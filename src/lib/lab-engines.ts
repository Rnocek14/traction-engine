/**
 * Engine abstraction layer for Video Lab
 * Each engine is independent - no engine knows about others
 */

import { supabase } from "@/integrations/supabase/client";

// Canonical engine IDs
export type VideoEngine = "sora" | "runway" | "luma";
export type VoiceEngine = "elevenlabs" | "openai";

export interface EngineJobStatus {
  status: "queued" | "running" | "done" | "failed";
  progress?: number;
  outputUrl?: string;
  error?: string;
}

// ============ VIDEO ENGINE TYPES ============

export interface VideoInput {
  prompt: string;
  duration: number; // seconds
  aspectRatio: "9:16" | "16:9" | "1:1";
  style?: string;
  cameraDirection?: string;
  startingFrameUrl?: string; // For extend/chain mode (Luma, Runway)
}

export interface VideoOutput {
  jobId: string;
  status: EngineJobStatus;
  engine: VideoEngine;
  outputUrl?: string;
  thumbnailUrl?: string;
  renderTimeMs?: number;
}

// ============ VOICE ENGINE TYPES ============

export interface VoiceInput {
  text: string;
  voice: string;
  provider: VoiceEngine;
  stability?: number;
  speed?: number;
  instructions?: string;
}

export interface VoiceOutput {
  audioUrl: string;
  provider: VoiceEngine;
  voice: string;
  durationMs?: number;
}

// ============ ASSEMBLY ENGINE TYPES ============

export interface AssemblyInput {
  audioUrl?: string;
  videoUrls: string[];
  mode: "voice_only" | "visual_voice" | "visual_only";
  transition?: "cut" | "crossfade";
}

export interface AssemblyOutput {
  outputUrl: string;
  durationSeconds: number;
  renderTimeMs: number;
}

// ============ ENGINE IMPLEMENTATIONS ============

/**
 * Generate video using specified engine via Lab-specific endpoint
 * Bypasses script_run validation
 */
export async function generateVideo(
  engine: VideoEngine,
  input: VideoInput
): Promise<{ jobId: string; error?: string }> {
  // Use the lab-specific endpoint that doesn't require a real script
  const { data, error } = await supabase.functions.invoke("lab-queue-video", {
    body: {
      prompt: input.prompt,
      provider: engine,
      settings: {
        size: input.aspectRatio, // Pass as aspect ratio, endpoint will map
        duration: input.duration,
        style: input.style,
      },
      starting_frame_url: input.startingFrameUrl, // For extend/chain mode
    },
  });

  if (error) {
    return { jobId: "", error: error.message };
  }

  return { 
    jobId: data?.job?.id || "", 
    error: data?.error 
  };
}

/**
 * Get video job status
 */
export async function getVideoJobStatus(
  jobId: string
): Promise<EngineJobStatus> {
  const { data, error } = await supabase
    .from("video_jobs")
    .select("status, progress, output_url, error")
    .eq("id", jobId)
    .single();

  if (error || !data) {
    return { status: "failed", error: error?.message || "Job not found" };
  }

  return {
    status: data.status as EngineJobStatus["status"],
    progress: data.progress || 0,
    outputUrl: data.output_url || undefined,
    error: data.error || undefined,
  };
}

/**
 * Generate voice using ElevenLabs or OpenAI
 */
export async function generateVoice(
  input: VoiceInput
): Promise<VoiceOutput & { error?: string }> {
  const { data, error } = await supabase.functions.invoke("generate-voiceover", {
    body: {
      lab_mode: true, // Skip DB lookups
      text: input.text, // Direct text input
      voice: input.voice,
      provider: input.provider,
      instructions: input.instructions,
    },
  });

  if (error) {
    return { 
      audioUrl: "", 
      provider: input.provider, 
      voice: input.voice,
      error: error.message 
    };
  }

  return {
    audioUrl: data?.audio_url || "",
    provider: data?.provider || input.provider,
    voice: data?.voice || input.voice,
    error: data?.error,
  };
}

/**
 * Trigger FFmpeg assembly (simplified for Lab)
 */
export async function assemblePreview(
  input: AssemblyInput
): Promise<AssemblyOutput & { error?: string }> {
  const startTime = Date.now();

  const { data, error } = await supabase.functions.invoke("assemble-reel", {
    body: {
      script_run_id: "lab-test",
      voiceover_url: input.audioUrl,
      video_urls: input.videoUrls,
      mode: input.mode,
      transition: {
        type: input.transition || "cut",
        duration: 0.5,
      },
    },
  });

  if (error) {
    return {
      outputUrl: "",
      durationSeconds: 0,
      renderTimeMs: Date.now() - startTime,
      error: error.message,
    };
  }

  return {
    outputUrl: data?.output_url || "",
    durationSeconds: data?.duration || 0,
    renderTimeMs: Date.now() - startTime,
    error: data?.error,
  };
}

// ============ ENGINE METADATA ============

export const VIDEO_ENGINES: { id: VideoEngine; name: string; description: string }[] = [
  { id: "sora", name: "Sora", description: "OpenAI - Aesthetics & atmosphere" },
  { id: "runway", name: "Runway", description: "Gen-3 - Character & low light" },
  { id: "luma", name: "Luma", description: "Dream Machine - Motion & environments" },
];

export const VOICE_ENGINES: { id: VoiceEngine; name: string }[] = [
  { id: "elevenlabs", name: "ElevenLabs" },
  { id: "openai", name: "OpenAI TTS" },
];

// Duration options per engine (must match edge function constraints)
// These are the valid API buckets - UI shows these, edge function enforces them
export const ENGINE_DURATIONS: Record<VideoEngine, number[]> = {
  sora: [4, 8, 12],      // Sora-2: 4/8/12 second buckets
  runway: [4, 6, 8],      // Veo3.1_fast: 4/6/8 second buckets  
  luma: [5],              // Ray-2: Fixed ~5s output (no duration param)
};

// Get valid duration for engine
export function getValidDuration(engine: VideoEngine, requested: number): number {
  const validDurations = ENGINE_DURATIONS[engine];
  // Find smallest valid duration >= requested
  const valid = validDurations.find(d => d >= requested);
  return valid || validDurations[validDurations.length - 1];
}
