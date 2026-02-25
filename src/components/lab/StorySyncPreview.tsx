/**
 * StorySyncPreview - Unified video + narration preview with audio-master sync
 *
 * Architecture:
 * - Audio is the MASTER clock (video follows narration timing)
 * - Video transitions when audio enters new scene boundary
 * - Freeze last frame if clip ends before narration scene ends
 * - Never switch clips based on video ended events
 * - No backwards transitions (prevent flicker)
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  AlertTriangle,
  CheckCircle2,
  Download,
  Maximize,
  Minimize,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";
import type { SceneTiming, WordTiming, StoryVoiceover } from "@/hooks/use-story-voiceover";

type VideoJob = Tables<"video_jobs">;

interface StorySyncPreviewProps {
  clips: VideoJob[];
  voiceover: StoryVoiceover;
  className?: string;
  onAssemble?: () => void;
  isAssembling?: boolean;
  assembledUrl?: string | null;
}

interface SyncQuality {
  totalDriftMs: number;
  quality: "good" | "fair" | "poor";
  recommendation: string | null;
}

/**
 * Calculate sync quality between narration timing and video clip durations
 */
function calculateSyncQuality(
  voTiming: SceneTiming[],
  clips: VideoJob[]
): SyncQuality {
  let totalDrift = 0;

  voTiming.forEach((scene, i) => {
    const voDuration = scene.end_ms - scene.start_ms;
    const clip = clips.find((c) => c.sequence_index === i);
    // Extract actual clip duration from settings (seconds or requested_seconds)
    const settings = clip?.settings as { seconds?: number; requested_seconds?: number } | null;
    const clipSeconds = settings?.seconds ?? settings?.requested_seconds ?? 5;
    const clipDuration = clipSeconds * 1000;
    totalDrift += Math.abs(voDuration - clipDuration);
  });

  return {
    totalDriftMs: totalDrift,
    quality:
      totalDrift < 5000 ? "good" : totalDrift < 15000 ? "fair" : "poor",
    recommendation:
      totalDrift > 15000 ? "Consider regenerating voiceover" : null,
  };
}

