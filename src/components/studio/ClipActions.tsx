import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Wand2,
  FastForward,
  Settings2,
  Loader2,
  Film,
  Sparkles,
  ChevronDown,
  Video,
  CheckCircle2,
  XCircle,
  Clock,
  Play,
  Scissors,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  useGenerateClipVideo,
  useClipVideoJob,
  SIZE_OPTIONS,
  DURATION_OPTIONS,
  type VideoSize,
  type VideoDuration,
} from "@/hooks/use-video-generation";
import { 
  getProviderDuration, 
  isClipDurationTooShort,
  isClipDurationTooLong,
  PROVIDER_CAPABILITIES,
  type VideoProvider,
} from "@/types/video-provider-types";
import { autoSplitClip, getSplitInfo } from "@/lib/clip-utils";
import type { Clip } from "@/types/timeline-types";

interface ClipActionsProps {
  clip: Clip | null;
  scriptId: string;
  /** Currently selected provider for generation */
  provider?: VideoProvider;
  onClipUpdated?: () => void;
  /** Callback to replace clip with auto-split segments */
  onAutoSplit?: (clipId: string, segments: Clip[]) => void;
  className?: string;
}

const STYLE_PRESETS = [
  { value: "cinematic", label: "Cinematic", desc: "Wide shots, dramatic lighting" },
  { value: "handheld", label: "Handheld", desc: "Organic, documentary feel" },
  { value: "macro", label: "Macro", desc: "Close-up detail shots" },
  { value: "broll", label: "B-Roll", desc: "Atmospheric cutaway footage" },
  { value: "montage", label: "Montage", desc: "Quick cuts, high energy" },
];

/**
 * Actions panel for selected clip - generate video, regenerate, extend
 */
