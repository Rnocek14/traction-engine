import { useRef, useEffect, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Video, Mic, Loader2, AlertCircle, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { VideoRatingPanel } from "./VideoRatingPanel";
import { VideoActionBar } from "./VideoActionBar";
import { UnifiedFilmstrip } from "./UnifiedFilmstrip";
import { getVideoJobDetails } from "@/lib/lab-ratings";
import type { LabResult } from "./LabGeneratePanel";
import type { VideoEngine } from "@/lib/lab-engines";

interface LabPreviewPanelProps {
  className?: string;
  results: LabResult[];
  activeResultId: string | null;
  onSelectResult: (id: string) => void;
  onAddResult?: (result: LabResult) => void;
  onExtendVideo?: (generationIdOrImageUrl: string, engine: VideoEngine) => void;
}

export function LabPreviewPanel({
  className,
  results,
  activeResultId,
  onSelectResult,
  onAddResult,
  onExtendVideo,
}: LabPreviewPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [showRatingPanel, setShowRatingPanel] = useState(false);

  const activeResult = results.find((r) => r.id === activeResultId);
  const activeIndex = results.findIndex((r) => r.id === activeResultId);

  // Fetch job details for rating
  const { data: jobDetails, refetch: refetchJobDetails } = useQuery({
    queryKey: ["video-job-details", activeResultId],
    queryFn: () => (activeResultId ? getVideoJobDetails(activeResultId) : null),
    enabled: !!activeResultId && activeResult?.status === "done" && activeResult?.type === "video",
  });

  // Reset error state when active result changes
  useEffect(() => {
    setPreviewFailed(false);
    setIsPlaying(false);
    setShowRatingPanel(false);
  }, [activeResultId]);

  // Auto-play when result is ready
  useEffect(() => {
    if (activeResult?.status === "done" && activeResult.outputUrl) {
      if (activeResult.type === "video" && videoRef.current) {
        videoRef.current.play().catch(() => {});
      } else if (activeResult.type === "audio" && audioRef.current) {
        audioRef.current.play().catch(() => {});
      }
    }
  }, [activeResult?.status, activeResult?.outputUrl]);

  const togglePlayback = useCallback(() => {
    const element = activeResult?.type === "video" ? videoRef.current : audioRef.current;
    if (!element) return;

    if (isPlaying) {
      element.pause();
    } else {
      element.play().catch(() => {});
    }
  }, [activeResult?.type, isPlaying]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (results.length === 0) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        const newIndex = activeIndex <= 0 ? results.length - 1 : activeIndex - 1;
        onSelectResult(results[newIndex].id);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        const newIndex = activeIndex >= results.length - 1 ? 0 : activeIndex + 1;
        onSelectResult(results[newIndex].id);
      } else if (e.key === " " && activeResult?.status === "done") {
        e.preventDefault();
        togglePlayback();
      }
    },
    [results, activeIndex, activeResult, onSelectResult, togglePlayback]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const getEngineColor = (engine: string) => {
    const colors: Record<string, string> = {
      sora: "bg-primary/20 text-primary border-primary/30",
      runway: "bg-orange-500/20 text-orange-400 border-orange-500/30",
      luma: "bg-purple-500/20 text-purple-400 border-purple-500/30",
      elevenlabs: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      openai: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    };
    return colors[engine] || "bg-secondary text-secondary-foreground";
  };

  const getStatusColor = (status: LabResult["status"]) => {
    switch (status) {
      case "queued":
        return "text-warning";
      case "running":
        return "text-primary";
      case "done":
        return "text-success";
      case "failed":
        return "text-destructive";
    }
  };

  // Handler for library video selection
  const handleLibrarySelect = (jobId: string, url: string, provider: string) => {
    // Check if already in results
    const existing = results.find((r) => r.id === jobId);
    if (existing) {
      onSelectResult(jobId);
    } else if (onAddResult) {
      // Add to results then select
      const tempResult: LabResult = {
        id: jobId,
        jobId: jobId,
        type: "video",
        engine: provider as "sora" | "runway" | "luma",
        status: "done",
        progress: 100,
        outputUrl: url,
        startTime: Date.now(),
      };
      onAddResult(tempResult);
    }
  };

  return (
    <div className={cn("flex flex-col h-full overflow-hidden", className)}>
      {/* Main Preview Area */}
      <div className="flex-1 min-h-0 flex flex-col">
        {activeResult ? (
          <div className="flex-1 min-h-0 flex flex-col">
            {/* Minimal header - just status */}
            <div className="flex items-center gap-2 p-2 border-b bg-card/30">
              {activeResult.type === "video" ? (
                <Video className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <Mic className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <Badge variant="outline" className={cn("text-[10px] h-5", getEngineColor(activeResult.engine))}>
                {activeResult.engine.toUpperCase()}
              </Badge>
              <Badge variant="outline" className={cn("text-[10px] h-5", getStatusColor(activeResult.status))}>
                {activeResult.status === "running" && <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />}
                {activeResult.status}
                {activeResult.status === "running" && ` ${activeResult.progress}%`}
              </Badge>
              {jobDetails?.accuracy_rating && (
                <Badge variant="outline" className="text-[10px] h-5 gap-1 ml-auto">
                  <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
                  {jobDetails.accuracy_rating}
                </Badge>
              )}
            </div>

            {/* Preview Content */}
            <div className="flex-1 min-h-0 flex items-center justify-center bg-black/50 relative overflow-hidden">
              {activeResult.status === "done" && activeResult.outputUrl ? (
                previewFailed ? (
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <AlertCircle className="h-8 w-8" />
                    <p className="text-sm">Preview failed to load</p>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => window.open(activeResult.outputUrl, "_blank")}
                    >
                      Open in new tab
                    </Button>
                  </div>
                ) : activeResult.type === "video" ? (
                  <video
                    ref={videoRef}
                    src={activeResult.outputUrl}
                    controls
                    autoPlay
                    muted
                    playsInline
                    className="max-w-full max-h-full w-auto h-auto object-contain"
                    style={{ maxHeight: "100%" }}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onEnded={() => setIsPlaying(false)}
                    onError={() => setPreviewFailed(true)}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-4 p-8">
                    <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center">
                      <Mic className="h-10 w-10 text-primary" />
                    </div>
                    <audio
                      ref={audioRef}
                      src={activeResult.outputUrl}
                      controls
                      autoPlay
                      className="w-full max-w-md"
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onEnded={() => setIsPlaying(false)}
                      onError={() => setPreviewFailed(true)}
                    />
                  </div>
                )
              ) : activeResult.status === "failed" ? (
                <div className="flex flex-col items-center gap-2 text-destructive">
                  <AlertCircle className="h-12 w-12" />
                  <p className="text-sm">{activeResult.error || "Generation failed"}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {activeResult.status === "queued" ? "Queued..." : `Generating... ${activeResult.progress}%`}
                  </p>
                </div>
              )}

              {/* Inline rating overlay when video ends */}
              {showRatingPanel && activeResult.status === "done" && activeResult.type === "video" && (
                <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-4">
                  <div className="bg-card rounded-lg p-4 max-w-md w-full max-h-[80%] overflow-y-auto">
                    <VideoRatingPanel
                      jobId={activeResult.id}
                      provider={activeResult.engine}
                      originalPrompt={jobDetails?.original_prompt || undefined}
                      enrichedPrompt={jobDetails?.enriched_prompt || undefined}
                      styleHints={jobDetails?.style_hints || undefined}
                      currentRating={jobDetails?.accuracy_rating || 0}
                      currentNotes=""
                      humanMatchRating={jobDetails?.human_match_rating}
                      humanPreferenceRating={jobDetails?.human_preference_rating}
                      isSerendipity={jobDetails?.is_serendipity}
                      autoMatchScore={jobDetails?.auto_match_score}
                      autoQualityScore={jobDetails?.auto_quality_score}
                      autoMotionScore={jobDetails?.auto_motion_score}
                      autoCinematicScore={jobDetails?.auto_cinematic_score}
                      autoOverallScore={jobDetails?.auto_overall_score}
                      autoConfidence={jobDetails?.auto_confidence}
                      autoReasons={jobDetails?.auto_reasons}
                      autoArtifactFlags={jobDetails?.auto_artifact_flags}
                      onRated={() => {
                        refetchJobDetails();
                        setShowRatingPanel(false);
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Action bar - only for completed videos */}
            {activeResult.status === "done" && activeResult.type === "video" && activeResult.outputUrl && (
              <VideoActionBar
                result={activeResult}
                jobDetails={jobDetails}
                isPlaying={isPlaying}
                onTogglePlayback={togglePlayback}
                onExtendVideo={onExtendVideo}
                onOpenRating={() => setShowRatingPanel(true)}
              />
            )}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-black/30">
            <div className="text-center text-muted-foreground">
              <Video className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Generate something to preview</p>
            </div>
          </div>
        )}
      </div>

      {/* Unified Filmstrip */}
      <UnifiedFilmstrip
        sessionResults={results}
        activeResultId={activeResultId}
        onSelectResult={onSelectResult}
        onSelectLibraryVideo={handleLibrarySelect}
      />
    </div>
  );
}
