import { useState, useRef, useEffect, useCallback, forwardRef } from "react";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Film, Mic, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";
import type { Clip, ClipTransition } from "@/types/timeline-types";
import { DEFAULT_TRANSITION } from "@/types/timeline-types";

type VideoJob = Tables<"video_jobs">;

interface ReelPlayerProps {
  clips: Clip[];
  videoJobs: VideoJob[];
  audioUrl?: string;
  className?: string;
  onClipChange?: (clipIndex: number) => void;
  /** Enable crossfade transitions between clips (default: true) */
  enableTransitions?: boolean;
  /** Default transition when clip doesn't specify one */
  defaultTransition?: ClipTransition;
}

/**
 * Sequential reel player that plays all clip videos seamlessly with crossfade transitions.
 * Uses dual video elements for gapless playback with opacity-based crossfades.
 * 
 * Key architecture:
 * - userWantsPlayingRef tracks user intent (not video element state)
 * - isNextReadyRef guards transitions until preload is buffered
 * - Audio syncs only on user actions (play/skip), not during auto-transitions
 * - Crossfade transitions via CSS opacity with configurable duration
 */
export const ReelPlayer = forwardRef<HTMLDivElement, ReelPlayerProps>(function ReelPlayer({
  clips,
  videoJobs,
  audioUrl,
  className,
  onClipChange,
  enableTransitions = true,
  defaultTransition = DEFAULT_TRANSITION,
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
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionDuration, setTransitionDuration] = useState(0);
  
  // Audio source: "voiceover" plays the voiceover track and mutes video,
  // "video" plays the video's embedded audio and mutes voiceover
  const [audioSource, setAudioSource] = useState<"voiceover" | "video">(
    audioUrl ? "voiceover" : "video"
  );
  
  // Imperative state refs - these are the source of truth
  const userWantsPlayingRef = useRef(false);
  const isTransitioningRef = useRef(false);
  const isNextReadyRef = useRef(false);
  // Per-player URL tracking to prevent loading conflicts during transitions
  const loadedUrlARef = useRef<string | null>(null);
  const loadedUrlBRef = useRef<string | null>(null);

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
  // Use per-player URL refs to prevent spurious reloads that stop playback
  useEffect(() => {
    // Don't interfere during transitions - the preload system handles it
    if (isTransitioningRef.current) return;
    
    if (!currentVideo?.job?.output_url) return;
    
    const url = currentVideo.job.output_url;
    const activeEl = activePlayer === "A" ? videoARef.current : videoBRef.current;
    const loadedUrlRef = activePlayer === "A" ? loadedUrlARef : loadedUrlBRef;
    
    // Skip if this player already has this URL loaded
    if (loadedUrlRef.current === url) return;
    
    if (!activeEl) return;
    
    console.log('[ReelPlayer] Loading video on player', activePlayer, 'url:', url.slice(-30));
    loadedUrlRef.current = url;
    activeEl.src = url;
    activeEl.load();
  }, [currentVideo, activePlayer]);

  // Preload next video with canplaythrough guard
  useEffect(() => {
    // DON'T PRELOAD DURING TRANSITIONS - the active player is changing
    if (isTransitioningRef.current) return;
    
    // Determine which player should preload (opposite of active)
    const preloadPlayer = activePlayer === "A" ? "B" : "A";
    const preloadEl = preloadPlayer === "A" ? videoARef.current : videoBRef.current;
    
    if (!nextVideo?.job?.output_url || !preloadEl) {
      isNextReadyRef.current = false;
      return;
    }
    
    // CRITICAL: Never call .load() on a video that's currently playing
    if (!preloadEl.paused) {
      console.log('[ReelPlayer] Skipping preload - element is playing');
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
  }, [currentClipIndex, nextVideo, activePlayer]);


  // Handle seamless transition to next clip with crossfade
  const transitionToNextClip = useCallback(() => {
    console.log('[ReelPlayer] transitionToNextClip called', {
      currentClipIndex,
      totalClips,
      isNextReady: isNextReadyRef.current,
      activePlayer,
      nextVideoUrl: nextVideo?.job?.output_url?.slice(-30)
    });
    
    if (currentClipIndex >= totalClips - 1) {
      // End of reel - stop and reset
      console.log('[ReelPlayer] End of reel, resetting');
      userWantsPlayingRef.current = false;
      setIsPlaying(false);
      setIsTransitioning(false);
      setCurrentClipIndex(0);
      setActivePlayer("A");
      loadedUrlARef.current = null;
      loadedUrlBRef.current = null;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      isTransitioningRef.current = false;
      return;
    }

    // Guard: wait for preload to be ready
    if (!isNextReadyRef.current) {
      console.log('[ReelPlayer] Next not ready, retrying in 50ms');
      // Retry after a short delay
      setTimeout(() => {
        if (userWantsPlayingRef.current) {
          transitionToNextClip();
        }
      }, 50);
      return;
    }

    const preloadRef = getPreloadRef();
    const activeRef = getActiveRef();
    const preloadEl = preloadRef.current;
    const activeEl = activeRef.current;
    
    if (!preloadEl) {
      console.log('[ReelPlayer] No preload element, aborting transition');
      isTransitioningRef.current = false;
      setIsTransitioning(false);
      return;
    }

    // Get transition settings for next clip
    const nextClipData = clipVideos[currentClipIndex + 1];
    const transition = enableTransitions 
      ? (nextClipData?.clip?.transition_in ?? defaultTransition)
      : { type: "cut" as const, duration: 0 };
    
    const transitionMs = transition.type === "cut" ? 0 : transition.duration * 1000;
    setTransitionDuration(transition.duration);
    
    // Start crossfade transition
    if (transitionMs > 0) {
      setIsTransitioning(true);
    }

    // Start playback on preloaded video FIRST
    preloadEl.currentTime = 0;
    const playPromise = preloadEl.play();
    
    if (playPromise !== undefined) {
      playPromise.then(() => {
        // Determine new active player
        const newActivePlayer = activePlayer === "A" ? "B" : "A";
        console.log('[ReelPlayer] Swap successful, new active player:', newActivePlayer);
        
        // Update URL tracking - the preloaded URL is now the active URL
        if (newActivePlayer === "B") {
          loadedUrlBRef.current = nextVideo?.job?.output_url || null;
          loadedUrlARef.current = null; // Clear old player so it can preload next
        } else {
          loadedUrlARef.current = nextVideo?.job?.output_url || null;
          loadedUrlBRef.current = null;
        }
        
        // Now swap the active player (triggers CSS transition)
        setActivePlayer(newActivePlayer);
        setCurrentClipIndex(prev => prev + 1);
        
        // Wait for crossfade to complete, then pause old video and cleanup
        setTimeout(() => {
          if (activeEl) {
            activeEl.pause();
          }
          setIsTransitioning(false);
          isTransitioningRef.current = false;
        }, transitionMs);
        
      }).catch((err) => {
        console.log('[ReelPlayer] Play promise rejected:', err);
        isTransitioningRef.current = false;
        setIsTransitioning(false);
      });
    } else {
      // Fallback for browsers without promise
      const newActivePlayer = activePlayer === "A" ? "B" : "A";
      if (newActivePlayer === "B") {
        loadedUrlBRef.current = nextVideo?.job?.output_url || null;
        loadedUrlARef.current = null;
      } else {
        loadedUrlARef.current = nextVideo?.job?.output_url || null;
        loadedUrlBRef.current = null;
      }
      setActivePlayer(newActivePlayer);
      setCurrentClipIndex(prev => prev + 1);
      setTimeout(() => {
        if (activeEl) activeEl.pause();
        setIsTransitioning(false);
        isTransitioningRef.current = false;
      }, transitionMs);
    }
  }, [currentClipIndex, totalClips, getPreloadRef, getActiveRef, activePlayer, nextVideo, clipVideos, enableTransitions, defaultTransition]);

  // Video ended handler - only triggers transition
  // CRITICAL: Set isTransitioningRef IMMEDIATELY to guard against onPause race condition
  const handleVideoEnded = useCallback(() => {
    console.log('[ReelPlayer] Video ended, clip:', currentClipIndex, 'userWantsPlaying:', userWantsPlayingRef.current);
    isTransitioningRef.current = true;
    
    if (userWantsPlayingRef.current) {
      console.log('[ReelPlayer] User wants playing, transitioning...');
      transitionToNextClip();
    } else {
      console.log('[ReelPlayer] User paused, not transitioning');
      isTransitioningRef.current = false;
    }
  }, [transitionToNextClip, currentClipIndex]);

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
    // Mute/unmute active audio source only
    if (audioSource === "voiceover") {
      if (audioRef.current) audioRef.current.muted = newMuted;
    } else {
      if (videoARef.current) videoARef.current.muted = newMuted;
      if (videoBRef.current) videoBRef.current.muted = newMuted;
    }
    setIsMuted(newMuted);
  }, [isMuted, audioSource]);
  
  // Toggle between voiceover and video audio
  const toggleAudioSource = useCallback(() => {
    const newSource = audioSource === "voiceover" ? "video" : "voiceover";
    setAudioSource(newSource);
    
    if (newSource === "voiceover") {
      // Mute video, unmute voiceover
      if (videoARef.current) videoARef.current.muted = true;
      if (videoBRef.current) videoBRef.current.muted = true;
      if (audioRef.current) {
        audioRef.current.muted = isMuted;
        // Sync voiceover to current position
        audioRef.current.currentTime = calculateGlobalTime();
        if (userWantsPlayingRef.current) {
          audioRef.current.play().catch(() => {});
        }
      }
    } else {
      // Mute voiceover, unmute video
      if (audioRef.current) {
        audioRef.current.muted = true;
        audioRef.current.pause();
      }
      if (videoARef.current) videoARef.current.muted = isMuted;
      if (videoBRef.current) videoBRef.current.muted = isMuted;
    }
  }, [audioSource, isMuted, calculateGlobalTime]);

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
      {/* Video container - fills parent, BOTH videos absolute-positioned for crossfade stacking */}
      <div className="relative w-full h-full flex items-center justify-center">
        {/* 
          CROSSFADE ARCHITECTURE:
          - Both videos are ALWAYS position:absolute;inset:0 so they stack
          - During transition: old opacity 1→0, new opacity 0→1 simultaneously
          - pointer-events:none on hidden layer to prevent click interference
          - Both mounted always to enable preloading
          
          Z-INDEX FIX: During transitions, INCOMING video is always on top (z-index 10)
          to prevent 1-frame flash from z-index swap before opacity settles.
          After transition completes, z-index normalizes.
        */}
        
        {/* Video A */}
        <video
          ref={videoARef}
          className={cn(
            "absolute inset-0 w-full h-full object-contain",
            // Opacity logic: active=1, transitioning-out=fading, hidden=0
            activePlayer === "A" && !isTransitioning && "opacity-100",
            activePlayer === "A" && isTransitioning && "opacity-100", // Still visible, incoming fades in on top
            activePlayer === "B" && isTransitioning && "opacity-0",   // Fading out (will be hidden by incoming B on top)
            activePlayer === "B" && !isTransitioning && "opacity-0 pointer-events-none"
          )}
          style={{
            transition: `opacity ${transitionDuration}s ease-in-out`,
            // Z-INDEX FIX: During transition, the INCOMING player is on top
            // When transitioning TO B, A is outgoing (lower z), B is incoming (higher z)
            // When transitioning TO A, B is outgoing (lower z), A is incoming (higher z)
            zIndex: isTransitioning 
              ? (activePlayer === "B" ? 1 : 10)  // A incoming = 10, A outgoing = 1
              : (activePlayer === "A" ? 2 : 1),  // Normal: active on top
          }}
          muted={audioSource === "voiceover" || isMuted}
          playsInline
          preload="auto"
          onTimeUpdate={activePlayer === "A" ? handleTimeUpdate : undefined}
          onEnded={activePlayer === "A" ? handleVideoEnded : undefined}
          onPause={activePlayer === "A" ? handleVideoPause : undefined}
          onCanPlay={activePlayer === "A" ? handleVideoCanPlay : undefined}
        />
        
        {/* Video B (always mounted for preloading) */}
        <video
          ref={videoBRef}
          className={cn(
            "absolute inset-0 w-full h-full object-contain",
            activePlayer === "B" && !isTransitioning && "opacity-100",
            activePlayer === "B" && isTransitioning && "opacity-100",
            activePlayer === "A" && isTransitioning && "opacity-0",
            activePlayer === "A" && !isTransitioning && "opacity-0 pointer-events-none"
          )}
          style={{
            transition: `opacity ${transitionDuration}s ease-in-out`,
            // Z-INDEX FIX: During transition, the INCOMING player is on top
            zIndex: isTransitioning 
              ? (activePlayer === "A" ? 1 : 10)  // B incoming = 10, B outgoing = 1
              : (activePlayer === "B" ? 2 : 1),  // Normal: active on top
          }}
          muted={audioSource === "voiceover" || isMuted}
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

          {/* Audio source toggle - only show if voiceover exists */}
          {audioUrl && (
            <button
              onClick={toggleAudioSource}
              className="p-1 hover:bg-secondary/50 rounded transition-colors flex items-center gap-1"
              title={audioSource === "voiceover" ? "Playing: Voiceover" : "Playing: Video Audio"}
            >
              {audioSource === "voiceover" ? (
                <Mic className="h-4 w-4 text-primary" />
              ) : (
                <Video className="h-4 w-4 text-primary" />
              )}
            </button>
          )}

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
