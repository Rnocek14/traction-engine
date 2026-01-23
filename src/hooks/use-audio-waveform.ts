import { useState, useEffect, useMemo } from "react";

interface AudioWaveformData {
  peaks: number[];
  duration: number;
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook to decode audio and extract waveform peak data.
 * Falls back to synthetic waveform if audio URL is not available.
 */
export function useAudioWaveform(
  audioUrl: string | null | undefined,
  voiceoverText: string,
  barCount: number = 60
): AudioWaveformData {
  const [peaks, setPeaks] = useState<number[]>([]);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Synthetic waveform as fallback
  const syntheticPeaks = useMemo(() => {
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
    const bars: number[] = [];
    const wordsPerBar = Math.max(1, Math.ceil(words.length / barCount));

    for (let i = 0; i < barCount; i++) {
      const startWord = i * wordsPerBar;
      const endWord = Math.min(startWord + wordsPerBar, words.length);
      const chunk = words.slice(startWord, endWord).join(" ");

      if (!chunk) {
        bars.push(0.1);
        continue;
      }

      const avgWordLen = chunk.length / Math.max(1, endWord - startWord);
      let amplitude = Math.min(1, avgWordLen / 8);

      if (/[!?]/.test(chunk)) amplitude = Math.min(1, amplitude + 0.3);
      if (/[,;:]/.test(chunk)) amplitude = Math.max(0.2, amplitude * 0.8);
      if (/\./.test(chunk)) amplitude = Math.max(0.15, amplitude * 0.6);

      amplitude += (random() - 0.5) * 0.2;
      amplitude = Math.max(0.1, Math.min(1, amplitude));

      bars.push(amplitude);
    }

    return bars;
  }, [voiceoverText, barCount]);

  useEffect(() => {
    if (!audioUrl) {
      setPeaks(syntheticPeaks);
      setDuration(0);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const loadAudio = async () => {
      try {
        // Fetch audio file
        const response = await fetch(audioUrl);
        if (!response.ok) throw new Error("Failed to fetch audio");
        
        const arrayBuffer = await response.arrayBuffer();
        
        // Decode audio
        const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        if (cancelled) return;

        // Get audio data from first channel
        const channelData = audioBuffer.getChannelData(0);
        const samplesPerBar = Math.floor(channelData.length / barCount);
        const extractedPeaks: number[] = [];

        for (let i = 0; i < barCount; i++) {
          const start = i * samplesPerBar;
          const end = Math.min(start + samplesPerBar, channelData.length);
          
          // Find peak amplitude in this segment
          let maxAmp = 0;
          for (let j = start; j < end; j++) {
            const amp = Math.abs(channelData[j]);
            if (amp > maxAmp) maxAmp = amp;
          }
          
          extractedPeaks.push(maxAmp);
        }

        // Normalize peaks to 0-1 range
        const maxPeak = Math.max(...extractedPeaks, 0.001);
        const normalizedPeaks = extractedPeaks.map(p => p / maxPeak);

        setPeaks(normalizedPeaks);
        setDuration(audioBuffer.duration);
        
        // Clean up
        await audioContext.close();
      } catch (err) {
        console.warn("Failed to decode audio, using synthetic waveform:", err);
        if (!cancelled) {
          setPeaks(syntheticPeaks);
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadAudio();

    return () => {
      cancelled = true;
    };
  }, [audioUrl, syntheticPeaks, barCount]);

  return { peaks, duration, isLoading, error };
}
