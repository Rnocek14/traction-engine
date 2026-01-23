/**
 * Clip utility functions for timeline manipulation
 */

import type { Clip } from "@/types/timeline-types";
import { generateClipId } from "@/types/timeline-types";
import { PROVIDER_CAPABILITIES, type VideoProvider } from "@/types/video-provider-types";

/**
 * Auto-split a clip into segments that fit within provider max duration.
 * Returns the original clip if no split is needed.
 * 
 * @param clip - The clip to split
 * @param provider - The video provider ("sora" | "runway")
 * @param margin - Optional margin to subtract from max (default 0.5s for safety)
 * @returns Array of clips (1 if no split needed, N if split)
 */
export function autoSplitClip(
  clip: Clip,
  provider: VideoProvider,
  margin: number = 0.5
): Clip[] {
  const maxDuration = PROVIDER_CAPABILITIES[provider].maxDuration;
  const segmentTarget = maxDuration - margin; // e.g., 11.5s for Sora
  const clipDuration = clip.end - clip.start;
  
  // No split needed
  if (clipDuration <= maxDuration) {
    return [clip];
  }
  
  // Calculate number of segments
  const segmentCount = Math.ceil(clipDuration / segmentTarget);
  const segmentDuration = clipDuration / segmentCount; // Even distribution
  
  const segments: Clip[] = [];
  
  for (let i = 0; i < segmentCount; i++) {
    const segmentStart = clip.start + (i * segmentDuration);
    const segmentEnd = i === segmentCount - 1 
      ? clip.end // Last segment goes to exact end
      : clip.start + ((i + 1) * segmentDuration);
    
    const segment: Clip = {
      ...clip,
      id: i === 0 ? clip.id : generateClipId(), // Keep original ID for first segment
      start: segmentStart,
      end: segmentEnd,
      // Clear video job - needs regeneration
      source: clip.source ? {
        ...clip.source,
        video_job_id: undefined,
        // Calculate source in/out if present
        in: clip.source.in !== undefined 
          ? clip.source.in + (i * segmentDuration)
          : undefined,
        out: clip.source.out !== undefined
          ? clip.source.in !== undefined
            ? clip.source.in + ((i + 1) * segmentDuration)
            : undefined
          : undefined,
      } : undefined,
    };
    
    segments.push(segment);
  }
  
  return segments;
}

/**
 * Check if a clip needs splitting for the given provider
 */
export function needsSplit(clip: Clip, provider: VideoProvider): boolean {
  const maxDuration = PROVIDER_CAPABILITIES[provider].maxDuration;
  const clipDuration = clip.end - clip.start;
  return clipDuration > maxDuration;
}

/**
 * Get split info for a clip
 */
export function getSplitInfo(clip: Clip, provider: VideoProvider): {
  needsSplit: boolean;
  clipDuration: number;
  maxDuration: number;
  segmentCount: number;
} {
  const maxDuration = PROVIDER_CAPABILITIES[provider].maxDuration;
  const clipDuration = clip.end - clip.start;
  const segmentTarget = maxDuration - 0.5;
  const segmentCount = Math.ceil(clipDuration / segmentTarget);
  
  return {
    needsSplit: clipDuration > maxDuration,
    clipDuration,
    maxDuration,
    segmentCount,
  };
}

/**
 * Auto-split multiple clips
 */
export function autoSplitClips(
  clips: Clip[],
  provider: VideoProvider,
  margin: number = 0.5
): { 
  result: Clip[]; 
  splitCount: number; 
  originalCount: number;
} {
  let splitCount = 0;
  const result: Clip[] = [];
  
  for (const clip of clips) {
    const segments = autoSplitClip(clip, provider, margin);
    if (segments.length > 1) {
      splitCount++;
    }
    result.push(...segments);
  }
  
  return {
    result,
    splitCount,
    originalCount: clips.length,
  };
}
