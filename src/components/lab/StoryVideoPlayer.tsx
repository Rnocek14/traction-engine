/**
 * StoryVideoPlayer
 * 
 * Simple sequential video player for story clips.
 * Plays completed clips in order with basic controls.
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  // Get only completed clips sorted by sequence
  const completedClips = clips
    .filter(c => c.status === "done" && c.output_url)
    .sort((a, b) => (a.sequence_index ?? 0) - (b.sequence_index ?? 0));

  const currentClip = completedClips[currentIndex];
  const hasClips = completedClips.length > 0;

  // Handle video end - advance to next clip
  const handleEnded = useCallback(() => {
    if (currentIndex < completedClips.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setIsPlaying(false);
      setCurrentIndex(0);
    }
  }, [currentIndex, completedClips.length]);

  // Auto-play next clip when index changes
  useEffect(() => {
    if (videoRef.current && isPlaying && currentClip?.output_url) {
      videoRef.current.src = currentClip.output_url;
      videoRef.current.play().catch(() => setIsPlaying(false));
    }
  }, [currentIndex, currentClip?.output_url, isPlaying]);

  // Update progress
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateProgress = () => {
      if (video.duration) {
        const clipProgress = video.currentTime / video.duration;
        const overallProgress = ((currentIndex + clipProgress) / completedClips.length) * 100;
        setProgress(overallProgress);
      }
    };

    video.addEventListener("timeupdate", updateProgress);
    return () => video.removeEventListener("timeupdate", updateProgress);
  }, [currentIndex, completedClips.length]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || !currentClip?.output_url) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.src = currentClip.output_url;
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  }, [isPlaying, currentClip?.output_url]);

  const skipPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  }, [currentIndex]);

  const skipNext = useCallback(() => {
    if (currentIndex < completedClips.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  }, [currentIndex, completedClips.length]);

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
      <div className={cn("relative bg-black rounded-lg overflow-hidden", className)}>
        <video
          src={assembledUrl}
          controls
          className="w-full h-full object-contain"
          poster={completedClips[0]?.thumbnail_url || undefined}
        />
        <div className="absolute top-2 right-2">
          <Badge variant="secondary" className="text-[10px] gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Assembled
          </Badge>
        </div>
        <a
          href={assembledUrl}
          download={`story-${Date.now()}.mp4`}
          className="absolute bottom-2 right-2"
        >
          <Button size="sm" variant="secondary" className="h-7 text-xs gap-1">
            <Download className="h-3 w-3" />
            Download
          </Button>
        </a>
      </div>
    );
  }

  return (
    <div className={cn("relative bg-black rounded-lg overflow-hidden", className)}>
      {/* Video element */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        onEnded={handleEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        poster={currentClip?.thumbnail_url || undefined}
        playsInline
      />

      {/* Clip indicator */}
      <div className="absolute top-2 left-2 right-2 flex items-center justify-between">
        <Badge variant="secondary" className="text-[10px]">
          Scene {currentIndex + 1} / {completedClips.length}
        </Badge>
        <Badge variant="outline" className="text-[10px] bg-background/80">
          {currentClip?.provider}
        </Badge>
      </div>

      {/* Controls overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
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
        </div>
      </div>

      {/* Thumbnail strip */}
      <div className="absolute left-2 right-2 top-10 flex gap-1 overflow-x-auto pb-1">
        {completedClips.map((clip, idx) => (
          <button
            key={clip.id}
            onClick={() => setCurrentIndex(idx)}
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
