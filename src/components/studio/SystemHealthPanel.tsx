import { useMemo } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Activity, Trash2, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Clip } from "@/types/timeline-types";
import type { Tables } from "@/integrations/supabase/types";
import { MIN_SCENE_DURATION, PROVIDER_CAPABILITIES } from "@/types/video-provider-types";

type VideoJob = Tables<"video_jobs">;

interface SystemHealthPanelProps {
  clips: Clip[];
  videoJobs: VideoJob[];
  provider?: "sora" | "runway";
  onFixShortClips?: () => void;
  className?: string;
}

interface HealthCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
  count?: number;
}

/**
 * System Health Panel - Pipeline diagnostics for Studio
 * Shows clip duration distribution, problem clips, and quick-fix actions
 */
export function SystemHealthPanel({
  clips,
  videoJobs,
  provider = "sora",
  onFixShortClips,
  className,
}: SystemHealthPanelProps) {
  const maxDuration = PROVIDER_CAPABILITIES[provider].maxDuration;

  // Analyze clips
  const analysis = useMemo(() => {
    const videoClips = clips.filter(c => c.type === "video");
    
    const buckets = {
      tooShort: 0,   // < 3s
      short: 0,      // 3-5s
      medium: 0,     // 5-8s
      long: 0,       // 8-12s
      tooLong: 0,    // > maxDuration
    };
    
    const problems: { id: string; issue: string; duration: number }[] = [];
    
    videoClips.forEach(clip => {
      const duration = clip.end - clip.start;
      
      if (duration < MIN_SCENE_DURATION) {
        buckets.tooShort++;
        problems.push({ id: clip.id, issue: "Too short", duration });
      } else if (duration < 5) {
        buckets.short++;
      } else if (duration < 8) {
        buckets.medium++;
      } else if (duration <= maxDuration) {
        buckets.long++;
      } else {
        buckets.tooLong++;
        problems.push({ id: clip.id, issue: "Needs split", duration });
      }
      
      if (!clip.prompt || clip.prompt.trim() === "") {
        problems.push({ id: clip.id, issue: "No prompt", duration });
      }
    });
    
    return { buckets, problems, totalClips: videoClips.length };
  }, [clips, maxDuration]);

  // Analyze jobs
  const jobAnalysis = useMemo(() => {
    const failed = videoJobs.filter(j => j.status === "failed").length;
    const pending = videoJobs.filter(j => ["queued", "running", "rendering"].includes(j.status)).length;
    const completed = videoJobs.filter(j => j.status === "succeeded" || j.status === "done").length;
    
    return { failed, pending, completed, total: videoJobs.length };
  }, [videoJobs]);

  // Build health checks
  const checks: HealthCheck[] = useMemo(() => [
    {
      name: "Short clips",
      status: analysis.buckets.tooShort === 0 ? "pass" : "fail",
      message: analysis.buckets.tooShort === 0 
        ? "No clips under 3s" 
        : `${analysis.buckets.tooShort} clips need extending`,
      count: analysis.buckets.tooShort,
    },
    {
      name: "Long clips",
      status: analysis.buckets.tooLong === 0 ? "pass" : "warn",
      message: analysis.buckets.tooLong === 0 
        ? "All clips within provider limits" 
        : `${analysis.buckets.tooLong} clips need auto-split`,
      count: analysis.buckets.tooLong,
    },
    {
      name: "Missing prompts",
      status: analysis.problems.filter(p => p.issue === "No prompt").length === 0 ? "pass" : "warn",
      message: analysis.problems.filter(p => p.issue === "No prompt").length === 0
        ? "All clips have prompts"
        : `${analysis.problems.filter(p => p.issue === "No prompt").length} clips need prompts`,
      count: analysis.problems.filter(p => p.issue === "No prompt").length,
    },
    {
      name: "Failed jobs",
      status: jobAnalysis.failed === 0 ? "pass" : "warn",
      message: jobAnalysis.failed === 0
        ? "No failed generation jobs"
        : `${jobAnalysis.failed} failed jobs in history`,
      count: jobAnalysis.failed,
    },
  ], [analysis, jobAnalysis]);

  const overallStatus = checks.some(c => c.status === "fail") 
    ? "fail" 
    : checks.some(c => c.status === "warn") 
      ? "warn" 
      : "pass";

  return (
    <div className={cn("rounded-lg border bg-card p-3 space-y-3", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">System Health</span>
        </div>
        <Badge 
          variant="outline" 
          className={cn(
            "gap-1",
            overallStatus === "pass" && "text-success border-success/30",
            overallStatus === "warn" && "text-warning border-warning/30",
            overallStatus === "fail" && "text-destructive border-destructive/30"
          )}
        >
          {overallStatus === "pass" && <CheckCircle2 className="h-3 w-3" />}
          {overallStatus === "warn" && <AlertTriangle className="h-3 w-3" />}
          {overallStatus === "fail" && <XCircle className="h-3 w-3" />}
          {overallStatus === "pass" ? "Healthy" : overallStatus === "warn" ? "Warnings" : "Issues"}
        </Badge>
      </div>

      {/* Duration Distribution */}
      <div className="space-y-1.5">
        <span className="text-xs text-muted-foreground">Clip Duration Distribution</span>
        <div className="flex gap-1 h-4">
          {analysis.buckets.tooShort > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div 
                  className="bg-destructive/60 rounded-sm min-w-[8px]"
                  style={{ flex: analysis.buckets.tooShort }}
                />
              </TooltipTrigger>
              <TooltipContent>
                {analysis.buckets.tooShort} clips under 3s (too short)
              </TooltipContent>
            </Tooltip>
          )}
          {analysis.buckets.short > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div 
                  className="bg-warning/60 rounded-sm min-w-[8px]"
                  style={{ flex: analysis.buckets.short }}
                />
              </TooltipTrigger>
              <TooltipContent>
                {analysis.buckets.short} clips 3-5s
              </TooltipContent>
            </Tooltip>
          )}
          {analysis.buckets.medium > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div 
                  className="bg-primary/60 rounded-sm min-w-[8px]"
                  style={{ flex: analysis.buckets.medium }}
                />
              </TooltipTrigger>
              <TooltipContent>
                {analysis.buckets.medium} clips 5-8s (optimal)
              </TooltipContent>
            </Tooltip>
          )}
          {analysis.buckets.long > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div 
                  className="bg-success/60 rounded-sm min-w-[8px]"
                  style={{ flex: analysis.buckets.long }}
                />
              </TooltipTrigger>
              <TooltipContent>
                {analysis.buckets.long} clips 8-{maxDuration}s
              </TooltipContent>
            </Tooltip>
          )}
          {analysis.buckets.tooLong > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div 
                  className="bg-destructive/40 rounded-sm min-w-[8px] border border-dashed border-destructive"
                  style={{ flex: analysis.buckets.tooLong }}
                />
              </TooltipTrigger>
              <TooltipContent>
                {analysis.buckets.tooLong} clips over {maxDuration}s (needs split)
              </TooltipContent>
            </Tooltip>
          )}
          {analysis.totalClips === 0 && (
            <div className="flex-1 bg-muted/30 rounded-sm" />
          )}
        </div>
      </div>

      {/* Health Checks */}
      <div className="space-y-1">
        {checks.map((check) => (
          <div key={check.name} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              {check.status === "pass" && <CheckCircle2 className="h-3 w-3 text-success" />}
              {check.status === "warn" && <AlertTriangle className="h-3 w-3 text-warning" />}
              {check.status === "fail" && <XCircle className="h-3 w-3 text-destructive" />}
              <span className="text-muted-foreground">{check.name}</span>
            </div>
            <span className={cn(
              check.status === "pass" && "text-success",
              check.status === "warn" && "text-warning",
              check.status === "fail" && "text-destructive"
            )}>
              {check.count !== undefined && check.count > 0 ? check.count : "✓"}
            </span>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      {(analysis.buckets.tooShort > 0 || jobAnalysis.failed > 0) && (
        <div className="flex gap-2 pt-1 border-t border-border/50">
          {analysis.buckets.tooShort > 0 && onFixShortClips && (
            <Button 
              variant="outline" 
              size="sm" 
              className="h-7 text-xs gap-1 flex-1"
              onClick={onFixShortClips}
            >
              <Wrench className="h-3 w-3" />
              Extend short clips
            </Button>
          )}
        </div>
      )}

      {/* Stats Footer */}
      <div className="flex justify-between text-[10px] text-muted-foreground/60 pt-1 border-t border-border/30">
        <span>{analysis.totalClips} clips</span>
        <span>{jobAnalysis.completed}/{jobAnalysis.total} generated</span>
      </div>
    </div>
  );
}