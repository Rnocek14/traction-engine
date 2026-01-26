/**
 * StoryAnalysisPanel
 * 
 * Displays story-level quality analysis with:
 * - 5 dimension scores (flow, character, environment, motion, prompt)
 * - Per-scene continuity heatmap
 * - Failure patterns and AI recommendations
 * - Manual analyze trigger
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  AlertTriangle,
  Lightbulb,
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Film,
  User,
  MapPin,
  Zap,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type StoryAnalysis = Tables<"story_analysis">;
type VideoJob = Tables<"video_jobs">;

interface StoryAnalysisPanelProps {
  storyId: string;
  clips?: VideoJob[];
  className?: string;
}

interface DimensionScore {
  label: string;
  value: number | null;
  icon: React.ReactNode;
  description: string;
}

function getScoreColor(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 80) return "text-primary";
  if (score >= 60) return "text-accent-foreground";
  if (score >= 40) return "text-muted-foreground";
  return "text-destructive";
}

function getScoreBgColor(score: number | null): string {
  if (score === null) return "bg-muted";
  if (score >= 80) return "bg-primary/20";
  if (score >= 60) return "bg-accent/50";
  if (score >= 40) return "bg-muted";
  return "bg-destructive/20";
}

function ScoreGauge({ score, label }: { score: number | null; label: string }) {
  const displayScore = score ?? 0;
  const color = getScoreColor(score);
  
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={cn("text-2xl font-bold", color)}>
        {score !== null ? displayScore : "—"}
      </div>
      <Progress 
        value={displayScore} 
        className="h-1.5 w-16"
      />
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
    </div>
  );
}

function SceneHeatmap({ 
  clips, 
  weakScenes 
}: { 
  clips: VideoJob[]; 
  weakScenes: number[];
}) {
  const weakSet = new Set(weakScenes);
  
  return (
    <div className="flex gap-1 flex-wrap">
      {clips.map((clip, idx) => {
        const score = clip.continuity_score;
        const isWeak = weakSet.has(idx);
        const bgColor = isWeak 
          ? "bg-destructive" 
          : getScoreBgColor(score);
        const textColor = isWeak 
          ? "text-destructive-foreground" 
          : getScoreColor(score);
        
        return (
          <TooltipProvider key={clip.id}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "w-8 h-8 rounded flex items-center justify-center text-xs font-medium cursor-default transition-transform hover:scale-110",
                    bgColor,
                    textColor,
                    isWeak && "ring-2 ring-destructive ring-offset-1 ring-offset-background"
                  )}
                >
                  {idx + 1}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <div className="space-y-1">
                  <div className="font-medium">Scene {idx + 1}</div>
                  {score !== null && (
                    <div className="text-sm">
                      Continuity: <span className={textColor}>{score}</span>
                    </div>
                  )}
                  {clip.continuity_notes && clip.continuity_notes.length > 0 && (
                    <ul className="text-xs text-muted-foreground list-disc list-inside">
                      {clip.continuity_notes.slice(0, 3).map((note, i) => (
                        <li key={i}>{note}</li>
                      ))}
                    </ul>
                  )}
                  {isWeak && (
                    <Badge variant="destructive" className="text-[10px]">
                      Weak Link
                    </Badge>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
    </div>
  );
}

export function StoryAnalysisPanel({
  storyId,
  clips = [],
  className,
}: StoryAnalysisPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch analysis for this story
  const { data: analysis, isLoading } = useQuery({
    queryKey: ["story-analysis", storyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("story_analysis")
        .select("*")
        .eq("story_job_id", storyId)
        .maybeSingle();

      if (error) throw error;
      return data as StoryAnalysis | null;
    },
    refetchInterval: 30000, // Refresh every 30s in case cron runs
  });

  // Manual analyze trigger
  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("auto-rate-story", {
        body: { story_id: storyId },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["story-analysis", storyId] });
      queryClient.invalidateQueries({ queryKey: ["story-clips"] });
      toast({
        title: "Analysis complete",
        description: "Story has been analyzed for continuity and flow.",
      });
    },
    onError: (error) => {
      toast({
        title: "Analysis failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const dimensions: DimensionScore[] = [
    {
      label: "Flow",
      value: analysis?.overall_flow_score ?? null,
      icon: <Film className="h-3.5 w-3.5" />,
      description: "Narrative progression and scene-to-scene logic",
    },
    {
      label: "Character",
      value: analysis?.character_continuity ?? null,
      icon: <User className="h-3.5 w-3.5" />,
      description: "Identity and appearance consistency",
    },
    {
      label: "Environment",
      value: analysis?.environment_consistency ?? null,
      icon: <MapPin className="h-3.5 w-3.5" />,
      description: "Location and lighting coherence",
    },
    {
      label: "Motion",
      value: analysis?.motion_logic ?? null,
      icon: <Zap className="h-3.5 w-3.5" />,
      description: "Physical plausibility of actions",
    },
    {
      label: "Prompt",
      value: analysis?.prompt_execution ?? null,
      icon: <Target className="h-3.5 w-3.5" />,
      description: "How well prompts were executed",
    },
  ];

  const hasAnalysis = !!analysis;
  const canAnalyze = clips.length >= 2 && clips.filter(c => c.status === "done").length >= 2;

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded} className={className}>
      <Card className="border-border/50">
        <CollapsibleTrigger asChild>
          <CardHeader className="py-3 px-4 cursor-pointer hover:bg-secondary/30 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium">Story Analysis</CardTitle>
              </div>
              
              {hasAnalysis ? (
                <Badge 
                  variant="outline" 
                  className={cn(
                    "text-xs",
                    getScoreColor(analysis.overall_flow_score)
                  )}
                >
                  Flow: {analysis.overall_flow_score}
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">
                  Not analyzed
                </Badge>
              )}
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 px-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Loading analysis...
              </div>
            ) : !hasAnalysis ? (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-3">
                  {canAnalyze 
                    ? "Run analysis to evaluate story continuity and flow."
                    : "Need at least 2 completed scenes to analyze."}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => analyzeMutation.mutate()}
                  disabled={!canAnalyze || analyzeMutation.isPending}
                >
                  {analyzeMutation.isPending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
                      Analyze Story
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Dimension Scores */}
                <div className="flex justify-between items-start gap-2">
                  {dimensions.map((dim) => (
                    <TooltipProvider key={dim.label}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex-1">
                            <ScoreGauge score={dim.value} label={dim.label} />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <div className="flex items-center gap-1.5">
                            {dim.icon}
                            <span>{dim.description}</span>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                </div>

                {/* Scene Heatmap */}
                {clips.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Film className="h-3 w-3" />
                      <span>Scene Continuity</span>
                      {analysis.weak_scenes && analysis.weak_scenes.length > 0 && (
                        <Badge variant="destructive" className="text-[10px] ml-auto">
                          {analysis.weak_scenes.length} weak link{analysis.weak_scenes.length > 1 ? "s" : ""}
                        </Badge>
                      )}
                    </div>
                    <SceneHeatmap 
                      clips={clips.filter(c => c.status === "done")} 
                      weakScenes={analysis.weak_scenes || []} 
                    />
                  </div>
                )}

                {/* Failure Patterns */}
                {analysis.failure_patterns && analysis.failure_patterns.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <AlertTriangle className="h-3 w-3 text-orange-500" />
                      <span>Issues Detected</span>
                    </div>
                    <ScrollArea className="max-h-24">
                      <ul className="space-y-1">
                        {analysis.failure_patterns.slice(0, 5).map((pattern, idx) => (
                          <li 
                            key={idx} 
                            className="text-xs text-muted-foreground flex items-start gap-1.5"
                          >
                            <XCircle className="h-3 w-3 text-destructive shrink-0 mt-0.5" />
                            <span>{pattern}</span>
                          </li>
                        ))}
                      </ul>
                    </ScrollArea>
                  </div>
                )}

                {/* Recommendations */}
                {analysis.recommendations && analysis.recommendations.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Lightbulb className="h-3 w-3 text-yellow-500" />
                      <span>Recommendations</span>
                    </div>
                    <ScrollArea className="max-h-24">
                      <ul className="space-y-1">
                        {analysis.recommendations.slice(0, 3).map((rec, idx) => (
                          <li 
                            key={idx} 
                            className="text-xs text-muted-foreground flex items-start gap-1.5"
                          >
                            <CheckCircle className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                            <span>{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </ScrollArea>
                  </div>
                )}

                {/* Re-analyze button */}
                <div className="flex justify-end pt-2 border-t border-border/30">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => analyzeMutation.mutate()}
                    disabled={analyzeMutation.isPending}
                  >
                    {analyzeMutation.isPending ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3 mr-1" />
                    )}
                    Re-analyze
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
