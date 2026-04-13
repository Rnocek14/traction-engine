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
  requested_seconds: number;
  generated_seconds: number;
  trim_seconds: number;
  trim_clamped: boolean;
  freeze_extend: boolean;
  duration: number;
  index: number;
}

interface AssembleRequest {
  script_run_id?: string;
  story_job_id?: string;
  transition_type?: "cut" | "crossfade" | "fade" | "wipe";
  transition_duration?: number;
  output_width?: number;
  output_height?: number;
  output_fps?: number;
}

interface FFmpegServiceRequest {
  job_id: string;
  idempotency_key: string;
  clips: { 
    url: string; 
    requested_seconds: number;
    generated_seconds: number;
    trim_seconds: number;
    freeze_extend?: boolean;
  }[];
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
  ffmpeg_instance_id?: string;
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

async function computeIdempotencyHash(
  clips: ClipInput[],
  voiceoverUrl: string | null,
  transition: { type: string; duration: number },
  output: { width: number; height: number; fps: number }
): Promise<string> {
  const payload = JSON.stringify({
    clips: clips.map(c => ({ 
      id: c.id, 
      trim_seconds: c.trim_seconds,
      generated_seconds: c.generated_seconds,
    })),
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

function safeTransitionDuration(clips: ClipInput[], requestedDuration: number): number {
  const minClipDuration = Math.min(...clips.map(c => c.trim_seconds));
  const maxSafeTransition = Math.max(0.1, minClipDuration - 0.3);
  
  if (minClipDuration <= requestedDuration + 0.05) {
    const forcedTransition = Math.max(0.05, minClipDuration - 0.05);
    console.log(`Force-clamping transition to ${forcedTransition}s (min clip: ${minClipDuration}s)`);
    return forcedTransition;
  }
  
  if (requestedDuration > maxSafeTransition) {
    console.log(`Clamping transition from ${requestedDuration}s to ${maxSafeTransition}s (min clip: ${minClipDuration}s)`);
    return maxSafeTransition;
  }
  return requestedDuration;
}

function validateClipDurations(clips: ClipInput[], minDuration: number = 0.3): string[] {
  const errors: string[] = [];
  for (const clip of clips) {
    if (clip.trim_seconds < minDuration) {
      errors.push(
        `Clip ${clip.index + 1} (${clip.id.slice(0, 8)}...) too short after clamping: ` +
        `requested=${clip.requested_seconds.toFixed(2)}s ` +
        `generated=${clip.generated_seconds.toFixed(2)}s ` +
        `trim=${clip.trim_seconds.toFixed(2)}s ` +
        `(min=${minDuration}s)`
      );
    }
  }
  return errors;
}

// ============================================
// Helper: write assembly status to correct table
// ============================================

async function updateAssemblyStatus(
  supabase: ReturnType<typeof createClient>,
  isStoryMode: boolean,
  primaryId: string,
  update: Record<string, unknown>,
) {
  const table = isStoryMode ? "story_jobs" : "script_runs";
  const { error } = await supabase
    .from(table)
    .update(update)
    .eq("id", primaryId);
  if (error) {
    console.log(JSON.stringify({ at: "assemble-reel:status_update_error", table, primaryId, error: error.message }));
  }
}

async function getRemoteJobState(
  ffmpegServiceUrl: string | undefined,
  jobId?: string,
  instanceId?: string,
): Promise<"active" | "done" | "missing" | "unknown"> {
  if (!jobId) return "missing";
  if (!ffmpegServiceUrl) return "unknown";

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (instanceId) {
      headers["fly-force-instance-id"] = instanceId;
    }

    const response = await fetch(`${ffmpegServiceUrl}/jobs/${jobId}`, {
      method: "GET",
      headers,
    });

    if (response.status === 404) return "missing";
    if (!response.ok) return "unknown";

    const result = await response.json();
    const status = result?.status;

    if (status === "queued" || status === "rendering") return "active";
    if (status === "succeeded" || status === "failed") return "done";
    return "unknown";
  } catch (error) {
    console.log(JSON.stringify({
      at: "assemble-reel:remote_job_probe_error",
      job_id: jobId,
      error: error instanceof Error ? error.message : "Unknown error",
    }));
    return "unknown";
  }
}

// ============================================
// Main Handler
// ============================================

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
      story_job_id,
      transition_type = "crossfade",
      transition_duration: requestedTransitionDuration = 0.2,
      output_width = 1080,
      output_height = 1920,
      output_fps = 30,
    } = body;

    if (!script_run_id && !story_job_id) {
      throw new Error("Either script_run_id or story_job_id is required");
    }

    const isStoryMode = !!story_job_id;

    interface VideoJobRecord {
      id: string;
      output_url: string | null;
      created_at: string;
      settings: Record<string, unknown> | null;
      sequence_index?: number;
      scene_id?: string;
      is_primary?: boolean;
    }

    interface VoiceoverSceneTiming {
      scene_index: number;
      scene_id?: string;
      start_ms: number;
      end_ms: number;
    }
    
    let voiceoverUrl: string | null = null;
    let orderedClipIds: string[] = [];
    let clipDurations: Map<string, number> = new Map();
    let videoJobs: VideoJobRecord[] = [];
    let primaryId: string;
    let voiceoverTiming: VoiceoverSceneTiming[] = [];

    if (isStoryMode) {
      // ============================================
      // STORY MODE
      // ============================================
      primaryId = story_job_id!;

      const { data: existingStory } = await supabase
        .from("story_jobs")
        .select("status, active_voiceover_id, assembled_status, assembled_meta")
        .eq("id", story_job_id)
        .single();

      if (existingStory?.assembled_status === "rendering") {
        const currentMeta = existingStory.assembled_meta as AssembledMeta | null;
        const remoteJobState = await getRemoteJobState(
          ffmpegServiceUrl,
          currentMeta?.ffmpeg_job_id,
          currentMeta?.ffmpeg_instance_id,
        );

        if (remoteJobState !== "missing") {
          return new Response(
            JSON.stringify({
              success: false,
              error: "Assembly already in progress",
              status: "rendering",
              job_id: currentMeta?.ffmpeg_job_id,
            }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(JSON.stringify({
          at: "assemble-reel:stale_rendering_job_recovered",
          primary_id: primaryId,
          job_id: currentMeta?.ffmpeg_job_id,
        }));
      }

      // Fetch active voiceover
      if (existingStory?.active_voiceover_id) {
        const { data: voiceover } = await supabase
          .from("story_voiceovers")
          .select("audio_url, status, actual_timing, alignment_ok")
          .eq("id", existingStory.active_voiceover_id)
          .single();

        if (voiceover?.status === "done" && voiceover.audio_url) {
          voiceoverUrl = voiceover.audio_url;
          console.log(`[story-mode] Using voiceover: ${voiceoverUrl}`);
          
          if (voiceover.alignment_ok && Array.isArray(voiceover.actual_timing)) {
            voiceoverTiming = voiceover.actual_timing as VoiceoverSceneTiming[];
            console.log(`[story-mode] Using authoritative timing for ${voiceoverTiming.length} scenes`);
          }
        }
      }

      // Fetch completed PRIMARY video jobs
      const { data: storyJobs, error: jobsError } = await supabase
        .from("video_jobs")
        .select("*")
        .eq("story_job_id", story_job_id)
        .eq("is_primary", true)
        .in("status", ["done", "succeeded"])
        .order("sequence_index", { ascending: true });

      if (jobsError) {
        throw new Error(`Failed to fetch video jobs: ${jobsError.message}`);
      }

      videoJobs = (storyJobs || []) as VideoJobRecord[];

      for (const job of videoJobs) {
        orderedClipIds.push(job.id);
        
        const timing = voiceoverTiming.find(t => 
          (t.scene_id && t.scene_id === job.scene_id) ||
          t.scene_index === job.sequence_index
        );
        
        if (timing) {
          const narrationDuration = (timing.end_ms - timing.start_ms) / 1000;
          clipDurations.set(job.id, narrationDuration);
          console.log(`[story-mode] Scene ${job.sequence_index}: narration duration ${narrationDuration.toFixed(2)}s`);
        } else {
          const duration = (job.settings?.seconds as number) || (job.settings?.requested_seconds as number) || 5;
          clipDurations.set(job.id, duration);
          console.log(`[story-mode] Scene ${job.sequence_index}: fallback duration ${duration}s`);
        }
      }

    } else {
      // ============================================
      // SCRIPT MODE
      // ============================================
      primaryId = script_run_id!;

      const { data: existingRun } = await supabase
        .from("script_runs")
        .select("assembled_status, assembled_meta")
        .eq("id", script_run_id)
        .single();

      if (existingRun?.assembled_status === "rendering") {
        const currentMeta = existingRun.assembled_meta as AssembledMeta | null;
        const remoteJobState = await getRemoteJobState(
          ffmpegServiceUrl,
          currentMeta?.ffmpeg_job_id,
          currentMeta?.ffmpeg_instance_id,
        );

        if (remoteJobState !== "missing") {
          return new Response(
            JSON.stringify({
              success: false,
              error: "Assembly already in progress",
              status: "rendering",
              job_id: currentMeta?.ffmpeg_job_id,
            }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(JSON.stringify({
          at: "assemble-reel:stale_rendering_job_recovered",
          primary_id: primaryId,
          job_id: currentMeta?.ffmpeg_job_id,
        }));
      }

      const { data: scriptRun, error: scriptError } = await supabase
        .from("script_runs")
        .select("*")
        .eq("id", script_run_id)
        .single();

      if (scriptError || !scriptRun) {
        throw new Error(`Script not found: ${scriptError?.message}`);
      }

      voiceoverUrl = scriptRun.voiceover_audio_url as string | null;

      const { data: timeline } = await supabase
        .from("studio_timelines")
        .select("timeline_json, version")
        .eq("script_run_id", script_run_id)
        .order("version", { ascending: false })
        .limit(1)
        .single();

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

      const { data: scriptJobs, error: jobsError } = await supabase
        .from("video_jobs")
        .select("*")
        .eq("script_run_id", script_run_id)
        .in("status", ["done", "succeeded"]);

      if (jobsError) {
        throw new Error(`Failed to fetch video jobs: ${jobsError.message}`);
      }

      videoJobs = (scriptJobs || []) as VideoJobRecord[];
    }

    if (!videoJobs?.length) {
      throw new Error("No completed video clips to assemble");
    }

    // Build ordered clip list
    const jobMap = new Map(videoJobs.map(j => [j.id, j]));
    const clips: ClipInput[] = [];

    if (orderedClipIds.length > 0) {
      for (let i = 0; i < orderedClipIds.length; i++) {
        const jobId = orderedClipIds[i];
        const job = jobMap.get(jobId);
        if (job?.output_url) {
          const jobSettings = job.settings as Record<string, unknown> | null;
          const timelineDuration = clipDurations.get(jobId);
          const storedRequested = jobSettings?.requested_seconds as number | undefined;
          const storedGenerated = jobSettings?.provider_seconds as number | undefined;
          const legacySeconds = jobSettings?.seconds as number | undefined;
          
          const requested_seconds = timelineDuration ?? storedRequested ?? legacySeconds ?? 4;
          const generated_seconds = storedGenerated ?? legacySeconds ?? 4;
          const trim_seconds = Math.min(requested_seconds, generated_seconds);
          const trim_clamped = requested_seconds > generated_seconds;
          
          if (trim_clamped) {
            console.log(`Clip ${jobId.slice(0, 8)}... clamped: requested=${requested_seconds}s > generated=${generated_seconds}s, using trim=${trim_seconds}s`);
          }
          
          clips.push({
            id: jobId,
            url: job.output_url,
            requested_seconds,
            generated_seconds,
            trim_seconds,
            trim_clamped,
            freeze_extend: isStoryMode && trim_clamped,
            duration: trim_seconds,
            index: i,
          });
        }
      }
    } else {
      const sortedJobs = videoJobs
        .filter(j => j.output_url)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      
      for (let i = 0; i < sortedJobs.length; i++) {
        const job = sortedJobs[i];
        const jobSettings = job.settings as Record<string, unknown> | null;
        const storedRequested = jobSettings?.requested_seconds as number | undefined;
        const storedGenerated = jobSettings?.provider_seconds as number | undefined;
        const legacySeconds = jobSettings?.seconds as number | undefined;
        
        const requested_seconds = storedRequested ?? legacySeconds ?? 4;
        const generated_seconds = storedGenerated ?? legacySeconds ?? 4;
        const trim_seconds = Math.min(requested_seconds, generated_seconds);
        const trim_clamped = requested_seconds > generated_seconds;
        
        if (trim_clamped) {
          console.log(`Clip ${job.id.slice(0, 8)}... clamped: requested=${requested_seconds}s > generated=${generated_seconds}s, using trim=${trim_seconds}s`);
        }
        
        clips.push({
          id: job.id,
          url: job.output_url!,
          requested_seconds,
          generated_seconds,
          trim_seconds,
          trim_clamped,
          freeze_extend: false,
          duration: trim_seconds,
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

    const transition_duration = safeTransitionDuration(clips, requestedTransitionDuration);
    const outputSettings = { width: output_width, height: output_height, fps: output_fps };
    const transitionSettings = { 
      type: transition_type === "crossfade" ? "fade" : transition_type, 
      duration: transition_duration 
    };

    const inputHash = await computeIdempotencyHash(clips, voiceoverUrl, transitionSettings, outputSettings);
    const idempotencyKey = `${primaryId}:${inputHash}`;

    const totalClipDuration = clips.reduce((sum, c) => sum + c.trim_seconds, 0);
    const transitionOverlap = (clips.length - 1) * transition_duration;
    const expectedDuration = totalClipDuration - transitionOverlap;

    console.log(
      JSON.stringify({
        at: "assemble-reel:prepared",
        primary_id: primaryId,
        is_story_mode: isStoryMode,
        clip_count: clips.length,
        clips: clips.map(c => ({
          i: c.index,
          id: c.id.slice(0, 8),
          requested: Number(c.requested_seconds.toFixed(2)),
          generated: Number(c.generated_seconds.toFixed(2)),
          trim: Number(c.trim_seconds.toFixed(2)),
          clamped: c.trim_clamped,
        })),
        transition: transitionSettings,
        output: outputSettings,
        voiceover: !!voiceoverUrl,
        expectedDuration: Number(expectedDuration.toFixed(2)),
        idempotencyKey,
      })
    );

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
      await updateAssemblyStatus(supabase, isStoryMode, primaryId, {
        assembled_status: "failed",
        assembled_meta: {
          ...sanitizedMeta,
          error: "FFmpeg service not configured",
          failed_at: new Date().toISOString(),
        },
      });

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

    const jobId = crypto.randomUUID();

    // Mark as rendering — uses correct table via helper
    await updateAssemblyStatus(supabase, isStoryMode, primaryId, {
      assembled_status: "rendering",
      assembled_meta: {
        ...sanitizedMeta,
        ffmpeg_job_id: jobId,
      },
    });

    const validationErrors = validateClipDurations(clips, 0.3);
    if (validationErrors.length > 0) {
      throw new Error(`Clips too short for assembly: ${validationErrors.join("; ")}`);
    }

    // FIX: Use primaryId for upload path (was hardcoded to script_run_id)
    const ffmpegRequest: FFmpegServiceRequest = {
      job_id: jobId,
      idempotency_key: idempotencyKey,
      clips: clips.map(c => ({ 
        url: c.url, 
        requested_seconds: c.requested_seconds,
        generated_seconds: c.generated_seconds,
        trim_seconds: c.trim_seconds,
        freeze_extend: c.freeze_extend,
      })),
      voiceover_url: voiceoverUrl || undefined,
      output: {
        ...outputSettings,
        video_bitrate: "8M",
        audio_bitrate: "192k",
      },
      transition: transitionSettings,
      mix: {
        duck_video_audio: !!voiceoverUrl,
        video_audio_gain_db: voiceoverUrl ? -96 : 0,
        voiceover_gain_db: 0,
      },
      upload: {
        provider: "supabase",
        bucket: "videos",
        path: `assembled/${primaryId}.mp4`,
        upsert: true,
        supabase_url: supabaseUrl,
        supabase_service_key: supabaseKey,
      },
    };

    console.log(`Calling FFmpeg service at ${ffmpegServiceUrl}`);

    const ffmpegResponse = await fetch(`${ffmpegServiceUrl}/render/reel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ffmpegRequest),
    });

    if (!ffmpegResponse.ok) {
      const errorText = await ffmpegResponse.text();
      console.log(
        JSON.stringify({
          at: "assemble-reel:ffmpeg_error",
          primary_id: primaryId,
          job_id: jobId,
          status_code: ffmpegResponse.status,
          error_body: errorText.slice(0, 500),
        })
      );
      throw new Error(`FFmpeg service error: ${ffmpegResponse.status} - ${errorText}`);
    }

    const ffmpegResult = await ffmpegResponse.json();
    const ffmpegInstanceId = ffmpegResult.instance_id || ffmpegResponse.headers.get("x-ffmpeg-instance-id") || undefined;

    console.log(
      JSON.stringify({
        at: "assemble-reel:ffmpeg_response",
        primary_id: primaryId,
        job_id: jobId,
        status: ffmpegResult.status,
        duration: ffmpegResult.duration,
        eta_seconds: ffmpegResult.eta_seconds,
        instance_id: ffmpegInstanceId,
      })
    );

    // Handle sync completion — writes to correct table
    if (ffmpegResult.status === "succeeded" && ffmpegResult.output_url) {
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/videos/assembled/${primaryId}.mp4`;
      
      await updateAssemblyStatus(supabase, isStoryMode, primaryId, {
        assembled_video_url: ffmpegResult.output_url || publicUrl,
        assembled_status: "succeeded",
        assembled_at: new Date().toISOString(),
        assembled_meta: {
          ...sanitizedMeta,
          completed_at: new Date().toISOString(),
          duration: ffmpegResult.duration || expectedDuration,
          ffmpeg_job_id: jobId,
          ffmpeg_instance_id: ffmpegInstanceId,
        },
      });

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

    // Async job — writes to correct table
    await updateAssemblyStatus(supabase, isStoryMode, primaryId, {
      assembled_meta: {
        ...sanitizedMeta,
        ffmpeg_job_id: jobId,
        ffmpeg_instance_id: ffmpegInstanceId,
        ffmpeg_status: ffmpegResult.status || "queued",
        eta_seconds: ffmpegResult.eta_seconds,
      },
    });

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
    console.log(
      JSON.stringify({
        at: "assemble-reel:error",
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack?.slice(0, 300) : undefined,
      })
    );

    // Error handler — write to correct table
    try {
      const body = await req.clone().json().catch(() => ({}));
      const errPrimaryId = body.story_job_id || body.script_run_id;
      const errIsStoryMode = !!body.story_job_id;
      if (errPrimaryId) {
        await updateAssemblyStatus(
          supabase, errIsStoryMode, errPrimaryId, {
            assembled_status: "failed",
            assembled_meta: {
              error: error instanceof Error ? error.message : "Unknown error",
              failed_at: new Date().toISOString(),
            },
          }
        );
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
