/**
 * generate-story-chained
 * 
 * Smart hybrid story generation with intelligent per-scene provider routing:
 * 1. Generate first clip immediately using smart provider selection
 * 2. Wait for it to complete
 * 3. Chain remaining clips sequentially, using previous clip's last frame
 * 4. Each scene uses queue-video-smart for optimal provider selection
 * 
 * This ensures visual continuity across the entire story while using
 * the best provider for each scene type (action, dialogue, establishing).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ChainedStoryRequest {
  story_job_id: string;
  scenes: Array<{
    id: string;
    prompt: string;
    enriched_prompt?: string;
    duration_target: number;
    camera_direction?: string;
    shot_type?: string; // For smart routing
    genre?: string;     // For smart routing
  }>;
  anchors: Record<string, unknown>;
  settings?: {
    size?: string;
    provider?: "sora" | "runway" | "luma" | "smart"; // Default: smart
  };
  /**
   * Resume support: start generating from this scene index (0-based).
   * Scenes before this index are skipped.
   * If provided, the function will attempt to get reference frame from the 
   * last completed clip at index (start_from_index - 1).
   */
  start_from_index?: number;
  /**
   * Optional: explicit reference image URL to use for the first generated scene.
   * If not provided but start_from_index > 0, will query the last completed clip.
   */
  resume_reference_url?: string;
}

/**
 * Extract routing tags from prompt for smart provider selection
 */
function extractRoutingTags(prompt: string, cameraDirection?: string): string[] {
  const tags: string[] = [];
  const lower = prompt.toLowerCase();
  
  // Motion tags
  if (lower.includes("action") || lower.includes("fight") || lower.includes("chase")) tags.push("action");
  if (lower.includes("slow") || lower.includes("gentle") || lower.includes("peaceful")) tags.push("slow_motion");
  if (lower.includes("fast") || lower.includes("rapid") || lower.includes("quick")) tags.push("fast_motion");
  
  // Shot type tags
  if (lower.includes("close-up") || lower.includes("closeup") || lower.includes("face")) tags.push("close_up");
  if (lower.includes("wide shot") || lower.includes("establishing")) tags.push("wide_shot");
  if (lower.includes("tracking") || lower.includes("follow")) tags.push("tracking");
  
  // Subject tags
  if (lower.includes("character") || lower.includes("person") || lower.includes("human")) tags.push("character");
  if (lower.includes("landscape") || lower.includes("environment") || lower.includes("scenery")) tags.push("environment");
  if (lower.includes("dragon") || lower.includes("creature") || lower.includes("monster")) tags.push("creature");
  
  // Lighting tags
  if (lower.includes("dark") || lower.includes("night") || lower.includes("shadow")) tags.push("low_light");
  if (lower.includes("golden hour") || lower.includes("sunset") || lower.includes("dawn")) tags.push("golden_hour");
  
  // Camera direction hints
  if (cameraDirection) {
    const camLower = cameraDirection.toLowerCase();
    if (camLower.includes("dolly") || camLower.includes("track")) tags.push("camera_movement");
    if (camLower.includes("static") || camLower.includes("locked")) tags.push("static_camera");
  }
  
  return tags.slice(0, 5); // Max 5 tags
}

/**
 * Infer shot type from prompt for routing hints
 */
function inferShotType(prompt: string): string | undefined {
  const lower = prompt.toLowerCase();
  if (lower.includes("close-up") || lower.includes("closeup") || lower.includes("face")) return "close-up";
  if (lower.includes("extreme close")) return "extreme-close";
  if (lower.includes("medium shot") || lower.includes("waist")) return "medium";
  if (lower.includes("wide shot") || lower.includes("full shot")) return "wide";
  if (lower.includes("extreme wide") || lower.includes("establishing")) return "extreme-wide";
  if (lower.includes("tracking") || lower.includes("follow")) return "tracking";
  if (lower.includes("over the shoulder") || lower.includes("over-shoulder")) return "over-shoulder";
  return undefined;
}

