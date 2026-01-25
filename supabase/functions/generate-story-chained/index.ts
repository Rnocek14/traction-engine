/**
 * generate-story-chained
 * 
 * VISUAL CONTINUITY-FOCUSED story generation:
 * 1. Scene 1: Text-to-Video (no reference needed)
 * 2. Scenes 2+: Image-to-Video using previous scene's thumbnail
 * 3. All scenes wait for previous to complete before starting
 * 4. Retry logic for transient network failures
 * 
 * This ensures a WATCHABLE story with consistent characters and environments.
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
  }>;
  anchors: Record<string, unknown>;
  settings?: {
    size?: string;
  };
  start_from_index?: number;
  resume_reference_url?: string;
}

/**
 * Wait for a video job to complete with retry logic
 */
async function waitForJobCompletion(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  maxWaitMs: number = 300000, // 5 minutes
  maxRetries: number = 3
): Promise<{ success: boolean; outputUrl?: string; thumbnailUrl?: string; error?: string }> {
  const pollInterval = 5000; // 5 seconds
  const startTime = Date.now();
  let consecutiveErrors = 0;
  
  while (Date.now() - startTime < maxWaitMs) {
    try {
      const { data: job, error } = await supabase
        .from("video_jobs")
        .select("status, output_url, thumbnail_url, error")
        .eq("id", jobId)
        .single();
      
      if (error) {
        consecutiveErrors++;
        console.warn(`[chained] Poll error (${consecutiveErrors}/${maxRetries}): ${error.message}`);
        if (consecutiveErrors >= maxRetries) {
          return { success: false, error: `Failed to check job status after ${maxRetries} retries: ${error.message}` };
        }
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        continue;
      }
      
      // Reset error counter on success
      consecutiveErrors = 0;
      
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
    } catch (err) {
      consecutiveErrors++;
      console.warn(`[chained] Network error (${consecutiveErrors}/${maxRetries}): ${err}`);
      if (consecutiveErrors >= maxRetries) {
        return { success: false, error: `Network failure after ${maxRetries} retries` };
      }
      await new Promise(resolve => setTimeout(resolve, pollInterval * 2)); // Longer wait on network error
    }
  }
  
  return { success: false, error: "Timeout waiting for job completion" };
}

/**
 * Queue a clip directly to Runway with explicit I2V/T2V mode
 */
