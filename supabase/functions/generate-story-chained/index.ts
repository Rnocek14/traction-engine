/**
 * generate-story-chained
 * 
 * Smart hybrid story generation:
 * 1. Generate first clip immediately (no reference needed)
 * 2. Wait for it to complete
 * 3. Chain remaining clips sequentially, using previous clip's last frame
 * 
 * This ensures visual continuity across the entire story while being
 * faster than pure sequential (first clip starts immediately).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Image, decode as decodeJpeg } from "https://esm.sh/jpeg-js@0.4.4";

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
    provider?: "sora" | "runway" | "luma";
  };
}

// Sora only supports 4, 8, 12 seconds
function getValidSoraDuration(requested: number): number {
  if (requested <= 4) return 4;
  if (requested <= 8) return 8;
  return 12;
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
 * Queue a single video clip via lab-queue-video
 */
async function queueClip(
  supabase: ReturnType<typeof createClient>,
  params: {
    storyJobId: string;
    sequenceIndex: number;
    prompt: string;
    originalPrompt: string;
    duration: number;
    cameraDirection?: string;
    anchors: Record<string, unknown>;
    size: string;
    provider: string;
    referenceImageUrl?: string;
  }
): Promise<{ jobId?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke("lab-queue-video", {
    body: {
      provider: params.provider,
      prompt: params.prompt,
      original_prompt: params.originalPrompt,
      settings: {
        size: params.size,
        duration: params.duration,
      },
      story_job_id: params.storyJobId,
      sequence_index: params.sequenceIndex,
      camera_direction: params.cameraDirection,
      style_hints: JSON.stringify(params.anchors),
      reference_image_url: params.referenceImageUrl,
    },
  });
  
  if (error) {
    return { error: error.message };
  }
  
  if (!data?.success) {
    return { error: data?.error || "Failed to queue clip" };
  }
  
  return { jobId: data.job?.id };
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
    const { story_job_id, scenes, anchors, settings } = body;

    if (!story_job_id || !scenes?.length) {
      return new Response(
        JSON.stringify({ success: false, error: "story_job_id and scenes required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const size = settings?.size || "16:9";
    const provider = settings?.provider || "sora";
    
    console.log(`[chained] Starting story ${story_job_id} with ${scenes.length} scenes`);

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
    }> = [];
    
    let previousJobId: string | null = null;
    
    // Process scenes sequentially with chaining
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const prompt = scene.enriched_prompt || scene.prompt;
      const duration = getValidSoraDuration(scene.duration_target);
      
      console.log(`[chained] Scene ${i + 1}/${scenes.length}: ${prompt.substring(0, 50)}...`);
      
      // For scenes after the first, wait for previous to complete and get reference
      let referenceImageUrl: string | undefined;
      
      if (i > 0 && previousJobId) {
        console.log(`[chained] Waiting for previous clip ${previousJobId} to complete...`);
        
        const waitResult = await waitForJobCompletion(supabase, previousJobId, 300000);
        
        if (!waitResult.success) {
          console.warn(`[chained] Previous clip failed: ${waitResult.error}`);
          // Still continue, but without reference
          results.push({
            sceneId: scenes[i - 1].id,
            jobId: previousJobId,
            status: "failed",
            error: waitResult.error,
          });
        } else {
          // Update previous result to done
          const prevResult = results.find(r => r.jobId === previousJobId);
          if (prevResult) {
            prevResult.status = "done";
          }
          
          // Get reference frame for chaining
          referenceImageUrl = await getLastFrameReference(supabase, previousJobId) || undefined;
          console.log(`[chained] Got reference frame: ${referenceImageUrl?.substring(0, 60)}...`);
        }
      }
      
      // Queue this clip
      const queueResult = await queueClip(supabase, {
        storyJobId: story_job_id,
        sequenceIndex: i,
        prompt,
        originalPrompt: scene.prompt,
        duration,
        cameraDirection: scene.camera_direction,
        anchors,
        size,
        provider,
        referenceImageUrl,
      });
      
      if (queueResult.error) {
        console.error(`[chained] Failed to queue scene ${i + 1}: ${queueResult.error}`);
        results.push({
          sceneId: scene.id,
          status: "failed",
          error: queueResult.error,
        });
        // Continue to next scene anyway
        previousJobId = null;
      } else {
        console.log(`[chained] Queued scene ${i + 1} as job ${queueResult.jobId}`);
        results.push({
          sceneId: scene.id,
          jobId: queueResult.jobId,
          status: "queued",
        });
        previousJobId = queueResult.jobId || null;
      }
      
      // Update story progress
      await supabase
        .from("story_jobs")
        .update({ 
          completed_clips: results.filter(r => r.status === "done").length,
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
    
    // Calculate final stats
    const succeeded = results.filter(r => r.status === "done").length;
    const failed = results.filter(r => r.status === "failed").length;
    const queued = results.filter(r => r.status === "queued").length;
    
    // Update story final status
    await supabase
      .from("story_jobs")
      .update({ 
        status: failed === scenes.length ? "failed" : succeeded === scenes.length ? "done" : "partial",
        completed_clips: succeeded,
      })
      .eq("id", story_job_id);
    
    console.log(`[chained] Story complete: ${succeeded} done, ${failed} failed, ${queued} still queued`);

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          total: scenes.length,
          succeeded,
          failed,
          queued,
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
