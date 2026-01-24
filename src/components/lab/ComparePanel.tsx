import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Scale, Loader2, AlertCircle, Trophy, Target, 
  Film, ArrowRight, ChevronDown, RefreshCw, X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface VideoJobOption {
  id: string;
  provider: string;
  output_url: string;
  thumbnail_url: string | null;
  original_prompt: string | null;
  enriched_prompt: string | null;
  created_at: string;
}

type ComparisonWinner = "A" | "B" | "tie";

type ComparisonDeltas = {
  prompt_adherence: number;
  temporal_consistency: number;
  motion_quality: number;
  fidelity: number;
  cinematic_quality: number;
};

interface ComparisonResult {
  winner: ComparisonWinner;
  confidence: number;
  deltas: ComparisonDeltas;
  reasons: string[];
  key_defects_a: string[];
  key_defects_b: string[];
  stored: boolean;
}

const DELTA_LABELS: Record<keyof ComparisonDeltas, string> = {
  prompt_adherence: "Prompt Adherence",
  temporal_consistency: "Temporal Consistency",
  motion_quality: "Motion Quality",
  fidelity: "Visual Fidelity",
  cinematic_quality: "Cinematic Quality",
};

interface ComparePanelProps {
  className?: string;
}

export function ComparePanel({ className }: ComparePanelProps) {
  const [jobIdA, setJobIdA] = useState<string | null>(null);
  const [jobIdB, setJobIdB] = useState<string | null>(null);
  const [result, setResult] = useState<ComparisonResult | null>(null);

  // Fetch available completed video jobs
  const { data: videoJobs = [], isLoading: loadingJobs } = useQuery({
    queryKey: ["compare-video-jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("video_jobs")
        .select("id, provider, output_url, thumbnail_url, original_prompt, enriched_prompt, created_at")
        .eq("status", "done")
        .not("output_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as VideoJobOption[];
    },
  });

  // Compare mutation
  const compareMutation = useMutation({
    mutationFn: async ({ jobIdA, jobIdB }: { jobIdA: string; jobIdB: string }) => {
      const { data, error } = await supabase.functions.invoke("compare-videos", {
        body: { jobIdA, jobIdB },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as ComparisonResult;
    },
    onSuccess: (data) => {
      setResult(data);
      toast.success("Comparison complete", {
        description: data.stored ? "Result saved to database" : "Result not stored (duplicate or error)",
      });
    },
    onError: (error) => {
      toast.error("Comparison failed", { description: error.message });
    },
  });

  const jobA = useMemo(() => videoJobs.find(j => j.id === jobIdA), [videoJobs, jobIdA]);
  const jobB = useMemo(() => videoJobs.find(j => j.id === jobIdB), [videoJobs, jobIdB]);

  const canCompare = jobIdA && jobIdB && jobIdA !== jobIdB;

  const getProviderColor = (provider: string) => {
    const colors: Record<string, string> = {
      sora: "bg-primary/20 text-primary border-primary/30",
      runway: "bg-orange-500/20 text-orange-400 border-orange-500/30",
      luma: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    };
    return colors[provider] || "bg-secondary text-secondary-foreground";
  };

  const getWinnerLabel = (winner: ComparisonWinner) => {
    if (winner === "tie") return { label: "Tie", color: "text-muted-foreground" };
    return { 
      label: winner === "A" ? "Video A" : "Video B", 
      color: winner === "A" ? "text-primary" : "text-orange-400" 
    };
  };

  const formatDelta = (delta: number) => {
    const sign = delta > 0 ? "+" : "";
    return `${sign}${delta}`;
  };

  const getDeltaColor = (delta: number) => {
    if (delta > 0) return "text-success";
    if (delta < 0) return "text-destructive";
    return "text-muted-foreground";
  };

  const handleReset = () => {
    setJobIdA(null);
    setJobIdB(null);
    setResult(null);
  };

  if (loadingJobs) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={cn("h-full flex flex-col overflow-hidden", className)}>
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b">
        <Scale className="h-5 w-5 text-primary" />
        <h2 className="text-sm font-semibold">Video Comparison</h2>
        <Badge variant="secondary" className="text-[10px] h-5">
          Pairwise Ranking
        </Badge>
        {result && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 text-xs"
            onClick={handleReset}
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            New Comparison
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Selection Area */}
          <div className="grid grid-cols-2 gap-4">
            {/* Job A Selection */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Video A</label>
              <Select value={jobIdA || ""} onValueChange={setJobIdA}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select video A" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {videoJobs.map((job) => (
                    <SelectItem 
                      key={job.id} 
                      value={job.id}
                      disabled={job.id === jobIdB}
                    >
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant="outline" 
                          className={cn("text-[9px] h-4", getProviderColor(job.provider))}
                        >
                          {job.provider}
                        </Badge>
                        <span className="text-xs truncate max-w-[150px]">
                          {job.original_prompt?.slice(0, 40) || job.id.slice(0, 8)}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {/* Preview A */}
              {jobA && (
                <Card className="overflow-hidden">
                  <div className="aspect-video bg-black/50 relative">
                    {jobA.thumbnail_url ? (
                      <img src={jobA.thumbnail_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <video src={jobA.output_url} className="w-full h-full object-cover" muted />
                    )}
                    <Badge 
                      className={cn("absolute top-2 left-2 text-[9px]", getProviderColor(jobA.provider))}
                    >
                      {jobA.provider}
                    </Badge>
                    {result?.winner === "A" && (
                      <div className="absolute top-2 right-2">
                        <Trophy className="h-5 w-5 text-yellow-400 fill-yellow-400/30" />
                      </div>
                    )}
                  </div>
                  <CardContent className="p-2">
                    <p className="text-[10px] text-muted-foreground line-clamp-2">
                      {jobA.original_prompt || "No prompt"}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Job B Selection */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Video B</label>
              <Select value={jobIdB || ""} onValueChange={setJobIdB}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select video B" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {videoJobs.map((job) => (
                    <SelectItem 
                      key={job.id} 
                      value={job.id}
                      disabled={job.id === jobIdA}
                    >
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant="outline" 
                          className={cn("text-[9px] h-4", getProviderColor(job.provider))}
                        >
                          {job.provider}
                        </Badge>
                        <span className="text-xs truncate max-w-[150px]">
                          {job.original_prompt?.slice(0, 40) || job.id.slice(0, 8)}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Preview B */}
              {jobB && (
                <Card className="overflow-hidden">
                  <div className="aspect-video bg-black/50 relative">
                    {jobB.thumbnail_url ? (
                      <img src={jobB.thumbnail_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <video src={jobB.output_url} className="w-full h-full object-cover" muted />
                    )}
                    <Badge 
                      className={cn("absolute top-2 left-2 text-[9px]", getProviderColor(jobB.provider))}
                    >
                      {jobB.provider}
                    </Badge>
                    {result?.winner === "B" && (
                      <div className="absolute top-2 right-2">
                        <Trophy className="h-5 w-5 text-yellow-400 fill-yellow-400/30" />
                      </div>
                    )}
                  </div>
                  <CardContent className="p-2">
                    <p className="text-[10px] text-muted-foreground line-clamp-2">
                      {jobB.original_prompt || "No prompt"}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* Compare Button */}
          <div className="flex justify-center">
            <Button
              onClick={() => canCompare && compareMutation.mutate({ jobIdA: jobIdA!, jobIdB: jobIdB! })}
              disabled={!canCompare || compareMutation.isPending}
              className="gap-2"
            >
              {compareMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Scale className="h-4 w-4" />
              )}
              {compareMutation.isPending ? "Analyzing..." : "Compare Videos"}
            </Button>
          </div>

          {/* Results */}
          {result && (
            <Card className="border-primary/30">
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-yellow-400" />
                  Comparison Result
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Winner */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="text-xs text-muted-foreground">Winner</p>
                    <p className={cn("text-lg font-bold", getWinnerLabel(result.winner).color)}>
                      {getWinnerLabel(result.winner).label}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Confidence</p>
                    <div className="flex items-center gap-2">
                      <Progress 
                        value={result.confidence * 100} 
                        className="w-20 h-2" 
                      />
                      <span className="text-sm font-mono">
                        {Math.round(result.confidence * 100)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Deltas Table */}
                <div>
                  <p className="text-xs font-medium mb-2">Per-Dimension Deltas (A vs B)</p>
                  <div className="space-y-1">
                    {(Object.keys(DELTA_LABELS) as (keyof ComparisonDeltas)[]).map((key) => {
                      const delta = result.deltas[key];
                      return (
                        <div key={key} className="flex items-center justify-between py-1 px-2 rounded bg-muted/30">
                          <span className="text-xs">{DELTA_LABELS[key]}</span>
                          <span className={cn("text-xs font-mono font-medium", getDeltaColor(delta))}>
                            {formatDelta(delta)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Reasons */}
                <div>
                  <p className="text-xs font-medium mb-2">Analysis Reasons</p>
                  <ul className="space-y-1">
                    {result.reasons.map((reason, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <span className="text-primary">•</span>
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Defects */}
                {(result.key_defects_a.length > 0 || result.key_defects_b.length > 0) && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-medium mb-1">Defects A</p>
                      <div className="flex flex-wrap gap-1">
                        {result.key_defects_a.length > 0 ? (
                          result.key_defects_a.map((d, i) => (
                            <Badge key={i} variant="outline" className="text-[9px] h-4 text-destructive border-destructive/30">
                              {d}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-[10px] text-muted-foreground">None detected</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium mb-1">Defects B</p>
                      <div className="flex flex-wrap gap-1">
                        {result.key_defects_b.length > 0 ? (
                          result.key_defects_b.map((d, i) => (
                            <Badge key={i} variant="outline" className="text-[9px] h-4 text-destructive border-destructive/30">
                              {d}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-[10px] text-muted-foreground">None detected</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Storage Status */}
                <div className="flex items-center gap-2 pt-2 border-t">
                  <Badge variant={result.stored ? "default" : "secondary"} className="text-[10px] h-5">
                    {result.stored ? "Saved to database" : "Not stored"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
