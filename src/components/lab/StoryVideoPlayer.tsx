/**
 * StoryVideoPlayer
 * 
 * Sequential video player for story clips with crossfade transitions.
 * Uses dual A/B video elements for gapless playback with smooth dissolves.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Download,
  Loader2,
  Film,
  CheckCircle2,
  Maximize,
  Minimize,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

type VideoJob = Tables<"video_jobs">;

interface StoryVideoPlayerProps {
  clips: VideoJob[];
  className?: string;
  onAssemble?: () => void;
  isAssembling?: boolean;
  assembledUrl?: string | null;
}

export function StoryVideoPlayer({
  clips,
  className,
  onAssemble,
  isAssembling,
  assembledUrl,
}: StoryVideoPlayerProps) {
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeVideo, setActiveVideo] = useState<"A" | "B">("A");
  const shouldAutoPlayRef = useRef(false);

  // Get only completed clips sorted by sequence
  const completedClips = clips
    .filter(c => c.status === "done" && c.output_url)
    .sort((a, b) => (a.sequence_index ?? 0) - (b.sequence_index ?? 0));

  const currentClip = completedClips[currentIndex];
  const hasClips = completedClips.length > 0;

  // Handle video end - advance to next clip
  const handleEnded = useCallback(() => {
    if (currentIndex < completedClips.length - 1) {
      shouldAutoPlayRef.current = true;
      setCurrentIndex(prev => prev + 1);
    } else {
      setIsPlaying(false);
      shouldAutoPlayRef.current = false;
      setCurrentIndex(0);
    }
  }, [currentIndex, completedClips.length]);

  // Load video into next element and crossfade when clip changes
  useEffect(() => {
    if (!currentClip?.output_url) return;

    const activeEl = activeVideo === "A" ? videoARef.current : videoBRef.current;
    const nextEl = activeVideo === "A" ? videoBRef.current : videoARef.current;
    if (!nextEl) return;

    // If the active element already has this clip loaded, just play it
    if (activeEl?.src === currentClip.output_url) {
      if (shouldAutoPlayRef.current) {
        activeEl.play().then(() => { setIsPlaying(true); shouldAutoPlayRef.current = false; }).catch(() => { shouldAutoPlayRef.current = false; });
      }
      return;
    }

    // Load into next (hidden) element
    nextEl.src = currentClip.output_url;
    nextEl.load();
    nextEl.currentTime = 0;

    const handleCanPlay = () => {
      if (shouldAutoPlayRef.current || isPlaying) {
        nextEl.play().then(() => { setIsPlaying(true); shouldAutoPlayRef.current = false; }).catch(() => { shouldAutoPlayRef.current = false; });
      }
      // Crossfade: swap active
      setActiveVideo(prev => prev === "A" ? "B" : "A");
      // Pause the old element after the transition
      setTimeout(() => { activeEl?.pause(); }, 550);
      nextEl.removeEventListener("canplaythrough", handleCanPlay);
    };

    nextEl.addEventListener("canplaythrough", handleCanPlay);
    return () => { nextEl.removeEventListener("canplaythrough", handleCanPlay); };
  }, [currentIndex, currentClip?.output_url]);

  // Fullscreen handling
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen();
    }
  }, []);

  // Update progress
  useEffect(() => {
    const activeEl = activeVideo === "A" ? videoARef.current : videoBRef.current;
    if (!activeEl) return;

    const updateProgress = () => {
      if (activeEl.duration) {
        const clipProgress = activeEl.currentTime / activeEl.duration;
        const overallProgress = ((currentIndex + clipProgress) / completedClips.length) * 100;
        setProgress(overallProgress);
      }
    };

    activeEl.addEventListener("timeupdate", updateProgress);
    return () => activeEl.removeEventListener("timeupdate", updateProgress);
  }, [currentIndex, completedClips.length, activeVideo]);

  // Sync play/pause state
  useEffect(() => {
    const activeEl = activeVideo === "A" ? videoARef.current : videoBRef.current;
    if (!activeEl) return;
    if (isPlaying) {
      activeEl.play().catch(() => {});
    } else {
      activeEl.pause();
    }
  }, [isPlaying, activeVideo]);

  const togglePlay = useCallback(() => {
    if (!currentClip?.output_url) return;
    setIsPlaying(prev => !prev);
  }, [currentClip?.output_url]);

  const skipPrev = useCallback(() => {
    if (currentIndex > 0) {
      shouldAutoPlayRef.current = isPlaying;
      setCurrentIndex(prev => prev - 1);
    }
  }, [currentIndex, isPlaying]);

  const skipNext = useCallback(() => {
    if (currentIndex < completedClips.length - 1) {
      shouldAutoPlayRef.current = isPlaying;
      setCurrentIndex(prev => prev + 1);
    }
  }, [currentIndex, completedClips.length, isPlaying]);

  if (!hasClips) {
    return (
      <div className={cn("aspect-[9/16] bg-muted rounded-lg flex items-center justify-center", className)}>
        <div className="text-center text-muted-foreground">
          <Film className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-xs">Waiting for clips...</p>
        </div>
      </div>
    );
  }

  // If we have an assembled video, show that instead
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
          <Button 
            size="sm" 
            variant="secondary" 
            className="h-7 text-xs gap-1"
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <Minimize className="h-3 w-3" /> : <Maximize className="h-3 w-3" />}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={cn("relative bg-black rounded-lg overflow-hidden group", className)}
    >
      {/* Dual video elements for crossfade transitions */}
      <video
        ref={videoARef}
        className={cn(
          "absolute inset-0 w-full h-full object-contain transition-opacity duration-500 ease-in-out",
          activeVideo === "A" ? "opacity-100 z-10" : "opacity-0 z-0"
        )}
        onEnded={handleEnded}
        playsInline
        muted
      />
      <video
        ref={videoBRef}
        className={cn(
          "absolute inset-0 w-full h-full object-contain transition-opacity duration-500 ease-in-out",
          activeVideo === "B" ? "opacity-100 z-10" : "opacity-0 z-0"
        )}
        onEnded={handleEnded}
        playsInline
        muted
      />

      {/* Big centered play button - shown when paused */}
      {!isPlaying && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity hover:bg-black/40 z-30"
        >
          <div className="w-16 h-16 rounded-full bg-primary/90 flex items-center justify-center shadow-lg hover:scale-105 transition-transform">
            <Play className="h-8 w-8 text-primary-foreground ml-1" />
          </div>
        </button>
      )}

      {/* Clip indicator */}
      <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-20">
        <Badge variant="secondary" className="text-[10px]">
          Scene {currentIndex + 1} / {completedClips.length}
        </Badge>
        <Badge variant="outline" className="text-[10px] bg-background/80">
          {currentClip?.provider}
        </Badge>
      </div>

      {/* Controls overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent z-20">
        {/* Progress bar */}
        <Progress value={progress} className="h-1 mb-2" />

        {/* Control buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-white hover:bg-white/20"
              onClick={skipPrev}
              disabled={currentIndex === 0}
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
              disabled={currentIndex === completedClips.length - 1}
            >
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-1">
            {/* Assemble button */}
            {onAssemble && (
              <Button
                size="sm"
                variant="secondary"
                className="h-7 text-xs gap-1"
                onClick={onAssemble}
                disabled={isAssembling}
              >
                {isAssembling ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Download className="h-3 w-3" />
                )}
                {isAssembling ? "Assembling..." : "Export"}
              </Button>
            )}
            {/* Fullscreen button */}
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-white hover:bg-white/20"
              onClick={toggleFullscreen}
            >
              {isFullscreen ? <Minimize className="h-3 w-3" /> : <Maximize className="h-3 w-3" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Thumbnail strip */}
      <div className="absolute left-2 right-2 top-10 flex gap-1 overflow-x-auto pb-1 z-20">
        {completedClips.map((clip, idx) => (
          <button
            key={clip.id}
            onClick={() => {
              shouldAutoPlayRef.current = isPlaying;
              setCurrentIndex(idx);
            }}
            className={cn(
              "flex-shrink-0 w-10 h-6 rounded overflow-hidden border-2 transition-all",
              idx === currentIndex 
                ? "border-primary ring-1 ring-primary/50" 
                : "border-transparent opacity-60 hover:opacity-100"
            )}
          >
            {clip.thumbnail_url ? (
              <img 
                src={clip.thumbnail_url} 
                alt={`Scene ${idx + 1}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-muted flex items-center justify-center">
                <span className="text-[8px]">{idx + 1}</span>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
