// ============================================
// Timeline & Clip Types for DaVinci-style Editor
// ============================================

// Re-export transition types from beat-map (types only)
export type { TransitionType, ClipTransition, AlignmentConstraints } from "./beat-map-types";
export { DEFAULT_ALIGNMENT_CONSTRAINTS } from "./beat-map-types";
import type { ClipTransition } from "./beat-map-types";

/**
 * Default transition for clips (0.2s crossfade)
 * This is the SINGLE source of truth for transitions - lives in clip domain
 */
export const DEFAULT_TRANSITION: ClipTransition = {
  type: "crossfade",
  duration: 0.2,
};

/**
 * Clip types supported in the timeline
 */
export type ClipType = "video" | "audio" | "text" | "image";

/**
 * Source reference for video/audio clips
 */
export interface ClipSource {
  video_job_id?: string;
  audio_url?: string;
  /** Source in-point (seconds) */
  in?: number;
  /** Source out-point (seconds) */
  out?: number;
  /** Alternative takes for this clip */
  take_ids?: string[];
  /** Currently active take */
  active_take_id?: string;
}

/**
 * Provider-specific generation settings
 */
export interface ClipSettings {
  provider?: string;
  model?: string;
  size?: string;
  duration?: number;
  style?: string;
  motion_style?: string;
  seed?: string;
  [key: string]: unknown;
}

/**
 * Shot types for per-clip camera direction
 * Must match SHOT_TYPES in cinematic-prompts.ts
 */
export const SHOT_TYPE_OPTIONS = [
  { value: "extreme-wide", label: "Extreme Wide (EWS)", description: "Vast environment, subject small" },
  { value: "wide", label: "Wide Shot (WS)", description: "Full body, environmental context" },
  { value: "medium-wide", label: "Medium Wide (MWS)", description: "Knees up, action space" },
  { value: "medium", label: "Medium Shot (MS)", description: "Waist up, conversational" },
  { value: "medium-close", label: "Medium Close-up (MCU)", description: "Chest up, emotional" },
  { value: "close-up", label: "Close-up (CU)", description: "Face fills frame, intensity" },
  { value: "extreme-close", label: "Extreme Close-up (ECU)", description: "Detail shot, eyes/hands" },
  { value: "over-shoulder", label: "Over-the-Shoulder (OTS)", description: "Conversational perspective" },
  { value: "pov", label: "Point of View (POV)", description: "First-person, immersive" },
  { value: "dutch", label: "Dutch Angle", description: "Tilted, tension/unease" },
  { value: "low-angle", label: "Low Angle", description: "Looking up, power/heroic" },
  { value: "high-angle", label: "High Angle", description: "Looking down, vulnerability" },
  { value: "tracking", label: "Tracking Shot", description: "Following movement" },
  { value: "crane", label: "Crane/Jib Shot", description: "Vertical reveal, epic scope" },
] as const;

/**
 * A single clip on the timeline
 */
export interface Clip {
  /** Stable UUID - never derived from content */
  id: string;
  /** Type of clip */
  type: ClipType;
  /** Start time in timeline (seconds) */
  start: number;
  /** End time in timeline (seconds) */
  end: number;
  /** Source reference for media clips */
  source?: ClipSource;
  /** Scene/generation prompt */
  prompt?: string;
  /** Generation settings used */
  settings?: ClipSettings;
  /** User notes */
  notes?: string;
  /** Whether clip is disabled/muted */
  disabled?: boolean;
  /** Lock clip from editing */
  locked?: boolean;
  /** Creation timestamp */
  created_at?: string;
  /** Per-clip camera direction/shot type (overrides style guide) */
  camera_direction?: string;
  /** Seed for reproducible generation */
  seed?: number;
  /** Generate as seamless loop for ambient clips */
  loop?: boolean;
  /** Transition effect when entering this clip */
  transition_in?: ClipTransition;
}

/**
 * Style guide for visual continuity across clips
 */
export interface StyleGuide {
  /** Character/subject description for consistency */
  character?: string;
  /** Location/setting description */
  location?: string;
  /** Lighting style: "natural", "golden_hour", "studio", "dramatic", "soft" */
  lighting?: string;
  /** Camera style: "documentary", "cinematic", "vlog", "static", "dynamic" */
  camera_style?: string;
  /** Color grade: "warm", "cool", "neutral", "vintage", "high_contrast" */
  color_grade?: string;
  /** Mood: "hopeful", "dramatic", "calm", "energetic", "intimate" */
  mood?: string;
  /** Custom style notes */
  custom_notes?: string;
  
  // Advanced cinematography controls
  /** Lens focal length: "24mm", "35mm", "50mm", "85mm", "135mm" */
  lens?: string;
  /** Depth of field: "shallow", "medium", "deep" */
  depth_of_field?: string;
  /** Motion style: "smooth", "handheld", "static", "tracking" */
  motion_style?: string;
  /** Film stock emulation: "digital", "portra", "ektar", "cinestill" */
  film_stock?: string;
  
  // Continuity anchors
  /** Wardrobe description for consistency */
  wardrobe?: string;
  /** Key props to maintain */
  props?: string;
  /** Time of day: "dawn", "morning", "midday", "golden_hour", "dusk", "night" */
  time_of_day?: string;
  
  // First-clip reference image for visual anchoring
  /** URL of reference image to anchor the first clip's visual style */
  reference_image_url?: string;
}

/**
 * Timeline data structure stored in studio_timelines.timeline_json
 */
export interface TimelineData {
  clips: Clip[];
  /** Total timeline duration (auto-calculated from clips) */
  duration?: number;
  /** Style guide for visual continuity */
  style_guide?: StyleGuide;
  /** Playback settings */
  playback?: {
    fps?: number;
    loop?: boolean;
  };
}

