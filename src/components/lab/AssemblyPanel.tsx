import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Film, Loader2, Play, Download, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { assemblePreview, AssemblyInput } from "@/lib/lab-engines";

interface AssemblyPanelProps {
  className?: string;
  audioUrl?: string;
  videoUrls?: string[];
}

type AssemblyMode = "voice_only" | "visual_voice" | "visual_only";

export function AssemblyPanel({ 
  className, 
  audioUrl: propAudioUrl, 
  videoUrls: propVideoUrls = [] 
}: AssemblyPanelProps) {
  const { toast } = useToast();

  // State for manual URL input (fallback if not provided via props)
  const [audioUrl, setAudioUrl] = useState(propAudioUrl || "");
  const [videoUrl1, setVideoUrl1] = useState(propVideoUrls[0] || "");
  const [videoUrl2, setVideoUrl2] = useState(propVideoUrls[1] || "");
  const [videoUrl3, setVideoUrl3] = useState(propVideoUrls[2] || "");

  const [mode, setMode] = useState<AssemblyMode>("visual_voice");
  const [transition, setTransition] = useState<"cut" | "crossfade">("cut");

  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [outputDuration, setOutputDuration] = useState<number | null>(null);
  const [renderTime, setRenderTime] = useState<number | null>(null);

  // Collect video URLs (filter empty)
  const getVideoUrls = () => [videoUrl1, videoUrl2, videoUrl3].filter(Boolean);

  const assemblyMutation = useMutation({
    mutationFn: async () => {
      const videoUrls = getVideoUrls();
      
      const input: AssemblyInput = {
        audioUrl: mode !== "visual_only" ? audioUrl : undefined,
        videoUrls: mode !== "voice_only" ? videoUrls : [],
        mode,
        transition,
      };

      return assemblePreview(input);
    },
    onSuccess: (data) => {
      if (data.error) {
        toast({
          title: "Assembly failed",
          description: data.error,
          variant: "destructive",
        });
        return;
      }

      setOutputUrl(data.outputUrl);
      setOutputDuration(data.durationSeconds);
      setRenderTime(data.renderTimeMs);

      toast({
        title: "Assembly complete",
        description: `${data.durationSeconds.toFixed(1)}s video rendered in ${(data.renderTimeMs / 1000).toFixed(1)}s`,
      });
    },
    onError: (error) => {
      toast({
        title: "Assembly failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const canAssemble = () => {
    switch (mode) {
      case "voice_only":
        return !!audioUrl;
      case "visual_only":
        return getVideoUrls().length > 0;
      case "visual_voice":
        return !!audioUrl && getVideoUrls().length > 0;
    }
  };

  const handleDownload = () => {
    if (!outputUrl) return;
    const a = document.createElement("a");
    a.href = outputUrl;
    a.download = `lab-assembly-${Date.now()}.mp4`;
    a.click();
  };

  return (
    <div className={cn("flex flex-col gap-4 p-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Film className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Assembly Testing
          </span>
        </div>
        {outputUrl && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleDownload}>
            <Download className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Mode Selector */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Mode</Label>
        <RadioGroup
          value={mode}
          onValueChange={(v) => setMode(v as AssemblyMode)}
          className="flex gap-3"
        >
          <div className="flex items-center space-x-1.5">
            <RadioGroupItem value="visual_voice" id="visual_voice" />
            <Label htmlFor="visual_voice" className="text-xs cursor-pointer">
              Visual + Voice
            </Label>
          </div>
          <div className="flex items-center space-x-1.5">
            <RadioGroupItem value="voice_only" id="voice_only" />
            <Label htmlFor="voice_only" className="text-xs cursor-pointer">
              Voice Only
            </Label>
          </div>
          <div className="flex items-center space-x-1.5">
            <RadioGroupItem value="visual_only" id="visual_only" />
            <Label htmlFor="visual_only" className="text-xs cursor-pointer">
              Visual Only
            </Label>
          </div>
        </RadioGroup>
      </div>

      {/* Audio URL (voice modes) */}
      {mode !== "visual_only" && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Voice Audio URL</Label>
          <Input
            value={audioUrl}
            onChange={(e) => setAudioUrl(e.target.value)}
            placeholder="https://... (from Voice Panel)"
            className="text-xs h-8 bg-secondary/30"
          />
          {audioUrl && (
            <audio src={audioUrl} controls className="w-full h-8" />
          )}
        </div>
      )}

      {/* Video URLs (visual modes) */}
      {mode !== "voice_only" && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Video Clip URLs</Label>
          <div className="space-y-1.5">
            <Input
              value={videoUrl1}
              onChange={(e) => setVideoUrl1(e.target.value)}
              placeholder="Clip 1 URL (from Visual Panel)"
              className="text-xs h-8 bg-secondary/30"
            />
            <Input
              value={videoUrl2}
              onChange={(e) => setVideoUrl2(e.target.value)}
              placeholder="Clip 2 URL (optional)"
              className="text-xs h-8 bg-secondary/30"
            />
            <Input
              value={videoUrl3}
              onChange={(e) => setVideoUrl3(e.target.value)}
              placeholder="Clip 3 URL (optional)"
              className="text-xs h-8 bg-secondary/30"
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            {getVideoUrls().length} clip(s) ready
          </p>
        </div>
      )}

      {/* Transition (multi-clip only) */}
      {mode !== "voice_only" && getVideoUrls().length > 1 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Transition</Label>
          <Select value={transition} onValueChange={(v) => setTransition(v as typeof transition)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cut">Cut (instant)</SelectItem>
              <SelectItem value="crossfade">Crossfade (0.5s)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Assemble Button */}
      <Button
        onClick={() => assemblyMutation.mutate()}
        disabled={assemblyMutation.isPending || !canAssemble()}
        className="w-full"
      >
        {assemblyMutation.isPending ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Rendering...
          </>
        ) : (
          <>
            <Film className="h-4 w-4 mr-2" />
            Render Preview
          </>
        )}
      </Button>

      {/* Output Preview */}
      {outputUrl && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 p-2 rounded bg-success/10 border border-success/30">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-success font-medium">Render complete</p>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">
                  {outputDuration?.toFixed(1)}s video
                </span>
                {renderTime && (
                  <Badge variant="outline" className="h-4 text-[9px] px-1">
                    {(renderTime / 1000).toFixed(1)}s render
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-lg overflow-hidden border bg-black/50">
            <video
              src={outputUrl}
              controls
              className="w-full aspect-video"
            />
          </div>
        </div>
      )}

      {/* Error state */}
      {assemblyMutation.isError && (
        <div className="flex items-center gap-2 p-2 rounded bg-destructive/10 border border-destructive/30">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <p className="text-xs text-destructive">
            {assemblyMutation.error?.message || "Assembly failed"}
          </p>
        </div>
      )}
    </div>
  );
}
