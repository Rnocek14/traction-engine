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
import { 
  routeBySceneRole, 
  inferRoleFromPosition,
  type SceneRole,
  type VideoProvider,
} from "../_shared/scene-role-router.ts";

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
    role?: SceneRole;
  }>;
  anchors: Record<string, unknown>;
  settings?: {
    size?: string;
    tier?: "volume" | "hero";
  };
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
 * Snap duration to valid values per provider
 */
function snapDurationForProvider(seconds: number, provider: VideoProvider): number {
  switch (provider) {
    case "sora":
      if (seconds <= 6) return 4;
      if (seconds <= 10) return 8;
      return 12;
    case "runway":
      if (seconds <= 5) return 4;
      if (seconds <= 7) return 6;
      return 8;
    case "luma":
      return 5;
    default:
      return 4;
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

    // Determine scene role (explicit or inferred from position)
    const sceneRole: SceneRole = firstScene.role || 
      inferRoleFromPosition(0, scenes.length);
    
    // Extract all roles for template-aware routing
    const templateRoles: SceneRole[] = scenes.map((s: { role?: SceneRole }, i: number) => 
      s.role || inferRoleFromPosition(i, scenes.length)
    );
    
    // Route by scene role (deterministic, with template context)
    const tier = settings?.tier || "volume";
    const routingResult = routeBySceneRole(sceneRole, {
      tier,
      isChained: false, // First scene is T2V
      soraUsedCount: 0,
      templateRoles, // Pass all roles for smart story_a fallback
    });
    
    const selectedProvider = routingResult.provider;
    const snappedDuration = snapDurationForProvider(firstScene.duration_target || 5, selectedProvider);
    
    console.log(`[chained] Role-based routing: ${sceneRole} → ${selectedProvider} (${routingResult.routingReason})`);
    
    // Queue to the selected provider directly
    const providerEndpoint = {
      sora: "queue-video",
      runway: "queue-video-runway",
      luma: "queue-video-luma",
    }[selectedProvider];
    
    const response = await fetch(`${supabaseUrl}/functions/v1/${providerEndpoint}`, {
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
          seconds: snappedDuration,
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
