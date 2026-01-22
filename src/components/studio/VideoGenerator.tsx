import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Video,
  Loader2,
  Film,
  ImagePlus,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  AlertCircle,
  RefreshCw,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { SpritesheetScrubber } from "./SpritesheetScrubber";
import type { Tables } from "@/integrations/supabase/types";

type ScriptRun = Tables<"script_runs">;
type VideoJob = Tables<"video_jobs">;

interface VideoGeneratorProps {
  script: ScriptRun;
}

// Sora 2 API constraints
type VideoSize = "720x1280" | "1280x720" | "1024x1792" | "1792x1024";
type VideoDuration = 4 | 8 | 12;

const SIZE_OPTIONS: { value: VideoSize; label: string; aspect: string }[] = [
  { value: "720x1280", label: "720p Vertical", aspect: "9:16" },
  { value: "1280x720", label: "720p Horizontal", aspect: "16:9" },
  { value: "1024x1792", label: "1024p Vertical (Pro)", aspect: "9:16" },
  { value: "1792x1024", label: "1024p Horizontal (Pro)", aspect: "16:9" },
];

const DURATION_OPTIONS: { value: VideoDuration; label: string }[] = [
  { value: 4, label: "4 seconds" },
  { value: 8, label: "8 seconds" },
  { value: 12, label: "12 seconds" },
];

const ACTIVE_STATUSES = ["queued", "running", "rendering"];

