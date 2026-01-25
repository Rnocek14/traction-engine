import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { 
  ArrowLeft, BarChart3, Loader2, TrendingUp, AlertTriangle, 
  Target, Zap, Trophy, ChevronDown, Film, Layers, Crown, Database,
  Activity, PieChart, Tag
} from "lucide-react";
import { CronMonitorPanel } from "@/components/studio/CronMonitorPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface ProviderQuality {
  provider: string;
  auto_best_use: string | null;
  count: number;
  avg_score: number | null;
}

interface DefectStat {
  defect_type: string;
  count: number;
  avg_impact: number | null;
}

interface RoutingTagStat {
  routing_tag: string;
  count: number;
  avg_score: number | null;
  pct_final: number;
}

interface ComparisonWinRate {
  provider: string;
  wins: number;
  total: number;
  win_rate: number;
}

interface ClusterStat {
  cluster_key: string;
  provider: string;
  wins: number;
  losses: number;
  ties: number;
  total_comparisons: number;
  avg_confidence: number | null;
  avg_win_delta: number | null;
  last_updated_at: string;
}

interface ClusterSummary {
  cluster_key: string;
  comparisons: number;
  last_updated: string;
  providers: Array<{
    provider: string;
    wins: number;
    losses: number;
    ties: number;
    winRate: number;
    avgConfidence: number | null;
    avgDelta: number | null;
  }>;
  topProvider: string | null;
  dataSufficient: boolean;
}

interface TagCoverageStats {
  totalRated: number;
  withTags: number;
  withoutTags: number;
  pctWithTags: number;
  generalClusterPct: number;
  totalGeneral: number;
  freeTagCount: number;
  topKept: Array<{ tag: string; count: number }>;
  topFree: Array<{ tag: string; count: number }>;
}