export function ClipActions({ 
  clip, 
  scriptId, 
  provider = "sora",
  onClipUpdated, 
  onAutoSplit,
  className 
}: ClipActionsProps) {
  const { toast } = useToast();
  const [isVideoOpen, setIsVideoOpen] = useState(false);
  const [size, setSize] = useState<VideoSize>("720x1280");
  const [useTimelineDuration, setUseTimelineDuration] = useState(true);
  const [manualDuration, setManualDuration] = useState<VideoDuration>(4);
  const [promptOverride, setPromptOverride] = useState("");

  const generateVideo = useGenerateClipVideo();
  const { data: clipJob, isLoading: jobLoading } = useClipVideoJob(scriptId, clip?.id);

  // Calculate timeline and provider durations
  const timelineDuration = clip ? clip.end - clip.start : 0;
  const { providerSeconds } = clip 
    ? getProviderDuration(provider, useTimelineDuration ? timelineDuration : manualDuration)
    : { providerSeconds: 4 };
  const willTrim = providerSeconds > timelineDuration && useTimelineDuration;
  const isTooShort = clip ? isClipDurationTooShort(timelineDuration) : false;
  
  // Check if clip is too long for the provider
  const isTooLong = clip ? isClipDurationTooLong(provider, timelineDuration) : false;
  const maxDuration = PROVIDER_CAPABILITIES[provider].maxDuration;
  const splitInfo = clip ? getSplitInfo(clip, provider) : null;
  
  const handleAutoSplit = () => {
    if (!clip || !onAutoSplit) return;
    const segments = autoSplitClip(clip, provider);
    if (segments.length > 1) {
      onAutoSplit(clip.id, segments);
    }
  };

  const handleGenerateVideo = async () => {
    if (!clip) return;

    // Block generation for clips that are too short
    if (timelineDuration < 3) {
      toast({
        title: "Clip too short",
        description: "Minimum 3 seconds required for video generation. Extend or merge this clip.",
        variant: "destructive",
      });
      return;
    }

    await generateVideo.mutateAsync({
      scriptId,
      clip,
      size,
      duration: useTimelineDuration ? undefined : manualDuration,
      promptOverride: promptOverride || undefined,
      provider,
    });

    setIsVideoOpen(false);
    setPromptOverride("");
    onClipUpdated?.();
  };

  const getJobStatusBadge = () => {
    if (!clipJob) return null;

    switch (clipJob.status) {
      case "succeeded":
      case "done":
        return (
          <Badge variant="outline" className="gap-1 text-success border-success/30">
            <CheckCircle2 className="h-3 w-3" />
            Ready
          </Badge>
        );
      case "queued":
        return (
          <Badge variant="outline" className="gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" />
            Queued
          </Badge>
        );
      case "running":
      case "rendering":
        return (
          <Badge variant="outline" className="gap-1 text-primary">
            <Loader2 className="h-3 w-3 animate-spin" />
            Rendering
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="outline" className="gap-1 text-destructive border-destructive/30">
            <XCircle className="h-3 w-3" />
            Failed
          </Badge>
        );
      default:
        return null;
    }
  };

  if (!clip) {
    return (
      <div className={cn("p-4 rounded-lg border border-dashed border-border/40 bg-secondary/5", className)}>
        <div className="text-center space-y-2">
          <Film className="h-8 w-8 mx-auto text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground/60">No clip selected</p>
          <p className="text-xs text-muted-foreground/40">Click a clip in the timeline to edit</p>
        </div>
      </div>
    );
  }

  const isGenerating = generateVideo.isPending || 
    (clipJob && ["queued", "running", "rendering"].includes(clipJob.status));
  const hasVideo = clipJob && (clipJob.status === "succeeded" || clipJob.status === "done");

  return (
    <div className={cn("space-y-3", className)}>
      {/* Video Generation - Primary Action */}
      <div className="p-3 bg-primary/5 rounded-lg border border-primary/20 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Video className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Generate Video</span>
          </div>
          {getJobStatusBadge()}
        </div>

        {/* Too long warning + Auto-split button */}
        {isTooLong && (
          <div className="p-2 bg-destructive/10 border border-destructive/30 rounded space-y-2">
            <div className="flex items-center gap-2 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>
                {timelineDuration.toFixed(1)}s exceeds max {maxDuration}s for {provider === "sora" ? "Sora" : "Runway"}
              </span>
            </div>
            {onAutoSplit && splitInfo && (
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 text-xs"
                onClick={handleAutoSplit}
              >
                <Scissors className="h-3.5 w-3.5" />
                Auto-split into {splitInfo.segmentCount} clips
              </Button>
            )}
          </div>
        )}

        <Dialog open={isVideoOpen} onOpenChange={setIsVideoOpen}>
          <DialogTrigger asChild>
            <Button 
              className="w-full gap-2" 
              size="sm"
              disabled={isGenerating || isTooLong}
              variant={hasVideo ? "outline" : "default"}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {clipJob?.status === "queued" ? "Queued..." : "Rendering..."}
                </>
              ) : isTooLong ? (
                <>
                  <AlertTriangle className="h-4 w-4" />
                  Split First
                </>
              ) : hasVideo ? (
                <>
                  <Sparkles className="h-4 w-4" />
                  Regenerate Video
                </>
              ) : (
                <>
                  <Video className="h-4 w-4" />
                  Generate with Sora
                </>
              )}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Generate Video for Clip</DialogTitle>
              <DialogDescription>
                Use Sora 2 to generate video from this scene prompt
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Current Prompt Display */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Scene Prompt</Label>
                <p className="text-sm p-2 bg-secondary/20 rounded border border-border/30">
                  {clip.prompt || "No prompt set"}
                </p>
              </div>

              {/* Optional Override */}
              <div className="space-y-2">
                <Label>Prompt Override (optional)</Label>
                <Textarea
                  value={promptOverride}
                  onChange={(e) => setPromptOverride(e.target.value)}
                  placeholder="Leave empty to use the scene prompt above..."
                  rows={3}
                />
              </div>

              {/* Settings */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Aspect Ratio</Label>
                  <Select value={size} onValueChange={(v) => setSize(v as VideoSize)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SIZE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Duration</Label>
                  <Select
                    value={useTimelineDuration ? "timeline" : String(manualDuration)}
                    onValueChange={(v) => {
                      if (v === "timeline") {
                        setUseTimelineDuration(true);
                      } else {
                        setUseTimelineDuration(false);
                        setManualDuration(Number(v) as VideoDuration);
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="timeline">
                        Timeline ({timelineDuration.toFixed(1)}s)
                      </SelectItem>
                      {DURATION_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={String(opt.value)}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Duration info */}
              <div className="p-2 bg-secondary/30 rounded text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Timeline duration</span>
                  <span className="font-mono">{timelineDuration.toFixed(1)}s</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Will generate</span>
                  <span className="font-mono">{providerSeconds}s</span>
                </div>
                {willTrim && (
                  <div className="flex items-center gap-1 text-primary">
                    <Scissors className="h-3 w-3" />
                    <span>Will trim to {timelineDuration.toFixed(1)}s on export</span>
                  </div>
                )}
                {isTooShort && (
                  <div className="flex items-center gap-1 text-warning">
                    <AlertTriangle className="h-3 w-3" />
                    <span>Very short - may reduce quality</span>
                  </div>
                )}
              </div>

              {/* Cost estimate */}
              <div className="text-xs text-muted-foreground text-center">
                Estimated: ~{providerSeconds === 4 ? "0.10" : providerSeconds === 8 ? "0.20" : "0.30"} credits
                {size.startsWith("1024") || size.startsWith("1792") ? " (Pro model)" : ""}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setIsVideoOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleGenerateVideo}
                disabled={generateVideo.isPending || !clip.prompt}
              >
                {generateVideo.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Video className="h-4 w-4 mr-2" />
                )}
                Generate
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Show video preview if available */}
        {hasVideo && clipJob.output_url && (
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            onClick={() => window.open(clipJob.output_url!, "_blank")}
          >
            <Play className="h-4 w-4" />
            Preview Video
          </Button>
        )}

        {/* Show error if failed */}
        {clipJob?.status === "failed" && clipJob.error && (
          <p className="text-xs text-destructive bg-destructive/10 p-2 rounded">
            {clipJob.error.slice(0, 100)}
          </p>
        )}
      </div>

      {/* Clip info */}
      <div className="p-3 bg-secondary/20 rounded-lg space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Duration</span>
          <span className="font-mono">{(clip.end - clip.start).toFixed(1)}s</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Type</span>
          <span className="capitalize">{clip.type}</span>
        </div>
        {clip.source?.video_job_id && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Video Job</span>
            <span className="font-mono text-xs">{clip.source.video_job_id.slice(0, 8)}</span>
          </div>
        )}
      </div>

      {/* Prompt preview */}
      {clip.prompt && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Prompt</Label>
          <p className="text-sm p-2 bg-secondary/10 rounded border border-border/30 line-clamp-3">
            {clip.prompt}
          </p>
        </div>
      )}
    </div>
  );
}
