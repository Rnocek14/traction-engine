import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCinematicPrompt, type StyleGuideData } from "../_shared/cinematic-prompts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VideoRequest {
  script_run_id: string;
  clip_id?: string;
  prompt?: string;
  provider?: "sora" | "runway";
  settings: {
    size: string;
    /** Provider-bucketed duration (what we request from API) */
    provider_seconds?: number;
    /** Exact timeline duration (source of truth for trim) */
    requested_seconds?: number;
    /** Legacy field - use provider_seconds instead */
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: VideoRequest = await req.json();
    const { script_run_id, clip_id, prompt: overridePrompt, settings, starting_frame_url, provider: reqProvider } = body;

    if (!script_run_id) {
      throw new Error("script_run_id is required");
    }

    const provider = reqProvider || "sora";

    // Validate settings
    const allowedSizes = ["720x1280", "1280x720", "1024x1792", "1792x1024"];
    // Provider durations: Sora = 4, 8, 12; Runway = 5, 10
    const allowedSecondsSora = [4, 8, 12];
    const allowedSecondsRunway = [5, 10];
    const allowedSeconds = provider === "runway" ? allowedSecondsRunway : allowedSecondsSora;
    
    const size = settings?.size || "720x1280";
    
    // Resolve provider duration: prefer provider_seconds, fall back to legacy seconds
    const providerSeconds = settings?.provider_seconds ?? settings?.seconds;
    
    // requested_seconds: prefer explicit, fall back to provider_seconds for legacy callers
    const requestedSeconds = settings?.requested_seconds ?? providerSeconds;
    
    // Legacy fallback: allow callers with just 'seconds' but log
    if (!providerSeconds) {
      console.error("queue-video called without provider_seconds or seconds - this is a bug");
      throw new Error("provider_seconds or seconds is required - duration must be explicitly provided");
    }
    
    // Log when using legacy field only (helps track migration)
    if (settings?.seconds && !settings?.provider_seconds) {
      console.log(`Legacy caller: using seconds=${settings.seconds} without provider_seconds`);
    }
    
    const model = settings?.model || "sora-2";

    if (!allowedSizes.includes(size)) {
      throw new Error(`Invalid size. Allowed: ${allowedSizes.join(", ")}`);
    }
    if (!allowedSeconds.includes(providerSeconds)) {
      console.warn(`Duration ${providerSeconds}s not in allowed list for ${provider}. Proceeding anyway.`);
    }

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

    // Fetch timeline to get style guide and clip data
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
      
      // Find clip if clip_id provided
      if (clip_id) {
        clipData = timelineData.clips?.find(c => c.id === clip_id) || null;
      }
    }

    // Build the video prompt using shared cinematic prompt builder
    let videoPrompt: string;
    let scenePrompt: string;

    if (overridePrompt) {
      scenePrompt = overridePrompt;
    } else if (clipData?.prompt) {
      scenePrompt = clipData.prompt;
    } else {
      // Build combined prompt from script content (legacy full-script mode)
      const content = script.script_content as Record<string, unknown>;
      const hook = (content?.hook as string) || "";
      const voiceover = (content?.voiceover as string) || "";
      const scenePrompts = (content?.scene_prompts as string[]) || [];

      scenePrompt = `
Create a cinematic short-form video for social media.

HOOK TEXT (opening): "${hook}"

VOICEOVER: "${voiceover}"

VISUAL SCENES:
${scenePrompts.map((p, i) => `Scene ${i + 1}: ${p}`).join("\n")}

Style: Professional, engaging, suitable for TikTok/Reels. Smooth transitions between scenes.
      `.trim();
    }

    // Use full cinematic prompt builder for professional quality
    videoPrompt = buildCinematicPrompt(
      styleGuide,
      scenePrompt,
      !starting_frame_url, // isFirstClip - true if no starting frame
      clipData?.camera_direction // Per-clip shot direction
    );

    // Create the video job in database first
    const { data: job, error: jobError } = await supabase
      .from("video_jobs")
      .insert({
        script_run_id,
        status: "queued",
        provider,
        settings: { 
          size, 
          provider_seconds: providerSeconds,
          requested_seconds: requestedSeconds,
          // Legacy field for backwards compat
          seconds: providerSeconds,
          model,
          clip_id: clip_id || null,
          prompt: videoPrompt.slice(0, 500), // Store truncated prompt for reference
          seed: settings.seed,
          camera_direction: clipData?.camera_direction,
          // Provider-neutral task ID (set after API call)
          provider_job_id: null,
        },
        progress: 0,
        openai_status: "pending",
      })
      .select()
      .single();

    if (jobError) {
      throw new Error(`Failed to create job: ${jobError.message}`);
    }

    // Build FormData for OpenAI Sora API
    const form = new FormData();
    form.set("prompt", videoPrompt);
    form.set("model", model);
    form.set("size", size);
    form.set("seconds", String(providerSeconds));

    // Add starting frame if provided (must be fetched and uploaded as file)
    if (starting_frame_url) {
      try {
        const imgRes = await fetch(starting_frame_url);
        if (!imgRes.ok) {
          throw new Error(`Failed to fetch starting frame: ${imgRes.status}`);
        }

        const mime = imgRes.headers.get("content-type") || "image/jpeg";
        const blob = await imgRes.blob();
        
        // input_reference must be a File with the correct size matching the video
        form.set("input_reference", new File([blob], "start-frame.jpg", { type: mime }));
        
        console.log(`Added starting frame: ${starting_frame_url}, type: ${mime}`);
      } catch (frameErr) {
        console.error("Failed to add starting frame:", frameErr);
        // Continue without starting frame rather than failing entirely
      }
    }

    // Call OpenAI Videos API with FormData
    const openaiResponse = await fetch("https://api.openai.com/v1/videos", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        // Do NOT set Content-Type - fetch will set it with boundary for FormData
      },
      body: form,
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error("OpenAI API error:", openaiResponse.status, errorText);
      
      // Update job with error
      await supabase
        .from("video_jobs")
        .update({ 
          status: "failed",
          openai_status: "failed",
          error: `OpenAI API error: ${openaiResponse.status} - ${errorText.slice(0, 200)}`,
        })
        .eq("id", job.id);

      throw new Error(`OpenAI API error: ${openaiResponse.status}`);
    }

    const openaiData = await openaiResponse.json();
    const openaiVideoId = openaiData.id;
    const openaiStatus = openaiData.status || "queued";

    // Update job with OpenAI video ID - store in both openai_video_id and settings.provider_job_id
    await supabase
      .from("video_jobs")
      .update({ 
        status: "running",
        openai_video_id: openaiVideoId,
        openai_status: openaiStatus,
        settings: {
          ...job.settings,
          provider_job_id: openaiVideoId,
        },
      })
      .eq("id", job.id);

    console.log(`Created OpenAI video job: ${openaiVideoId} (status: ${openaiStatus}) for job: ${job.id}${clip_id ? ` clip: ${clip_id}` : ""}`);

    return new Response(
      JSON.stringify({
        success: true,
        job: {
          id: job.id,
          status: "running",
          openai_video_id: openaiVideoId,
          openai_status: openaiStatus,
          clip_id: clip_id || null,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("queue-video error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
