import { useState, useCallback, useRef, useEffect } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SpritesheetScrubber } from "./SpritesheetScrubber";
import type { Tables } from "@/integrations/supabase/types";

type VideoJob = Tables<"video_jobs">;

interface PreviewCanvasProps {
  videoJob?: VideoJob | null;
  scenePrompts: string[];
  currentSceneIndex: number;
  onSceneChange?: (index: number) => void;
  onScrubPositionChange?: (position: number) => void;
  hoveredClipId?: string | null;
  className?: string;
}

/**
 * Hero video preview component with DaVinci-style aesthetic.
 * Shows video when available, otherwise displays scene prompts as floating cards.
 */
export function PreviewCanvas({
  videoJob,
  scenePrompts,
  currentSceneIndex,
  onSceneChange,
  onScrubPositionChange,
  hoveredClipId,
  className,
}: PreviewCanvasProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(false);

  const hasVideo = videoJob?.output_url;
  const thumbnailUrl = (videoJob as unknown as { thumbnail_url?: string })?.thumbnail_url;
  const spritesheetUrl = (videoJob as unknown as { spritesheet_url?: string })?.spritesheet_url;

  // Determine aspect ratio from video settings (fixed: proper dimension parsing)
  const settings = (videoJob?.settings ?? {}) as Record<string, unknown>;
  const videoSize = typeof settings.size === "string" ? settings.size : "720x1280";
  const [w, h] = videoSize.split("x").map(Number);
  const isVertical = h > w;

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const toggleMute = useCallback(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  }, [isMuted]);

  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);
    
    // Calculate scrub position (0-1) and notify parent
    if (duration > 0 && onScrubPositionChange) {
      onScrubPositionChange(videoRef.current.currentTime / duration);
    }
  }, [duration, onScrubPositionChange]);

  const handleLoadedMetadata = useCallback(() => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const frames = Math.floor((seconds % 1) * 30); // Assuming 30fps
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}:${frames.toString().padStart(2, "0")}`;
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      switch (e.code) {
        case "Space":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          if (videoRef.current) {
            videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 0.1);
          }
          break;
        case "ArrowRight":
          if (videoRef.current) {
            videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 0.1);
          }
          break;
        case "KeyM":
          toggleMute();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay, toggleMute, duration]);

  return (
    <div
      className={cn(
        "relative bg-[hsl(222_47%_4%)] rounded-lg overflow-hidden",
        "border border-border/30",
        className
      )}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      {/* Aspect ratio container */}
      <div
        className={cn(
          "relative w-full flex items-center justify-center",
          isVertical ? "aspect-[9/16] max-h-[70vh]" : "aspect-video"
        )}
      >
        {hasVideo ? (
          <>
            {/* Video element */}
            <video
              ref={videoRef}
              src={videoJob.output_url!}
              className={cn(
                "max-w-full max-h-full object-contain",
                isVertical ? "h-full" : "w-full"
              )}
              muted={isMuted}
              loop
              playsInline
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />

            {/* Play/Pause overlay */}
            <button
              onClick={togglePlay}
              className={cn(
                "absolute inset-0 flex items-center justify-center",
                "transition-opacity duration-200",
                showControls || !isPlaying ? "opacity-100" : "opacity-0"
              )}
            >
              <div className={cn(
                "w-20 h-20 rounded-full flex items-center justify-center",
                "bg-background/50 backdrop-blur-sm border border-primary/50",
                "shadow-[0_0_30px_hsl(var(--primary)/0.4)]",
                "hover:scale-110 transition-transform"
              )}>
                {isPlaying ? (
                  <Pause className="h-8 w-8 text-primary" />
                ) : (
                  <Play className="h-8 w-8 text-primary ml-1" />
                )}
              </div>
            </button>
          </>
        ) : thumbnailUrl && spritesheetUrl ? (
          /* Spritesheet scrubber when video not yet available */
          <SpritesheetScrubber
            thumbnailUrl={thumbnailUrl}
            spritesheetUrl={spritesheetUrl}
            className="w-full h-full"
            cols={10}
            rows={10}
          />
        ) : (
          /* Empty state - scene prompts as floating cards */
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8">
            <div className="relative w-full max-w-md">
              {/* Animated gradient border */}
              <div className="absolute -inset-1 bg-gradient-to-r from-primary/50 via-accent/50 to-primary/50 rounded-lg blur-sm opacity-75 animate-pulse" />
              
              <div className="relative bg-background/90 backdrop-blur-sm rounded-lg p-6 border border-border/50">
                <p className="text-sm text-muted-foreground text-center mb-4">
                  No video generated yet
                </p>
                
                {scenePrompts.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">Scene Preview:</p>
                    <div className="p-3 rounded bg-secondary/30 text-sm">
                      <span className="text-primary font-mono text-xs mr-2">
                        [{currentSceneIndex + 1}/{scenePrompts.length}]
                      </span>
                      {scenePrompts[currentSceneIndex] || "No scene prompt"}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Scene indicator overlay */}
      {scenePrompts.length > 0 && (
        <div className={cn(
          "absolute top-3 left-3 right-3 flex items-start justify-between",
          "transition-opacity duration-200",
          showControls || !hasVideo ? "opacity-100" : "opacity-0"
        )}>
          {/* Scene badge */}
          <div className="px-2 py-1 rounded bg-background/60 backdrop-blur-sm border border-border/30">
            <span className="text-[10px] font-mono text-primary font-semibold">
              SCENE {currentSceneIndex + 1}/{scenePrompts.length}
            </span>
          </div>
          
          {/* Current prompt preview */}
          <div className="max-w-[60%] px-2 py-1 rounded bg-background/60 backdrop-blur-sm border border-border/30">
            <p className="text-[10px] text-muted-foreground truncate">
              {scenePrompts[currentSceneIndex] || "No prompt"}
            </p>
          </div>
        </div>
      )}
      <div
        className={cn(
          "absolute bottom-0 left-0 right-0 p-3",
          "bg-gradient-to-t from-background/90 to-transparent",
          "transition-opacity duration-200",
          showControls || !isPlaying ? "opacity-100" : "opacity-0"
        )}
      >
        <div className="flex items-center gap-3">
          {/* Timecode */}
          <div className="font-mono text-xs text-primary tabular-nums">
            {formatTime(currentTime)}
          </div>

          {/* Progress bar */}
          <div className="flex-1 h-1 bg-secondary/50 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-100"
              style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : "0%" }}
            />
          </div>

          {/* Duration */}
          <div className="font-mono text-xs text-muted-foreground tabular-nums">
            {formatTime(duration)}
          </div>

          {/* Volume toggle */}
          <button
            onClick={toggleMute}
            className="p-1 hover:bg-secondary/50 rounded transition-colors"
          >
            {isMuted ? (
              <VolumeX className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Volume2 className="h-4 w-4 text-primary" />
            )}
          </button>

          {/* Fullscreen (placeholder) */}
          <button className="p-1 hover:bg-secondary/50 rounded transition-colors opacity-50">
            <Maximize2 className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
}
