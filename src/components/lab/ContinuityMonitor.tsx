/**
 * ContinuityMonitor
 * 
 * Displays per-clip continuity scores, artifact flags, and story aggregate.
 * Highlights weakest clip and suggests regeneration actions.
 */

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  XCircle,
  Sparkles,
  ArrowRight,
  Loader2,
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import {
  calculateStoryScore,
  getApplicablePolicies,
  passesQualityGate,
  type StoryType,
  type ContinuityAnchors,
} from "@/lib/continuity-scoring";

type VideoJob = Tables<"video_jobs">;

interface ContinuityMonitorProps {
  clips: VideoJob[];
  storyType: StoryType;
  anchors?: ContinuityAnchors;
  onRegenerateClip?: (clipId: string, suggestion: { provider?: string; negativePrompt?: string }) => void;
  className?: string;
}

export function ContinuityMonitor({
  clips,
  storyType,
  anchors,
  onRegenerateClip,
  className,
}: ContinuityMonitorProps) {
  const storyScore = useMemo(() => 
    calculateStoryScore(clips, anchors || null),
    [clips, anchors]
  );

  const sortedClips = useMemo(() => 
    [...clips].sort((a, b) => (a.sequence_index || 0) - (b.sequence_index || 0)),
    [clips]
  );

  // Calculate generation progress
  const generationStats = useMemo(() => {
    const total = clips.length;
    const running = clips.filter(c => c.status === "running" || c.status === "queued").length;
    const done = clips.filter(c => c.status === "done" || c.status === "rendered").length;
    const failed = clips.filter(c => c.status === "failed").length;
    return { total, running, done, failed, isGenerating: running > 0 };
  }, [clips]);

  if (clips.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center text-muted-foreground text-sm">
          No clips to monitor
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Continuity Monitor
          </CardTitle>
          <ScoreBadge score={storyScore.score} />
        </div>
        
        {/* Generation Progress (when clips are generating) */}
        {generationStats.isGenerating ? (
          <div className="space-y-1 mt-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                Generating videos...
              </span>
              <span>{generationStats.done}/{generationStats.total} complete</span>
            </div>
            <Progress 
              value={(generationStats.done / generationStats.total) * 100} 
              className="h-2"
            />
            {generationStats.failed > 0 && (
              <p className="text-[10px] text-destructive">
                {generationStats.failed} failed - check clips for errors
              </p>
            )}
          </div>
        ) : (
          /* Quality Score (when done generating) */
          <div className="space-y-1 mt-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Story Quality</span>
              <span>{storyScore.score}/100</span>
            </div>
            <Progress 
              value={storyScore.score} 
              className="h-2"
            />
          </div>
        )}
        
        {storyScore.weakestClipId && storyScore.weakestScore < 70 && (
          <div className="flex items-center gap-2 mt-2 p-2 bg-amber-500/10 rounded text-xs">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-amber-700 dark:text-amber-300">
              Clip {sortedClips.findIndex(c => c.id === storyScore.weakestClipId) + 1} is weakest ({storyScore.weakestScore})
            </span>
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        <ScrollArea className="h-[280px]">
          <div className="space-y-2">
            {sortedClips.map((clip, index) => (
              <ClipRow
                key={clip.id}
                clip={clip}
                index={index}
                storyType={storyType}
                isWeakest={clip.id === storyScore.weakestClipId}
                clipScore={storyScore.clipScores.get(clip.id)}
                onRegenerate={onRegenerateClip}
              />
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function ScoreBadge({ score }: { score: number }) {
  if (score >= 80) {
    return (
      <Badge variant="default" className="bg-green-500/20 text-green-700 dark:text-green-300 gap-1">
        <CheckCircle className="h-3 w-3" />
        {score}
      </Badge>
    );
  }
  if (score >= 60) {
    return (
      <Badge variant="secondary" className="bg-amber-500/20 text-amber-700 dark:text-amber-300 gap-1">
        <AlertTriangle className="h-3 w-3" />
        {score}
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="gap-1">
      <XCircle className="h-3 w-3" />
      {score}
    </Badge>
  );
}

function ProviderBadge({ provider }: { provider: string }) {
  const config: Record<string, { label: string; className: string }> = {
    sora: { label: "Sora", className: "bg-violet-500/20 text-violet-700 dark:text-violet-300" },
    runway: { label: "Runway", className: "bg-sky-500/20 text-sky-700 dark:text-sky-300" },
    luma: { label: "Luma", className: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" },
  };
  const { label, className } = config[provider] || { label: provider, className: "bg-muted text-muted-foreground" };
  
  return (
    <Badge variant="outline" className={`text-[10px] h-4 px-1.5 ${className}`}>
      {label}
    </Badge>
  );
}

interface ClipRowProps {
  clip: VideoJob;
  index: number;
  storyType: StoryType;
  isWeakest: boolean;
  clipScore?: { score: number; issues: string[]; suggestions: { action: string; reason: string; constraints?: Record<string, unknown> }[] };
  onRegenerate?: (clipId: string, suggestion: { provider?: string; negativePrompt?: string }) => void;
}

function ClipRow({ clip, index, storyType, isWeakest, clipScore, onRegenerate }: ClipRowProps) {
  const score = clipScore?.score ?? clip.continuity_score ?? 100;
  const gate = passesQualityGate({ ...clip, continuity_score: score }, storyType);
  const policies = getApplicablePolicies(clip);

  // Get defects for display
  const defects = parseDefectsForDisplay(clip.auto_defects);

  // Status-based styling
  const isRunning = clip.status === "running" || clip.status === "queued";
  const isFailed = clip.status === "failed";
  const isDone = clip.status === "done" || clip.status === "rendered";

  return (
    <div 
      className={`
        p-2 rounded border text-xs
        ${isRunning ? "border-primary/50 bg-primary/5" : ""}
        ${isFailed ? "border-destructive/50 bg-destructive/5" : ""}
        ${isDone && isWeakest ? "border-amber-500/50 bg-amber-500/5" : ""}
        ${isDone && !isWeakest && !gate.isHardBlock ? "border-border" : ""}
        ${gate.isHardBlock && isDone ? "border-destructive/50 bg-destructive/5" : ""}
      `}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium text-muted-foreground">#{index + 1}</span>
          <ProviderBadge provider={clip.provider} />
          <span className="truncate max-w-[100px]">
            {clip.original_prompt?.slice(0, 25) || "Untitled"}...
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Status Badge */}
          {isRunning && (
            <Badge variant="secondary" className="text-[10px] h-5 gap-1">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              Generating
            </Badge>
          )}
          {isFailed && (
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="destructive" className="text-[10px] h-5 gap-1">
                  <XCircle className="h-2.5 w-2.5" />
                  Failed
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                {clip.error?.slice(0, 100) || "Unknown error"}
              </TooltipContent>
            </Tooltip>
          )}
          {isDone && <ScoreBadge score={score} />}
          {gate.isHardBlock && isDone && (
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="destructive" className="text-[10px] h-5">BLOCK</Badge>
              </TooltipTrigger>
              <TooltipContent>Below quality threshold</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Error message for failed clips */}
      {isFailed && clip.error && (
        <p className="text-[10px] text-destructive mt-1 truncate">
          {clip.error.slice(0, 80)}...
        </p>
      )}

      {/* Issues */}
      {clipScore?.issues && clipScore.issues.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {clipScore.issues.slice(0, 3).map((issue, i) => (
            <Badge key={i} variant="outline" className="text-[10px] text-muted-foreground">
              {issue}
            </Badge>
          ))}
          {clipScore.issues.length > 3 && (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              +{clipScore.issues.length - 3} more
            </Badge>
          )}
        </div>
      )}

      {/* Defect Tags */}
      {defects.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {defects.map((defect, i) => (
            <Badge key={i} variant="destructive" className="text-[10px]">
              {defect}
            </Badge>
          ))}
        </div>
      )}

      {/* Regen Suggestions */}
      {policies.length > 0 && onRegenerate && (
        <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/50">
          <span className="text-[10px] text-muted-foreground">Fix:</span>
          {policies.slice(0, 2).map((policy) => (
            <Button
              key={policy.id}
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px] gap-1"
              onClick={() => onRegenerate(clip.id, {
                provider: policy.constraints?.provider as string,
                negativePrompt: policy.constraints?.negativePrompt as string,
              })}
            >
              <RefreshCw className="h-2.5 w-2.5" />
              {policy.action === "switch_provider" && `→ ${policy.constraints?.provider}`}
              {policy.action === "add_constraints" && "Add constraints"}
              {policy.action === "retry_same" && "Retry"}
              {policy.action === "manual_review" && "Review"}
            </Button>
          ))}
          {policies.length > 2 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]">
                  <ArrowRight className="h-2.5 w-2.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {policies.slice(2).map(p => p.name).join(", ")}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
}

function parseDefectsForDisplay(defects: unknown): string[] {
  if (!defects) return [];
  if (Array.isArray(defects)) {
    return defects.map(d => {
      if (typeof d === "string") return d;
      if (typeof d === "object" && d !== null && "type" in d) return (d as { type: string }).type;
      return String(d);
    }).slice(0, 5);
  }
  return [];
}
