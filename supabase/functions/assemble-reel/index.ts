import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================
// Types
// ============================================

interface ClipInput {
  id: string;
  url: string;
  duration: number;
  index: number;
}

interface AssembleRequest {
  script_run_id: string;
  transition_type?: "cut" | "crossfade" | "fade" | "wipe";
  transition_duration?: number; // 0.1 - 0.5 seconds
  output_width?: number;
  output_height?: number;
  output_fps?: number;
}

// Request sent to FFmpeg service (excludes sensitive data from what we store)
interface FFmpegServiceRequest {
  job_id: string;
  idempotency_key: string;
  clips: { url: string; duration: number }[];
  voiceover_url?: string;
  output: {
    width: number;
    height: number;
    fps: number;
    video_bitrate: string;
    audio_bitrate: string;
  };
  transition: {
    type: string;
    duration: number;
  };
  mix: {
    duck_video_audio: boolean;
    video_audio_gain_db: number;
    voiceover_gain_db: number;
  };
  upload: {
    provider: string;
    bucket: string;
    path: string;
    upsert: boolean;
    supabase_url: string;
    supabase_service_key: string;
  };
}

// Sanitized metadata stored in DB (no secrets!)
interface AssembledMeta {
  started_at?: string;
  completed_at?: string;
  failed_at?: string;
  error?: string;
  clips_count: number;
  clip_ids?: string[];
  expected_duration: number;
  voiceover_available: boolean;
  transition: { type: string; duration: number };
  output: { width: number; height: number; fps: number };
  ffmpeg_job_id?: string;
  ffmpeg_status?: string;
  eta_seconds?: number;
  duration?: number;
  idempotency_key?: string;
}

interface TimelineData {
  clips: Array<{
    id: string;
    type: string;
    start: number;
    end: number;
    prompt?: string;
    source?: {
      video_job_id?: string;
    };
    disabled?: boolean;
  }>;
  style_guide?: Record<string, unknown>;
}

// ============================================
// Utilities
// ============================================

/**
 * Compute a stable hash from inputs for idempotency.
 * Uses clip IDs, durations, transition settings, output settings, and voiceover.
 */
