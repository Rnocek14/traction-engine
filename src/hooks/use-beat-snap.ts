import { useCallback, useMemo } from "react";
import type { Beat, BeatMap, SuggestedCut } from "@/types/beat-map-types";
import { snapToBeat, suggestCutsFromBeats } from "@/types/beat-map-types";
import type { Clip } from "@/types/timeline-types";

interface UseBeatSnapOptions {
  beatMap: BeatMap | null;
  /** Tolerance in seconds for snapping (default 0.3s) */
  tolerance?: number;
}

/**
 * Hook for beat-aligned editing operations.
 * Provides utilities to snap clip boundaries to detected beats.
 */
export function useBeatSnap({ beatMap, tolerance = 0.3 }: UseBeatSnapOptions) {
  const beats = beatMap?.beats ?? [];
  
  /**
   * Snap a time position to the nearest beat
   */
  const snapToNearestBeat = useCallback(
    (time: number, customTolerance?: number): number => {
      if (!beatMap?.beats?.length) return time;
      const result = snapToBeat(time, beatMap.beats, customTolerance ?? tolerance);
      return result.time;
    },
    [beatMap, tolerance]
  );
  
  /**
   * Get the beat at a specific time (if any)
   */
  const getBeatAt = useCallback(
    (time: number): Beat | null => {
      if (!beatMap?.beats?.length) return null;
      return beatMap.beats.find(
        (b) => time >= b.time && time < b.time + Math.max(b.duration, 0.1)
      ) ?? null;
    },
    [beatMap]
  );
  
  /**
   * Get all beats within a time range
   */
  const getBeatsInRange = useCallback(
    (startTime: number, endTime: number): Beat[] => {
      if (!beatMap?.beats?.length) return [];
      return beatMap.beats.filter(
        (b) => b.time >= startTime && b.time <= endTime
      );
    },
    [beatMap]
  );
  
  /**
   * Get suggested cuts for a set of target clip durations
   */
  const getSuggestedCuts = useCallback(
    (targetDurations: number[]): SuggestedCut[] => {
      if (!beatMap?.beats?.length) return [];
      return suggestCutsFromBeats(beatMap.beats, targetDurations, tolerance);
    },
    [beatMap, tolerance]
  );
  
  /**
   * Align clips to beats, adjusting their boundaries to snap to nearby beats
   */
  const alignClipsToBeats = useCallback(
    (clips: Clip[]): Clip[] => {
      if (!beatMap?.beats?.length) return clips;
      
      const aligned: Clip[] = [];
      let currentTime = 0;
      
      for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        const originalDuration = clip.end - clip.start;
        
        // For all clips except the first, try to snap the start to a beat
        const startTime = i === 0 ? 0 : currentTime;
        
        // Try to snap the end to a beat
        const targetEnd = startTime + originalDuration;
        const snappedEnd = snapToNearestBeat(targetEnd, tolerance);
        
        // Ensure minimum duration
        const finalEnd = Math.max(snappedEnd, startTime + 0.5);
        
        aligned.push({
          ...clip,
          start: startTime,
          end: finalEnd,
        });
        
        currentTime = finalEnd;
      }
      
      return aligned;
    },
    [beatMap, snapToNearestBeat, tolerance]
  );
  
  /**
   * Check if a time position is near a beat (for UI highlighting)
   */
  const isNearBeat = useCallback(
    (time: number, customTolerance?: number): boolean => {
      if (!beatMap?.beats?.length) return false;
      const t = customTolerance ?? tolerance;
      return beatMap.beats.some(
        (b) => Math.abs(b.time - time) <= t && (b.is_cut_point || b.cut_priority >= 5)
      );
    },
    [beatMap, tolerance]
  );
  
  /**
   * Get cut-eligible beats (for rendering beat markers)
   */
  const cutEligibleBeats = useMemo(() => {
    return beats.filter((b) => b.is_cut_point || b.cut_priority >= 7);
  }, [beats]);
  
  /**
   * Get all beats with visual priority info
   */
  const visualBeats = useMemo(() => {
    return beats.map((beat) => ({
      ...beat,
      /** Color based on beat type */
      color: getBeatColor(beat),
      /** Opacity based on priority */
      opacity: Math.max(0.3, beat.cut_priority / 10),
    }));
  }, [beats]);
  
  return {
    /** Snap a time to nearest beat */
    snapToNearestBeat,
    /** Get beat at a specific time */
    getBeatAt,
    /** Get all beats in a time range */
    getBeatsInRange,
    /** Get suggested cuts for durations */
    getSuggestedCuts,
    /** Align clips to beat boundaries */
    alignClipsToBeats,
    /** Check if time is near a beat */
    isNearBeat,
    /** All detected beats */
    beats,
    /** Beats eligible for cuts */
    cutEligibleBeats,
    /** Beats with visual info for rendering */
    visualBeats,
    /** Whether beat map is available */
    hasBeatMap: !!beatMap && beats.length > 0,
    /** Beat map duration */
    duration: beatMap?.duration ?? 0,
  };
}

/**
 * Get color for beat type visualization
 */
function getBeatColor(beat: Beat): string {
  switch (beat.type) {
    case "phrase_end":
      return "hsl(142, 76%, 36%)"; // Green - strong cut point
    case "pause":
      return "hsl(38, 92%, 50%)";  // Amber - natural pause
    case "clause_break":
      return "hsl(221, 83%, 53%)"; // Blue - medium cut
    case "emphasis":
    case "peak":
      return "hsl(262, 83%, 58%)"; // Purple - energy peak
    case "semantic_shift":
      return "hsl(0, 84%, 60%)";   // Red - topic change
    default:
      return "hsl(220, 9%, 46%)";  // Gray - default
  }
}
