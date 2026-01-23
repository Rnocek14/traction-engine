import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw,
  Sparkles,
  FileText,
  Wrench,
  Loader2,
  Film,
  ChevronUp,
  ChevronDown,
  Video,
  CheckCircle2,
  Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
import {
  useVideoJobs,
  useGenerateAllClipsVideo,
  useGenerateChainedSequence,
  SIZE_OPTIONS,
  DURATION_OPTIONS,
  type VideoSize,
  type VideoDuration,
} from "@/hooks/use-video-generation";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";
import type { Clip } from "@/types/timeline-types";

type ScriptRun = Tables<"script_runs">;

const ACTIVE_STATUSES = ["queued", "running", "rendering"];

interface ActionDockProps {
  script: ScriptRun;
  clips?: Clip[];
  className?: string;
}

/**
 * Floating action dock for regeneration and video generation.
 * Compact design with expandable sections.
 */
export function ActionDock({ script, clips = [], className }: ActionDockProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const regenerateMutation = useRegenerateFromStudio();
  const generateAllMutation = useGenerateAllClipsVideo();
  const generateChainedMutation = useGenerateChainedSequence();

  const [activePreset, setActivePreset] = useState<RegenPreset | null>(null);
  const [isRegenOpen, setIsRegenOpen] = useState(false); // Start collapsed
  const [isVideoOpen, setIsVideoOpen] = useState(true); // Video section open by default
  const [size, setSize] = useState<VideoSize>("720x1280");
  const [duration, setDuration] = useState<VideoDuration>(4);
  const [isChainedMode, setIsChainedMode] = useState(false);

  const isHardBlock = hasHardBlocks(script);
  const isFailed = script.status === "qa_failed";
  const isPassed = script.status === "qa_passed";

  // Video jobs for this script
  const { data: jobs = [] } = useVideoJobs(script.id);

  const hasActiveJob = jobs.some((j) => ACTIVE_STATUSES.includes(j.status));
  const completedJobs = jobs.filter((j) => j.status === "succeeded" || j.status === "done").length;
  const videoClips = clips.filter((c) => c.type === "video" && c.prompt && !c.disabled);
  const activeJobsCount = jobs.filter((j) => ACTIVE_STATUSES.includes(j.status)).length;

  const handleGenerateAll = async () => {
    if (videoClips.length === 0) {
      toast({ title: "No clips to generate", description: "Add video clips with prompts first" });
      return;
    }

    if (isChainedMode) {
      // Use chained sequential generation
      await generateChainedMutation.mutateAsync({
        scriptId: script.id,
        clipIds: videoClips.map(c => c.id),
        size,
        duration,
      });
    } else {
      // Use parallel generation (faster but less consistent)
      await generateAllMutation.mutateAsync({
        scriptId: script.id,
        clips: videoClips,
        size,
        duration,
      });
    }
  };

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
  const isGenerating = generateAllMutation.isPending || generateChainedMutation.isPending || hasActiveJob;
  const isChainedGenerating = generateChainedMutation.isPending;

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
            <span className="text-xs font-medium">Generate Videos</span>
            {hasActiveJob && (
              <Badge variant="outline" className="text-[10px] h-5 gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                {activeJobsCount}
              </Badge>
            )}
            {completedJobs > 0 && !hasActiveJob && (
              <Badge variant="outline" className="text-[10px] h-5 gap-1 text-success border-success/30">
                <CheckCircle2 className="h-3 w-3" />
                {completedJobs}
              </Badge>
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
              {/* Settings row */}
              <div className="flex gap-2">
                <Select value={size} onValueChange={(v) => setSize(v as VideoSize)}>
                  <SelectTrigger className="h-8 text-xs flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SIZE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.aspectRatio}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v) as VideoDuration)}>
                  <SelectTrigger className="h-8 text-xs w-16">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>
                        {opt.value}s
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Chained mode toggle */}
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-1.5">
                  <Link2 className="h-3 w-3 text-muted-foreground" />
                  <Label htmlFor="chained-mode" className="text-[10px] text-muted-foreground cursor-pointer">
                    Frame chaining
                  </Label>
                </div>
                <Switch
                  id="chained-mode"
                  checked={isChainedMode}
                  onCheckedChange={setIsChainedMode}
                  className="scale-75"
                />
              </div>

              {/* Generate All Button */}
              <Button
                className="w-full h-9 gap-2"
                disabled={isGenerating || videoClips.length === 0}
                onClick={handleGenerateAll}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {isChainedGenerating 
                      ? "Generating sequence..." 
                      : hasActiveJob 
                        ? `Rendering ${activeJobsCount}...` 
                        : "Queueing..."}
                  </>
                ) : (
                  <>
                    <Video className="h-4 w-4" />
                    {isChainedMode ? "Generate Chained" : "Generate All"} ({videoClips.length})
                  </>
                )}
              </Button>

              {/* Info text */}
              <p className="text-[10px] text-muted-foreground text-center">
                {videoClips.length === 0 
                  ? "No video clips with prompts" 
                  : isChainedMode
                    ? `Sequential • ~${Math.ceil(videoClips.length * 2)} min`
                    : `Parallel • ~${(duration * videoClips.length * 0.025).toFixed(2)} credits`
                }
              </p>

              {/* Job summary */}
              {jobs.length > 0 && (
                <div className="flex justify-center gap-3 text-[10px] text-muted-foreground">
                  <span>{completedJobs} done</span>
                  <span>•</span>
                  <span>{jobs.length} total</span>
                </div>
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