export function StorySyncPreview({
  clips,
  voiceover,
  className,
  onAssemble,
  isAssembling,
  assembledUrl,
}: StorySyncPreviewProps) {
  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [currentWord, setCurrentWord] = useState<WordTiming | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Video element switching (A/B pattern for gapless playback)
  const [activeVideo, setActiveVideo] = useState<"A" | "B">("A");
  const [videoFrozen, setVideoFrozen] = useState(false);

  // User intent tracking (prevents auto-advance issues)
  const userSeekRef = useRef(false);
  const lastSceneIndexRef = useRef(0);

  // Get completed clips sorted by sequence
  const completedClips = useMemo(
    () =>
      clips
        .filter((c) => c.status === "done" && c.output_url)
        .sort((a, b) => (a.sequence_index ?? 0) - (b.sequence_index ?? 0)),
    [clips]
  );

  const actualTiming = voiceover.actual_timing || [];
  const totalDurationMs = voiceover.total_duration_ms || 0;

  // Calculate sync quality
  const syncQuality = useMemo(
    () => calculateSyncQuality(actualTiming, completedClips),
    [actualTiming, completedClips]
  );

  // Progress as percentage
  const progress = totalDurationMs > 0 ? (currentTimeMs / totalDurationMs) * 100 : 0;

  // Find current scene from audio time
  const findSceneForTime = useCallback(
    (timeMs: number): number => {
      for (let i = actualTiming.length - 1; i >= 0; i--) {
        if (timeMs >= actualTiming[i].start_ms) {
          return i;
        }
      }
      return 0;
    },
    [actualTiming]
  );

  // Find current word from audio time
  const findWordForTime = useCallback(
    (timeMs: number): WordTiming | null => {
      for (const scene of actualTiming) {
        if (timeMs >= scene.start_ms && timeMs <= scene.end_ms) {
          if (scene.words?.length) {
            return (
              scene.words.find(
                (w) => timeMs >= w.start_ms && timeMs <= w.end_ms
              ) || null
            );
          }
        }
      }
      return null;
    },
    [actualTiming]
  );

  // Get clip for a scene index
  const getClipForScene = useCallback(
    (sceneIndex: number): VideoJob | undefined => {
      return completedClips.find((c) => c.sequence_index === sceneIndex);
    },
    [completedClips]
  );

  // Stable refs for callbacks (prevent audio re-init on state changes)
  const findSceneForTimeRef = useRef(findSceneForTime);
  const findWordForTimeRef = useRef(findWordForTime);
  useEffect(() => { findSceneForTimeRef.current = findSceneForTime; }, [findSceneForTime]);
  useEffect(() => { findWordForTimeRef.current = findWordForTime; }, [findWordForTime]);

  // Initialize audio element - ONLY when URL changes
  useEffect(() => {
    if (!voiceover.audio_url) return;

    console.log("[StorySyncPreview] Creating audio element");
    const audio = new Audio(voiceover.audio_url);
    audio.preload = "auto";
    audioRef.current = audio;

    const handleTimeUpdate = () => {
      const timeMs = audio.currentTime * 1000;
      setCurrentTimeMs(timeMs);

      // Find scene from audio time (audio is master)
      const targetSceneIndex = findSceneForTimeRef.current(timeMs);

      // Forward-only unless user explicitly seeked
      if (
        userSeekRef.current ||
        targetSceneIndex > lastSceneIndexRef.current
      ) {
        setCurrentSceneIndex(targetSceneIndex);
        lastSceneIndexRef.current = targetSceneIndex;
        userSeekRef.current = false;
      }

      // Find current word
      setCurrentWord(findWordForTimeRef.current(timeMs));
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTimeMs(0);
      setCurrentSceneIndex(0);
      lastSceneIndexRef.current = 0;
    };

    const handleCanPlay = () => {
      console.log("[StorySyncPreview] Audio ready");
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("canplaythrough", handleCanPlay);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("canplaythrough", handleCanPlay);
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, [voiceover.audio_url]); // Only re-init when URL changes

  // Load video for current scene with A/B gapless swap (audio-driven)
  useEffect(() => {
    const clip = getClipForScene(currentSceneIndex);
    if (!clip?.output_url) {
      setVideoFrozen(true);
      return;
    }

    setVideoFrozen(false);
    
    // Get active and next video elements
    const activeEl = activeVideo === "A" ? videoARef.current : videoBRef.current;
    const nextEl = activeVideo === "A" ? videoBRef.current : videoARef.current;
    
    if (!nextEl) return;

    // Check if clip is already loaded in active element
    if (activeEl?.src === clip.output_url) {
      // Already showing correct clip
      if (isPlaying) {
        activeEl.play().catch(() => {});
      }
      return;
    }

    // Load clip into the NEXT (hidden) element, then swap
    console.log(`[StorySyncPreview] Loading clip ${currentSceneIndex} into ${activeVideo === "A" ? "B" : "A"}`);
    nextEl.src = clip.output_url;
    nextEl.muted = true;
    nextEl.playsInline = true;
    nextEl.load();
    nextEl.currentTime = 0;

    // Swap when loaded
    const handleCanPlay = () => {
      if (isPlaying) {
        nextEl.play().catch(() => {});
      }
      // Swap visibility
      setActiveVideo(activeVideo === "A" ? "B" : "A");
      nextEl.removeEventListener("canplaythrough", handleCanPlay);
    };
    
    nextEl.addEventListener("canplaythrough", handleCanPlay);

    return () => {
      nextEl.removeEventListener("canplaythrough", handleCanPlay);
    };
  }, [currentSceneIndex, getClipForScene, isPlaying, activeVideo]);

  // Handle video ended - FREEZE, don't advance (audio is master)
  const handleVideoEnded = useCallback(() => {
    // Freeze on last frame - do NOT advance scene
    // Audio will advance the scene when it's ready
    const video = activeVideo === "A" ? videoARef.current : videoBRef.current;
    if (video) {
      video.pause();
      // Keep on last frame
      setVideoFrozen(true);
    }
  }, [activeVideo]);

  // Sync video play/pause with audio - control BOTH elements
  useEffect(() => {
    const videoA = videoARef.current;
    const videoB = videoBRef.current;
    
    // Always ensure both are muted
    if (videoA) videoA.muted = true;
    if (videoB) videoB.muted = true;
    
    const activeEl = activeVideo === "A" ? videoA : videoB;
    if (!activeEl || videoFrozen) return;

    if (isPlaying) {
      activeEl.play().catch(() => {});
    } else {
      activeEl.pause();
    }
  }, [isPlaying, activeVideo, videoFrozen]);

  // Fullscreen handling
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen();
    }
  }, []);

  // Play/Pause toggle
  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(console.error);
    }
  }, [isPlaying]);

  // Mute toggle
  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.muted = !audio.muted;
      setIsMuted(audio.muted);
    }
  }, []);

  // Skip to scene
  const skipToScene = useCallback(
    (sceneIndex: number) => {
      const audio = audioRef.current;
      if (!audio || sceneIndex < 0 || sceneIndex >= actualTiming.length) return;

      userSeekRef.current = true;
      const targetTime = actualTiming[sceneIndex].start_ms / 1000;
      audio.currentTime = targetTime;
      setCurrentSceneIndex(sceneIndex);
      lastSceneIndexRef.current = sceneIndex;
    },
    [actualTiming]
  );

  const skipPrev = useCallback(() => {
    if (currentSceneIndex > 0) {
      skipToScene(currentSceneIndex - 1);
    }
  }, [currentSceneIndex, skipToScene]);

  const skipNext = useCallback(() => {
    if (currentSceneIndex < actualTiming.length - 1) {
      skipToScene(currentSceneIndex + 1);
    }
  }, [currentSceneIndex, actualTiming.length, skipToScene]);

  // Format time display
  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  const currentClip = getClipForScene(currentSceneIndex);

  // If assembled video exists, show that instead
  if (assembledUrl) {
    return (
      <div
        ref={containerRef}
        className={cn("relative bg-black rounded-lg overflow-hidden", className)}
      >
        <video
          src={assembledUrl}
          controls
          className="w-full h-full object-contain"
          poster={completedClips[0]?.thumbnail_url || undefined}
        />
        <div className="absolute top-2 right-2 flex gap-1">
          <Badge variant="secondary" className="text-[10px] gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Assembled
          </Badge>
        </div>
        <div className="absolute bottom-2 right-2 flex gap-1">
          <a href={assembledUrl} download={`story-${Date.now()}.mp4`}>
            <Button size="sm" variant="secondary" className="h-7 text-xs gap-1">
              <Download className="h-3 w-3" />
              Download
            </Button>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Main Preview Container */}
      <div
        ref={containerRef}
        className={cn("relative bg-black rounded-lg overflow-hidden", className)}
      >
        {/* Dual video elements for gapless playback */}
        <video
          ref={videoARef}
          className={cn(
            "absolute inset-0 w-full h-full object-contain transition-opacity duration-500 ease-in-out",
            activeVideo === "A" ? "opacity-100 z-10" : "opacity-0 z-0"
          )}
          onEnded={handleVideoEnded}
          muted
          playsInline
        />
        <video
          ref={videoBRef}
          className={cn(
            "absolute inset-0 w-full h-full object-contain transition-opacity duration-500 ease-in-out",
            activeVideo === "B" ? "opacity-100 z-10" : "opacity-0 z-0"
          )}
          onEnded={handleVideoEnded}
          muted
          playsInline
        />

        {/* Scene/Provider indicator */}
        <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-20">
          <Badge variant="secondary" className="text-[10px]">
            Scene {currentSceneIndex + 1} / {actualTiming.length}
          </Badge>
          <div className="flex gap-1">
            {currentClip && (
              <Badge variant="outline" className="text-[10px] bg-background/80">
                {currentClip.provider}
              </Badge>
            )}
            {videoFrozen && (
              <Badge variant="outline" className="text-[10px] bg-yellow-500/20 text-yellow-500">
                Frozen
              </Badge>
            )}
          </div>
        </div>

        {/* Caption overlay (current word highlight) */}
        {currentWord && (
          <div className="absolute bottom-20 left-4 right-4 z-20">
            <div className="bg-black/70 backdrop-blur-sm rounded px-3 py-1.5 text-center">
              <span className="text-white text-sm font-medium">
                {currentWord.word}
              </span>
            </div>
          </div>
        )}

        {/* Controls overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent z-20">
          {/* Progress bar */}
          <Progress value={progress} className="h-1 mb-2" />

          {/* Time display */}
          <div className="flex items-center justify-between text-[10px] text-white/70 mb-2">
            <span>{formatTime(currentTimeMs)}</span>
            <span>{formatTime(totalDurationMs)}</span>
          </div>

          {/* Control buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-white hover:bg-white/20"
                onClick={skipPrev}
                disabled={currentSceneIndex === 0}
              >
                <SkipBack className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-10 w-10 text-white hover:bg-white/20"
                onClick={togglePlay}
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5" />
                ) : (
                  <Play className="h-5 w-5" />
                )}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-white hover:bg-white/20"
                onClick={skipNext}
                disabled={currentSceneIndex === actualTiming.length - 1}
              >
                <SkipForward className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-white hover:bg-white/20"
                onClick={toggleMute}
              >
                {isMuted ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </Button>
            </div>

            <div className="flex items-center gap-1">
              {onAssemble && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs gap-1"
                  onClick={onAssemble}
                  disabled={isAssembling}
                >
                  <Download className="h-3 w-3" />
                  {isAssembling ? "Assembling..." : "Export"}
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-white hover:bg-white/20"
                onClick={toggleFullscreen}
              >
                {isFullscreen ? (
                  <Minimize className="h-3 w-3" />
                ) : (
                  <Maximize className="h-3 w-3" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Scene Timeline */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">Scene Timeline</span>
          <SyncQualityBadge quality={syncQuality} />
        </div>

        {/* Timeline bars */}
        <div className="relative h-12 bg-muted/30 rounded-lg overflow-hidden">
          {/* Narration timing bars */}
          <div className="absolute inset-x-2 top-1 h-4 flex gap-0.5">
            {actualTiming.map((scene, idx) => {
              const widthPct =
                ((scene.end_ms - scene.start_ms) / totalDurationMs) * 100;
              const isActive = idx === currentSceneIndex;

              return (
                <button
                  key={`vo-${idx}`}
                  onClick={() => skipToScene(idx)}
                  className={cn(
                    "h-full rounded-sm transition-all text-[8px] flex items-center justify-center",
                    isActive
                      ? "bg-primary text-primary-foreground ring-1 ring-primary"
                      : "bg-primary/40 text-primary-foreground/70 hover:bg-primary/60"
                  )}
                  style={{
                    width: `${widthPct}%`,
                  }}
                  title={`Scene ${idx + 1}: ${formatTime(scene.start_ms)} - ${formatTime(scene.end_ms)}`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          {/* Video clip indicators */}
          <div className="absolute inset-x-2 bottom-1 h-4 flex gap-0.5">
            {completedClips.map((clip, idx) => {
              const sceneIdx = clip.sequence_index ?? idx;
              const sceneTiming = actualTiming[sceneIdx];
              if (!sceneTiming) return null;

              const widthPct =
                ((sceneTiming.end_ms - sceneTiming.start_ms) / totalDurationMs) *
                100;
              const isActive = sceneIdx === currentSceneIndex;

              return (
                <div
                  key={clip.id}
                  className={cn(
                    "h-full rounded-sm flex items-center justify-center overflow-hidden",
                    isActive ? "ring-1 ring-white" : "opacity-60"
                  )}
                  style={{
                    width: `${widthPct}%`,
                  }}
                  title={`Clip ${sceneIdx + 1} (${clip.provider})`}
                >
                  {clip.thumbnail_url ? (
                    <img
                      src={clip.thumbnail_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-secondary flex items-center justify-center text-[8px]">
                      {sceneIdx + 1}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg z-10 transition-all"
            style={{
              left: `${Math.min(progress, 100)}%`,
            }}
          />
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-3 h-2 bg-primary rounded-sm" />
            <span>Narration</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-2 bg-secondary rounded-sm" />
            <span>Video</span>
          </div>
        </div>
      </div>

      {/* Script with word highlighting */}
      {voiceover.compiled_script && (
        <div className="space-y-1">
          <span className="text-xs font-medium">Script</span>
          <ScrollArea className="h-20 rounded-md border p-2 bg-muted/30">
            <p className="text-xs leading-relaxed">
              <ScriptHighlight
                script={voiceover.compiled_script}
                currentWord={currentWord}
              />
            </p>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

// Sync quality indicator badge
function SyncQualityBadge({ quality }: { quality: SyncQuality }) {
  const { quality: level, totalDriftMs, recommendation } = quality;

  const config = {
    good: { color: "bg-green-500/20 text-green-500", icon: CheckCircle2 },
    fair: { color: "bg-yellow-500/20 text-yellow-500", icon: AlertTriangle },
    poor: { color: "bg-red-500/20 text-red-500", icon: AlertTriangle },
  }[level];

  const Icon = config.icon;

  return (
    <Badge variant="outline" className={cn("text-[10px] gap-1", config.color)}>
      <Icon className="h-3 w-3" />
      {level.charAt(0).toUpperCase() + level.slice(1)} sync ({(totalDriftMs / 1000).toFixed(1)}s drift)
    </Badge>
  );
}

// Script text with current word highlighted
function ScriptHighlight({
  script,
  currentWord,
}: {
  script: string;
  currentWord: WordTiming | null;
}) {
  if (!currentWord) {
    return <>{script}</>;
  }

  const { char_start, char_end } = currentWord;

  if (char_start < 0 || char_end > script.length || char_start >= char_end) {
    return <>{script}</>;
  }

  const before = script.slice(0, char_start);
  const highlighted = script.slice(char_start, char_end);
  const after = script.slice(char_end);

  return (
    <>
      {before}
      <span className="bg-primary text-primary-foreground px-0.5 rounded">
        {highlighted}
      </span>
      {after}
    </>
  );
}
