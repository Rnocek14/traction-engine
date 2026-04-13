import { useScraperHealth } from "@/hooks/use-scraper-health";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  Clock,
  Database,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Globe,
  Tag,
  Zap,
  Heart,
  Film,
  Hash,
  ExternalLink,
  Flame,
  Sparkles,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";

export function ScraperHealthDashboard() {
  const { data: health, isLoading } = useScraperHealth();
  const queryClient = useQueryClient();
  const [addingId, setAddingId] = useState<string | null>(null);

  const handleAddToQueue = async (story: NonNullable<typeof health>["trendingStories"][number]) => {
    setAddingId(story.id);
    try {
      const { error } = await supabase.from("content_ideas").insert({
        account_id: "default",
        title: story.title || "Untitled trend",
        subject: story.topics?.[0] || story.title || "Trending topic",
        angle: story.content_format ? `${story.content_format} format` : null,
        vertical: null,
        suggested_format: story.content_format,
        emotional_triggers: story.emotional_triggers || [],
        trend_source_ids: [story.id],
        opportunity_score: story.viral_score,
        status: "proposed",
        generated_by: "operator",
      });
      if (error) throw error;
      toast.success(`"${story.title || "Trend"}" added to idea queue`);
      queryClient.invalidateQueries({ queryKey: ["content-ideas"] });
    } catch (err) {
      toast.error(`Failed to add idea: ${(err as Error).message}`);
    } finally {
      setAddingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-48" />)}
        </div>
      </div>
    );
  }

  if (!health) return null;

  const isHealthy = health.insightsLast24h >= 5;
  const isStarved = health.totalInsights < 20;
  const hasScoreVariance = health.maxScore - health.minScore > 20;
  const scraperStatus = health.insightsLast24h > 0 ? "active" : health.lastScrapeAt ? "idle" : "never_run";

  return (
    <div className="space-y-4">
      {/* Status banner */}
      {isStarved && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="text-muted-foreground">
            <strong className="text-foreground">{health.totalInsights} insights total</strong> — system needs 50+ for reliable trend intelligence. Run the scraper more frequently.
          </span>
        </div>
      )}

      {/* Key metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          icon={<Database className="w-4 h-4" />}
          label="Total Insights"
          value={health.totalInsights}
          sub={`${health.insightsLast7d} last 7d`}
          status={health.totalInsights >= 50 ? "good" : health.totalInsights >= 20 ? "warn" : "bad"}
        />
        <MetricCard
          icon={<Activity className="w-4 h-4" />}
          label="Last 24h"
          value={health.insightsLast24h}
          sub={scraperStatus === "active" ? "Scraper active" : "Scraper idle"}
          status={health.insightsLast24h >= 10 ? "good" : health.insightsLast24h >= 1 ? "warn" : "bad"}
        />
        <MetricCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Avg Viral Score"
          value={health.avgScore}
          sub={`${health.minScore}–${health.maxScore} range`}
          status={hasScoreVariance ? "good" : "warn"}
        />
        <MetricCard
          icon={<Clock className="w-4 h-4" />}
          label="Data Freshness"
          value={health.lastScrapeAt ? formatDistanceToNow(new Date(health.lastScrapeAt), { addSuffix: false }) : "Never"}
          sub={`Avg age: ${health.avgAgeHours}h`}
          status={health.avgAgeHours < 48 ? "good" : health.avgAgeHours < 168 ? "warn" : "bad"}
        />
      </div>

      {/* Trending Stories — actual content */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Flame className="w-4 h-4 text-primary" />
            Trending Now — Top Scraped Stories
          </CardTitle>
        </CardHeader>
        <CardContent>
          {health.trendingStories.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No trend data yet. Run the scraper to discover trending topics.
            </p>
          ) : (
            <div className="space-y-3">
              {health.trendingStories.map((story) => (
                <div
                  key={story.id}
                  className="p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge
                          variant={story.viral_score >= 80 ? "default" : "secondary"}
                          className="text-xs tabular-nums"
                        >
                          🔥 {story.viral_score}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {story.source_type}
                        </Badge>
                        {story.content_format && (
                          <Badge variant="outline" className="text-[10px]">
                            📐 {story.content_format}
                          </Badge>
                        )}
                      </div>
                      <h4 className="text-sm font-semibold">{story.title || "Untitled"}</h4>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {story.topics.slice(0, 4).map((t) => (
                          <Badge key={t} variant="secondary" className="text-[10px] px-1.5 py-0">
                            {t}
                          </Badge>
                        ))}
                      </div>
                      {story.emotional_triggers.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-1 text-[10px] text-muted-foreground">
                          {story.emotional_triggers.slice(0, 3).map((e) => (
                            <span key={e}>❤️ {e}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    {story.source_url && (
                      <a
                        href={story.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground shrink-0"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail panels */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Score Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Score Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {health.scoreDistribution.map(({ bucket, count }) => {
              const pct = health.totalInsights > 0 ? (count / health.totalInsights) * 100 : 0;
              return (
                <div key={bucket} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{bucket}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                </div>
              );
            })}
            {!hasScoreVariance && (
              <p className="text-[10px] text-amber-500 mt-2">
                ⚠️ Low variance — scores are clustered. New scrapes will fix this.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Source Diversity */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary" />
              Source Diversity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {health.sourceCounts.length === 0 ? (
              <p className="text-xs text-muted-foreground">No sources yet</p>
            ) : (
              health.sourceCounts.map(({ type, count }) => {
                const pct = health.totalInsights > 0 ? (count / health.totalInsights) * 100 : 0;
                return (
                  <div key={type} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground capitalize">{type}</span>
                      <span className="font-medium">{count} ({Math.round(pct)}%)</span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>
                );
              })
            )}
            {health.sourceCounts.length < 3 && (
              <p className="text-[10px] text-amber-500 mt-2">
                ⚠️ Limited source diversity. Add TikTok/Shorts queries for better coverage.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Vertical Coverage */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Tag className="w-4 h-4 text-primary" />
              Vertical Coverage
            </CardTitle>
          </CardHeader>
          <CardContent>
            {health.verticalCounts.length === 0 ? (
              <p className="text-xs text-muted-foreground">No vertical tags yet</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {health.verticalCounts.map(({ vertical, count }) => (
                  <Badge
                    key={vertical}
                    variant={count >= 3 ? "default" : "secondary"}
                    className="text-[10px] gap-1"
                  >
                    {vertical} <span className="opacity-70">({count})</span>
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pattern Intelligence */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <PatternList
          title="Top Emotions"
          icon={<Heart className="w-4 h-4 text-destructive" />}
          items={health.topEmotions}
        />
        <PatternList
          title="Content Formats"
          icon={<Film className="w-4 h-4 text-primary" />}
          items={health.topFormats}
        />
        <PatternList
          title="Trending Topics"
          icon={<Hash className="w-4 h-4 text-primary" />}
          items={health.topTopics}
        />
        <PatternList
          title="Hook Patterns"
          icon={<Zap className="w-4 h-4 text-amber-500" />}
          items={health.topHookTypes}
        />
      </div>

      {/* Scrape job health */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
        <span className="flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3 text-green-500" />
          {health.totalScrapeJobs - health.failedJobs} successful jobs
        </span>
        {health.failedJobs > 0 && (
          <span className="flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-amber-500" />
            {health.failedJobs} failed
          </span>
        )}
        {health.lastScrapeAt && (
          <span>Last run: {formatDistanceToNow(new Date(health.lastScrapeAt), { addSuffix: true })}</span>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  sub,
  status,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub: string;
  status: "good" | "warn" | "bad";
}) {
  const statusColor = {
    good: "text-green-500",
    warn: "text-amber-500",
    bad: "text-destructive",
  }[status];

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className={`p-1.5 rounded-md bg-primary/10 ${statusColor}`}>{icon}</div>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className="text-xl font-bold">{value}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
      </CardContent>
    </Card>
  );
}

function PatternList({
  title,
  icon,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  items: { name: string; count: number }[];
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">{icon} {title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">No data yet</p>
        ) : (
          items.slice(0, 6).map(({ name, count }) => (
            <div key={name} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-muted-foreground">{name}</span>
              <Badge variant="secondary" className="text-[10px] shrink-0">{count}</Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