export default function RoutingAnalytics() {
  // Provider quality distribution
  const { data: providerQuality, isLoading: loadingQuality } = useQuery({
    queryKey: ["routing-provider-quality"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("video_jobs")
        .select("provider, auto_best_use, auto_overall_score")
        .eq("status", "done")
        .not("auto_rated_at", "is", null);
      
      if (error) throw error;
      
      // Group by provider + best_use client-side
      const grouped = new Map<string, ProviderQuality>();
      for (const job of data || []) {
        const key = `${job.provider}|${job.auto_best_use || "unknown"}`;
        const existing = grouped.get(key);
        if (existing) {
          existing.count++;
          if (job.auto_overall_score) {
            existing.avg_score = ((existing.avg_score || 0) * (existing.count - 1) + job.auto_overall_score) / existing.count;
          }
        } else {
          grouped.set(key, {
            provider: job.provider,
            auto_best_use: job.auto_best_use,
            count: 1,
            avg_score: job.auto_overall_score,
          });
        }
      }
      return Array.from(grouped.values()).sort((a, b) => b.count - a.count);
    },
  });

  // Top defects
  const { data: defectStats, isLoading: loadingDefects } = useQuery({
    queryKey: ["routing-defect-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("video_jobs")
        .select("auto_defects, auto_overall_score")
        .eq("status", "done")
        .not("auto_defects", "is", null);

      if (error) throw error;

      // Count defects client-side
      const defectCounts = new Map<string, { count: number; totalScore: number; scoredCount: number }>();
      for (const job of data || []) {
        const defects = job.auto_defects as Array<{ type: string }> | null;
        if (!defects) continue;
        for (const d of defects) {
          const existing = defectCounts.get(d.type);
          if (existing) {
            existing.count++;
            if (job.auto_overall_score) {
              existing.totalScore += job.auto_overall_score;
              existing.scoredCount++;
            }
          } else {
            defectCounts.set(d.type, {
              count: 1,
              totalScore: job.auto_overall_score || 0,
              scoredCount: job.auto_overall_score ? 1 : 0,
            });
          }
        }
      }

      return Array.from(defectCounts.entries())
        .map(([type, stats]) => ({
          defect_type: type,
          count: stats.count,
          avg_impact: stats.scoredCount > 0 ? Math.round(stats.totalScore / stats.scoredCount) : null,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);
    },
  });

  // Routing tag performance
  const { data: routingTags, isLoading: loadingTags } = useQuery({
    queryKey: ["routing-tag-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("video_jobs")
        .select("auto_routing_tags, auto_overall_score, auto_best_use")
        .eq("status", "done")
        .not("auto_routing_tags", "is", null);

      if (error) throw error;

      // Count tags client-side
      const tagStats = new Map<string, { count: number; totalScore: number; finalCount: number }>();
      for (const job of data || []) {
        const tags = job.auto_routing_tags as string[] | null;
        if (!tags) continue;
        for (const tag of tags) {
          const existing = tagStats.get(tag);
          const isFinal = job.auto_best_use === "final";
          if (existing) {
            existing.count++;
            existing.totalScore += job.auto_overall_score || 0;
            if (isFinal) existing.finalCount++;
          } else {
            tagStats.set(tag, {
              count: 1,
              totalScore: job.auto_overall_score || 0,
              finalCount: isFinal ? 1 : 0,
            });
          }
        }
      }

      return Array.from(tagStats.entries())
        .map(([tag, stats]) => ({
          routing_tag: tag,
          count: stats.count,
          avg_score: stats.count > 0 ? Math.round(stats.totalScore / stats.count) : null,
          pct_final: Math.round((stats.finalCount / stats.count) * 100),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);
    },
  });

  // Comparison win rates
  const { data: winRates, isLoading: loadingWins } = useQuery({
    queryKey: ["routing-win-rates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("video_comparisons")
        .select("provider_a, provider_b, winner, winner_job");

      if (error) throw error;

      // Count wins per provider
      const providerWins = new Map<string, { wins: number; total: number }>();
      for (const comp of data || []) {
        // Count for provider_a
        const statsA = providerWins.get(comp.provider_a) || { wins: 0, total: 0 };
        statsA.total++;
        if (comp.winner === "A") statsA.wins++;
        providerWins.set(comp.provider_a, statsA);

        // Count for provider_b
        const statsB = providerWins.get(comp.provider_b) || { wins: 0, total: 0 };
        statsB.total++;
        if (comp.winner === "B") statsB.wins++;
        providerWins.set(comp.provider_b, statsB);
      }

      return Array.from(providerWins.entries())
        .map(([provider, stats]) => ({
          provider,
          wins: stats.wins,
          total: stats.total,
          win_rate: Math.round((stats.wins / stats.total) * 100),
        }))
        .sort((a, b) => b.win_rate - a.win_rate);
    },
  });

  // Cluster stats from provider_cluster_stats
  const { data: clusterStats, isLoading: loadingClusters } = useQuery({
    queryKey: ["routing-cluster-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("provider_cluster_stats")
        .select("*")
        .order("last_updated_at", { ascending: false })
        .limit(300);

      if (error) throw error;

      // Group by cluster_key
      const clusterMap = new Map<string, ClusterStat[]>();
      for (const row of data || []) {
        const stats = clusterMap.get(row.cluster_key) || [];
        stats.push(row as ClusterStat);
        clusterMap.set(row.cluster_key, stats);
      }

      // Build summaries
      const MIN_COMPARISONS = 5;
      const summaries: ClusterSummary[] = [];
      
      for (const [cluster_key, stats] of clusterMap.entries()) {
        const comparisons = Math.max(...stats.map(s => s.total_comparisons || 0));
        const last_updated = stats.reduce((max, s) => 
          s.last_updated_at > max ? s.last_updated_at : max, 
          ""
        );
        
        const providers = stats.map(s => ({
          provider: s.provider,
          wins: s.wins,
          losses: s.losses,
          ties: s.ties,
          winRate: s.total_comparisons > 0 
            ? Math.round((s.wins / s.total_comparisons) * 100) 
            : 0,
          avgConfidence: s.avg_confidence,
          avgDelta: s.avg_win_delta,
        })).sort((a, b) => b.winRate - a.winRate);
        
        // Find top provider (highest winRate with enough data)
        const topProvider = providers.length > 0 ? providers[0].provider : null;
        
        summaries.push({
          cluster_key,
          comparisons,
          last_updated,
          providers,
          topProvider,
          dataSufficient: comparisons >= MIN_COMPARISONS,
        });
      }

      return summaries.sort((a, b) => b.comparisons - a.comparisons);
    },
  });

  // Tag coverage stats
  const { data: coverageStats, isLoading: loadingCoverage } = useQuery({
    queryKey: ["routing-tag-coverage"],
    queryFn: async (): Promise<TagCoverageStats> => {
      // Client-side deriveClusterKey - matches backend logic exactly
      const deriveClusterKey = (tags: string[] | null | undefined): string => {
        if (!tags?.length) return "general";
        const normalizeTag = (tag: string): string => tag
          .toLowerCase()
          .trim()
          .replace(/[\s-]+/g, "_")
          .replace(/[^a-z0-9_]/g, "")
          .replace(/_+/g, "_")
          .replace(/^_+|_+$/g, "");
        const normalized = [...new Set(tags.map(normalizeTag).filter(t => t.length > 0))]
          .sort()
          .slice(0, 3);
        return normalized.length > 0 ? normalized.join("|") : "general";
      };

      // Bounded query: last 7 days, max 1000 rows
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("video_jobs")
        .select("auto_routing_tags")
        .eq("status", "done")
        .not("auto_rated_at", "is", null)
        .gte("auto_rated_at", sevenDaysAgo)
        .limit(1000);

      if (error) throw error;

      const jobs = data || [];
      const totalRated = jobs.length;
      const withTags = jobs.filter(j => j.auto_routing_tags && j.auto_routing_tags.length > 0).length;
      const withoutTags = totalRated - withTags;
      const pctWithTags = totalRated > 0 ? Math.round((withTags / totalRated) * 100) : 0;

      // Compute cluster key client-side and count general clusters
      const generalJobs = jobs.filter(j => {
        const clusterKey = deriveClusterKey(j.auto_routing_tags as string[] | null);
        return clusterKey === "general";
      }).length;
      const generalClusterPct = totalRated > 0 ? Math.round((generalJobs / totalRated) * 100) : 0;

      // Count tags by type (kept vs x_ free tags)
      const keptCounts = new Map<string, number>();
      const freeCounts = new Map<string, number>();
      let freeTagCount = 0;

      for (const job of jobs) {
        const tags = job.auto_routing_tags as string[] | null;
        if (!tags) continue;
        for (const tag of tags) {
          if (tag.startsWith("x_")) {
            freeTagCount++;
            const existing = freeCounts.get(tag) || 0;
            freeCounts.set(tag, existing + 1);
          } else {
            const existing = keptCounts.get(tag) || 0;
            keptCounts.set(tag, existing + 1);
          }
        }
      }

      const topKept = Array.from(keptCounts.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);

      const topFree = Array.from(freeCounts.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);

      return {
        totalRated,
        withTags,
        withoutTags,
        pctWithTags,
        generalClusterPct,
        totalGeneral: generalJobs,
        freeTagCount,
        topKept,
        topFree,
      };
    },
  });

  const getProviderColor = (provider: string) => {
    const colors: Record<string, string> = {
      sora: "bg-primary/20 text-primary border-primary/30",
      runway: "bg-orange-500/20 text-orange-400 border-orange-500/30",
      luma: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    };
    return colors[provider] || "bg-secondary text-secondary-foreground";
  };

  const getBestUseColor = (use: string | null) => {
    const colors: Record<string, string> = {
      final: "bg-success/20 text-success border-success/30",
      usable_social: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      draft_only: "bg-warning/20 text-warning border-warning/30",
      reject: "bg-destructive/20 text-destructive border-destructive/30",
    };
    return colors[use || ""] || "bg-muted text-muted-foreground";
  };

  const isLoading = loadingQuality || loadingDefects || loadingTags || loadingWins || loadingClusters || loadingCoverage;

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b bg-card/50">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <Link to="/studio/lab">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h1 className="text-sm font-semibold">Routing Analytics</h1>
          </div>
          <Badge variant="secondary" className="text-[10px] h-5">
            Provider Performance
          </Badge>
        </div>
      </header>

      {/* Main Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6 max-w-7xl mx-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Tabs defaultValue="quality" className="space-y-4">
              <TabsList>
                <TabsTrigger value="quality" className="gap-1.5 text-xs">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Quality
                </TabsTrigger>
                <TabsTrigger value="defects" className="gap-1.5 text-xs">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Defects
                </TabsTrigger>
                <TabsTrigger value="routing" className="gap-1.5 text-xs">
                  <Target className="h-3.5 w-3.5" />
                  Routing Tags
                </TabsTrigger>
                <TabsTrigger value="comparisons" className="gap-1.5 text-xs">
                  <Trophy className="h-3.5 w-3.5" />
                  Win Rates
                </TabsTrigger>
                <TabsTrigger value="clusters" className="gap-1.5 text-xs">
                  <Layers className="h-3.5 w-3.5" />
                  Clusters
                </TabsTrigger>
                <TabsTrigger value="coverage" className="gap-1.5 text-xs">
                  <PieChart className="h-3.5 w-3.5" />
                  Coverage
                </TabsTrigger>
                <TabsTrigger value="system" className="gap-1.5 text-xs">
                  <Activity className="h-3.5 w-3.5" />
                  System
                </TabsTrigger>
              </TabsList>

              {/* Quality Distribution Tab */}
              <TabsContent value="quality" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Provider → Best Use Distribution</CardTitle>
                    <CardDescription>
                      How each provider's outputs are rated by quality tier
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {providerQuality && providerQuality.length > 0 ? (
                      <div className="space-y-2">
                        {providerQuality.map((row, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-3 p-2 rounded-lg bg-muted/30"
                          >
                            <Badge className={cn("text-[10px] min-w-[60px] justify-center", getProviderColor(row.provider))}>
                              {row.provider}
                            </Badge>
                            <Badge className={cn("text-[10px] min-w-[90px] justify-center", getBestUseColor(row.auto_best_use))}>
                              {row.auto_best_use || "unrated"}
                            </Badge>
                            <div className="flex-1">
                              <Progress value={Math.min(row.count * 5, 100)} className="h-2" />
                            </div>
                            <span className="text-xs font-mono w-12 text-right">{row.count}</span>
                            {row.avg_score && (
                              <span className="text-xs text-muted-foreground w-16 text-right">
                                avg: {Math.round(row.avg_score)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No rated videos yet</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Defects Tab */}
              <TabsContent value="defects" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Top Defect Types</CardTitle>
                    <CardDescription>
                      Most common defects detected and their impact on scores
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {defectStats && defectStats.length > 0 ? (
                      <div className="space-y-2">
                        {defectStats.map((defect, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-3 p-2 rounded-lg bg-muted/30"
                          >
                            <Badge variant="outline" className="text-[10px] min-w-[120px] justify-center text-destructive border-destructive/30">
                              {defect.defect_type}
                            </Badge>
                            <div className="flex-1">
                              <Progress value={Math.min(defect.count * 10, 100)} className="h-2" />
                            </div>
                            <span className="text-xs font-mono w-12 text-right">{defect.count}×</span>
                            {defect.avg_impact && (
                              <span className="text-xs text-muted-foreground w-20 text-right">
                                avg score: {defect.avg_impact}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No defects recorded yet</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Routing Tags Tab */}
              <TabsContent value="routing" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Routing Tag Performance</CardTitle>
                    <CardDescription>
                      Average score and "final" rate per routing tag
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {routingTags && routingTags.length > 0 ? (
                      <div className="space-y-2">
                        {routingTags.map((tag, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-3 p-2 rounded-lg bg-muted/30"
                          >
                            <Badge variant="secondary" className="text-[10px] min-w-[100px] justify-center">
                              {tag.routing_tag}
                            </Badge>
                            <div className="flex-1">
                              <Progress value={tag.pct_final} className="h-2" />
                            </div>
                            <span className="text-xs font-mono w-12 text-right">{tag.count}×</span>
                            <span className="text-xs text-muted-foreground w-16 text-right">
                              avg: {tag.avg_score || "-"}
                            </span>
                            <span className="text-xs text-success w-16 text-right">
                              {tag.pct_final}% final
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No routing tags yet</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Comparisons Tab */}
              <TabsContent value="comparisons" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Provider Win Rates</CardTitle>
                    <CardDescription>
                      Head-to-head comparison results from pairwise ranking
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {winRates && winRates.length > 0 ? (
                      <div className="space-y-3">
                        {winRates.map((rate, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-3 p-3 rounded-lg bg-muted/30"
                          >
                            <Badge className={cn("text-xs min-w-[70px] justify-center", getProviderColor(rate.provider))}>
                              {rate.provider}
                            </Badge>
                            <div className="flex-1 space-y-1">
                              <Progress value={rate.win_rate} className="h-3" />
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold">{rate.win_rate}%</p>
                              <p className="text-[10px] text-muted-foreground">
                                {rate.wins}/{rate.total} wins
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Film className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">No comparisons yet</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Use the Compare tab in the Lab to run head-to-head comparisons
                        </p>
                        <Button variant="secondary" size="sm" className="mt-4" asChild>
                          <Link to="/studio/lab">Go to Lab</Link>
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Clusters Tab */}
              <TabsContent value="clusters" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      Per-Cluster Provider Performance
                      <Badge variant="outline" className="text-[10px]">
                        <Database className="h-3 w-3 mr-1" />
                        {clusterStats?.length || 0} clusters
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      Win rates per routing tag cluster (derived from top 3 tags)
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {clusterStats && clusterStats.length > 0 ? (
                      <div className="space-y-4">
                        {clusterStats.map((cluster, i) => (
                          <div
                            key={i}
                            className="p-3 rounded-lg bg-muted/30 border border-border/50"
                          >
                            {/* Cluster Header */}
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                                  {cluster.cluster_key}
                                </code>
                                {cluster.dataSufficient ? (
                                  <Badge variant="secondary" className="text-[10px] bg-success/20 text-success">
                                    ✓ Data sufficient
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                    &lt; 5 comparisons
                                  </Badge>
                                )}
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-muted-foreground">
                                  {cluster.comparisons} comparisons
                                </p>
                              </div>
                            </div>

                            {/* Provider Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                              {cluster.providers.map((p, j) => (
                                <div
                                  key={j}
                                  className={cn(
                                    "p-2 rounded border",
                                    p.provider === cluster.topProvider && cluster.dataSufficient
                                      ? "border-success/50 bg-success/5"
                                      : "border-border/30 bg-background/50"
                                  )}
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <Badge className={cn("text-[10px]", getProviderColor(p.provider))}>
                                      {p.provider}
                                    </Badge>
                                    {p.provider === cluster.topProvider && cluster.dataSufficient && (
                                      <Crown className="h-3 w-3 text-success" />
                                    )}
                                  </div>
                                  <div className="space-y-1">
                                    <div className="flex justify-between text-[10px]">
                                      <span className="text-muted-foreground">Win rate</span>
                                      <span className="font-bold">{p.winRate}%</span>
                                    </div>
                                    <Progress value={p.winRate} className="h-1.5" />
                                    <div className="flex justify-between text-[10px] text-muted-foreground">
                                      <span>{p.wins}W / {p.losses}L / {p.ties}T</span>
                                      {p.avgConfidence && (
                                        <span>conf: {Math.round(p.avgConfidence * 100)}%</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Layers className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">No cluster data yet</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Cluster stats are populated from automated comparisons
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Coverage Tab */}
              <TabsContent value="coverage" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs text-muted-foreground">Total Rated</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{coverageStats?.totalRated ?? 0}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs text-muted-foreground">With Tags</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-success">
                        {coverageStats?.pctWithTags ?? 0}%
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {coverageStats?.withTags ?? 0} / {coverageStats?.totalRated ?? 0}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs text-muted-foreground">"General" Cluster</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className={cn(
                        "text-2xl font-bold",
                        (coverageStats?.generalClusterPct ?? 0) > 50 ? "text-destructive" : "text-warning"
                      )}>
                        {coverageStats?.generalClusterPct ?? 0}%
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {coverageStats?.totalGeneral ?? 0} jobs (target: &lt;20%)
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs text-muted-foreground">Free Tags (x_)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-blue-400">
                        {coverageStats?.freeTagCount ?? 0}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Fallback tags for tuning
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Tag className="h-4 w-4 text-success" />
                        Top Allowlisted Tags
                      </CardTitle>
                      <CardDescription>
                        Tags that made it through the allowlist filter
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {coverageStats?.topKept && coverageStats.topKept.length > 0 ? (
                        <div className="space-y-2">
                          {coverageStats.topKept.map((tag, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-3 p-2 rounded-lg bg-muted/30"
                            >
                              <Badge variant="outline" className="text-[10px] min-w-[120px] justify-center text-success border-success/30">
                                {tag.tag}
                              </Badge>
                              <div className="flex-1">
                                <Progress 
                                  value={Math.min((tag.count / (coverageStats.topKept[0]?.count || 1)) * 100, 100)} 
                                  className="h-2" 
                                />
                              </div>
                              <span className="text-xs font-mono w-12 text-right">{tag.count}×</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No tags recorded yet</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Tag className="h-4 w-4 text-blue-400" />
                        Top Free Tags (x_)
                      </CardTitle>
                      <CardDescription>
                        Unknown tags preserved as fallbacks — candidates for allowlist expansion
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {coverageStats?.topFree && coverageStats.topFree.length > 0 ? (
                        <div className="space-y-2">
                          {coverageStats.topFree.map((tag, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-3 p-2 rounded-lg bg-muted/30"
                            >
                              <Badge variant="outline" className="text-[10px] min-w-[120px] justify-center text-blue-400 border-blue-400/30">
                                {tag.tag}
                              </Badge>
                              <div className="flex-1">
                                <Progress 
                                  value={Math.min((tag.count / (coverageStats.topFree[0]?.count || 1)) * 100, 100)} 
                                  className="h-2" 
                                />
                              </div>
                              <span className="text-xs font-mono w-12 text-right">{tag.count}×</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No free tags recorded yet — the allowlist is covering all VLM outputs</p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* System Tab */}
              <TabsContent value="system" className="space-y-4">
                <CronMonitorPanel />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