/**
 * Full timeline record from database
 */
export interface StudioTimeline {
  id: string;
  script_run_id: string;
  timeline_json: TimelineData;
  version: number;
  label?: string;
  created_at: string;
  updated_at: string;
  published_at?: string;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Generate a stable UUID for a new clip
 */
export function generateClipId(): string {
  return crypto.randomUUID();
}

/**
 * Calculate total timeline duration from clips
 */
export function calculateTimelineDuration(clips: Clip[]): number {
  if (clips.length === 0) return 0;
  return Math.max(...clips.map((c) => c.end));
}

/**
 * Reflow clips sequentially to eliminate gaps and ensure contiguous timing.
 * Use after any structural change (delete, duplicate, reorder).
 */
export function reflowClipsSequential(clips: Clip[]): Clip[] {
  let t = 0;
  return clips.map((c) => {
    const d = Math.max(0.01, c.end - c.start); // Ensure minimum duration
    const next = { ...c, start: t, end: t + d };
    t += d;
    return next;
  });
}

/**
 * Convert legacy scene_prompts array to clips
 */
export function scenePromptsToClips(
  scenePrompts: string[],
  defaultDurationPerScene: number = 4
): Clip[] {
  let currentTime = 0;
  
  return scenePrompts.map((prompt) => {
    const clip: Clip = {
      id: generateClipId(),
      type: "video",
      start: currentTime,
      end: currentTime + defaultDurationPerScene,
      prompt,
      created_at: new Date().toISOString(),
    };
    currentTime += defaultDurationPerScene;
    return clip;
  });
}

/**
 * Convert clips back to scene_prompts for backward compatibility
 */
export function clipsToScenePrompts(clips: Clip[]): string[] {
  return clips
    .filter((c) => c.type === "video" && c.prompt)
    .sort((a, b) => a.start - b.start)
    .map((c) => c.prompt!);
}

/**
 * Split a clip at a given time point
 */
export function splitClip(clip: Clip, splitTime: number): [Clip, Clip] | null {
  // Validate split point is within clip
  if (splitTime <= clip.start || splitTime >= clip.end) {
    return null;
  }

  const firstHalf: Clip = {
    ...clip,
    id: generateClipId(),
    end: splitTime,
    source: clip.source
      ? {
          ...clip.source,
          out: clip.source.in !== undefined 
            ? clip.source.in + (splitTime - clip.start)
            : splitTime - clip.start,
        }
      : undefined,
  };

  const secondHalf: Clip = {
    ...clip,
    id: generateClipId(),
    start: splitTime,
    source: clip.source
      ? {
          ...clip.source,
          in: clip.source.in !== undefined
            ? clip.source.in + (splitTime - clip.start)
            : splitTime - clip.start,
        }
      : undefined,
  };

  return [firstHalf, secondHalf];
}

/**
 * Trim a clip's in or out point
 */
export function trimClip(
  clip: Clip,
  newStart?: number,
  newEnd?: number
): Clip {
  const trimmedClip = { ...clip };
  
  if (newStart !== undefined && newStart >= clip.start && newStart < clip.end) {
    const delta = newStart - clip.start;
    trimmedClip.start = newStart;
    if (trimmedClip.source) {
      trimmedClip.source = {
        ...trimmedClip.source,
        in: (trimmedClip.source.in || 0) + delta,
      };
    }
  }
  
  if (newEnd !== undefined && newEnd > clip.start && newEnd <= clip.end) {
    const delta = clip.end - newEnd;
    trimmedClip.end = newEnd;
    if (trimmedClip.source) {
      trimmedClip.source = {
        ...trimmedClip.source,
        out: (trimmedClip.source.out || clip.end - clip.start) - delta,
      };
    }
  }
  
  return trimmedClip;
}

/**
 * Ripple delete - remove clip and reflow remaining clips
 */
export function rippleDeleteClip(clips: Clip[], clipId: string): Clip[] {
  const filtered = clips.filter((c) => c.id !== clipId);
  return reflowClipsSequential(filtered);
}

/**
 * Simple delete - remove clip without shifting
 */
export function deleteClip(clips: Clip[], clipId: string): Clip[] {
  return clips.filter((c) => c.id !== clipId);
}

/**
 * Move clip to a new position (reorder)
 */
export function moveClip(
  clips: Clip[],
  fromIndex: number,
  toIndex: number
): Clip[] {
  const result = [...clips];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  
  // Recalculate start/end times based on new order
  let currentTime = 0;
  return result.map((clip) => {
    const duration = clip.end - clip.start;
    const newClip = {
      ...clip,
      start: currentTime,
      end: currentTime + duration,
    };
    currentTime += duration;
    return newClip;
  });
}

/**
 * Duplicate a clip and reflow timeline
 */
export function duplicateClip(clips: Clip[], clipId: string): Clip[] {
  const clipIndex = clips.findIndex((c) => c.id === clipId);
  if (clipIndex === -1) return clips;
  
  const originalClip = clips[clipIndex];
  const duration = originalClip.end - originalClip.start;
  
  const duplicatedClip: Clip = {
    ...originalClip,
    id: generateClipId(),
    start: 0, // Will be recalculated by reflow
    end: duration,
    notes: originalClip.notes ? `${originalClip.notes} (copy)` : "(copy)",
    created_at: new Date().toISOString(),
  };
  
  // Insert after original
  const result = [...clips];
  result.splice(clipIndex + 1, 0, duplicatedClip);
  
  // Reflow to ensure contiguous timing
  return reflowClipsSequential(result);
}
