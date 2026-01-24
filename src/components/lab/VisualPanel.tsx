import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Video, Loader2, Play, RefreshCw, Beaker, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  VideoEngine,
  VIDEO_ENGINES,
  ENGINE_DURATIONS,
  getValidDuration,
  generateVideo,
  getVideoJobStatus,
} from "@/lib/lab-engines";
import { STYLE_PRESETS } from "@/data/style-presets";

interface VisualPanelProps {
  className?: string;
  onVideoGenerated?: (url: string, engine: VideoEngine) => void;
}

interface GeneratedVideo {
  engine: VideoEngine;
  jobId: string;
  status: "queued" | "running" | "done" | "failed";
  progress: number;
  outputUrl?: string;
  error?: string;
  startTime: number;
}

export function VisualPanel({ className, onVideoGenerated }: VisualPanelProps) {
  const { toast } = useToast();
  const [selectedEngine, setSelectedEngine] = useState<VideoEngine>("sora");
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(4);
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1">("9:16");
  const [stylePreset, setStylePreset] = useState("");
  const [generatedVideos, setGeneratedVideos] = useState<GeneratedVideo[]>([]);

  // Get valid durations for selected engine
  const validDurations = ENGINE_DURATIONS[selectedEngine];

  // Auto-adjust duration when engine changes
  useEffect(() => {
    const validDuration = getValidDuration(selectedEngine, duration);
    if (validDuration !== duration) {
      setDuration(validDuration);
    }
  }, [selectedEngine]);

  // Generate mutation
  const generateMutation = useMutation({
    mutationFn: async (engine: VideoEngine) => {
      // Get style preset and build enhanced prompt
      const presetData = STYLE_PRESETS.find(p => p.id === stylePreset);
      const styleNotes = presetData?.guide?.custom_notes 
        ? `${presetData.guide.custom_notes}. ` 
        : "";
      const fullPrompt = stylePreset 
        ? `${styleNotes}${prompt}`.trim()
        : prompt;

      return generateVideo(engine, {
        prompt: fullPrompt,
        duration: getValidDuration(engine, duration),
        aspectRatio,
        style: stylePreset,
      });
    },
    onSuccess: (data, engine) => {
      if (data.error) {
        toast({
          title: `${engine} generation failed`,
          description: data.error,
          variant: "destructive",
        });
        return;
      }

      setGeneratedVideos(prev => [
        ...prev,
        {
          engine,
          jobId: data.jobId,
          status: "queued",
          progress: 0,
          startTime: Date.now(),
        },
      ]);

      toast({
        title: `${engine} job queued`,
        description: `Job ID: ${data.jobId.slice(0, 8)}...`,
      });
    },
    onError: (error, engine) => {
      toast({
        title: `${engine} generation failed`,
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Poll for job status updates
  useQuery({
    queryKey: ["lab-video-jobs", generatedVideos.map(v => v.jobId)],
    queryFn: async () => {
      const activeJobs = generatedVideos.filter(
        v => v.status === "queued" || v.status === "running"
      );

      if (activeJobs.length === 0) return null;

      const updates = await Promise.all(
        activeJobs.map(async job => {
          const status = await getVideoJobStatus(job.jobId);
          return { jobId: job.jobId, ...status };
        })
      );

      setGeneratedVideos(prev =>
        prev.map(video => {
          const update = updates.find(u => u.jobId === video.jobId);
          if (!update) return video;

          // Notify on completion
          if (update.status === "done" && video.status !== "done" && update.outputUrl) {
            onVideoGenerated?.(update.outputUrl, video.engine);
          }

          return {
            ...video,
            status: update.status,
            progress: update.progress || video.progress,
            outputUrl: update.outputUrl,
            error: update.error,
          };
        })
      );

      return updates;
    },
    enabled: generatedVideos.some(v => v.status === "queued" || v.status === "running"),
    refetchInterval: 3000,
  });

  const handleGenerate = () => {
    if (!prompt.trim()) {
      toast({
        title: "Prompt required",
        description: "Enter a visual prompt to generate",
        variant: "destructive",
      });
      return;
    }
    generateMutation.mutate(selectedEngine);
  };

  const handleGenerateAB = () => {
    if (!prompt.trim()) {
      toast({
        title: "Prompt required",
        description: "Enter a visual prompt to generate",
        variant: "destructive",
      });
      return;
    }
    // Generate with all engines for A/B comparison
    VIDEO_ENGINES.forEach(engine => {
      generateMutation.mutate(engine.id);
    });
  };

  const getStatusBadge = (video: GeneratedVideo) => {
    switch (video.status) {
      case "queued":
        return <Badge variant="outline" className="text-warning">Queued</Badge>;
      case "running":
        return (
          <Badge variant="outline" className="text-primary">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            {video.progress}%
          </Badge>
        );
      case "done":
        return <Badge variant="outline" className="text-success">Done</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
    }
  };

  const getEngineBadge = (engine: VideoEngine) => {
    const colors: Record<VideoEngine, string> = {
      sora: "bg-primary/20 text-primary border-primary/30",
      runway: "bg-accent/20 text-accent-foreground border-accent/30",
      luma: "bg-secondary text-secondary-foreground border-secondary",
    };
    return (
      <Badge variant="outline" className={cn("text-xs", colors[engine])}>
        {engine.toUpperCase()}
      </Badge>
    );
  };

  return (
    <div className={cn("flex flex-col gap-4 p-4", className)}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <Video className="h-4 w-4 text-primary" />
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Visual Engine Testing
        </span>
      </div>

      {/* Engine Selector */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Engine</Label>
        <RadioGroup
          value={selectedEngine}
          onValueChange={(v) => setSelectedEngine(v as VideoEngine)}
          className="flex gap-2"
        >
          {VIDEO_ENGINES.map(engine => (
            <div key={engine.id} className="flex items-center space-x-2">
              <RadioGroupItem value={engine.id} id={engine.id} />
              <Label htmlFor={engine.id} className="text-xs cursor-pointer">
                {engine.name}
              </Label>
            </div>
          ))}
        </RadioGroup>
        <p className="text-[10px] text-muted-foreground">
          {VIDEO_ENGINES.find(e => e.id === selectedEngine)?.description}
        </p>
      </div>

      {/* Prompt */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Visual Prompt</Label>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the visual scene..."
          className="text-xs bg-secondary/30 border-border/30 min-h-[80px] resize-none"
        />
      </div>

      {/* Settings Row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Duration</Label>
          <Select value={duration.toString()} onValueChange={(v) => setDuration(Number(v))}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {validDurations.map(d => (
                <SelectItem key={d} value={d.toString()}>
                  {d}s
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Aspect</Label>
          <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v as typeof aspectRatio)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="9:16">9:16 (Portrait)</SelectItem>
              <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
              <SelectItem value="1:1">1:1 (Square)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Style</Label>
          <Select value={stylePreset || "none"} onValueChange={(v) => setStylePreset(v === "none" ? "" : v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {STYLE_PRESETS.map(preset => (
                <SelectItem key={preset.id} value={preset.id}>
                  {preset.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button
          onClick={handleGenerate}
          disabled={generateMutation.isPending || !prompt.trim()}
          className="flex-1"
        >
          {generateMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Play className="h-4 w-4 mr-2" />
          )}
          Generate ({selectedEngine})
        </Button>

        <Button
          variant="outline"
          onClick={handleGenerateAB}
          disabled={generateMutation.isPending || !prompt.trim()}
          title="Generate with all engines for A/B comparison"
        >
          <Beaker className="h-4 w-4" />
        </Button>
      </div>

      {/* Generated Videos Grid */}
      {generatedVideos.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Results</Label>
          <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto">
            {generatedVideos.map((video, idx) => (
              <div
                key={video.jobId || idx}
                className="rounded-lg border bg-secondary/20 overflow-hidden"
              >
                {/* Video preview */}
                <div className="aspect-video bg-black/50 relative">
                  {video.status === "done" && video.outputUrl ? (
                    <video
                      src={video.outputUrl}
                      controls
                      className="w-full h-full object-contain"
                    />
                  ) : video.status === "failed" ? (
                    <div className="flex flex-col items-center justify-center h-full text-destructive">
                      <AlertCircle className="h-6 w-6 mb-1" />
                      <span className="text-[10px]">{video.error || "Failed"}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground mt-1">
                        {video.progress}%
                      </span>
                    </div>
                  )}
                </div>

                {/* Metadata */}
                <div className="p-2 flex items-center justify-between">
                  {getEngineBadge(video.engine)}
                  <div className="flex items-center gap-2">
                    {getStatusBadge(video)}
                    {video.status === "done" && (
                      <span className="text-[10px] text-muted-foreground">
                        {((Date.now() - video.startTime) / 1000).toFixed(1)}s
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