export function VideoGenerator({ script }: VideoGeneratorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [size, setSize] = useState<VideoSize>("720x1280");
  const [duration, setDuration] = useState<VideoDuration>(8);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const isPassed = script.status === "qa_passed";
  const content = script.script_content as Record<string, unknown> | null;
  const scenePrompts = (content?.scene_prompts as string[]) || [];

  // Fetch existing video jobs for this script
  const { data: jobs = [], isLoading: jobsLoading } = useQuery({
    queryKey: ["video-jobs", script.id],
    queryFn: async (): Promise<VideoJob[]> => {
      const { data, error } = await supabase
        .from("video_jobs")
        .select("*")
        .eq("script_run_id", script.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });

  // Check if there's an active job (for polling + disable button)
  const hasActiveJob = jobs.some((j) => ACTIVE_STATUSES.includes(j.status));

  // Poll while there's an active job
  useEffect(() => {
    if (!hasActiveJob) return;

    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["video-jobs", script.id] });
      
      // Also trigger process-video to check status
      supabase.functions.invoke("process-video", {
        body: {},
      }).catch(console.error);
    }, 5000);

    return () => clearInterval(interval);
  }, [hasActiveJob, script.id, queryClient]);

  // Realtime subscription for instant updates
  useEffect(() => {
    const channel = supabase
      .channel(`video-jobs-${script.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "video_jobs",
          filter: `script_run_id=eq.${script.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["video-jobs", script.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [script.id, queryClient]);

  // Queue video mutation - calls edge function
  const queueMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("queue-video", {
        body: {
          script_run_id: script.id,
          settings: {
            size,
            seconds: duration,
            model: size.startsWith("1024") || size.startsWith("1792") ? "sora-2-pro" : "sora-2",
          },
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to queue video");
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "Video queued!",
        description: `Job ID: ${data.job.id.slice(0, 8)}...`,
      });
      queryClient.invalidateQueries({ queryKey: ["video-jobs", script.id] });
    },
    onError: (error) => {
      toast({
        title: "Failed to queue video",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getJobStatusIcon = (status: string) => {
    switch (status) {
      case "succeeded":
      case "done":
        return <CheckCircle2 className="h-4 w-4 text-success" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-destructive" />;
      case "running":
      case "rendering":
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getJobStatusBadge = (status: string) => {
    switch (status) {
      case "succeeded":
      case "done":
        return <Badge variant="outline" className="bg-success/20 text-success border-success/30">Done</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      case "running":
      case "rendering":
        return <Badge variant="outline" className="bg-primary/20 text-primary border-primary/30">Rendering</Badge>;
      default:
        return <Badge variant="secondary">Queued</Badge>;
    }
  };

  return (
    <>
      <Card className="glass-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Video className="h-4 w-4 text-primary" />
            Video Generation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isPassed ? (
            <div className="text-center py-4">
              <AlertCircle className="h-8 w-8 text-warning mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Script must pass QA before generating video
              </p>
              <Badge variant="outline" className="mt-2">
                Status: {script.status}
              </Badge>
            </div>
          ) : (
            <>
              {/* Scene Preview */}
              {scenePrompts.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Scene Prompts ({scenePrompts.length})
                  </label>
                  <div className="max-h-32 overflow-auto space-y-1 text-xs">
                    {scenePrompts.slice(0, 3).map((prompt, i) => (
                      <div key={i} className="p-2 rounded bg-secondary/30 truncate">
                        <span className="text-primary mr-1">Scene {i + 1}:</span>
                        {prompt}
                      </div>
                    ))}
                    {scenePrompts.length > 3 && (
                      <div className="text-muted-foreground text-center">
                        +{scenePrompts.length - 3} more scenes
                      </div>
                    )}
                  </div>
                </div>
              )}

              <Separator />

              {/* Video Settings - Sora 2 API compatible */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">Size</label>
                  <Select
                    value={size}
                    onValueChange={(v) => setSize(v as VideoSize)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SIZE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label} ({opt.aspect})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">Duration</label>
                  <Select
                    value={String(duration)}
                    onValueChange={(v) => setDuration(Number(v) as VideoDuration)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DURATION_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={String(opt.value)}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              {/* Action Buttons */}
              <div className="space-y-2">
                <Button
                  className="w-full gap-2"
                  disabled={queueMutation.isPending || hasActiveJob}
                  onClick={() => queueMutation.mutate()}
                >
                  {queueMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : hasActiveJob ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Rendering in progress...
                    </>
                  ) : (
                    <>
                      <Film className="h-4 w-4" />
                      Generate Video (Sora 2)
                    </>
                  )}
                </Button>

                <Button variant="outline" className="w-full gap-2" disabled>
                  <ImagePlus className="h-4 w-4" />
                  Use Starting Frame
                  <Badge variant="secondary" className="ml-auto text-[10px]">
                    Soon
                  </Badge>
                </Button>
              </div>

              {/* Info */}
              <p className="text-[10px] text-muted-foreground text-center">
                Sora 2 API • Render time varies based on queue and settings
              </p>
            </>
          )}

          {/* Video Jobs Status Tracker */}
          {jobs.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">
                    Video Jobs ({jobs.length})
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => queryClient.invalidateQueries({ queryKey: ["video-jobs", script.id] })}
                  >
                    <RefreshCw className={`h-3 w-3 ${jobsLoading ? "animate-spin" : ""}`} />
                  </Button>
                </div>
                <div className="space-y-2 max-h-48 overflow-auto">
                  {jobs.map((job) => {
                    const settings = (job.settings ?? {}) as Record<string, unknown>;
                    const jobSize = typeof settings.size === "string" ? settings.size : null;
                    const jobSeconds = typeof settings.seconds === "number" ? settings.seconds : null;
                    const progress = (job as unknown as { progress?: number }).progress ?? 0;
                    const thumbnailUrl = (job as unknown as { thumbnail_url?: string }).thumbnail_url;
                    const spritesheetUrl = (job as unknown as { spritesheet_url?: string }).spritesheet_url;

                    return (
                      <div
                        key={job.id}
                        className="p-2 rounded-lg bg-secondary/30 space-y-2"
                      >
                        <div className="flex items-start gap-2">
                          {/* Thumbnail with spritesheet scrubbing */}
                          {thumbnailUrl && spritesheetUrl ? (
                            <SpritesheetScrubber
                              thumbnailUrl={thumbnailUrl}
                              spritesheetUrl={spritesheetUrl}
                              onClick={() => job.output_url && setPreviewUrl(job.output_url)}
                              className="w-16 h-16 rounded flex-shrink-0"
                              cols={10}
                              rows={10}
                            />
                          ) : thumbnailUrl ? (
                            <img 
                              src={thumbnailUrl} 
                              alt="Video thumbnail" 
                              className="w-16 h-16 rounded object-cover flex-shrink-0 cursor-pointer hover:opacity-80"
                              onClick={() => job.output_url && setPreviewUrl(job.output_url)}
                            />
                          ) : (
                            <div className="w-16 h-16 rounded bg-secondary/50 flex items-center justify-center flex-shrink-0">
                              {getJobStatusIcon(job.status)}
                            </div>
                          )}
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {getJobStatusBadge(job.status)}
                              {jobSize && jobSeconds && (
                                <span className="text-[10px] text-muted-foreground">
                                  {jobSize} • {jobSeconds}s
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                            </p>
                            
                            {/* Progress bar for active jobs */}
                            {ACTIVE_STATUSES.includes(job.status) && progress > 0 && (
                              <Progress value={progress} className="h-1 mt-1" />
                            )}

                            {/* Error display */}
                            {job.error && (
                              <p className="text-[10px] text-destructive truncate mt-1">
                                {job.error}
                              </p>
                            )}
                          </div>
                          
                          {/* Preview/Open buttons */}
                          {job.output_url && (
                            <div className="flex gap-1 flex-shrink-0">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => setPreviewUrl(job.output_url)}
                              >
                                <Play className="h-3 w-3" />
                              </Button>
                              <a
                                href={job.output_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:text-primary/80 p-1"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Video Preview Modal */}
      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Video Preview</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <video
              src={previewUrl}
              controls
              autoPlay
              className="w-full rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}