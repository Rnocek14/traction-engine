import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Video,
  Play,
  Loader2,
  Film,
  ImagePlus,
  Clock,
  CheckCircle2,
  XCircle,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type ScriptRun = Tables<"script_runs">;

interface VideoGeneratorProps {
  script: ScriptRun;
}

type VideoResolution = "480p" | "720p" | "1080p";
type VideoAspect = "16:9" | "9:16" | "1:1";
type VideoDuration = 5 | 10;

export function VideoGenerator({ script }: VideoGeneratorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [resolution, setResolution] = useState<VideoResolution>("720p");
  const [aspect, setAspect] = useState<VideoAspect>("9:16");
  const [duration, setDuration] = useState<VideoDuration>(5);

  const isPassed = script.status === "qa_passed";
  const content = script.script_content as Record<string, unknown> | null;
  const scenePrompts = (content?.scene_prompts as string[]) || [];
  const hook = (content?.hook as string) || "";

  // Queue video mutation
  const queueMutation = useMutation({
    mutationFn: async () => {
      // For now, we'll directly insert into video_jobs
      // Later this should call a queue-video edge function
      const { data, error } = await supabase
        .from("video_jobs")
        .insert({
          script_run_id: script.id,
          status: "queued",
          provider: "sora",
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "Video queued!",
        description: `Job ID: ${data.id.slice(0, 8)}...`,
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

  return (
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
            <XCircle className="h-8 w-8 text-warning mx-auto mb-2" />
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

            {/* Video Settings */}
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Resolution</label>
                <Select
                  value={resolution}
                  onValueChange={(v) => setResolution(v as VideoResolution)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="480p">480p (Fast)</SelectItem>
                    <SelectItem value="720p">720p</SelectItem>
                    <SelectItem value="1080p">1080p (HD)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Aspect</label>
                <Select
                  value={aspect}
                  onValueChange={(v) => setAspect(v as VideoAspect)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="9:16">9:16 (TikTok)</SelectItem>
                    <SelectItem value="16:9">16:9 (YouTube)</SelectItem>
                    <SelectItem value="1:1">1:1 (Square)</SelectItem>
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
                    <SelectItem value="5">5 seconds</SelectItem>
                    <SelectItem value="10">10 seconds</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Action Buttons */}
            <div className="space-y-2">
              <Button
                className="w-full gap-2"
                disabled={queueMutation.isPending}
                onClick={() => queueMutation.mutate()}
              >
                {queueMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Film className="h-4 w-4" />
                )}
                Generate Video (Sora)
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
              Video generation uses OpenAI Sora API. Typical render: 30-60 seconds.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
