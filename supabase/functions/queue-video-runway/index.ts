/**
 * Queue Video for Runway Gen-3 Alpha
 * 
 * Supports both text-to-video and image-to-video (for frame chaining).
 * Accepts same interface as queue-video for seamless provider switching.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { 
  buildRunwayPrompt, 
  buildProviderPromptWithMotif,
  type StyleGuideData,
  type StoryPromptContext,
} from "../_shared/cinematic-prompts.ts";
import { type MotifScene } from "../_shared/motif-injection.ts";
import { type SceneRole } from "../_shared/scene-role-router.ts";

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
  /** Optional motif context for story generation */
  motif_context?: MotifContext;
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

// Map Sora durations to Runway text-to-video (accepts 4, 6, or 8 seconds)
function mapDurationToRunwayTextToVideo(soraDuration: number): 4 | 6 | 8 {
  if (soraDuration <= 5) return 4;
  if (soraDuration <= 7) return 6;
  return 8;
}

// Map Sora durations to Runway image-to-video (accepts 2-10 seconds)
function mapDurationToRunwayImageToVideo(soraDuration: number): number {
  return Math.max(2, Math.min(10, soraDuration));
}

// Valid text-to-video models: veo3, veo3.1, veo3.1_fast
function getTextToVideoModel(model?: string): string {
  const validModels = ["veo3", "veo3.1", "veo3.1_fast"];
  if (model && validModels.includes(model)) return model;
  return "veo3.1_fast"; // Best balance of speed and quality
}

// Valid image-to-video models: gen4_turbo, veo3.1, gen3a_turbo, veo3.1_fast, veo3
function getImageToVideoModel(model?: string): string {
  const validModels = ["gen4_turbo", "veo3.1", "gen3a_turbo", "veo3.1_fast", "veo3"];
  if (model && validModels.includes(model)) return model;
  return "gen4_turbo"; // Best for image-to-video continuity
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
    
    // Get the base duration from settings (will be mapped per endpoint type later)
    let baseDuration: number;
    if (settings?.provider_seconds !== undefined) {
      baseDuration = settings.provider_seconds;
    } else if (requestedSeconds !== undefined) {
      baseDuration = requestedSeconds;
    } else if (legacySeconds !== undefined) {
      baseDuration = legacySeconds;
      console.log(`Warning: Using legacy seconds=${legacySeconds} for Runway`);
    } else {
      baseDuration = 6; // Default to 6s
    }

    // Map settings to Runway format
    const runwaySize = mapSizeToRunway(settings?.size || "720x1280");

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

    // Build Runway-optimized prompt (with optional motif injection)
    let videoPrompt: string;
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
        "runway",
        styleGuide,
        scenePrompt,
        !starting_frame_url,
        clipData?.camera_direction,
        storyContext
      );
    } else {
      videoPrompt = buildRunwayPrompt(
        styleGuide,
        scenePrompt,
        clipData?.camera_direction
      );
    }

    // Determine if image-to-video based on reference image availability
    const isImageToVideo = !!starting_frame_url || !!styleGuide?.reference_image_url;
    const referenceImageUrl = starting_frame_url || styleGuide?.reference_image_url;

    // Get the correct model and duration based on endpoint type
    let runwayModel: string;
    let runwayDuration: number;
    
    if (isImageToVideo) {
      // Image-to-video: accepts gen4_turbo, veo3.1, gen3a_turbo, veo3.1_fast, veo3
      // Duration: 2-10 seconds
      runwayModel = getImageToVideoModel(settings?.model);
      runwayDuration = mapDurationToRunwayImageToVideo(baseDuration);
    } else {
      // Text-to-video: only accepts veo3, veo3.1, veo3.1_fast
      // Duration: exactly 4, 6, or 8
      runwayModel = getTextToVideoModel(settings?.model);
      runwayDuration = mapDurationToRunwayTextToVideo(baseDuration);
    }

    // Create job record first - store both timeline and provider durations
    const { data: job, error: jobError } = await supabase
      .from("video_jobs")
      .insert({
        script_run_id,
        status: "queued",
        provider: "runway",
        settings: {
          // Runway uses : format (e.g., "720:1280")
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
          // Store original Sora format for reference
          original_sora_size: settings?.size,
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

    // Build Runway API request
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
      console.log(`Using image-to-video with reference: ${referenceImageUrl}, model: ${runwayModel}, duration: ${runwayDuration}`);
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
      console.log(`Using text-to-video with model: ${runwayModel}, duration: ${runwayDuration}`);
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
      
      // Detect credits/quota error for clearer messaging
      const isQuotaError = errorText.includes("credits") || errorText.includes("quota");
      const errorSummary = isQuotaError 
        ? "No credits available" 
        : `Runway API error: ${runwayResponse.status}`;
      
      // Update job with error
      await supabase
        .from("video_jobs")
        .update({
          status: "failed",
          openai_status: "failed",
          error: `Runway API error: ${runwayResponse.status} - ${errorText.slice(0, 200)}`,
        })
        .eq("id", job.id);

      // Include quota indicator in thrown error for continue-story-chain to detect
      throw new Error(isQuotaError 
        ? `Runway API error: ${runwayResponse.status} - no credits available`
        : `Runway API error: ${runwayResponse.status}`);
    }

    const runwayData = await runwayResponse.json();
    const runwayTaskId = runwayData.id;

    // Update job with Runway task ID - store in settings.provider_job_id (provider-neutral)
    await supabase
      .from("video_jobs")
      .update({
        status: "running",
        settings: {
          ...job.settings,
          provider_job_id: runwayTaskId,
        },
        // Keep openai_video_id temporarily for backwards compat
        openai_video_id: runwayTaskId,
        openai_status: "PENDING",
      })
      .eq("id", job.id);

    console.log(`Created Runway video job: ${runwayTaskId} for job: ${job.id}${clip_id ? ` clip: ${clip_id}` : ""}`, {
      requestedSeconds: requestedSeconds ?? legacySeconds ?? runwayDuration,
      providerSeconds: runwayDuration,
      size: runwaySize,
    });

    return new Response(
      JSON.stringify({
        success: true,
        job: {
          id: job.id,
          status: "running",
          provider: "runway",
          provider_job_id: runwayTaskId,
          requested_seconds: requestedSeconds ?? legacySeconds ?? runwayDuration,
          provider_seconds: runwayDuration,
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
