// ============================================
// Timeline & Clip Types for DaVinci-style Editor
// ============================================

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
}

/**
 * Timeline data structure stored in studio_timelines.timeline_json
 */
export interface TimelineData {
  clips: Clip[];
  /** Total timeline duration (auto-calculated from clips) */
  duration?: number;
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
 * Ripple delete - remove clip and shift all following clips
 */
export function rippleDeleteClip(clips: Clip[], clipId: string): Clip[] {
  const clipIndex = clips.findIndex((c) => c.id === clipId);
  if (clipIndex === -1) return clips;
  
  const clipToRemove = clips[clipIndex];
  const duration = clipToRemove.end - clipToRemove.start;
  
  return clips
    .filter((c) => c.id !== clipId)
    .map((c) => {
      if (c.start >= clipToRemove.end) {
        return {
          ...c,
          start: c.start - duration,
          end: c.end - duration,
        };
      }
      return c;
    });
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
 * Duplicate a clip
 */
export function duplicateClip(clips: Clip[], clipId: string): Clip[] {
  const clipIndex = clips.findIndex((c) => c.id === clipId);
  if (clipIndex === -1) return clips;
  
  const originalClip = clips[clipIndex];
  const duration = originalClip.end - originalClip.start;
  
  const duplicatedClip: Clip = {
    ...originalClip,
    id: generateClipId(),
    start: originalClip.end,
    end: originalClip.end + duration,
    notes: originalClip.notes ? `${originalClip.notes} (copy)` : "(copy)",
    created_at: new Date().toISOString(),
  };
  
  // Insert after original and shift remaining clips
  const result = [...clips];
  result.splice(clipIndex + 1, 0, duplicatedClip);
  
  // Shift all clips after the duplicate
  return result.map((clip, i) => {
    if (i > clipIndex + 1) {
      return {
        ...clip,
        start: clip.start + duration,
        end: clip.end + duration,
      };
    }
    return clip;
  });
}
