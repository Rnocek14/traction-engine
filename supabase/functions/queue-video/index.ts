import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { 
  buildCinematicPrompt, 
  buildProviderPromptWithMotif,
  type StyleGuideData,
  type StoryPromptContext,
} from "../_shared/cinematic-prompts.ts";
import { type MotifScene } from "../_shared/motif-injection.ts";
import { type SceneRole } from "../_shared/scene-role-router.ts";
import { 
  sanitizeForModeration, 
  logModerationSanitization,
  getRetryPrompt,
  isModerationError,
  logRetryAttempt,
  type RetryContext,
} from "../_shared/moderation-safety.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Motif context for story generation (optional)
interface MotifContext {
  sceneId: string;
  sceneIndex: number;
  role: SceneRole;
  isHeroShot?: boolean;
  changeType?: string;
  motifs: string[];
  allScenes: MotifScene[];
}

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
  /** Optional motif context for story generation */
  motif_context?: MotifContext;
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

    // Helper: detect if prompt was pre-built by continue-story-chain
    // These prompts already have cinematography, capture contracts, and narrative context
    const isPreBuiltPrompt = (prompt: string): boolean => {
      return prompt.includes("[CAPTURE:") || 
             prompt.includes("[CINEMATOGRAPHY role=") ||
             prompt.includes("=== DIRECTOR'S BRIEF ===");
    };

    if (overridePrompt && isPreBuiltPrompt(overridePrompt)) {
      // PASS-THROUGH MODE: Prompt already has cinematography, capture contract, etc.
      // Do NOT rebuild - this preserves role-based variety and realism anchors
      videoPrompt = overridePrompt;
      scenePrompt = overridePrompt; // For logging
      console.log("[queue-video] Using pre-built prompt (pass-through mode)");
    } else {
      // Determine the raw scene prompt first
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

      // Now build the cinematic prompt
      if (body.motif_context) {
        const storyContext: StoryPromptContext = {
          sceneId: body.motif_context.sceneId,
          sceneIndex: body.motif_context.sceneIndex,
          role: body.motif_context.role,
          isHeroShot: body.motif_context.isHeroShot,
          changeType: body.motif_context.changeType,
          motifs: body.motif_context.motifs,
          allScenes: body.motif_context.allScenes,
        };
        videoPrompt = buildProviderPromptWithMotif(
          "sora",
          styleGuide,
          scenePrompt,
          !starting_frame_url,
          clipData?.camera_direction,
          storyContext
        );
      } else {
        // Use full cinematic prompt builder for professional quality
        videoPrompt = buildCinematicPrompt(
          styleGuide,
          scenePrompt,
          !starting_frame_url, // isFirstClip - true if no starting frame
          clipData?.camera_direction // Per-clip shot direction
        );
      }
    }

    // Create the video job in database first
    // Store full prompts in dedicated columns (text columns are unlimited)
    const { data: job, error: jobError } = await supabase
      .from("video_jobs")
      .insert({
        script_run_id,
        status: "queued",
        provider,
        // Store prompts in proper columns for auto-rating and audit
        original_prompt: scenePrompt,
        enriched_prompt: videoPrompt,
        settings: { 
          size, 
          provider_seconds: providerSeconds,
          requested_seconds: requestedSeconds,
          // Legacy field for backwards compat
          seconds: providerSeconds,
          model,
          clip_id: clip_id || null,
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

    // Call OpenAI Sora API with retry ladder for moderation failures
    const MAX_RETRIES = 3;
    let lastError: string | undefined;
    let openaiData: { id: string; status?: string };
    let startingFrameBlob: Blob | undefined;
    let startingFrameMime = "image/jpeg";
    
    // Pre-fetch starting frame (if provided) so we can retry with/without it
    if (starting_frame_url) {
      try {
        const imgRes = await fetch(starting_frame_url);
        if (imgRes.ok) {
          startingFrameMime = imgRes.headers.get("content-type") || "image/jpeg";
          startingFrameBlob = await imgRes.blob();
          console.log(`Pre-fetched starting frame: ${starting_frame_url}, type: ${startingFrameMime}`);
        }
      } catch (frameErr) {
        console.error("Failed to fetch starting frame:", frameErr);
      }
    }
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      // Get prompt for this attempt (escalating sanitization)
      let promptForAttempt: string;
      let useStartingFrame = !!startingFrameBlob;
      
      if (attempt === 1) {
        // First attempt: apply soft sanitization
        const { sanitized, wasModified, replacements } = sanitizeForModeration(videoPrompt, "soft");
        if (wasModified) {
          logModerationSanitization(videoPrompt, sanitized, replacements, "soft", job.id);
        }
        promptForAttempt = sanitized;
      } else {
        // Apply retry ladder
        const retryCtx: RetryContext = {
          attempt,
          originalPrompt: videoPrompt,
          provider: "sora",
          brutalityMode: false,
          lastError,
        };
        const retryResult = getRetryPrompt(retryCtx);
        logRetryAttempt(retryCtx, retryResult, job.id);
        
        promptForAttempt = retryResult.prompt;
        
        // On attempt 3, drop reference frame (force T2V)
        if (retryResult.shouldDropReference) {
          console.log(`[queue-video] Attempt ${attempt}: Dropping reference frame, forcing T2V`);
          useStartingFrame = false;
        }
      }
      
      // Build FormData for this attempt
      const form = new FormData();
      form.set("prompt", promptForAttempt);
      form.set("model", model);
      form.set("size", size);
      form.set("seconds", String(providerSeconds));
      
      if (useStartingFrame && startingFrameBlob) {
        form.set("input_reference", new File([startingFrameBlob], "start-frame.jpg", { type: startingFrameMime }));
      }
      
      const openaiResponse = await fetch("https://api.openai.com/v1/videos", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiApiKey}`,
        },
        body: form,
      });

      if (openaiResponse.ok) {
        openaiData = await openaiResponse.json();
        break; // Success!
      }
      
      const errorText = await openaiResponse.text();
      lastError = errorText;
      console.error(`[queue-video] Attempt ${attempt}/${MAX_RETRIES} failed:`, openaiResponse.status, errorText.slice(0, 200));
      
      // Check if it's a moderation error worth retrying
      if (!isModerationError(errorText) && attempt === 1) {
        // Non-moderation error on first attempt - fail immediately
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
      
      // If this was the last attempt, fail
      if (attempt === MAX_RETRIES) {
        await supabase
          .from("video_jobs")
          .update({ 
            status: "failed",
            openai_status: "failed",
            error: `OpenAI API error after ${MAX_RETRIES} attempts: ${openaiResponse.status} - ${errorText.slice(0, 200)}`,
          })
          .eq("id", job.id);
        throw new Error(`OpenAI API error: ${openaiResponse.status} - exhausted ${MAX_RETRIES} retry attempts`);
      }
      
      // Wait briefly before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }

    const openaiVideoId = openaiData!.id;
    const openaiStatus = openaiData!.status || "queued";

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