async function computeIdempotencyHash(
  clips: ClipInput[],
  voiceoverUrl: string | null,
  transition: { type: string; duration: number },
  output: { width: number; height: number; fps: number }
): Promise<string> {
  const payload = JSON.stringify({
    clips: clips.map(c => ({ id: c.id, duration: c.duration })),
    voiceover: voiceoverUrl || null,
    transition,
    output,
  });
  
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.slice(0, 8).map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Enforce minimum clip duration for xfade safety.
 * Returns adjusted transition duration if clips are too short.
 */
function safeTransitionDuration(clips: ClipInput[], requestedDuration: number): number {
  const minClipDuration = Math.min(...clips.map(c => c.duration));
  // xfade needs clip duration > transition + buffer
  const maxSafeTransition = Math.max(0.1, minClipDuration - 0.3);
  
  if (requestedDuration > maxSafeTransition) {
    console.log(`Clamping transition from ${requestedDuration}s to ${maxSafeTransition}s (min clip: ${minClipDuration}s)`);
    return maxSafeTransition;
  }
  return requestedDuration;
}

// ============================================
// Main Handler
// ============================================

/**
 * Assembles video clips with voiceover audio baked in and crossfade transitions.
 * Calls external FFmpeg microservice (Fly.io) for rendering.
 * 
 * This is the server-side bake that ensures:
 * - Audio/video sync is locked (not client-dependent)
 * - Transitions are baked into the final MP4
 * - Export quality matches preview quality
 * - Mixed resolutions are normalized to output size
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ffmpegServiceUrl = Deno.env.get("FFMPEG_SERVICE_URL");
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body: AssembleRequest = await req.json();
    const {
      script_run_id,
      transition_type = "crossfade",
      transition_duration: requestedTransitionDuration = 0.2,
      output_width = 1080,
      output_height = 1920,
      output_fps = 30,
    } = body;

    if (!script_run_id) {
      throw new Error("script_run_id is required");
    }

    // Check if already rendering
    const { data: existingRun } = await supabase
      .from("script_runs")
      .select("assembled_status, assembled_meta")
      .eq("id", script_run_id)
      .single();

    if (existingRun?.assembled_status === "rendering") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Assembly already in progress",
          status: "rendering",
          job_id: (existingRun.assembled_meta as AssembledMeta)?.ffmpeg_job_id,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch script run with voiceover
    const { data: scriptRun, error: scriptError } = await supabase
      .from("script_runs")
      .select("*")
      .eq("id", script_run_id)
      .single();

    if (scriptError || !scriptRun) {
      throw new Error(`Script not found: ${scriptError?.message}`);
    }

    // Fetch timeline for ordered clips with durations
    const { data: timeline } = await supabase
      .from("studio_timelines")
      .select("timeline_json, version")
      .eq("script_run_id", script_run_id)
      .order("version", { ascending: false })
      .limit(1)
      .single();

    // Get clips from timeline or fall back to video_jobs order
    let orderedClipIds: string[] = [];
    let clipDurations: Map<string, number> = new Map();

    if (timeline?.timeline_json) {
      const timelineData = timeline.timeline_json as TimelineData;
      const enabledClips = timelineData.clips
        .filter(c => c.type === "video" && !c.disabled && c.source?.video_job_id)
        .sort((a, b) => a.start - b.start);
      
      for (const clip of enabledClips) {
        if (clip.source?.video_job_id) {
          orderedClipIds.push(clip.source.video_job_id);
          clipDurations.set(clip.source.video_job_id, clip.end - clip.start);
        }
      }
    }

    // Fetch completed video jobs
    const { data: videoJobs, error: jobsError } = await supabase
      .from("video_jobs")
      .select("*")
      .eq("script_run_id", script_run_id)
      .in("status", ["done", "succeeded"]);

    if (jobsError) {
      throw new Error(`Failed to fetch video jobs: ${jobsError.message}`);
    }

    if (!videoJobs?.length) {
      throw new Error("No completed video clips to assemble");
    }

    // Build ordered clip list with URLs and durations
    const jobMap = new Map(videoJobs.map(j => [j.id, j]));
    const clips: ClipInput[] = [];

    if (orderedClipIds.length > 0) {
      // Use timeline order
      for (let i = 0; i < orderedClipIds.length; i++) {
        const jobId = orderedClipIds[i];
        const job = jobMap.get(jobId);
        if (job?.output_url) {
          clips.push({
            id: jobId,
            url: job.output_url,
            duration: clipDurations.get(jobId) || (job.settings as Record<string, unknown>)?.seconds as number || 4,
            index: i,
          });
        }
      }
    } else {
      // Fall back to creation order
      const sortedJobs = videoJobs
        .filter(j => j.output_url)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      
      for (let i = 0; i < sortedJobs.length; i++) {
        const job = sortedJobs[i];
        clips.push({
          id: job.id,
          url: job.output_url!,
          duration: (job.settings as Record<string, unknown>)?.seconds as number || 4,
          index: i,
        });
      }
    }

    if (clips.length === 0) {
      throw new Error("No valid clips with output URLs found");
    }

    if (clips.length < 2) {
      throw new Error("Need at least 2 clips to assemble a reel");
    }

    const voiceoverUrl = scriptRun.voiceover_audio_url as string | null;

    // Enforce minimum clip duration for safe xfade
    const transition_duration = safeTransitionDuration(clips, requestedTransitionDuration);

    const outputSettings = { width: output_width, height: output_height, fps: output_fps };
    const transitionSettings = { 
      type: transition_type === "crossfade" ? "fade" : transition_type, 
      duration: transition_duration 
    };

    // Compute idempotency hash from actual inputs (not just version)
    const inputHash = await computeIdempotencyHash(clips, voiceoverUrl, transitionSettings, outputSettings);
    const idempotencyKey = `${script_run_id}:${inputHash}`;

    console.log(`Assembling reel: ${clips.length} clips, voiceover: ${!!voiceoverUrl}`);
    console.log(`Transition: ${transitionSettings.type} @ ${transition_duration}s`);
    console.log(`Output: ${output_width}x${output_height} @ ${output_fps}fps`);
    console.log(`Idempotency: ${idempotencyKey}`);

    // Calculate expected duration
    const totalClipDuration = clips.reduce((sum, c) => sum + c.duration, 0);
    const transitionOverlap = (clips.length - 1) * transition_duration;
    const expectedDuration = totalClipDuration - transitionOverlap;

    // Build sanitized metadata (NO secrets!)
    const sanitizedMeta: AssembledMeta = {
      started_at: new Date().toISOString(),
      clips_count: clips.length,
      clip_ids: clips.map(c => c.id),
      expected_duration: expectedDuration,
      voiceover_available: !!voiceoverUrl,
      transition: transitionSettings,
      output: outputSettings,
      idempotency_key: idempotencyKey,
    };

    // Check if FFmpeg service is configured
    if (!ffmpegServiceUrl) {
      // Update status to indicate service not configured
      await supabase
        .from("script_runs")
        .update({
          assembled_status: "failed",
          assembled_meta: {
            ...sanitizedMeta,
            error: "FFmpeg service not configured",
            failed_at: new Date().toISOString(),
          },
        })
        .eq("id", script_run_id);

      return new Response(
        JSON.stringify({
          success: false,
          error: "FFmpeg service not configured. Set FFMPEG_SERVICE_URL secret.",
          clips_count: clips.length,
          expected_duration: expectedDuration,
          voiceover_available: !!voiceoverUrl,
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate job ID
    const jobId = crypto.randomUUID();

    // Mark as rendering with sanitized metadata
    await supabase
      .from("script_runs")
      .update({
        assembled_status: "rendering",
        assembled_meta: {
          ...sanitizedMeta,
          ffmpeg_job_id: jobId,
        },
      })
      .eq("id", script_run_id);

    // Build FFmpeg service request (includes secrets for upload, but NOT stored)
    const ffmpegRequest: FFmpegServiceRequest = {
      job_id: jobId,
      idempotency_key: idempotencyKey,
      clips: clips.map(c => ({ url: c.url, duration: c.duration })),
      voiceover_url: voiceoverUrl || undefined,
      output: {
        ...outputSettings,
        video_bitrate: "8M",
        audio_bitrate: "192k",
      },
      transition: transitionSettings,
      mix: {
        duck_video_audio: true,
        video_audio_gain_db: -18,
        voiceover_gain_db: 0,
      },
      upload: {
        provider: "supabase",
        bucket: "videos",
        path: `assembled/${script_run_id}.mp4`,
        upsert: true,
        supabase_url: supabaseUrl,
        supabase_service_key: supabaseKey, // Only sent to FFmpeg service, NOT stored!
      },
    };

    console.log(`Calling FFmpeg service at ${ffmpegServiceUrl}`);

    // Call FFmpeg service
    const ffmpegResponse = await fetch(`${ffmpegServiceUrl}/render/reel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(ffmpegRequest),
    });

    if (!ffmpegResponse.ok) {
      const errorText = await ffmpegResponse.text();
      throw new Error(`FFmpeg service error: ${ffmpegResponse.status} - ${errorText}`);
    }

    const ffmpegResult = await ffmpegResponse.json();

    console.log("FFmpeg service response:", ffmpegResult);

    // Handle sync completion
    if (ffmpegResult.status === "succeeded" && ffmpegResult.output_url) {
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/videos/assembled/${script_run_id}.mp4`;
      
      await supabase
        .from("script_runs")
        .update({
          assembled_video_url: ffmpegResult.output_url || publicUrl,
          assembled_status: "succeeded",
          assembled_at: new Date().toISOString(),
          assembled_meta: {
            ...sanitizedMeta,
            completed_at: new Date().toISOString(),
            duration: ffmpegResult.duration || expectedDuration,
            ffmpeg_job_id: jobId,
          },
        })
        .eq("id", script_run_id);

      return new Response(
        JSON.stringify({
          success: true,
          status: "succeeded",
          output_url: ffmpegResult.output_url || publicUrl,
          duration: ffmpegResult.duration || expectedDuration,
          job_id: jobId,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Async job - update with job info for polling
    await supabase
      .from("script_runs")
      .update({
        assembled_meta: {
          ...sanitizedMeta,
          ffmpeg_job_id: jobId,
          ffmpeg_status: ffmpegResult.status || "queued",
          eta_seconds: ffmpegResult.eta_seconds,
        },
      })
      .eq("id", script_run_id);

    return new Response(
      JSON.stringify({
        success: true,
        status: ffmpegResult.status || "queued",
        job_id: jobId,
        eta_seconds: ffmpegResult.eta_seconds,
        expected_duration: expectedDuration,
      }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("assemble-reel error:", error);

    // Try to update status on error
    try {
      const body = await req.clone().json().catch(() => ({}));
      if (body.script_run_id) {
        await supabase
          .from("script_runs")
          .update({
            assembled_status: "failed",
            assembled_meta: {
              error: error instanceof Error ? error.message : "Unknown error",
              failed_at: new Date().toISOString(),
            },
          })
          .eq("id", body.script_run_id);
      }
    } catch {
      // Ignore update error
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
