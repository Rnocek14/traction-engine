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
  /** Skip prompt enrichment - prompt is already fully built (Myth Mode, Film Mode, etc.) */
  skip_enrichment?: boolean;
  /** Original prompt before any enrichment (for audit) */
  original_prompt?: string;
  /** Skip internal retry ladder - chain layer owns retry for story mode (FIX #4) */
  skip_internal_retry?: boolean;
  /** Bypass QA gate for story mode / dev testing */
  bypass_qa?: boolean;
  /** Story job ID - if present, this is story mode (not script-based QA flow) */
  story_job_id?: string;
  /** Scene index for story mode - used for pro model upgrade logic */
  sequence_index?: number;
  /** Force a specific model (overrides auto-upgrade) */
  force_model?: string;
  /** Disable pro upgrade even if scene qualifies (cost control) */
  pro_upgrade?: boolean | "auto";
  /** Number of variants to generate (default 1) */
  variants?: number;
  /** Variant strategy: camera, staging, timing, or all */
  variant_strategy?: "camera" | "staging" | "timing" | "all";
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
    const { script_run_id, clip_id, prompt: overridePrompt, settings, starting_frame_url, provider: reqProvider, skip_enrichment, original_prompt: explicitOriginalPrompt, skip_internal_retry, bypass_qa, story_job_id } = body;

    if (!script_run_id) {
      throw new Error("script_run_id is required");
    }

    const provider = reqProvider || "sora";

    // ============================================================
    // PRO MODEL AUTO-UPGRADE FOR SETPIECES
    // ============================================================
    // Fetch story context if story_job_id provided (for model upgrade decision)
    let storyGenerationSettings: Record<string, unknown> | null = null;
    let sceneContext: Record<string, unknown> | null = null;
    let sequenceIndex: number | null = null;
    
    // Safe parsing for sequence_index
    if (story_job_id && body.sequence_index !== undefined) {
      const parsedSeq = Number(body.sequence_index);
      sequenceIndex = Number.isFinite(parsedSeq) ? parsedSeq : null;
    }
    
    if (story_job_id && sequenceIndex !== null) {
      const { data: storyJob } = await supabase
        .from("story_jobs")
        .select("storyboard_json")
        .eq("id", story_job_id)
        .single();
      
      if (storyJob?.storyboard_json) {
        const storyboard = storyJob.storyboard_json as Record<string, unknown>;
        storyGenerationSettings = (storyboard.generation_settings || {}) as Record<string, unknown>;
        const scenes = (storyboard.scenes || []) as Record<string, unknown>[];
        sceneContext = scenes[sequenceIndex] || null;
      }
    }
    
    // Determine if scene qualifies for sora-2-pro upgrade
    function shouldUsePro(
      gs: Record<string, unknown> | null, 
      scene: Record<string, unknown> | null
    ): boolean {
      const esc = Number(scene?.escalation_delta ?? 0);
      const sp = Number(scene?.setpiece_delta ?? 0);
      const actionMode = gs?.action_mode === true;
      // Normalize: action_mode=true overrides contemplative
      const rawIntensity = gs?.intensity_profile as string | undefined;
      const intensity = (actionMode && (!rawIntensity || rawIntensity === "contemplative"))
        ? "action"
        : rawIntensity;
      
      return (
        esc >= 2 ||
        sp >= 2 ||
        actionMode ||
        intensity === "action" ||
        intensity === "epic"
      );
    }
    
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
    
    // Model selection with pro auto-upgrade
    let model: string;
    const baseModel = settings?.model || "sora-2";
    let modelReason: string;
    
    if (body.force_model) {
      // Explicit override wins
      model = body.force_model;
      modelReason = "forced";
      console.log(`[queue-video] model=${model} (forced override)`);
    } else if (body.pro_upgrade === false) {
      // Pro upgrade explicitly disabled
      model = baseModel;
      modelReason = "pro_disabled";
      console.log(`[queue-video] model=${model} (pro_upgrade disabled)`);
    } else if (provider === "sora" && shouldUsePro(storyGenerationSettings, sceneContext)) {
      // Auto-upgrade to pro for setpieces
      model = "sora-2-pro";
      modelReason = "auto_pro";
      console.log(
        `[queue-video] model=${model} (auto-upgraded) ` +
        `esc=${sceneContext?.escalation_delta ?? 0} ` +
        `setpiece=${sceneContext?.setpiece_delta ?? 0} ` +
        `intensity=${storyGenerationSettings?.intensity_profile ?? "none"} ` +
        `action_mode=${storyGenerationSettings?.action_mode ?? false}`
      );
    } else {
      model = baseModel;
      modelReason = "default";
      console.log(`[queue-video] model=${model} (default)`);
    }

    // ============================================================
    // VARIANT GENERATION
    // ============================================================
    const variantCount = Math.min(Math.max(body.variants || 1, 1), 5); // 1-5 variants
    const variantStrategy = body.variant_strategy || "all";
    
    // Variant mutation tags - controlled diversity without breaking V3 structure
    const VARIANT_MUTATIONS: Record<string, string[]> = {
      camera: [
        "", // v0 = original
        "[VARIANT: handheld, aggressive push-in, low angle on impacts]",
        "[VARIANT: crane shot, sweeping overhead to ground level]",
        "[VARIANT: dolly zoom, Hitchcock vertigo effect on transformation peak]",
        "[VARIANT: static wide, let action fill frame, no camera movement]",
      ],
      staging: [
        "",
        "[VARIANT: wider debris field, stronger silhouette deformation]",
        "[VARIANT: tighter framing, extreme close-up punctuations]",
        "[VARIANT: layered depth, foreground particles + mid silhouette + far environment]",
        "[VARIANT: asymmetric composition, rule of thirds tension]",
      ],
      timing: [
        "",
        "[VARIANT: front-load action in first 3s, slow reveal after]",
        "[VARIANT: slow build, explosive climax in final 4s]",
        "[VARIANT: rhythmic pulses, 3 distinct motion peaks]",
        "[VARIANT: sustained crescendo, continuous escalation]",
      ],
    };
    
    function getVariantMutation(variantIndex: number, strategy: string): string {
      if (variantIndex === 0) return ""; // v0 is always the original
      
      const mutations: string[] = [];
      if (strategy === "all" || strategy === "camera") {
        mutations.push(VARIANT_MUTATIONS.camera[variantIndex] || "");
      }
      if (strategy === "all" || strategy === "staging") {
        mutations.push(VARIANT_MUTATIONS.staging[variantIndex] || "");
      }
      if (strategy === "all" || strategy === "timing") {
        mutations.push(VARIANT_MUTATIONS.timing[variantIndex] || "");
      }
      return mutations.filter(Boolean).join("\n");
    }
    
    // Results collector for multi-variant response
    const createdJobs: Array<{ id: string; variant_index: number; openai_video_id: string }> = [];

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

    // QA gate - conditional bypass for story mode and dev testing
    // Story mode uses story_jobs flow, not script QA flow
    const isStoryMode = !!story_job_id || !!body.motif_context;
    const shouldBypassQa = bypass_qa === true || isStoryMode;
    
    if (!shouldBypassQa && script.status !== "qa_passed") {
      throw new Error("Script must pass QA before video generation (use bypass_qa: true for story mode)");
    }
    
    if (shouldBypassQa) {
      console.log(`[queue-video] QA bypass active: story_mode=${isStoryMode}, explicit_bypass=${bypass_qa}`);
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

    // Helper: detect if prompt was pre-built by continue-story-chain or mode-specific generators
    // These prompts already have cinematography, capture contracts, and narrative context
    const isPreBuiltPrompt = (prompt: string): boolean => {
      return prompt.includes("[CAPTURE:") || 
             prompt.includes("[CINEMATOGRAPHY role=") ||
             prompt.includes("=== DIRECTOR'S BRIEF ===") ||
             prompt.includes("[STYLE:");  // Myth Mode prompts start with [STYLE:
    };

    // PASS-THROUGH MODE: Skip enrichment if explicitly requested OR if prompt is pre-built
    if (skip_enrichment || (overridePrompt && isPreBuiltPrompt(overridePrompt))) {
      // Prompt already has everything needed - use as-is
      videoPrompt = overridePrompt || "";
      scenePrompt = explicitOriginalPrompt || overridePrompt || "";
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

    // ============================================================
    // VARIANT LOOP: Generate N variants with controlled mutations
    // ============================================================
    for (let variantIndex = 0; variantIndex < variantCount; variantIndex++) {
      // Apply variant mutation to prompt
      const variantMutation = getVariantMutation(variantIndex, variantStrategy);
      const variantPrompt = variantMutation 
        ? `${videoPrompt}\n\n${variantMutation}`
        : videoPrompt;
      
      if (variantCount > 1) {
        console.log(`[queue-video] Generating variant ${variantIndex + 1}/${variantCount} (strategy: ${variantStrategy})`);
      }

      // Create the video job in database
      const { data: job, error: jobError } = await supabase
        .from("video_jobs")
        .insert({
          script_run_id,
          status: "queued",
          provider,
          // Store prompts in proper columns for auto-rating and audit
          original_prompt: scenePrompt,
          enriched_prompt: variantPrompt,
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
            // Model selection audit
            model_selected: model,
            model_reason: modelReason,
            scene_escalation_delta: sceneContext?.escalation_delta ?? null,
            scene_setpiece_delta: sceneContext?.setpiece_delta ?? null,
            // Variant tracking
            variant_index: variantIndex,
            variant_count: variantCount,
            variant_strategy: variantStrategy,
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
      // FIX #4: If skip_internal_retry is true, chain layer owns retry - single attempt only
      const MAX_RETRIES = skip_internal_retry ? 1 : 3;
      let lastError: string | undefined;
      let openaiData: { id: string; status?: string } | undefined;
      let startingFrameBlob: Blob | undefined;
      let startingFrameMime = "image/jpeg";
      
      // Pre-fetch starting frame (if provided) so we can retry with/without it
      // Only fetch once for first variant
      if (starting_frame_url && variantIndex === 0) {
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
          const { sanitized, wasModified, replacements } = sanitizeForModeration(variantPrompt, "soft");
          if (wasModified) {
            logModerationSanitization(variantPrompt, sanitized, replacements, "soft", job.id);
          }
          promptForAttempt = sanitized;
        } else {
          // Apply retry ladder
          const retryCtx: RetryContext = {
            attempt,
            originalPrompt: variantPrompt,
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

      console.log(`Created OpenAI video job: ${openaiVideoId} (status: ${openaiStatus}) for job: ${job.id}${clip_id ? ` clip: ${clip_id}` : ""}${variantCount > 1 ? ` variant: ${variantIndex}` : ""}`);
      
      createdJobs.push({
        id: job.id,
        variant_index: variantIndex,
        openai_video_id: openaiVideoId,
      });
    } // End variant loop

    return new Response(
      JSON.stringify({
        success: true,
        jobs: createdJobs,
        // Legacy single-job response for backwards compat
        job: createdJobs[0] ? {
          id: createdJobs[0].id,
          status: "running",
          openai_video_id: createdJobs[0].openai_video_id,
          openai_status: "queued",
          clip_id: clip_id || null,
        } : null,
        variant_count: variantCount,
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
