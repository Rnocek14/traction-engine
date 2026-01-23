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
  Zap,
  Dices,
  Download,
  ExternalLink,
  AlertTriangle,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
  QUALITY_TIERS,
  type QualityTier,
} from "@/hooks/use-video-generation";
import { useReelAssembly } from "@/hooks/use-reel-assembly";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { QualityGate, analyzeQuality } from "./QualityGate";
import { autoAssignCameraDirections } from "@/lib/prompt-quality";
import type { Tables } from "@/integrations/supabase/types";
import type { Clip, StyleGuide } from "@/types/timeline-types";

type ScriptRun = Tables<"script_runs">;

const ACTIVE_STATUSES = ["queued", "running", "rendering"];

interface ActionDockProps {
  script: ScriptRun;
  clips?: Clip[];
  styleGuide?: StyleGuide | null;
  onNavigateToStyleGuide?: () => void;
  onSelectClip?: (clipId: string) => void;
  onAutoAssignCameras?: (assignments: Array<{ clipId: string; direction: string }>) => void;
  className?: string;
}

/**
 * Floating action dock for regeneration and video generation.
 * Compact design with expandable sections.
 */
export function ActionDock({ script, clips = [], styleGuide, onNavigateToStyleGuide, onSelectClip, onAutoAssignCameras, className }: ActionDockProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const regenerateMutation = useRegenerateFromStudio();
  const generateAllMutation = useGenerateAllClipsVideo();
  const generateChainedMutation = useGenerateChainedSequence();
  
  // Reel assembly hook
  const assembly = useReelAssembly(script.id);

  const [activePreset, setActivePreset] = useState<RegenPreset | null>(null);
  const [isRegenOpen, setIsRegenOpen] = useState(false);
  const [isVideoOpen, setIsVideoOpen] = useState(true);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [qualityTier, setQualityTier] = useState<QualityTier>("standard");
  const [isChainedMode, setIsChainedMode] = useState(true); // Default to chained for best quality
  const [seed, setSeed] = useState<number | undefined>(); // Optional seed for reproducibility
  const [isQualityOpen, setIsQualityOpen] = useState(true);

  const isHardBlock = hasHardBlocks(script);
  const isFailed = script.status === "qa_failed";
  const isPassed = script.status === "qa_passed";
  
  // Quality gate analysis
  const qualityResult = analyzeQuality(clips, styleGuide);

  // Get current tier config
  const tierConfig = QUALITY_TIERS.find((t) => t.tier === qualityTier) || QUALITY_TIERS[1];

  // Video jobs for this script
  const { data: jobs = [] } = useVideoJobs(script.id);

  const hasActiveJob = jobs.some((j) => ACTIVE_STATUSES.includes(j.status));
  const completedJobs = jobs.filter((j) => j.status === "succeeded" || j.status === "done").length;
  const videoClips = clips.filter((c) => c.type === "video" && c.prompt && !c.disabled);
  const activeJobsCount = jobs.filter((j) => ACTIVE_STATUSES.includes(j.status)).length;
  
  // Check if we can export (need at least some completed video jobs)
  const canExport = completedJobs >= 2 && !assembly.isAssembling;

  const handleGenerateAll = async () => {
    if (videoClips.length === 0) {
      toast({ title: "No clips to generate", description: "Add video clips with prompts first" });
      return;
    }

    // ========== PRE-FLIGHT: Validate timeline exists in DB ==========
    // This prevents the "total: 0" silent failure
    const { data: timeline, error: timelineError } = await supabase
      .from("studio_timelines")
      .select("id, timeline_json")
      .eq("script_run_id", script.id)
      .order("version", { ascending: false })
      .limit(1)
      .single();
    
    if (timelineError || !timeline) {
      console.error("[ActionDock] Timeline not found in DB:", timelineError);
      toast({ 
        title: "Timeline not saved", 
        description: "Please wait for auto-save or press Cmd+S to save before generating videos.",
        variant: "destructive",
      });
      return;
    }
    
    // Verify clip IDs exist in the saved timeline
    const savedClips = (timeline.timeline_json as { clips?: Array<{ id: string }> })?.clips || [];
    const savedClipIds = new Set(savedClips.map(c => c.id));
    const missingClips = videoClips.filter(c => !savedClipIds.has(c.id));
    
    if (missingClips.length > 0) {
      console.warn(`[ActionDock] ${missingClips.length} clips not yet saved to DB`);
      toast({ 
        title: "Timeline out of sync", 
        description: "Some clips haven't been saved. Please save (Cmd+S) and try again.",
        variant: "destructive",
      });
      return;
    }
    
    console.log(`[ActionDock] Pre-flight passed: ${videoClips.length} clips ready for generation`);

    const { size, seconds: duration, model } = tierConfig;

    if (isChainedMode) {
      // Use chained sequential generation with proper frame extraction
      await generateChainedMutation.mutateAsync({
        scriptId: script.id,
        clipIds: videoClips.map(c => c.id),
        size,
        duration,
        model,
        seed, // Pass seed for reproducibility
      });
    } else {
      // Use parallel generation (faster but less consistent)
      await generateAllMutation.mutateAsync({
        scriptId: script.id,
        clips: videoClips,
        size,
        duration,
        model,
        seed, // Pass seed for reproducibility
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

      {/* Quality Gate Section */}
      <Collapsible open={isQualityOpen} onOpenChange={setIsQualityOpen}>
        <CollapsibleTrigger className="flex items-center justify-between w-full p-3 hover:bg-secondary/30 transition-colors border-t border-border/30">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium">Quality Check</span>
            <Badge 
              variant="outline" 
              className={cn(
                "text-[10px] h-5 font-mono",
                qualityResult.overallScore >= 80 
                  ? "border-success text-success" 
                  : qualityResult.overallScore >= 50
                    ? "border-warning text-warning"
                    : "border-destructive text-destructive"
              )}
            >
              {qualityResult.overallScore}%
            </Badge>
          </div>
          {isQualityOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </CollapsibleTrigger>

        <CollapsibleContent className="px-3 pb-3 space-y-2">
          <QualityGate
            clips={clips}
            styleGuide={styleGuide}
            onNavigateToStyleGuide={onNavigateToStyleGuide}
            onSelectClip={onSelectClip}
          />
          
          {/* Auto-assign cameras button */}
          {clips.filter(c => !c.camera_direction).length > 0 && onAutoAssignCameras && (
            <Button
              variant="outline"
              size="sm"
              className="w-full h-8 gap-2 text-xs mt-2"
              onClick={() => {
                const assignments = autoAssignCameraDirections(clips);
                if (assignments.length > 0) {
                  onAutoAssignCameras(assignments.map(a => ({
                    clipId: a.clipId,
                    direction: a.suggestedDirection
                  })));
                  toast({
                    title: "Camera directions assigned",
                    description: `Set ${assignments.length} camera direction${assignments.length > 1 ? "s" : ""} based on prompt analysis`
                  });
                }
              }}
            >
              <Video className="h-3.5 w-3.5" />
              Auto-assign Cameras ({clips.filter(c => !c.camera_direction).length} missing)
            </Button>
          )}
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
              {/* Quality Tier Selector */}
              <div className="space-y-1.5">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Quality Tier
                </Label>
                <div className="grid grid-cols-3 gap-1">
                  {QUALITY_TIERS.map((tier) => (
                    <button
                      key={tier.tier}
                      onClick={() => setQualityTier(tier.tier)}
                      className={cn(
                        "flex flex-col items-center p-2 rounded border transition-all",
                        qualityTier === tier.tier
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/30 hover:border-border/50 text-muted-foreground"
                      )}
                    >
                      {tier.tier === "pro" && <Zap className="h-3 w-3 mb-0.5" />}
                      <span className="text-[10px] font-medium">{tier.label}</span>
                      <span className="text-[8px] opacity-70">{tier.description}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[9px] text-muted-foreground text-center">
                  {tierConfig.size} • {tierConfig.seconds}s • {tierConfig.model}
                </p>
              </div>

              {/* Chained mode toggle */}
              <div className="flex items-center justify-between py-1 px-1 rounded bg-secondary/20">
                <div className="flex items-center gap-1.5">
                  <Link2 className={cn("h-3 w-3", isChainedMode ? "text-primary" : "text-muted-foreground")} />
                  <Label htmlFor="chained-mode" className="text-[10px] text-muted-foreground cursor-pointer">
                    Frame chaining (recommended)
                  </Label>
                </div>
                <Switch
                  id="chained-mode"
                  checked={isChainedMode}
                  onCheckedChange={setIsChainedMode}
                  className="scale-75"
                />
              </div>
              
              {isChainedMode && (
                <p className="text-[9px] text-primary/80 text-center">
                  ✓ Each clip uses the last frame of the previous clip for seamless continuity
                </p>
              )}

              {/* Seed input for reproducibility */}
              <div className="flex items-center gap-2 px-1">
                <Label className="text-[10px] text-muted-foreground whitespace-nowrap">
                  Seed
                </Label>
                <Input
                  type="number"
                  value={seed || ""}
                  onChange={(e) => setSeed(e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="Random"
                  className="h-7 text-xs flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 p-0"
                  onClick={() => setSeed(Math.floor(Math.random() * 999999))}
                  title="Generate random seed"
                >
                  <Dices className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
              {seed && (
                <p className="text-[9px] text-muted-foreground/70 text-center">
                  Seed: {seed} (for reproducible results)
                </p>
              )}

              {/* Generate All Button - Enforced by Quality Gate */}
              {!qualityResult.canGenerate ? (
                <div className="space-y-2">
                  <Button
                    className="w-full h-9 gap-2"
                    disabled
                    variant="outline"
                  >
                    <AlertTriangle className="h-4 w-4 text-warning" />
                    Fix Issues to Generate
                  </Button>
                  <p className="text-[10px] text-warning text-center">
                    Quality gate is blocking generation. Fix the issues above first.
                  </p>
                </div>
              ) : (
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
              )}

              {/* Info text */}
              <p className="text-[10px] text-muted-foreground text-center">
                {videoClips.length === 0 
                  ? "No video clips with prompts" 
                  : isChainedMode
                    ? `Sequential • ~${Math.ceil(videoClips.length * 2)} min total`
                    : `Parallel • faster but less consistent`
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

      {/* Export Section - Coming Soon */}
      <Collapsible open={isExportOpen} onOpenChange={setIsExportOpen}>
        <CollapsibleTrigger className="flex items-center justify-between w-full p-3 hover:bg-secondary/30 transition-colors border-t border-border/30">
          <div className="flex items-center gap-2">
            <Download className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Export Reel</span>
            <Badge variant="outline" className="text-[10px] h-5 gap-1 text-muted-foreground border-muted-foreground/30">
              Coming Soon
            </Badge>
          </div>
          {isExportOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </CollapsibleTrigger>

        <CollapsibleContent className="px-3 pb-3 space-y-2">
          <div className="text-center py-3 space-y-2">
            <p className="text-[11px] text-muted-foreground">
              Final MP4 export is coming soon
            </p>
            <p className="text-[10px] text-muted-foreground/70">
              For now, preview your reel in the player above
            </p>
            <Button
              className="w-full h-9 gap-2"
              disabled
              variant="outline"
            >
              <Download className="h-4 w-4" />
              Export Final MP4
            </Button>
          </div>
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
