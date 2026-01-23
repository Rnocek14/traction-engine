/**
 * Queue Video for Runway Gen-3 Alpha
 * 
 * Supports both text-to-video and image-to-video (for frame chaining).
 * Accepts same interface as queue-video for seamless provider switching.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildRunwayPrompt, type StyleGuideData } from "../_shared/cinematic-prompts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VideoRequest {
  script_run_id: string;
  clip_id?: string;
  prompt?: string;
  settings: {
    size: string; // Sora format: "720x1280" - will be converted
    /** Timeline duration in seconds - source of truth */
    requested_seconds?: number;
    /** Provider bucket duration for Runway (5 or 10) */
    provider_seconds?: number;
    /** Legacy field - deprecated, use requested_seconds + provider_seconds */
    seconds?: number;
    model?: string; // "gen3a_turbo", "gen3a", "gen4_turbo"
    seed?: number;
  };
  starting_frame_url?: string;
}

interface ClipData {
  id: string;
  prompt?: string;
  camera_direction?: string;
}

// Runway API version header
const RUNWAY_API_VERSION = "2024-11-06";

// Map Sora sizes to Runway aspect ratios
function mapSizeToRunway(soraSize: string): string {
  const mapping: Record<string, string> = {
    "720x1280": "720:1280",
    "1280x720": "1280:720",
    "1024x1792": "768:1280",
    "1792x1024": "1280:768",
  };
  return mapping[soraSize] || "720:1280";
}

// Map Sora durations to Runway (5 or 10 seconds)
function mapDurationToRunway(soraDuration: number): 5 | 10 {
  if (soraDuration <= 5) return 5;
  return 10;
}

