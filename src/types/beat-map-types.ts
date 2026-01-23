// ============================================
// Beat Map Types for Editorial Intelligence Layer
// ============================================

/**
 * Source of beat detection: waveform-only (MVP) or Whisper-enhanced
 */
export type BeatSource = "waveform" | "whisper" | "hybrid";

/**
 * Beat type classification
 */
export type BeatType = 
  | "emphasis"       // High-energy word/moment
  | "pause"          // Silence gap > 0.3s
  | "phrase_end"     // Sentence-final punctuation (.!?)
  | "clause_break"   // Clause punctuation (,;:)
  | "semantic_shift" // Topic/meaning change
  | "peak"           // Waveform amplitude peak
  | "onset";         // Audio onset detection

/**
 * A single detected beat in the audio
 */
export interface Beat {
  id: string;
  type: BeatType;
  /** Time position in seconds from audio start */
  time: number;
  /** Duration of beat (for pauses) */
  duration: number;
  /** The word at this beat (if available from Whisper) */
  word?: string;
  /** Position in transcript */
  word_index?: number;
  /** Confidence score 0-1 */
  confidence: number;
  /** Should video cut here? */
  is_cut_point: boolean;
  /** Priority for cutting (1-10, higher = better cut point) */
  cut_priority: number;
  /** Source that detected this beat */
  source: BeatSource;
}

/**
 * Word-level timing from Whisper (enhanced mode)
 */
export interface WordTiming {
  word: string;
  start: number;
  end: number;
}

/**
 * Suggested cut point for clip boundaries
 */
export interface SuggestedCut {
  /** Time position in seconds */
  time: number;
  /** Reason for suggesting this cut */
  reason: BeatType | "target_duration";
  /** Confidence 0-1 */
  confidence: number;
  /** Which scene/clip index this cut starts */
  scene_prompt_index?: number;
  /** The beat that generated this suggestion */
  beat_id?: string;
}

/**
 * Full Beat Map for a script
 */
export interface BeatMap {
  id: string;
  script_run_id: string;
  audio_url?: string;
  /** Total audio duration in seconds */
  duration: number;
  /** Source of beat data */
  source: BeatSource;
  
  /** Raw waveform peaks (always available) */
  waveform_peaks?: number[];
  
  /** Word-level timings from Whisper (enhanced mode) */
  words?: WordTiming[];
  
  /** Detected beats */
  beats: Beat[];
  
  /** Auto-calculated suggested clip boundaries */
  suggested_cuts: SuggestedCut[];
  
  /** Metadata */
  generated_at: string;
  algorithm_version: string;
}

/**
 * Transition types for clip boundaries
 * NOTE: These are defined here for type-only usage. 
 * DEFAULT_TRANSITION lives in timeline-types.ts (clip domain)
 */
export type TransitionType = 
  | "cut"           // Hard cut (default)
  | "crossfade"     // Opacity dissolve
  | "push_left"     // Push transition
  | "push_right"
  | "zoom_in"       // Zoom into next
  | "zoom_out";     // Zoom out to next

/**
 * Transition settings for a clip
 */
export interface ClipTransition {
  type: TransitionType;
  /** Duration in seconds (0.1 - 0.5) */
  duration: number;
}

// ============================================
// Beat Map Utility Functions
// ============================================

/**
 * Generate a unique beat ID
 */
