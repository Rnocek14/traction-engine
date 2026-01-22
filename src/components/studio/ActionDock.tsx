import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  RefreshCw,
  Sparkles,
  FileText,
  Wrench,
  Loader2,
  Film,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  useRegenerateFromStudio,
  buildConstraintFromFailure,
  type RegenPreset,
} from "@/hooks/use-regenerate-studio";
import { hasHardBlocks } from "@/hooks/use-studio";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

type ScriptRun = Tables<"script_runs">;
type VideoJob = Tables<"video_jobs">;

// Sora 2 constraints
type VideoSize = "720x1280" | "1280x720" | "1024x1792" | "1792x1024";
type VideoDuration = 4 | 8 | 12;

const SIZE_OPTIONS: { value: VideoSize; label: string }[] = [
  { value: "720x1280", label: "9:16 (720p)" },
  { value: "1280x720", label: "16:9 (720p)" },
  { value: "1024x1792", label: "9:16 Pro" },
  { value: "1792x1024", label: "16:9 Pro" },
];

const DURATION_OPTIONS: { value: VideoDuration; label: string }[] = [
  { value: 4, label: "4s" },
  { value: 8, label: "8s" },
  { value: 12, label: "12s" },
];

interface ActionDockProps {
  script: ScriptRun;
  className?: string;
}

const ACTIVE_STATUSES = ["queued", "running", "rendering"];

/**
 * Floating action dock for regeneration and video generation.
 * Compact design with expandable sections.
 */
export function ActionDock({ script, className }: ActionDockProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const regenerateMutation = useRegenerateFromStudio();

  const [activePreset, setActivePreset] = useState<RegenPreset | null>(null);
  const [isRegenOpen, setIsRegenOpen] = useState(true);
  const [isVideoOpen, setIsVideoOpen] = useState(true);
  const [size, setSize] = useState<VideoSize>("720x1280");
  const [duration, setDuration] = useState<VideoDuration>(8);

  const isHardBlock = hasHardBlocks(script);
  const isFailed = script.status === "qa_failed";
  const isPassed = script.status === "qa_passed";

  // Check for active video jobs
  const { data: jobs = [] } = useQuery({
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

  const hasActiveJob = jobs.some((j) => ACTIVE_STATUSES.includes(j.status));

  // Queue video mutation
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
    onSuccess: () => {
      toast({ title: "Video queued!" });
      queryClient.invalidateQueries({ queryKey: ["video-jobs", script.id] });
    },
    onError: (error) => {
      toast({ title: "Failed to queue video", description: error.message, variant: "destructive" });
    },
  });

  const handleRegenerate = async (preset: RegenPreset) => {
    setActivePreset(preset);
    try {
      const constraint = preset === "fix_flags" ? buildConstraintFromFailure(script) : undefined;
      const result = await regenerateMutation.mutateAsync({
        scriptId: script.id,
        preset,
        constraint,
      });

      toast({ title: "Regeneration started" });
      if (result.script_run?.id) {
        navigate(`/studio/${result.script_run.id}`);
      }
    } catch (error) {
      toast({
        title: "Regeneration failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setActivePreset(null);
    }
  };

  const isAnyLoading = regenerateMutation.isPending;

  return (
    <div
      className={cn(
        "bg-[hsl(222_47%_6%)] rounded-lg border border-border/30",
        "flex flex-col",
        className
      )}
    >
      {/* Regenerate Section */}
      <Collapsible open={isRegenOpen} onOpenChange={setIsRegenOpen}>
        <CollapsibleTrigger className="flex items-center justify-between w-full p-3 hover:bg-secondary/30 transition-colors">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium">Regenerate</span>
            {isHardBlock && (
              <Badge variant="destructive" className="text-[10px] h-5">
                Required
              </Badge>
            )}
          </div>
          {isRegenOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </CollapsibleTrigger>

        <CollapsibleContent className="px-3 pb-3 space-y-1.5">
          <RegenButton
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            label="Keep Topic"
            isLoading={activePreset === "keep_topic"}
            disabled={isAnyLoading}
            onClick={() => handleRegenerate("keep_topic")}
          />
          <RegenButton
            icon={<Sparkles className="h-3.5 w-3.5" />}
            label="New Topic"
            isLoading={activePreset === "new_topic_same_pillar"}
            disabled={isAnyLoading}
            onClick={() => handleRegenerate("new_topic_same_pillar")}
          />
          {(isFailed || isHardBlock) && (
            <RegenButton
              icon={<Wrench className="h-3.5 w-3.5" />}
              label="Fix Flags"
              isLoading={activePreset === "fix_flags"}
              disabled={isAnyLoading}
              onClick={() => handleRegenerate("fix_flags")}
              variant="warning"
            />
          )}
          <RegenButton
            icon={<FileText className="h-3.5 w-3.5" />}
            label="Template Mode"
            isLoading={activePreset === "template_keep_topic"}
            disabled={isAnyLoading}
            onClick={() => handleRegenerate("template_keep_topic")}
            subtle
          />
        </CollapsibleContent>
      </Collapsible>

      {/* Video Section */}
      <Collapsible open={isVideoOpen} onOpenChange={setIsVideoOpen}>
        <CollapsibleTrigger className="flex items-center justify-between w-full p-3 hover:bg-secondary/30 transition-colors border-t border-border/30">
          <div className="flex items-center gap-2">
            <Film className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium">Generate Video</span>
            {hasActiveJob && (
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
            )}
          </div>
          {isVideoOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </CollapsibleTrigger>

        <CollapsibleContent className="px-3 pb-3 space-y-2">
          {!isPassed ? (
            <div className="text-center py-2">
              <p className="text-[11px] text-muted-foreground">
                Script must pass QA first
              </p>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <Select value={size} onValueChange={(v) => setSize(v as VideoSize)}>
                  <SelectTrigger className="h-8 text-xs flex-1">
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

                <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v) as VideoDuration)}>
                  <SelectTrigger className="h-8 text-xs w-20">
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

              <Button
                className="w-full h-9 gap-2"
                disabled={queueMutation.isPending || hasActiveJob}
                onClick={() => queueMutation.mutate()}
              >
                {queueMutation.isPending || hasActiveJob ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {hasActiveJob ? "Rendering..." : "Queueing..."}
                  </>
                ) : (
                  <>
                    <Film className="h-4 w-4" />
                    Generate (Sora 2)
                  </>
                )}
              </Button>

              {/* Job count */}
              {jobs.length > 0 && (
                <p className="text-[10px] text-muted-foreground text-center">
                  {jobs.filter((j) => j.status === "succeeded" || j.status === "done").length} completed • {jobs.length} total
                </p>
              )}
            </>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

interface RegenButtonProps {
  icon: React.ReactNode;
  label: string;
  isLoading: boolean;
  disabled: boolean;
  onClick: () => void;
  variant?: "default" | "warning";
  subtle?: boolean;
}

function RegenButton({ icon, label, isLoading, disabled, onClick, variant, subtle }: RegenButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      className={cn(
        "w-full justify-start gap-2 h-8",
        variant === "warning" && "border-warning/50 text-warning hover:bg-warning/10",
        subtle && "opacity-70"
      )}
      disabled={disabled}
      onClick={onClick}
    >
      {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      <span className="text-xs">{label}</span>
    </Button>
  );
}
