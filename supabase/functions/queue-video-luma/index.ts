/**
 * Luma Dream Machine Video Queue
 * 
 * Queues a video generation job using Luma AI's Ray2 API.
 * Supports text-to-video and image-to-video for frame chaining.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildProviderPrompt, type StyleGuideData } from "../_shared/cinematic-prompts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VideoRequest {
  script_run_id: string;
  clip_id?: string;
  prompt?: string;
  settings: {
    size: string;
    requested_seconds?: number;
    provider_seconds?: number;
    seconds?: number;
    model?: string;
    seed?: number;
  };
  starting_frame_url?: string;
}

interface ClipData {
  id: string;
  prompt?: string;
  camera_direction?: string;
}

/**
 * Map our size format to Luma aspect ratio
 * Luma uses aspect_ratio strings like "16:9", "9:16", "1:1"
 */
function mapSizeToLumaAspect(size: string): string {
  if (size.includes("720x1280") || size.includes("768x1280") || size.includes("1024x1792")) {
    return "9:16"; // Vertical
  }
  if (size.includes("1280x720") || size.includes("1280x768") || size.includes("1792x1024")) {
    return "16:9"; // Landscape
  }
  if (size.includes("1024x1024")) {
    return "1:1"; // Square
  }
  return "9:16"; // Default vertical
}

/**
 * Get Luma model from settings
 */
function getLumaModel(model?: string): string {
  if (model === "ray2-flash") return "ray2";
  return "ray2";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lumaApiKey = Deno.env.get("LUMA_API_KEY");

    if (!lumaApiKey) {
      throw new Error("LUMA_API_KEY not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body: VideoRequest = await req.json();

    // Validate required fields
    if (!body.script_run_id) {
      throw new Error("script_run_id is required");
    }
    if (!body.settings) {
      throw new Error("settings object is required");
    }

    // Extract duration settings
    const providerSeconds = body.settings.provider_seconds ?? body.settings.seconds ?? 5;
    const requestedSeconds = body.settings.requested_seconds ?? providerSeconds;

    // Validate duration (Luma supports 5 or 10 seconds)
    const validDuration = providerSeconds <= 5 ? 5 : 10;

    // Fetch script and validate status
    const { data: script, error: scriptError } = await supabase
      .from("script_runs")
      .select("id, status, scene_prompts")
      .eq("id", body.script_run_id)
      .single();

    if (scriptError || !script) {
      throw new Error("Script not found");
    }

    if (script.status !== "qa_passed") {
      throw new Error("Script must pass QA before video generation");
    }

    // Fetch the latest studio timeline for style guide
    const { data: timeline } = await supabase
      .from("studio_timelines")
      .select("timeline_json")
      .eq("script_run_id", body.script_run_id)
      .order("version", { ascending: false })
      .limit(1)
      .single();

    const styleGuide: StyleGuideData | null = timeline?.timeline_json?.style_guide || null;

    // Find clip data if clip_id provided
    let clipData: ClipData | null = null;
    if (body.clip_id && timeline?.timeline_json?.clips) {
      clipData = timeline.timeline_json.clips.find(
        (c: ClipData) => c.id === body.clip_id
      ) || null;
    }

    // Build prompt using provider-aware prompt builder
    const scenePrompt = body.prompt || clipData?.prompt || 
      (script.scene_prompts && script.scene_prompts[0]) || 
      "A cinematic scene";

    const videoPrompt = buildProviderPrompt(
      "luma", // Use Luma-optimized prompts
      styleGuide,
      scenePrompt,
      true, // isFirstClip - handled differently for Luma
      clipData?.camera_direction
    );

    // Create video job record - store provider_job_id in settings, not openai_video_id
    // IMPORTANT: No truncation - text columns are unlimited
    const { data: job, error: jobError } = await supabase
      .from("video_jobs")
      .insert({
        script_run_id: body.script_run_id,
        provider: "luma",
        status: "queued",
        // Store prompts in correct columns for auto-rating - NO TRUNCATION
        original_prompt: scenePrompt,
        enriched_prompt: videoPrompt,
        settings: {
          size: body.settings.size,
          aspect_ratio: mapSizeToLumaAspect(body.settings.size),
          requested_seconds: requestedSeconds,
          provider_seconds: validDuration,
          clip_id: body.clip_id,
          seed: body.settings.seed,
          model: getLumaModel(body.settings.model),
          // Provider-neutral task ID storage (set after API call)
          provider_job_id: null,
        },
      })
      .select()
      .single();

    if (jobError || !job) {
      throw new Error(`Failed to create job record: ${jobError?.message}`);
    }

    // Build Luma API request
    const lumaRequest: Record<string, unknown> = {
      prompt: videoPrompt,
      aspect_ratio: mapSizeToLumaAspect(body.settings.size),
      loop: false,
      model: getLumaModel(body.settings.model),
    };

    // Add duration - Luma uses "duration" field with number of seconds
    // Only add if >5s since 5s is default
    if (validDuration === 10) {
      lumaRequest.duration = 10;
    }

    // Add starting frame for image-to-video
    if (body.starting_frame_url) {
      lumaRequest.keyframes = {
        frame0: {
          type: "image",
          url: body.starting_frame_url,
        },
      };
    }

    // Log exact request for debugging (minus long prompt)
    console.log("Luma API request:", JSON.stringify({
      jobId: job.id,
      model: lumaRequest.model,
      aspect_ratio: lumaRequest.aspect_ratio,
      duration: lumaRequest.duration,
      hasKeyframes: !!lumaRequest.keyframes,
      loop: lumaRequest.loop,
      promptLength: videoPrompt.length,
      promptPreview: videoPrompt.slice(0, 100),
    }));

    // Call Luma API
    const lumaResponse = await fetch("https://api.lumalabs.ai/dream-machine/v1/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lumaApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(lumaRequest),
    });

    const lumaData = await lumaResponse.json();

    // Log full response for debugging
    console.log("Luma API response:", JSON.stringify({
      ok: lumaResponse.ok,
      status: lumaResponse.status,
      keys: Object.keys(lumaData),
      id: lumaData.id,
      state: lumaData.state,
    }));

    if (!lumaResponse.ok) {
      const errorMessage = lumaData.detail || lumaData.message || lumaData.error || "Luma API error";
      console.error("Luma API error full:", JSON.stringify(lumaData));
      
      // Update job as failed
      await supabase
        .from("video_jobs")
        .update({
          status: "failed",
          error: errorMessage,
        })
        .eq("id", job.id);

      throw new Error(errorMessage);
    }

    // Update job with Luma task ID - store in settings.provider_job_id (provider-neutral)
    const lumaTaskId = lumaData.id;
    
    await supabase
      .from("video_jobs")
      .update({
        status: "running",
        // Store in settings for provider-neutral access
        settings: {
          ...job.settings,
          provider_job_id: lumaTaskId,
        },
        // Keep openai_video_id temporarily for backwards compat (will be removed)
        openai_video_id: lumaTaskId,
        openai_status: "pending",
      })
      .eq("id", job.id);

    console.log("Luma job started:", {
      jobId: job.id,
      lumaTaskId,
      requestedSeconds,
      providerSeconds: validDuration,
    });

    return new Response(
      JSON.stringify({
        success: true,
        job: {
          id: job.id,
          script_run_id: body.script_run_id,
          status: "running",
          provider: "luma",
          provider_job_id: lumaTaskId,
          requested_seconds: requestedSeconds,
          provider_seconds: validDuration,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("queue-video-luma error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