export function generateBeatId(): string {
  return `beat_${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Detect beats from waveform peaks + voiceover text punctuation (MVP algorithm)
 * No Whisper required - uses amplitude analysis + text heuristics
 * 
 * GUARDRAIL: Punctuation beats only become cut-eligible if validated by nearby waveform evidence
 */
export function detectBeatsFromWaveform(
  peaks: number[],
  duration: number,
  voiceoverText: string
): Beat[] {
  const beats: Beat[] = [];
  const samplesPerSecond = peaks.length / duration;
  
  // ============================================
  // STEP 1: Detect waveform-based beats FIRST
  // ============================================
  
  // Detect peaks (relative amplitude spikes)
  const avgPeak = peaks.reduce((a, b) => a + b, 0) / peaks.length;
  const threshold = avgPeak * 1.3; // 30% above average
  
  for (let i = 1; i < peaks.length - 1; i++) {
    const prev = peaks[i - 1];
    const curr = peaks[i];
    const next = peaks[i + 1];
    
    // Local maximum above threshold
    if (curr > prev && curr > next && curr > threshold) {
      const time = i / samplesPerSecond;
      beats.push({
        id: generateBeatId(),
        type: "peak",
        time,
        duration: 0,
        confidence: Math.min(1, curr / avgPeak / 2),
        is_cut_point: false, // Peaks alone don't trigger cuts
        cut_priority: Math.min(5, Math.floor((curr / avgPeak) * 2)),
        source: "waveform",
      });
    }
  }
  
  // Detect pauses (low amplitude regions)
  // IMPORTANT: Build pauseBeats array FIRST, then use for punctuation coupling
  const pauseBeats: Beat[] = [];
  const silenceThreshold = avgPeak * 0.15;
  let pauseStart: number | null = null;
  
  for (let i = 0; i < peaks.length; i++) {
    const time = i / samplesPerSecond;
    
    if (peaks[i] < silenceThreshold) {
      if (pauseStart === null) {
        pauseStart = time;
      }
    } else if (pauseStart !== null) {
      const pauseDuration = time - pauseStart;
      if (pauseDuration > 0.3) { // 300ms+ pause
        const pauseBeat: Beat = {
          id: generateBeatId(),
          type: "pause",
          time: pauseStart,
          duration: pauseDuration,
          confidence: Math.min(1, pauseDuration / 0.8),
          is_cut_point: pauseDuration > 0.5,
          cut_priority: Math.min(10, Math.floor(pauseDuration * 10)),
          source: "waveform",
        };
        pauseBeats.push(pauseBeat);
        beats.push(pauseBeat);
      }
      pauseStart = null;
    }
  }
  
  // ============================================
  // STEP 2: Detect punctuation beats using STABLE pauseBeats array
  // GUARDRAIL: Only mark as cut-eligible if there's nearby waveform evidence
  // ============================================
  const words = voiceoverText.split(/\s+/).filter(Boolean);
  const wordsPerSecond = words.length / duration;
  
  words.forEach((word, index) => {
    const estimatedTime = (index + 1) / wordsPerSecond;
    
    // Check if there's a pause beat within ±0.35s that would validate this punctuation
    // Use the STABLE pauseBeats array, not the evolving beats list
    const hasNearbyPause = pauseBeats.some(p => 
      Math.abs(p.time - estimatedTime) <= 0.35
    );
    
    // Also check for low amplitude region in raw waveform as additional validation
    const sampleIndex = Math.floor(estimatedTime * samplesPerSecond);
    const localAmplitude = peaks[sampleIndex] ?? avgPeak;
    const hasLowAmplitude = localAmplitude < avgPeak * 0.4;
    
    // Combine both signals for validation
    const hasWaveformEvidence = hasNearbyPause || hasLowAmplitude;
    
    // Sentence-final punctuation (.!?)
    if (/[.!?]$/.test(word)) {
      beats.push({
        id: generateBeatId(),
        type: "phrase_end",
        time: estimatedTime,
        duration: 0,
        word,
        word_index: index,
        confidence: hasWaveformEvidence ? 0.9 : 0.5, // Higher if validated by waveform
        // GUARDRAIL: Only cut-eligible if waveform evidence validates the timing
        is_cut_point: hasWaveformEvidence,
        cut_priority: hasWaveformEvidence ? 9 : 4, // Demote significantly if no evidence
        source: "waveform", // Derived from text, not Whisper
      });
    }
    // Clause breaks (,;:)
    else if (/[,;:]$/.test(word)) {
      beats.push({
        id: generateBeatId(),
        type: "clause_break",
        time: estimatedTime,
        duration: 0,
        word,
        word_index: index,
        confidence: 0.4,
        is_cut_point: false, // Clause breaks are suggestions only
        cut_priority: 3,
        source: "waveform",
      });
    }
  });
  
  // Sort by time
  beats.sort((a, b) => a.time - b.time);
  
  return beats;
}

/**
 * Enhance beat detection with Whisper word-level timestamps
 */
export function enhanceBeatsWithWhisper(
  existingBeats: Beat[],
  words: WordTiming[]
): Beat[] {
  const enhanced: Beat[] = [];
  
  // Add word-timing-derived beats
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const nextWord = words[i + 1];
    const gap = nextWord ? nextWord.start - word.end : 0;
    
    // Pause detection (>300ms gap)
    if (gap > 0.3) {
      enhanced.push({
        id: generateBeatId(),
        type: "pause",
        time: word.end,
        duration: gap,
        word: word.word,
        word_index: i,
        confidence: 0.95, // High confidence from Whisper
        is_cut_point: gap > 0.5,
        cut_priority: Math.min(10, Math.floor(gap * 10)),
        source: "whisper",
      });
    }
    
    // Phrase end detection
    if (/[.!?]$/.test(word.word)) {
      enhanced.push({
        id: generateBeatId(),
        type: "phrase_end",
        time: word.end,
        duration: 0,
        word: word.word,
        word_index: i,
        confidence: 0.95,
        is_cut_point: true,
        cut_priority: 9,
        source: "whisper",
      });
    }
    
    // Clause boundary
    if (/[,;:]$/.test(word.word)) {
      enhanced.push({
        id: generateBeatId(),
        type: "clause_break",
        time: word.end,
        duration: 0,
        word: word.word,
        word_index: i,
        confidence: 0.9,
        is_cut_point: gap > 0.15,
        cut_priority: 5,
        source: "whisper",
      });
    }
  }
  
  // Merge with existing waveform beats (prefer Whisper for timing)
  const merged = [...enhanced];
  
  for (const beat of existingBeats) {
    // Only keep waveform beats that don't overlap with Whisper beats
    const hasOverlap = enhanced.some(e => Math.abs(e.time - beat.time) < 0.15);
    if (!hasOverlap && beat.type === "peak") {
      merged.push({ ...beat, source: "hybrid" });
    }
  }
  
  return merged.sort((a, b) => a.time - b.time);
}

/**
 * Alignment constraints for beat snapping
 */
export interface AlignmentConstraints {
  /** Maximum stretch per clip (e.g., 0.2 = 20% longer) */
  maxStretch: number;
  /** Maximum shrink per clip (e.g., 0.2 = 20% shorter) */
  maxShrink: number;
  /** Minimum clip duration in seconds */
  minClipDuration: number;
  /** Enforce total end time (audio duration) */
  totalDuration?: number;
}

export const DEFAULT_ALIGNMENT_CONSTRAINTS: AlignmentConstraints = {
  maxStretch: 0.2,  // ±20%
  maxShrink: 0.2,
  minClipDuration: 0.5,
};

/**
 * Calculate suggested clip boundaries that snap to beats
 * With constraints to prevent drift and micro-clips
 */
export function suggestCutsFromBeats(
  beats: Beat[],
  targetDurations: number[],
  tolerance: number = 0.3,
  constraints: AlignmentConstraints = DEFAULT_ALIGNMENT_CONSTRAINTS
): SuggestedCut[] {
  const cuts: SuggestedCut[] = [];
  let accumulatedTime = 0;
  
  // Calculate total target duration for end-time enforcement
  const totalTargetDuration = targetDurations.reduce((a, b) => a + b, 0);
  const enforcedTotalDuration = constraints.totalDuration ?? totalTargetDuration;
  
  // Get cut-eligible beats sorted by priority
  const cutBeats = beats
    .filter(b => b.is_cut_point || b.cut_priority >= 7)
    .sort((a, b) => a.time - b.time);
  
  for (let i = 0; i < targetDurations.length - 1; i++) {
    const targetCutTime = accumulatedTime + targetDurations[i];
    const originalDuration = targetDurations[i];
    
    // Calculate allowed range based on constraints
    const minDuration = Math.max(
      constraints.minClipDuration, 
      originalDuration * (1 - constraints.maxShrink)
    );
    const maxDuration = originalDuration * (1 + constraints.maxStretch);
    
    const minCutTime = accumulatedTime + minDuration;
    const maxCutTime = accumulatedTime + maxDuration;
    
    // Find best beat within ±tolerance AND within stretch/shrink constraints
    const nearbyBeats = cutBeats.filter(b =>
      Math.abs(b.time - targetCutTime) <= tolerance &&
      b.time >= minCutTime &&
      b.time <= maxCutTime
    );
    
    if (nearbyBeats.length > 0) {
      // Pick highest priority beat
      const best = nearbyBeats.sort((a, b) => b.cut_priority - a.cut_priority)[0];
      cuts.push({
        time: best.time,
        reason: best.type,
        confidence: best.cut_priority / 10,
        scene_prompt_index: i + 1,
        beat_id: best.id,
      });
      accumulatedTime = best.time;
    } else {
      // No beat nearby, use target time but enforce constraints
      const clampedTime = Math.max(minCutTime, Math.min(maxCutTime, targetCutTime));
      cuts.push({
        time: clampedTime,
        reason: "target_duration",
        confidence: 0.5,
        scene_prompt_index: i + 1,
      });
      accumulatedTime = clampedTime;
    }
  }
  
  // GUARDRAIL: Enforce total end time - adjust last cut if drift occurred
  if (cuts.length > 0 && constraints.totalDuration !== undefined) {
    const lastCut = cuts[cuts.length - 1];
    const remainingDuration = enforcedTotalDuration - lastCut.time;
    const lastOriginalDuration = targetDurations[targetDurations.length - 1];
    
    // If last clip would be too short or too long, flag with lower confidence
    if (remainingDuration < lastOriginalDuration * (1 - constraints.maxShrink) ||
        remainingDuration > lastOriginalDuration * (1 + constraints.maxStretch)) {
      lastCut.confidence = Math.max(0.3, lastCut.confidence - 0.2);
    }
  }
  
  return cuts;
}

/**
 * Snap a time position to the nearest beat
 */
export function snapToBeat(
  time: number,
  beats: Beat[],
  tolerance: number = 0.3
): { time: number; beat: Beat | null } {
  const cutBeats = beats.filter(b => b.is_cut_point || b.cut_priority >= 5);
  const nearestBeat = cutBeats
    .filter(b => Math.abs(b.time - time) <= tolerance)
    .sort((a, b) => {
      // Prefer closer beats, then higher priority
      const distA = Math.abs(a.time - time);
      const distB = Math.abs(b.time - time);
      if (Math.abs(distA - distB) < 0.05) {
        return b.cut_priority - a.cut_priority;
      }
      return distA - distB;
    })[0];
  
  return nearestBeat 
    ? { time: nearestBeat.time, beat: nearestBeat }
    : { time, beat: null };
}

/**
 * Create an empty/default beat map
 */
export function createEmptyBeatMap(scriptRunId: string): BeatMap {
  return {
    id: crypto.randomUUID(),
    script_run_id: scriptRunId,
    duration: 0,
    source: "waveform",
    beats: [],
    suggested_cuts: [],
    generated_at: new Date().toISOString(),
    algorithm_version: "1.0.0",
  };
}

// DEFAULT_TRANSITION is now defined with ClipTransition interface above (lines 123-127)
