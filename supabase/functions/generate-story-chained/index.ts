/**
 * generate-story-chained
 * 
 * VISUAL CONTINUITY-FOCUSED story generation:
 * 1. Scene 1: Text-to-Video (queued immediately)
 * 2. Scenes 2+: Handled by continue-story-chain cron (Image-to-Video)
 * 3. This function only queues the FIRST scene to avoid timeouts
 * 
 * The continue-story-chain cron runs every 30s to advance the chain.
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
}

/**
 * Extract routing tags from scene metadata for smart provider selection
 */
function extractRoutingTags(scene: { prompt: string; camera_direction?: string }): string[] {
  const tags: string[] = [];
  
  const prompt = scene.prompt.toLowerCase();
  
  // Action/motion detection
  if (/action|fight|battle|explosion|chase|run|jump/.test(prompt)) {
    tags.push("action");
  }
  if (/slow|peaceful|calm|serene|quiet/.test(prompt)) {
    tags.push("slow_motion");
  }
  
  // Shot type from camera direction
  if (scene.camera_direction) {
    const cam = scene.camera_direction.toLowerCase();
    if (/close/.test(cam)) tags.push("close_up");
    if (/wide/.test(cam)) tags.push("wide_shot");
    if (/tracking|follow/.test(cam)) tags.push("tracking");
    if (/aerial|drone/.test(cam)) tags.push("aerial");
  }
  
  // Genre/style detection
  if (/fantasy|dragon|magic|wizard|medieval/.test(prompt)) {
    tags.push("fantasy");
  }
  if (/horror|dark|scary|creepy/.test(prompt)) {
    tags.push("horror");
  }
  if (/nature|landscape|forest|ocean|mountain/.test(prompt)) {
    tags.push("nature");
  }
  if (/person|character|man|woman|figure/.test(prompt)) {
    tags.push("character");
  }
  
  return tags.slice(0, 5); // Limit to top 5 tags
}

/**
 * Normalize size input - convert aspect ratios to pixel dimensions
 */
function normalizeSize(input?: string): string {
  const sizeMap: Record<string, string> = {
    "16:9": "1280x720",
    "9:16": "720x1280",
    "1:1": "1024x1024",
    "4:3": "1024x768",
    "3:4": "768x1024",
  };
  const validSizes = ["720x1280", "1280x720", "1024x1792", "1792x1024"];
  if (validSizes.includes(input || "")) return input!;
  return sizeMap[input || ""] || "720x1280";
}

/**
 * Snap duration to valid Sora values (4, 8, 12 seconds)
 */
function snapToValidDuration(seconds: number): number {
  if (seconds <= 6) return 4;
  if (seconds <= 10) return 8;
  return 12;
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

    const size = normalizeSize(settings?.size);
    const firstScene = scenes[0];
    const prompt = firstScene.enriched_prompt || firstScene.prompt;
    
    console.log(`[chained] Starting story ${story_job_id}: ${scenes.length} scenes`);
    console.log(`[chained] Queueing scene 1 (T2V), scenes 2-${scenes.length} will be handled by cron`);

    // Create a dedicated script_run for this story
    const { data: newScript, error: scriptError } = await supabase
      .from("script_runs")
      .insert({
        account_id: "lab-story",
        status: "qa_passed",
        script_content: { type: "story_chained", story_job_id, scenes: scenes.map(s => s.prompt) },
      })
      .select("id")
      .single();
    
    if (scriptError || !newScript) {
      throw new Error(`Failed to create script_run: ${scriptError?.message}`);
    }
    const scriptRunId = newScript.id;
    console.log(`[chained] Created script_run ${scriptRunId}`);

    // Update story status and store storyboard for cron to use
    await supabase
      .from("story_jobs")
      .update({ 
        status: "generating",
        total_clips: scenes.length,
        completed_clips: 0,
        storyboard_json: { scenes },
        continuity_anchors: anchors,
      })
      .eq("id", story_job_id);

    // Extract routing hints from scene metadata
    const sceneRoutingTags = extractRoutingTags(firstScene);
    
    // Queue ONLY scene 1 via smart router (will pick best provider)
    const response = await fetch(`${supabaseUrl}/functions/v1/queue-video-smart`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        script_run_id: scriptRunId,
        prompt: prompt,
        settings: {
          size: size,
          seconds: snapToValidDuration(firstScene.duration_target || 5),
        },
        provider: "smart", // Let the router decide
        routing_hint: {
          shot_type: firstScene.camera_direction,
          is_chained: false, // First scene is T2V, not chained
          routing_tags: sceneRoutingTags,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    const jobId = data.job?.id;

    // Link job to story
    if (jobId) {
      await supabase
        .from("video_jobs")
        .update({
          story_job_id: story_job_id,
          sequence_index: 0,
          original_prompt: firstScene.prompt,
          style_hints: JSON.stringify(anchors),
        })
        .eq("id", jobId);
    }

    console.log(`[chained] ✓ Queued scene 1 as job ${jobId}. Cron will handle scenes 2-${scenes.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Scene 1 queued. Scenes 2-${scenes.length} will chain automatically via cron.`,
        jobId,
        totalScenes: scenes.length,
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
