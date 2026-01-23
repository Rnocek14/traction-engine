import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Film } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";
import type { Clip } from "@/types/timeline-types";

type VideoJob = Tables<"video_jobs">;

interface ReelPlayerProps {
  clips: Clip[];
  videoJobs: VideoJob[];
  audioUrl?: string;
  className?: string;
  onClipChange?: (clipIndex: number) => void;
}

/**
 * Sequential reel player that plays all clip videos seamlessly.
 * Uses dual video elements for gapless playback.
 */
export function ReelPlayer({
  clips,
  videoJobs,
  audioUrl,
  className,
  onClipChange,
}: ReelPlayerProps) {
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  
  const [activePlayer, setActivePlayer] = useState<"A" | "B">("A");
  const [currentClipIndex, setCurrentClipIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [showControls, setShowControls] = useState(true);

  // Map clips to their video jobs
  const clipVideos = clips
    .filter(c => c.type === "video" && !c.disabled)
    .map(clip => {
      const job = videoJobs.find(j => {
        const settings = j.settings as Record<string, unknown> | null;
        return settings?.clip_id === clip.id && (j.status === "done" || j.status === "succeeded");
      });
      return { clip, job };
    })
    .filter(cv => cv.job?.output_url);

  const currentVideo = clipVideos[currentClipIndex];
  const nextVideo = clipVideos[currentClipIndex + 1];
  const totalClips = clipVideos.length;
  const hasVideos = totalClips > 0;

  // Calculate total duration
  const totalDuration = clipVideos.reduce((sum, cv) => {
    return sum + (cv.clip.end - cv.clip.start);
  }, 0);

  // Get refs based on active player
  const activeVideoRef = activePlayer === "A" ? videoARef : videoBRef;
  const preloadVideoRef = activePlayer === "A" ? videoBRef : videoARef;

  // Preload next video
  useEffect(() => {
    if (nextVideo?.job?.output_url && preloadVideoRef.current) {
      preloadVideoRef.current.src = nextVideo.job.output_url;
      preloadVideoRef.current.load();
    }
  }, [nextVideo, preloadVideoRef]);

  // Calculate current position across all clips
  const calculateGlobalTime = useCallback(() => {
    let time = 0;
    for (let i = 0; i < currentClipIndex; i++) {
      time += clipVideos[i].clip.end - clipVideos[i].clip.start;
    }
    if (activeVideoRef.current) {
      time += activeVideoRef.current.currentTime;
    }
    return time;
  }, [currentClipIndex, clipVideos, activeVideoRef]);

  const handleTimeUpdate = useCallback(() => {
    if (!activeVideoRef.current) return;
    setCurrentTime(calculateGlobalTime());
    
    // Check if near end of current video (within 0.1s) to prepare seamless transition
    const timeRemaining = activeVideoRef.current.duration - activeVideoRef.current.currentTime;
    if (timeRemaining < 0.15 && timeRemaining > 0 && nextVideo && preloadVideoRef.current) {
      // Ensure next video is ready
      if (preloadVideoRef.current.readyState >= 3) {
        preloadVideoRef.current.currentTime = 0;
      }
    }
  }, [calculateGlobalTime, nextVideo, preloadVideoRef, activeVideoRef]);

  const handleVideoEnded = useCallback(() => {
    if (currentClipIndex < totalClips - 1) {
      // Seamlessly switch to preloaded video
      const nextIndex = currentClipIndex + 1;
      
      // Start the preloaded video immediately
      if (preloadVideoRef.current && isPlaying) {
        preloadVideoRef.current.currentTime = 0;
        preloadVideoRef.current.play().catch(() => {});
      }
      
      // Swap active player
      setActivePlayer(prev => prev === "A" ? "B" : "A");
      setCurrentClipIndex(nextIndex);
    } else {
      // End of reel - loop back to start
      setIsPlaying(false);
      setCurrentClipIndex(0);
      setActivePlayer("A");
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    }
  }, [currentClipIndex, totalClips, isPlaying, preloadVideoRef]);

  // Notify parent of clip changes
  useEffect(() => {
    onClipChange?.(currentClipIndex);
  }, [currentClipIndex, onClipChange]);

  // Sync audio with video playback
  useEffect(() => {
    if (!audioRef.current || !audioUrl) return;
    
    if (isPlaying) {
      const globalTime = calculateGlobalTime();
      audioRef.current.currentTime = globalTime;
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, audioUrl, calculateGlobalTime]);

  const togglePlay = useCallback(() => {
    if (!activeVideoRef.current) return;
    
    if (isPlaying) {
      activeVideoRef.current.pause();
      audioRef.current?.pause();
    } else {
      activeVideoRef.current.play().catch(() => {});
      if (audioRef.current && audioUrl) {
        const globalTime = calculateGlobalTime();
        audioRef.current.currentTime = globalTime;
        audioRef.current.play().catch(() => {});
      }
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying, audioUrl, calculateGlobalTime, activeVideoRef]);

  const toggleMute = useCallback(() => {
    if (videoARef.current) videoARef.current.muted = !isMuted;
    if (videoBRef.current) videoBRef.current.muted = !isMuted;
    if (audioRef.current) audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  }, [isMuted]);

  const skipToClip = useCallback((index: number) => {
    if (index < 0 || index >= totalClips) return;
    
    const targetVideo = clipVideos[index];
    if (!targetVideo?.job?.output_url) return;
    
    // Load and play the target video
    if (activeVideoRef.current) {
      activeVideoRef.current.src = targetVideo.job.output_url;
      activeVideoRef.current.currentTime = 0;
      if (isPlaying) {
        activeVideoRef.current.play().catch(() => {});
      }
    }
    
    setCurrentClipIndex(index);
    
    // Sync audio
    if (audioRef.current && audioUrl) {
      let time = 0;
      for (let i = 0; i < index; i++) {
        time += clipVideos[i].clip.end - clipVideos[i].clip.start;
      }
      audioRef.current.currentTime = time;
    }
  }, [totalClips, clipVideos, isPlaying, audioUrl, activeVideoRef]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
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
          skipToClip(currentClipIndex - 1);
          break;
        case "ArrowRight":
          skipToClip(currentClipIndex + 1);
          break;
        case "KeyM":
          toggleMute();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay, toggleMute, currentClipIndex, skipToClip]);

  if (!hasVideos) {
    return (
      <div className={cn(
        "relative bg-[hsl(222_47%_4%)] rounded-lg overflow-hidden border border-border/30",
        "flex items-center justify-center aspect-[9/16] max-h-[70vh]",
        className
      )}>
        <div className="text-center p-8">
          <Film className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-sm text-muted-foreground">No videos ready yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Generate videos for clips first
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative bg-[hsl(222_47%_4%)] rounded-lg overflow-hidden border border-border/30",
        className
      )}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      {/* Dual video players for seamless transitions */}
      <div className="relative aspect-[9/16] max-h-[70vh] flex items-center justify-center">
        {/* Video A */}
        <video
          ref={videoARef}
          src={currentVideo?.job?.output_url || ""}
          className={cn(
            "absolute inset-0 w-full h-full object-contain transition-opacity duration-100",
            activePlayer === "A" ? "opacity-100 z-10" : "opacity-0 z-0"
          )}
          muted={isMuted}
          playsInline
          onTimeUpdate={activePlayer === "A" ? handleTimeUpdate : undefined}
          onEnded={activePlayer === "A" ? handleVideoEnded : undefined}
          onPlay={() => activePlayer === "A" && setIsPlaying(true)}
          onPause={() => activePlayer === "A" && setIsPlaying(false)}
        />
        
        {/* Video B (preload/swap) */}
        <video
          ref={videoBRef}
          className={cn(
            "absolute inset-0 w-full h-full object-contain transition-opacity duration-100",
            activePlayer === "B" ? "opacity-100 z-10" : "opacity-0 z-0"
          )}
          muted={isMuted}
          playsInline
          onTimeUpdate={activePlayer === "B" ? handleTimeUpdate : undefined}
          onEnded={activePlayer === "B" ? handleVideoEnded : undefined}
          onPlay={() => activePlayer === "B" && setIsPlaying(true)}
          onPause={() => activePlayer === "B" && setIsPlaying(false)}
        />

        {/* Hidden audio for voiceover */}
        {audioUrl && (
          <audio ref={audioRef} src={audioUrl} preload="auto" />
        )}

        {/* Play/Pause overlay */}
        <button
          onClick={togglePlay}
          className={cn(
            "absolute inset-0 z-20 flex items-center justify-center",
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
      </div>

      {/* Clip indicator */}
      <div className={cn(
        "absolute top-3 left-3 right-3 z-30 flex items-center justify-between",
        "transition-opacity duration-200",
        showControls ? "opacity-100" : "opacity-0"
      )}>
        <div className="px-2 py-1 rounded bg-background/60 backdrop-blur-sm border border-border/30">
          <span className="text-[10px] font-mono text-primary font-semibold">
            CLIP {currentClipIndex + 1}/{totalClips}
          </span>
        </div>
        
        {currentVideo?.clip.prompt && (
          <div className="max-w-[60%] px-2 py-1 rounded bg-background/60 backdrop-blur-sm border border-border/30">
            <p className="text-[10px] text-muted-foreground truncate">
              {currentVideo.clip.prompt}
            </p>
          </div>
        )}
      </div>

      {/* Clip thumbnails strip */}
      <div className={cn(
        "absolute left-3 right-3 bottom-16 z-30",
        "flex gap-1 overflow-x-auto pb-1",
        "transition-opacity duration-200",
        showControls ? "opacity-100" : "opacity-0"
      )}>
        {clipVideos.map((cv, idx) => {
          const job = cv.job as VideoJob & { thumbnail_url?: string };
          return (
            <button
              key={cv.clip.id}
              onClick={() => skipToClip(idx)}
              className={cn(
                "flex-shrink-0 w-10 h-16 rounded overflow-hidden border-2 transition-all",
                idx === currentClipIndex
                  ? "border-primary scale-105"
                  : "border-transparent opacity-60 hover:opacity-100"
              )}
            >
              {job?.thumbnail_url ? (
                <img
                  src={job.thumbnail_url}
                  alt={`Clip ${idx + 1}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-secondary/30 flex items-center justify-center">
                  <span className="text-[10px] text-muted-foreground">{idx + 1}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Controls */}
      <div className={cn(
        "absolute bottom-0 left-0 right-0 z-30 p-3",
        "bg-gradient-to-t from-background/90 to-transparent",
        "transition-opacity duration-200",
        showControls || !isPlaying ? "opacity-100" : "opacity-0"
      )}>
        <div className="flex items-center gap-3">
          {/* Skip back */}
          <button
            onClick={() => skipToClip(currentClipIndex - 1)}
            disabled={currentClipIndex === 0}
            className="p-1 hover:bg-secondary/50 rounded transition-colors disabled:opacity-30"
          >
            <SkipBack className="h-4 w-4 text-muted-foreground" />
          </button>

          {/* Timecode */}
          <div className="font-mono text-xs text-primary tabular-nums">
            {formatTime(currentTime)}
          </div>

          {/* Progress bar */}
          <div className="flex-1 h-1 bg-secondary/50 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-100"
              style={{ width: totalDuration > 0 ? `${(currentTime / totalDuration) * 100}%` : "0%" }}
            />
          </div>

          {/* Duration */}
          <div className="font-mono text-xs text-muted-foreground tabular-nums">
            {formatTime(totalDuration)}
          </div>

          {/* Skip forward */}
          <button
            onClick={() => skipToClip(currentClipIndex + 1)}
            disabled={currentClipIndex === totalClips - 1}
            className="p-1 hover:bg-secondary/50 rounded transition-colors disabled:opacity-30"
          >
            <SkipForward className="h-4 w-4 text-muted-foreground" />
          </button>

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
        </div>
      </div>
    </div>
  );
}