/**
 * Wait for a video job to complete
 */
async function waitForJobCompletion(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  maxWaitMs: number = 300000 // 5 minutes
): Promise<{ success: boolean; outputUrl?: string; thumbnailUrl?: string; error?: string }> {
  const pollInterval = 5000; // 5 seconds
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    const { data: job, error } = await supabase
      .from("video_jobs")
      .select("status, output_url, thumbnail_url, error")
      .eq("id", jobId)
      .single();
    
    if (error) {
      return { success: false, error: `Failed to check job status: ${error.message}` };
    }
    
    if (job.status === "done") {
      return { 
        success: true, 
        outputUrl: job.output_url,
        thumbnailUrl: job.thumbnail_url,
      };
    }
    
    if (job.status === "failed") {
      return { success: false, error: job.error || "Job failed" };
    }
    
    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  return { success: false, error: "Timeout waiting for job completion" };
}

/**
 * Extract last frame from completed video as reference for next clip
 * Prefers thumbnail_url for higher quality
 */
async function getLastFrameReference(
  supabase: ReturnType<typeof createClient>,
  jobId: string
): Promise<string | null> {
  const { data: job } = await supabase
    .from("video_jobs")
    .select("thumbnail_url, output_url")
    .eq("id", jobId)
    .single();
  
  // Prefer thumbnail (high quality single frame)
  if (job?.thumbnail_url) {
    return job.thumbnail_url;
  }
  
  // For Runway, can use video URL directly
  if (job?.output_url) {
    return job.output_url;
  }
  
  return null;
}

/**
 * Queue a single video clip via queue-video-smart for intelligent provider selection
 */