async function queueClipToRunway(
  supabaseUrl: string,
  supabaseServiceKey: string,
  params: {
    scriptRunId: string;
    storyJobId: string;
    sequenceIndex: number;
    prompt: string;
    originalPrompt: string;
    duration: number;
    anchors: Record<string, unknown>;
    size: string;
    referenceImageUrl?: string; // If provided, uses Image-to-Video (gen4_turbo)
  }
): Promise<{ jobId?: string; error?: string }> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  // Determine if this is I2V or T2V
  const isImageToVideo = !!params.referenceImageUrl;
  
  console.log(`[chained] Queueing scene ${params.sequenceIndex + 1} as ${isImageToVideo ? "Image-to-Video" : "Text-to-Video"}`);
  
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/queue-video-runway`, {
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
          requested_seconds: params.duration,
          // Force gen4_turbo for I2V (best for continuity), veo3.1_fast for T2V
          model: isImageToVideo ? "gen4_turbo" : "veo3.1_fast",
        },
        // Critical: pass reference image for I2V
        starting_frame_url: params.referenceImageUrl,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      return { error: data.error || `HTTP ${response.status}` };
    }

    const jobId = data.job?.id;

    // Link job to story
    if (jobId) {
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
        console.error(`[chained] Failed to link job: ${updateError.message}`);
      }
    }

    return { jobId };
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

    const size = settings?.size || "720x1280";
    const startIndex = start_from_index ?? 0;
    const scenesToProcess = scenes.slice(startIndex);
    
    if (scenesToProcess.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No scenes to process" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log(`[chained] Starting story ${story_job_id}: ${scenesToProcess.length} scenes from index ${startIndex}`);
    console.log(`[chained] VISUAL CONTINUITY MODE: Scene 1=T2V, Scenes 2+= I2V with frame chaining`);

    // Get or create script_run for Runway
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
        throw new Error(`Failed to create script: ${scriptError?.message}`);
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
      status: "queued" | "done" | "failed"; 
      error?: string;
      sequenceIndex: number;
      mode: "T2V" | "I2V";
    }> = [];
    
    let previousJobId: string | null = null;
    let previousThumbnailUrl: string | null = resume_reference_url || null;
    
    // If resuming, get reference from last completed clip
    if (!previousThumbnailUrl && startIndex > 0) {
      const { data: lastClip } = await supabase
        .from("video_jobs")
        .select("thumbnail_url")
        .eq("story_job_id", story_job_id)
        .eq("status", "done")
        .lt("sequence_index", startIndex)
        .order("sequence_index", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (lastClip?.thumbnail_url) {
        previousThumbnailUrl = lastClip.thumbnail_url;
        console.log(`[chained] Resume: using thumbnail from scene ${startIndex - 1}`);
      }
    }
    
    // Process scenes SEQUENTIALLY with proper chaining
    for (let i = 0; i < scenesToProcess.length; i++) {
      const scene = scenesToProcess[i];
      const actualIndex = startIndex + i;
      const prompt = scene.enriched_prompt || scene.prompt;
      
      // CRITICAL: Determine if this is the first scene overall (T2V) or continuation (I2V)
      const isFirstScene = actualIndex === 0;
      const mode = isFirstScene ? "T2V" : "I2V";
      
      console.log(`[chained] Scene ${actualIndex + 1}/${scenes.length} [${mode}]: ${prompt.substring(0, 50)}...`);
      
      // If not first scene, wait for previous to complete and get its thumbnail
      let referenceImageUrl: string | undefined;
      
      if (!isFirstScene) {
        if (previousJobId) {
          console.log(`[chained] Waiting for scene ${actualIndex} to complete...`);
          
          const waitResult = await waitForJobCompletion(supabase, previousJobId, 360000); // 6 min timeout
          
          if (!waitResult.success) {
            console.error(`[chained] Scene ${actualIndex} failed: ${waitResult.error}`);
            results.push({
              sceneId: scene.id,
              status: "failed",
              error: `Previous scene failed: ${waitResult.error}`,
              sequenceIndex: actualIndex,
              mode,
            });
            break; // Stop chain on failure
          }
          
          // Use thumbnail as reference for next scene
          referenceImageUrl = waitResult.thumbnailUrl || undefined;
          console.log(`[chained] ✓ Scene ${actualIndex} done. Got reference: ${referenceImageUrl ? "yes" : "no"}`);
          
          // Update previous result to done
          const prevResult = results.find(r => r.jobId === previousJobId);
          if (prevResult) prevResult.status = "done";
        } else if (previousThumbnailUrl) {
          // Use provided/resume reference
          referenceImageUrl = previousThumbnailUrl;
          console.log(`[chained] Using resume reference for scene ${actualIndex + 1}`);
        }
        
        // CRITICAL: If no reference available for I2V scene, we have a problem
        if (!referenceImageUrl) {
          console.error(`[chained] ❌ No reference image for I2V scene ${actualIndex + 1}. Chain broken.`);
          results.push({
            sceneId: scene.id,
            status: "failed",
            error: "No reference image available for Image-to-Video",
            sequenceIndex: actualIndex,
            mode,
          });
          break;
        }
      }
      
      // Queue the clip with correct mode
      const queueResult = await queueClipToRunway(supabaseUrl, supabaseServiceKey, {
        scriptRunId,
        storyJobId: story_job_id,
        sequenceIndex: actualIndex,
        prompt,
        originalPrompt: scene.prompt,
        duration: scene.duration_target,
        anchors,
        size,
        referenceImageUrl, // undefined for T2V, URL for I2V
      });
      
      if (queueResult.error) {
        console.error(`[chained] Failed to queue scene ${actualIndex + 1}: ${queueResult.error}`);
        results.push({
          sceneId: scene.id,
          status: "failed",
          error: queueResult.error,
          sequenceIndex: actualIndex,
          mode,
        });
        break; // Stop chain on failure
      }
      
      console.log(`[chained] ✓ Queued scene ${actualIndex + 1} as job ${queueResult.jobId} [${mode}]`);
      results.push({
        sceneId: scene.id,
        jobId: queueResult.jobId,
        status: "queued",
        sequenceIndex: actualIndex,
        mode,
      });
      
      previousJobId = queueResult.jobId || null;
      previousThumbnailUrl = null; // Clear resume reference after first use
      
      // Update story progress
      await supabase
        .from("story_jobs")
        .update({ completed_clips: actualIndex })
        .eq("id", story_job_id);
    }
    
    // Wait for final clip
    if (previousJobId) {
      console.log(`[chained] Waiting for final scene...`);
      const finalResult = await waitForJobCompletion(supabase, previousJobId, 360000);
      const lastResult = results.find(r => r.jobId === previousJobId);
      if (lastResult) {
        lastResult.status = finalResult.success ? "done" : "failed";
        if (!finalResult.success) lastResult.error = finalResult.error;
      }
    }
    
    // Final status
    const succeeded = results.filter(r => r.status === "done").length;
    const failed = results.filter(r => r.status === "failed").length;
    const allDone = succeeded === scenes.length;
    
    await supabase
      .from("story_jobs")
      .update({ 
        status: allDone ? "done" : failed > 0 ? "partial" : "generating",
        completed_clips: succeeded,
      })
      .eq("id", story_job_id);
    
    console.log(`[chained] Complete: ${succeeded}/${scenes.length} done, ${failed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          total: scenes.length,
          succeeded,
          failed,
          visualContinuity: failed === 0, // True if chain unbroken
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
