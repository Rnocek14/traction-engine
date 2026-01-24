import { Star, FastForward, ImageIcon, Copy, Download, ExternalLink, Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { LabResult } from "./LabGeneratePanel";
import type { VideoEngine } from "@/lib/lab-engines";

interface VideoActionBarProps {
  result: LabResult;
  jobDetails?: {
    accuracy_rating: number | null;
    original_prompt: string | null;
    enriched_prompt: string | null;
    style_hints: string | null;
  } | null;
  isPlaying: boolean;
  onTogglePlayback: () => void;
  onExtendVideo?: (generationIdOrImageUrl: string, engine: VideoEngine) => void;
  onOpenRating: () => void;
  className?: string;
}

export function VideoActionBar({
  result,
  jobDetails,
  isPlaying,
  onTogglePlayback,
  onExtendVideo,
  onOpenRating,
  className,
}: VideoActionBarProps) {
  const { toast } = useToast();

  const handleCopyUrl = async () => {
    if (!result.outputUrl) return;
    await navigator.clipboard.writeText(result.outputUrl);
    toast({ title: "Copied", description: "URL copied to clipboard" });
  };

  const handleDownload = () => {
    if (!result.outputUrl) return;
    const a = document.createElement("a");
    a.href = result.outputUrl;
    a.download = `video-${result.id.slice(0, 8)}.mp4`;
    a.click();
  };

  const promptPreview = result.prompt || jobDetails?.original_prompt || "";

  return (
    <div className={cn("border-t bg-card/80 backdrop-blur-sm", className)}>
      {/* Prompt preview */}
      {promptPreview && (
        <div className="px-3 py-2 border-b border-border/30">
          <p className="text-[11px] text-muted-foreground line-clamp-1">
            {promptPreview}
          </p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-1 px-3 py-2">
        {/* Rating button */}
        <Button
          size="sm"
          variant={jobDetails?.accuracy_rating ? "secondary" : "outline"}
          className={cn(
            "h-8 text-xs gap-1.5",
            !jobDetails?.accuracy_rating && "border-yellow-500/30 hover:border-yellow-500/50"
          )}
          onClick={onOpenRating}
        >
          <Star className={cn(
            "h-3.5 w-3.5",
            jobDetails?.accuracy_rating 
              ? "fill-yellow-400 text-yellow-400" 
              : "text-yellow-400"
          )} />
          {jobDetails?.accuracy_rating ? `${jobDetails.accuracy_rating}/5` : "Rate"}
        </Button>

        {/* Luma extend actions */}
        {result.engine === "luma" && onExtendVideo && (
          <>
            {result.providerGenerationId && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                onClick={() => onExtendVideo(result.providerGenerationId!, result.engine as VideoEngine)}
                title="Continue seamlessly from last frame"
              >
                <FastForward className="h-3.5 w-3.5" />
                Extend
              </Button>
            )}
            {result.thumbnailUrl && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                onClick={() => onExtendVideo(result.thumbnailUrl!, result.engine as VideoEngine)}
                title="Use thumbnail as visual reference"
              >
                <ImageIcon className="h-3.5 w-3.5" />
                Reference
              </Button>
            )}
          </>
        )}

        <div className="flex-1" />

        {/* Playback and utility buttons */}
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onTogglePlayback}>
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={handleCopyUrl}>
          <Copy className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={handleDownload}>
          <Download className="h-4 w-4" />
        </Button>
        <Button 
          size="sm" 
          variant="ghost" 
          className="h-8 w-8 p-0" 
          onClick={() => window.open(result.outputUrl, "_blank")}
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
