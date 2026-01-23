import { useState, useRef, useEffect, useCallback, forwardRef } from "react";
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
 * 
 * Key architecture:
 * - userWantsPlayingRef tracks user intent (not video element state)
 * - isNextReadyRef guards transitions until preload is buffered
 * - Audio syncs only on user actions (play/skip), not during auto-transitions
 */
export const ReelPlayer = forwardRef<HTMLDivElement, ReelPlayerProps>(function ReelPlayer({
  clips,
  videoJobs,
  audioUrl,
  className,
  onClipChange,
}, ref) {
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  
  const [activePlayer, setActivePlayer] = useState<"A" | "B">("A");
  const [currentClipIndex, setCurrentClipIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [showControls, setShowControls] = useState(true);
  
  // Imperative state refs - these are the source of truth
  const userWantsPlayingRef = useRef(false);
  const isTransitioningRef = useRef(false);
  const isNextReadyRef = useRef(false);
  const loadedVideoUrlRef = useRef<string | null>(null);

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
  const getActiveRef = useCallback(() => {
    return activePlayer === "A" ? videoARef : videoBRef;
  }, [activePlayer]);

  const getPreloadRef = useCallback(() => {
    return activePlayer === "A" ? videoBRef : videoARef;
  }, [activePlayer]);

  // Calculate global time across all clips
  const calculateGlobalTime = useCallback(() => {
    let time = 0;
    for (let i = 0; i < currentClipIndex; i++) {
      if (clipVideos[i]) {
        time += clipVideos[i].clip.end - clipVideos[i].clip.start;
      }
    }
    const activeRef = getActiveRef();
    if (activeRef.current && !isNaN(activeRef.current.currentTime)) {
      time += activeRef.current.currentTime;
    }
    return time;
  }, [currentClipIndex, clipVideos, getActiveRef]);

  // Load initial video when component mounts or clip changes
  // Use loadedVideoUrlRef to prevent spurious reloads that stop playback
  useEffect(() => {
    if (!currentVideo?.job?.output_url) return;
    
    const url = currentVideo.job.output_url;
    
    // Skip if we've already loaded this exact URL
    if (loadedVideoUrlRef.current === url) return;
    
    const activeEl = activePlayer === "A" ? videoARef.current : videoBRef.current;
    if (!activeEl) return;
    
    loadedVideoUrlRef.current = url;
    activeEl.src = url;
    activeEl.load();
  }, [currentVideo, activePlayer]);

  // Preload next video with canplaythrough guard
  useEffect(() => {
    const preloadRef = getPreloadRef();
    const preloadEl = preloadRef.current;
    if (!nextVideo?.job?.output_url || !preloadEl) {
      isNextReadyRef.current = false;
      return;
    }
    
    isNextReadyRef.current = false;
    preloadEl.src = nextVideo.job.output_url;
    preloadEl.load();
    preloadEl.currentTime = 0;
    
    const handleCanPlay = () => {
      isNextReadyRef.current = true;
    };
    
    preloadEl.addEventListener("canplaythrough", handleCanPlay);
    return () => preloadEl.removeEventListener("canplaythrough", handleCanPlay);
  }, [currentClipIndex, nextVideo, getPreloadRef]);


  // Handle seamless transition to next clip
  const transitionToNextClip = useCallback(() => {
    if (currentClipIndex >= totalClips - 1) {
      // End of reel - stop and reset
      userWantsPlayingRef.current = false;
      setIsPlaying(false);
      setCurrentClipIndex(0);
      setActivePlayer("A");
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      return;
    }

    // Guard: wait for preload to be ready
    if (!isNextReadyRef.current) {
      // Retry after a short delay
      setTimeout(() => {
        if (userWantsPlayingRef.current) {
          transitionToNextClip();
        }
      }, 50);
      return;
    }

    isTransitioningRef.current = true;
    
    const preloadRef = getPreloadRef();
    const activeRef = getActiveRef();
    const preloadEl = preloadRef.current;
    const activeEl = activeRef.current;
    
    if (!preloadEl) {
      isTransitioningRef.current = false;
      return;
    }

    // Start playback on preloaded video FIRST
    preloadEl.currentTime = 0;
    const playPromise = preloadEl.play();
    
    if (playPromise !== undefined) {
      playPromise.then(() => {
        // Now swap the active player
        setActivePlayer(prev => prev === "A" ? "B" : "A");
        setCurrentClipIndex(prev => prev + 1);
        
        // Pause old video after swap
        if (activeEl) {
          activeEl.pause();
        }
        
        isTransitioningRef.current = false;
      }).catch(() => {
        isTransitioningRef.current = false;
      });
    } else {
      // Fallback for browsers without promise
      setActivePlayer(prev => prev === "A" ? "B" : "A");
      setCurrentClipIndex(prev => prev + 1);
      if (activeEl) activeEl.pause();
      isTransitioningRef.current = false;
    }
  }, [currentClipIndex, totalClips, getPreloadRef, getActiveRef]);

  // Video ended handler - only triggers transition
  // CRITICAL: Set isTransitioningRef IMMEDIATELY to guard against onPause race condition
  const handleVideoEnded = useCallback(() => {
    isTransitioningRef.current = true;
    
    if (userWantsPlayingRef.current) {
      transitionToNextClip();
    } else {
      isTransitioningRef.current = false;
    }
  }, [transitionToNextClip]);

  // Time update handler
  const handleTimeUpdate = useCallback(() => {
    const activeEl = activePlayer === "A" ? videoARef.current : videoBRef.current;
    if (!activeEl) return;
    setCurrentTime(calculateGlobalTime());
    
    // Pre-set transition flag when we're near the end of the clip
    // This prevents onPause from killing playback during clip transitions
    const timeRemaining = activeEl.duration - activeEl.currentTime;
    if (timeRemaining < 0.3 && timeRemaining > 0 && userWantsPlayingRef.current && !isNaN(activeEl.duration)) {
      isTransitioningRef.current = true;
    }
  }, [calculateGlobalTime, activePlayer]);

  // Handle unexpected video pause - sync audio
  const handleVideoPause = useCallback(() => {
    const activeEl = activePlayer === "A" ? videoARef.current : videoBRef.current;
    
    // If user wanted playback but video paused unexpectedly (not during transition)
    if (userWantsPlayingRef.current && !isTransitioningRef.current) {
      // Check if this is a natural end-of-video pause (not unexpected)
      if (activeEl && !isNaN(activeEl.duration) && activeEl.currentTime >= activeEl.duration - 0.1) {
        // Video ended naturally - don't treat as unexpected pause
        return;
      }
      
      // Truly unexpected pause - sync audio
      audioRef.current?.pause();
      setIsPlaying(false);
      userWantsPlayingRef.current = false;
    }
  }, [activePlayer]);

  // Handle video ready to play - resume if user wants playback
  const handleVideoCanPlay = useCallback(() => {
    const activeEl = activePlayer === "A" ? videoARef.current : videoBRef.current;
    if (activeEl && userWantsPlayingRef.current && !isTransitioningRef.current) {
      activeEl.play().catch(() => {});
    }
  }, [activePlayer]);

  // Notify parent of clip changes
  useEffect(() => {
    onClipChange?.(currentClipIndex);
  }, [currentClipIndex, onClipChange]);

  // Sync audio imperatively (called only on user actions)
  const syncAudio = useCallback((globalTime: number) => {
    if (!audioRef.current || !audioUrl) return;
    audioRef.current.currentTime = globalTime;
    if (userWantsPlayingRef.current) {
      audioRef.current.play().catch(() => {});
    }
  }, [audioUrl]);

  const togglePlay = useCallback(() => {
    const activeRef = getActiveRef();
    const activeEl = activeRef.current;
    if (!activeEl) return;
    
    if (isPlaying) {
      // User wants to pause
      userWantsPlayingRef.current = false;
      activeEl.pause();
      audioRef.current?.pause();
      setIsPlaying(false);
    } else {
      // User wants to play
      userWantsPlayingRef.current = true;
      activeEl.play().catch(() => {});
      // Sync audio on explicit play action
      syncAudio(calculateGlobalTime());
      setIsPlaying(true);
    }
  }, [isPlaying, calculateGlobalTime, getActiveRef, syncAudio]);

  const toggleMute = useCallback(() => {
    const newMuted = !isMuted;
    if (videoARef.current) videoARef.current.muted = newMuted;
    if (videoBRef.current) videoBRef.current.muted = newMuted;
    if (audioRef.current) audioRef.current.muted = newMuted;
    setIsMuted(newMuted);
  }, [isMuted]);

  const skipToClip = useCallback((index: number) => {
    if (index < 0 || index >= totalClips) return;
    
    const targetVideo = clipVideos[index];
    if (!targetVideo?.job?.output_url) return;
    
    isTransitioningRef.current = true;
    
    // Calculate audio time for target clip
    let audioTime = 0;
    for (let i = 0; i < index; i++) {
      audioTime += clipVideos[i].clip.end - clipVideos[i].clip.start;
    }
    
    // Reset to player A for clean state
    setActivePlayer("A");
    setCurrentClipIndex(index);
    
    // Load and play the target video
    if (videoARef.current) {
      videoARef.current.src = targetVideo.job.output_url;
      videoARef.current.currentTime = 0;
      if (userWantsPlayingRef.current) {
        videoARef.current.play().catch(() => {});
      }
    }
    
    // Sync audio on explicit skip
    syncAudio(audioTime);
    
    isTransitioningRef.current = false;
  }, [totalClips, clipVideos, syncAudio]);

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
      <div 
        ref={ref}
        className={cn(
          "relative bg-[hsl(222_47%_4%)] rounded-lg overflow-hidden border border-border/30",
          "flex items-center justify-center h-full",
          className
        )}
      >
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
      ref={ref}
      className={cn(
        "relative bg-[hsl(222_47%_4%)] rounded-lg overflow-hidden border border-border/30 h-full",
        className
      )}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      {/* Video container - fills parent, videos use object-contain */}
      <div className="relative w-full h-full flex items-center justify-center">
        {/* Video A */}
        <video
          ref={videoARef}
          className={cn(
            "max-w-full max-h-full object-contain transition-opacity duration-75",
            activePlayer === "A" ? "opacity-100" : "opacity-0 absolute"
          )}
          muted={isMuted}
          playsInline
          preload="auto"
          onTimeUpdate={activePlayer === "A" ? handleTimeUpdate : undefined}
          onEnded={activePlayer === "A" ? handleVideoEnded : undefined}
          onPause={activePlayer === "A" ? handleVideoPause : undefined}
          onCanPlay={activePlayer === "A" ? handleVideoCanPlay : undefined}
        />
        
        {/* Video B (preload/swap) */}
        <video
          ref={videoBRef}
          className={cn(
            "max-w-full max-h-full object-contain transition-opacity duration-75",
            activePlayer === "B" ? "opacity-100" : "opacity-0 absolute"
          )}
          muted={isMuted}
          playsInline
          preload="auto"
          onTimeUpdate={activePlayer === "B" ? handleTimeUpdate : undefined}
          onEnded={activePlayer === "B" ? handleVideoEnded : undefined}
          onPause={activePlayer === "B" ? handleVideoPause : undefined}
          onCanPlay={activePlayer === "B" ? handleVideoCanPlay : undefined}
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
});
