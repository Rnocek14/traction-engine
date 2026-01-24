import { useRef, useEffect, useState } from "react";
import { Copy, ExternalLink, Download, Play, Pause, Video, Mic, Loader2, AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import type { LabResult } from "./LabGeneratePanel";

interface LabPreviewPanelProps {
  className?: string;
  results: LabResult[];
  activeResultId: string | null;
  onSelectResult: (id: string) => void;
}

export function LabPreviewPanel({ 
  className, 
  results, 
  activeResultId, 
  onSelectResult 
}: LabPreviewPanelProps) {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);

  const activeResult = results.find(r => r.id === activeResultId);

  // Reset error state when active result changes
  useEffect(() => {
    setPreviewFailed(false);
    setIsPlaying(false);
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

  const handleCopyUrl = async (url?: string) => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    toast({ title: "Copied", description: "URL copied to clipboard" });
  };

  const handleDownload = (url?: string, type?: "video" | "audio") => {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `lab-${type}-${Date.now()}.${type === "video" ? "mp4" : "mp3"}`;
    a.click();
  };

  const togglePlayback = () => {
    const element = activeResult?.type === "video" ? videoRef.current : audioRef.current;
    if (!element) return;
    
    if (isPlaying) {
      element.pause();
    } else {
      element.play().catch(() => {});
    }
  };

  const getStatusColor = (status: LabResult["status"]) => {
    switch (status) {
      case "queued": return "text-warning";
      case "running": return "text-primary";
      case "done": return "text-success";
      case "failed": return "text-destructive";
    }
  };

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

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Main Preview Area */}
      <div className="flex-1 flex flex-col">
        {activeResult ? (
          <div className="flex-1 flex flex-col">
            {/* Preview Header */}
            <div className="flex items-center justify-between p-3 border-b bg-card/50">
              <div className="flex items-center gap-2">
                {activeResult.type === "video" ? (
                  <Video className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Mic className="h-4 w-4 text-muted-foreground" />
                )}
                <Badge variant="outline" className={cn("text-xs", getEngineColor(activeResult.engine))}>
                  {activeResult.engine.toUpperCase()}
                </Badge>
                <Badge variant="outline" className={cn("text-xs", getStatusColor(activeResult.status))}>
                  {activeResult.status === "running" && (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  )}
                  {activeResult.status}
                  {activeResult.status === "running" && ` ${activeResult.progress}%`}
                </Badge>
              </div>
              
              {activeResult.status === "done" && activeResult.outputUrl && (
                <div className="flex gap-1">
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-7"
                    onClick={togglePlayback}
                  >
                    {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-7"
                    onClick={() => handleCopyUrl(activeResult.outputUrl)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-7"
                    onClick={() => handleDownload(activeResult.outputUrl, activeResult.type)}
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-7"
                    onClick={() => window.open(activeResult.outputUrl, "_blank")}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>

            {/* Preview Content */}
            <div className="flex-1 flex items-center justify-center bg-black/50 relative">
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
                      <ExternalLink className="h-4 w-4 mr-2" />
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
                    className="max-w-full max-h-full object-contain"
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onEnded={() => setIsPlaying(false)}
                    onError={() => setPreviewFailed(true)}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-4 p-8">
                    <div className="w-32 h-32 rounded-full bg-primary/20 flex items-center justify-center">
                      <Mic className="h-12 w-12 text-primary" />
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
            </div>
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

      {/* Results Strip */}
      {results.length > 0 && (
        <div className="border-t bg-card/50">
          <div className="p-2">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {results.map((result) => (
                <button
                  key={result.id}
                  onClick={() => onSelectResult(result.id)}
                  className={cn(
                    "flex-shrink-0 w-20 rounded-lg overflow-hidden border-2 transition-all",
                    activeResultId === result.id 
                      ? "border-primary ring-2 ring-primary/20" 
                      : "border-transparent hover:border-border"
                  )}
                >
                  <div className="aspect-video bg-black/50 relative flex items-center justify-center">
                    {result.status === "done" && result.outputUrl ? (
                      result.type === "video" ? (
                        <video
                          src={result.outputUrl}
                          className="w-full h-full object-cover"
                          muted
                        />
                      ) : (
                        <Mic className="h-5 w-5 text-primary" />
                      )
                    ) : result.status === "failed" ? (
                      <X className="h-5 w-5 text-destructive" />
                    ) : (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    
                    {/* Engine badge overlay */}
                    <div className="absolute bottom-0.5 left-0.5">
                      <span className={cn(
                        "text-[8px] px-1 rounded font-medium uppercase",
                        getEngineColor(result.engine)
                      )}>
                        {result.engine.slice(0, 4)}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