async function queueClipSmart(
  supabaseUrl: string,
  supabaseServiceKey: string,
  params: {
    scriptRunId: string;
    storyJobId: string;
    sequenceIndex: number;
    prompt: string;
    originalPrompt: string;
    duration: number;
    cameraDirection?: string;
    anchors: Record<string, unknown>;
    size: string;
    shotType?: string;
    genre?: string;
    routingTags: string[];
    referenceImageUrl?: string;
  }
): Promise<{ jobId?: string; provider?: string; error?: string }> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/queue-video-smart`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        script_run_id: params.scriptRunId,
        prompt: params.prompt,
        settings: {
          size: params.size,
          seconds: params.duration,
        },
        starting_frame_url: params.referenceImageUrl,
        provider: "smart", // Let smart routing decide
        routing_hint: {
          shot_type: params.shotType,
          genre: params.genre,
          is_chained: params.sequenceIndex > 0, // Enable chained mode for continuity
          routing_tags: params.routingTags,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      return { error: data.error || `HTTP ${response.status}` };
    }

    // Extract job ID from response (handle both formats)
    const jobId = data.jobId || data.job?.id;
    const provider = data.provider || data.job?.provider;

    // Update the job with story-specific metadata
    if (jobId) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const { error: updateError } = await supabase
        .from("video_jobs")
        .update({
          story_job_id: params.storyJobId,
          sequence_index: params.sequenceIndex,
          original_prompt: params.originalPrompt,
          style_hints: JSON.stringify(params.anchors),
        })
        .eq("id", jobId);
      
      if (updateError) {
        console.error(`[chained] Failed to link job ${jobId} to story:`, updateError.message);
      } else {
        console.log(`[chained] Linked job ${jobId} to story ${params.storyJobId} at index ${params.sequenceIndex}`);
      }
    }

    return { jobId, provider };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: ChainedStoryRequest = await req.json();
    const { story_job_id, scenes, anchors, settings, start_from_index, resume_reference_url } = body;

    if (!story_job_id || !scenes?.length) {
      return new Response(
        JSON.stringify({ success: false, error: "story_job_id and scenes required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const size = settings?.size || "16:9";
    const useSmartRouting = settings?.provider === "smart" || !settings?.provider;
    
    // Determine starting index for resume support
    const startIndex = start_from_index ?? 0;
    const scenesToProcess = scenes.slice(startIndex);
    
    if (scenesToProcess.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No scenes to process from given start_from_index" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log(`[chained] Starting story ${story_job_id} from index ${startIndex}, processing ${scenesToProcess.length}/${scenes.length} scenes (smart routing: ${useSmartRouting})`);

    // We need a script_run_id for queue-video-smart, create a placeholder if needed
    let scriptRunId: string;
    const { data: existingScript } = await supabase
      .from("script_runs")
      .select("id")
      .eq("account_id", "lab-story")
      .eq("status", "qa_passed")
      .limit(1)
      .maybeSingle();
    
    if (existingScript) {
      scriptRunId = existingScript.id;
    } else {
      // Create a placeholder script for lab story generation
      const { data: newScript, error: scriptError } = await supabase
        .from("script_runs")
        .insert({
          account_id: "lab-story",
          status: "qa_passed",
          script_content: { type: "story_chained", story_job_id },
        })
        .select("id")
        .single();
      
      if (scriptError || !newScript) {
        throw new Error(`Failed to create placeholder script: ${scriptError?.message}`);
      }
      scriptRunId = newScript.id;
    }

    // Update story status
    await supabase
      .from("story_jobs")
      .update({ status: "generating" })
      .eq("id", story_job_id);

    const results: Array<{ 
      sceneId: string; 
      jobId?: string; 
      provider?: string;
      status: "queued" | "done" | "failed"; 
      error?: string;
      sequenceIndex: number;
    }> = [];
    
    let previousJobId: string | null = null;
    
    // For resume: get initial reference from last completed clip or provided URL
    let initialReferenceUrl: string | undefined = resume_reference_url;
    
    if (!initialReferenceUrl && startIndex > 0) {
      // Try to get reference from the last completed clip before startIndex
      const { data: lastCompletedClip } = await supabase
        .from("video_jobs")
        .select("id, thumbnail_url, output_url")
        .eq("story_job_id", story_job_id)
        .eq("status", "done")
        .lt("sequence_index", startIndex)
        .order("sequence_index", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (lastCompletedClip) {
        initialReferenceUrl = lastCompletedClip.thumbnail_url || lastCompletedClip.output_url || undefined;
        console.log(`[chained] Resume: got reference from clip at index ${startIndex - 1}: ${initialReferenceUrl?.substring(0, 60) || "none"}...`);
      }
    }
    
    // Process scenes sequentially with chaining
    for (let i = 0; i < scenesToProcess.length; i++) {
      const scene = scenesToProcess[i];
      const actualSequenceIndex = startIndex + i; // Correct sequence index
      const prompt = scene.enriched_prompt || scene.prompt;
      
      // Extract routing intelligence from the prompt
      const routingTags = extractRoutingTags(prompt, scene.camera_direction);
      const shotType = scene.shot_type || inferShotType(prompt);
      
      console.log(`[chained] Scene ${actualSequenceIndex + 1}/${scenes.length}: ${prompt.substring(0, 50)}...`);
      console.log(`[chained] Routing tags: [${routingTags.join(", ")}], shot_type: ${shotType || "unknown"}`);
      
      // Determine reference image
      let referenceImageUrl: string | undefined;
      
      if (i === 0 && initialReferenceUrl) {
        // First scene in this batch: use initial reference (from resume or provided)
        referenceImageUrl = initialReferenceUrl;
        console.log(`[chained] Using initial reference for first scene: ${referenceImageUrl?.substring(0, 60)}...`);
      } else if (i > 0 && previousJobId) {
        // Subsequent scenes: wait for previous to complete and get reference
        console.log(`[chained] Waiting for previous clip ${previousJobId} to complete...`);
        
        const waitResult = await waitForJobCompletion(supabase, previousJobId, 300000);
        
        if (!waitResult.success) {
          console.warn(`[chained] Previous clip failed: ${waitResult.error}`);
          // Update the failed result
          const prevResult = results.find(r => r.jobId === previousJobId);
          if (prevResult) {
            prevResult.status = "failed";
            prevResult.error = waitResult.error;
          }
          // Continue without reference
        } else {
          // Update previous result to done
          const prevResult = results.find(r => r.jobId === previousJobId);
          if (prevResult) {
            prevResult.status = "done";
          }
          
          // Get reference frame for chaining
          referenceImageUrl = await getLastFrameReference(supabase, previousJobId) || undefined;
          console.log(`[chained] Got reference frame: ${referenceImageUrl?.substring(0, 60) || "none"}...`);
        }
      }
      
      // Queue this clip using smart routing with correct sequence index
      const queueResult = await queueClipSmart(supabaseUrl, supabaseServiceKey, {
        scriptRunId,
        storyJobId: story_job_id,
        sequenceIndex: actualSequenceIndex, // Use correct index for resume
        prompt,
        originalPrompt: scene.prompt,
        duration: scene.duration_target,
        cameraDirection: scene.camera_direction,
        anchors,
        size,
        shotType,
        genre: scene.genre,
        routingTags,
        referenceImageUrl,
      });
      
      if (queueResult.error) {
        console.error(`[chained] Failed to queue scene ${actualSequenceIndex + 1}: ${queueResult.error}`);
        results.push({
          sceneId: scene.id,
          status: "failed",
          error: queueResult.error,
          sequenceIndex: actualSequenceIndex,
        });
        // Continue to next scene anyway
        previousJobId = null;
      } else {
        console.log(`[chained] Queued scene ${actualSequenceIndex + 1} as job ${queueResult.jobId} via ${queueResult.provider || "smart"}`);
        results.push({
          sceneId: scene.id,
          jobId: queueResult.jobId,
          provider: queueResult.provider,
          status: "queued",
          sequenceIndex: actualSequenceIndex,
        });
        previousJobId = queueResult.jobId || null;
      }
      
      // Update story progress (count all done clips, not just this batch)
      const { count: totalDone } = await supabase
        .from("video_jobs")
        .select("id", { count: "exact", head: true })
        .eq("story_job_id", story_job_id)
        .eq("status", "done");
      
      await supabase
        .from("story_jobs")
        .update({ 
          completed_clips: totalDone || 0,
        })
        .eq("id", story_job_id);
    }
    
    // Wait for last clip to complete
    if (previousJobId) {
      console.log(`[chained] Waiting for final clip ${previousJobId}...`);
      const finalResult = await waitForJobCompletion(supabase, previousJobId, 300000);
      const lastResult = results.find(r => r.jobId === previousJobId);
      if (lastResult) {
        lastResult.status = finalResult.success ? "done" : "failed";
        if (!finalResult.success) {
          lastResult.error = finalResult.error;
        }
      }
    }
    
    // Calculate final stats for this batch
    const batchSucceeded = results.filter(r => r.status === "done").length;
    const batchFailed = results.filter(r => r.status === "failed").length;
    const batchQueued = results.filter(r => r.status === "queued").length;
    
    // Get total done count across all clips
    const { count: totalDone } = await supabase
      .from("video_jobs")
      .select("id", { count: "exact", head: true })
      .eq("story_job_id", story_job_id)
      .eq("status", "done");
    
    // Determine final story status
    const totalScenes = scenes.length;
    const allDone = (totalDone || 0) >= totalScenes;
    const anyFailed = batchFailed > 0;
    
    await supabase
      .from("story_jobs")
      .update({ 
        status: allDone ? "done" : anyFailed ? "partial" : "generating",
        completed_clips: totalDone || 0,
      })
      .eq("id", story_job_id);
    
    console.log(`[chained] Batch complete: ${batchSucceeded} done, ${batchFailed} failed, ${batchQueued} still queued. Total story: ${totalDone}/${totalScenes}`);

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          total: totalScenes,
          batchProcessed: scenesToProcess.length,
          batchSucceeded,
          batchFailed,
          batchQueued,
          totalDone: totalDone || 0,
          startedFromIndex: startIndex,
        },
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[chained] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
