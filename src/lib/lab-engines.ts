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
  providerGenerationId?: string; // Luma generation ID for extend mode
}

// ============ VIDEO ENGINE TYPES ============

export interface VideoInput {
  prompt: string;
  duration: number; // seconds
  aspectRatio: "9:16" | "16:9" | "1:1";
  style?: string;
  cameraDirection?: string;
  // Prompt tracking for analysis
  originalPrompt?: string;  // Raw user input before enrichment
  styleHints?: string;      // Style hints used for enrichment
  // Luma extend modes:
  extendGenerationId?: string; // Continue seamlessly from Luma generation ID
  referenceImageUrl?: string;  // Use image as visual reference
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
): Promise<{ jobId: string; providerGenerationId?: string; error?: string }> {
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
      // Prompt tracking for analysis
      original_prompt: input.originalPrompt,
      style_hints: input.styleHints,
      // Luma extend modes
      extend_generation_id: input.extendGenerationId,
      reference_image_url: input.referenceImageUrl,
    },
  });

  if (error) {
    return { jobId: "", error: error.message };
  }

  return { 
    jobId: data?.job?.id || "", 
    providerGenerationId: data?.job?.provider_job_id,
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
    .select("status, progress, output_url, error, openai_video_id, settings")
    .eq("id", jobId)
    .single();

  if (error || !data) {
    return { status: "failed", error: error?.message || "Job not found" };
  }

  // Extract provider generation ID (stored in openai_video_id or settings.provider_job_id)
  const settings = data.settings as Record<string, unknown> | null;
  const providerGenerationId = (settings?.provider_job_id as string) || data.openai_video_id || undefined;

  return {
    status: data.status as EngineJobStatus["status"],
    progress: data.progress || 0,
    outputUrl: data.output_url || undefined,
    error: data.error || undefined,
    providerGenerationId,
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

// ============ PROMPT ENRICHMENT ============

export interface EnrichmentResult {
  original: string;
  enriched: string;
  fullEnrichment?: string;  // Full GPT output before compression
  provider?: VideoEngine;
  schemaVersion: string;
  charCount: number;
  maxChars: number;
  wasCompressed: boolean;
  error?: string;
}

/**
 * Enrich a simple prompt using GPT-4o with provider-specific optimization
 * V2: Uses provider-specific prompting + hard length limits
 */
export async function enrichPrompt(
  prompt: string,
  provider?: VideoEngine,
  styleHints?: string
): Promise<EnrichmentResult> {
  const { data, error } = await supabase.functions.invoke("enrich-video-prompt", {
    body: { 
      prompt, 
      provider, 
      style_hints: styleHints 
    },
  });

  if (error) {
    console.error("Prompt enrichment failed:", error);
    return { 
      original: prompt, 
      enriched: prompt, 
      schemaVersion: "error",
      charCount: prompt.length,
      maxChars: 500,
      wasCompressed: false,
      error: error.message 
    };
  }

  return {
    original: data?.original || prompt,
    enriched: data?.enriched || prompt,
    fullEnrichment: data?.full_enrichment,
    provider: data?.provider,
    schemaVersion: data?.schema_version || "v1.0",
    charCount: data?.char_count || (data?.enriched?.length || prompt.length),
    maxChars: data?.max_chars || 500,
    wasCompressed: data?.was_compressed || false,
    error: data?.error,
  };
}

/**
 * Infer continuity anchors from scene prompts using AI
 * This analyzes all scenes to extract consistent character, environment, and camera details
 */
export async function inferAnchorsFromScenes(
  scenePrompts: string[]
): Promise<{ 
  character?: { description: string; wardrobe: string; identity_lock_tokens: string[] };
  environment?: { location: string; time_of_day: string; props: string[] };
  camera_language?: { lens: string; movement_style: string; framing_rules: string };
  negative_list?: string[];
  error?: string;
}> {
  // Combine all scene prompts for analysis
  const combinedPrompts = scenePrompts.map((p, i) => `Scene ${i + 1}: ${p}`).join("\n");
  
  const { data, error } = await supabase.functions.invoke("infer-story-anchors", {
    body: { scene_prompts: combinedPrompts },
  });

  if (error) {
    console.error("Anchor inference failed:", error);
    return { error: error.message };
  }

  return {
    character: data?.character,
    environment: data?.environment,
    camera_language: data?.camera_language,
    negative_list: data?.negative_list || ["flicker", "jitter", "identity drift", "morph"],
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