// Default to gen3a_turbo if not specified
function getRunwayModel(model?: string): string {
  const validModels = ["gen3a_turbo", "gen3a", "gen4_turbo"];
  if (model && validModels.includes(model)) return model;
  return "gen3a_turbo";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const runwayApiKey = Deno.env.get("RUNWAY_API_KEY");

    if (!runwayApiKey) {
      throw new Error("RUNWAY_API_KEY not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: VideoRequest = await req.json();
    const { script_run_id, clip_id, prompt: overridePrompt, settings, starting_frame_url } = body;

    if (!script_run_id) {
      throw new Error("script_run_id is required");
    }

    // Extract durations - timeline-driven architecture
    // provider_seconds takes priority, then map from requested_seconds, then legacy seconds
    const requestedSeconds = settings?.requested_seconds;
    const legacySeconds = settings?.seconds;
    
    // Determine provider duration (Runway uses 5 or 10)
    let runwayDuration: 5 | 10;
    if (settings?.provider_seconds !== undefined) {
      runwayDuration = settings.provider_seconds <= 7 ? 5 : 10;
    } else if (requestedSeconds !== undefined) {
      runwayDuration = mapDurationToRunway(requestedSeconds);
    } else if (legacySeconds !== undefined) {
      runwayDuration = mapDurationToRunway(legacySeconds);
      console.log(`Warning: Using legacy seconds=${legacySeconds} for Runway, mapped to ${runwayDuration}s`);
    } else {
      throw new Error("Duration is required: provide requested_seconds, provider_seconds, or seconds");
    }

    // Map settings to Runway format
    const runwaySize = mapSizeToRunway(settings?.size || "720x1280");
    const runwayModel = getRunwayModel(settings?.model);

    // Fetch the script to get the prompt
    const { data: script, error: scriptError } = await supabase
      .from("script_runs")
      .select("*")
      .eq("id", script_run_id)
      .single();

    if (scriptError || !script) {
      throw new Error("Script not found");
    }

    // Only allow video generation for qa_passed scripts
    if (script.status !== "qa_passed") {
      throw new Error("Script must pass QA before video generation");
    }

    // Fetch timeline for style guide and clip data
    const { data: timeline } = await supabase
      .from("studio_timelines")
      .select("timeline_json")
      .eq("script_run_id", script_run_id)
      .order("version", { ascending: false })
      .limit(1)
      .single();

    let styleGuide: StyleGuideData | null = null;
    let clipData: ClipData | null = null;

    if (timeline?.timeline_json) {
      const timelineData = timeline.timeline_json as {
        clips?: ClipData[];
        style_guide?: StyleGuideData;
      };
      styleGuide = timelineData.style_guide || null;
      
      if (clip_id) {
        clipData = timelineData.clips?.find(c => c.id === clip_id) || null;
      }
    }

    // Build the video prompt
    let scenePrompt: string;

    if (overridePrompt) {
      scenePrompt = overridePrompt;
    } else if (clipData?.prompt) {
      scenePrompt = clipData.prompt;
    } else {
      // Build from script content (legacy mode)
      const content = script.script_content as Record<string, unknown>;
      const hook = (content?.hook as string) || "";
      const voiceover = (content?.voiceover as string) || "";
      const scenePrompts = (content?.scene_prompts as string[]) || [];

      scenePrompt = `
Hook: "${hook}"
Voiceover: "${voiceover}"
Scenes: ${scenePrompts.join("; ")}
Style: Professional short-form video, engaging, smooth transitions.
      `.trim();
    }

    // Build Runway-optimized prompt
    const videoPrompt = buildRunwayPrompt(
      styleGuide,
      scenePrompt,
      clipData?.camera_direction
    );

    // Create job record first - store both timeline and provider durations
    const { data: job, error: jobError } = await supabase
      .from("video_jobs")
      .insert({
        script_run_id,
        status: "queued",
        provider: "runway",
        settings: {
          size: runwaySize,
          // Store both durations for timeline-driven trimming
          requested_seconds: requestedSeconds ?? legacySeconds ?? runwayDuration,
          provider_seconds: runwayDuration,
          // Legacy field for backwards compat
          seconds: runwayDuration,
          model: runwayModel,
          clip_id: clip_id || null,
          prompt: videoPrompt.slice(0, 500),
          seed: settings?.seed,
          camera_direction: clipData?.camera_direction,
          original_sora_size: settings?.size,
        },
        progress: 0,
        openai_status: "pending", // Reusing field for runway status
      })
      .select()
      .single();

    if (jobError) {
      throw new Error(`Failed to create job: ${jobError.message}`);
    }

    // Build Runway API request
    const isImageToVideo = !!starting_frame_url || !!styleGuide?.reference_image_url;
    const referenceImageUrl = starting_frame_url || styleGuide?.reference_image_url;

    let runwayEndpoint: string;
    let runwayBody: Record<string, unknown>;

    if (isImageToVideo && referenceImageUrl) {
      // Image-to-video endpoint
      runwayEndpoint = "https://api.dev.runwayml.com/v1/image_to_video";
      runwayBody = {
        model: runwayModel,
        promptImage: referenceImageUrl,
        promptText: videoPrompt,
        duration: runwayDuration,
        ratio: runwaySize,
        seed: settings?.seed,
      };
      console.log(`Using image-to-video with reference: ${referenceImageUrl}`);
    } else {
      // Text-to-video endpoint
      runwayEndpoint = "https://api.dev.runwayml.com/v1/text_to_video";
      runwayBody = {
        model: runwayModel,
        promptText: videoPrompt,
        duration: runwayDuration,
        ratio: runwaySize,
        seed: settings?.seed,
      };
    }

    // Call Runway API
    const runwayResponse = await fetch(runwayEndpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${runwayApiKey}`,
        "X-Runway-Version": RUNWAY_API_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(runwayBody),
    });

    if (!runwayResponse.ok) {
      const errorText = await runwayResponse.text();
      console.error("Runway API error:", runwayResponse.status, errorText);
      
      // Update job with error
      await supabase
        .from("video_jobs")
        .update({
          status: "failed",
          openai_status: "failed",
          error: `Runway API error: ${runwayResponse.status} - ${errorText.slice(0, 200)}`,
        })
        .eq("id", job.id);

      throw new Error(`Runway API error: ${runwayResponse.status}`);
    }

    const runwayData = await runwayResponse.json();
    const runwayTaskId = runwayData.id;

    // Update job with Runway task ID
    await supabase
      .from("video_jobs")
      .update({
        status: "running",
        openai_video_id: runwayTaskId, // Reusing field for Runway task ID
        openai_status: "PENDING",
      })
      .eq("id", job.id);

    console.log(`Created Runway video job: ${runwayTaskId} for job: ${job.id}${clip_id ? ` clip: ${clip_id}` : ""}`);

    return new Response(
      JSON.stringify({
        success: true,
        job: {
          id: job.id,
          status: "running",
          provider: "runway",
          runway_task_id: runwayTaskId,
          clip_id: clip_id || null,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("queue-video-runway error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
