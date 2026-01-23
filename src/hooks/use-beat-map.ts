import { useMemo } from "react";
import { useAudioWaveform } from "./use-audio-waveform";
import {
  BeatMap,
  detectBeatsFromWaveform,
  suggestCutsFromBeats,
  createEmptyBeatMap,
} from "@/types/beat-map-types";
import type { Clip } from "@/types/timeline-types";

interface UseBeatMapOptions {
  scriptRunId: string;
  voiceoverText: string;
  audioUrl?: string | null;
  clips: Clip[];
  /** Bar count for waveform analysis */
  barCount?: number;
}

/**
 * Hook to generate a Beat Map from audio waveform + voiceover text.
 * This is the MVP algorithm that doesn't require Whisper.
 */
export function useBeatMap({
  scriptRunId,
  voiceoverText,
  audioUrl,
  clips,
  barCount = 120,
}: UseBeatMapOptions): {
  beatMap: BeatMap | null;
  isLoading: boolean;
  error: string | null;
} {
  // Get waveform data
  const {
    peaks,
    duration,
    isLoading,
    error,
  } = useAudioWaveform(audioUrl, voiceoverText, barCount);
  
  // Generate beat map from waveform + text
  const beatMap = useMemo(() => {
    // Need either real audio or voiceover text
    if ((!peaks.length && !voiceoverText) || isLoading) {
      return null;
    }
    
    // Estimate duration from voiceover if no audio
    const estimatedDuration = duration > 0 
      ? duration 
      : voiceoverText.split(/\s+/).filter(Boolean).length / 2.5; // ~150 wpm
    
    if (estimatedDuration <= 0) {
      return createEmptyBeatMap(scriptRunId);
    }
    
    // Detect beats from waveform + punctuation
    const beats = detectBeatsFromWaveform(
      peaks.length > 0 ? peaks : generateSyntheticPeaks(voiceoverText, barCount),
      estimatedDuration,
      voiceoverText
    );
    
    // Get target durations from clips
    const targetDurations = clips
      .filter(c => c.type === "video" && !c.disabled)
      .map(c => c.end - c.start);
    
    // Generate suggested cuts
    const suggestedCuts = suggestCutsFromBeats(beats, targetDurations);
    
    const beatMap: BeatMap = {
      id: crypto.randomUUID(),
      script_run_id: scriptRunId,
      audio_url: audioUrl ?? undefined,
      duration: estimatedDuration,
      source: peaks.length > 0 ? "waveform" : "waveform", // Text-only is still "waveform" source
      waveform_peaks: peaks.length > 0 ? peaks : undefined,
      beats,
      suggested_cuts: suggestedCuts,
      generated_at: new Date().toISOString(),
      algorithm_version: "1.0.0-mvp",
    };
    
    return beatMap;
  }, [scriptRunId, peaks, duration, voiceoverText, audioUrl, clips, barCount, isLoading]);
  
  return {
    beatMap,
    isLoading,
    error,
  };
}

/**
 * Generate synthetic peaks from voiceover text (fallback when no audio)
 */
function generateSyntheticPeaks(voiceoverText: string, barCount: number): number[] {
  if (!voiceoverText) return [];
  
  // Seeded PRNG for deterministic randomness
  const hashString = (str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  };

  const seed = hashString(voiceoverText);
  let currentSeed = seed;
  const random = () => {
    currentSeed = (currentSeed * 1103515245 + 12345) & 0x7fffffff;
    return currentSeed / 0x7fffffff;
  };

  const words = voiceoverText.split(/\s+/).filter(Boolean);
  const peaks: number[] = [];
  const wordsPerBar = Math.max(1, Math.ceil(words.length / barCount));

  for (let i = 0; i < barCount; i++) {
    const startWord = i * wordsPerBar;
    const endWord = Math.min(startWord + wordsPerBar, words.length);
    const chunk = words.slice(startWord, endWord).join(" ");

    if (!chunk) {
      peaks.push(0.1);
      continue;
    }

    const avgWordLen = chunk.length / Math.max(1, endWord - startWord);
    let amplitude = Math.min(1, avgWordLen / 8);

    // Boost for emphasis punctuation
    if (/[!?]/.test(chunk)) amplitude = Math.min(1, amplitude + 0.3);
    // Reduce for clause breaks
    if (/[,;:]/.test(chunk)) amplitude = Math.max(0.2, amplitude * 0.8);
    // Reduce more for sentence ends (pause-like)
    if (/\./.test(chunk)) amplitude = Math.max(0.15, amplitude * 0.6);

    amplitude += (random() - 0.5) * 0.2;
    amplitude = Math.max(0.1, Math.min(1, amplitude));

    peaks.push(amplitude);
  }

  return peaks;
}
