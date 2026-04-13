import { useTrendSignals, useTrendStats } from "@/hooks/use-ideas-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Zap, Heart, Film, ExternalLink } from "lucide-react";

export function TrendIntelligencePanel() {
  const { data: stats, isLoading: statsLoading } = useTrendStats();
  const { data: signals, isLoading: signalsLoading } = useTrendSignals();

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Insights (7d)"
          value={statsLoading ? "—" : String(stats?.totalInsights || 0)}
          icon={<TrendingUp className="w-4 h-4" />}
        />
        <StatCard
          label="Avg Viral Score"
          value={statsLoading ? "—" : String(stats?.avgViralScore || 0)}
          icon={<Zap className="w-4 h-4" />}
        />
        <StatCard
          label="Stories This Week"
          value={statsLoading ? "—" : String(stats?.storiesThisWeek || 0)}
          icon={<Film className="w-4 h-4" />}
        />
        <StatCard
          label="Approved"
          value={statsLoading ? "—" : String(stats?.storiesApproved || 0)}
          icon={<Heart className="w-4 h-4" />}
        />
      </div>

      {/* Top patterns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PatternCard
          title="Top Hook Patterns"
          icon={<Zap className="w-4 h-4 text-primary" />}
          items={stats?.topHooks || []}
          loading={statsLoading}
        />
        <PatternCard
          title="Emotional Triggers"
          icon={<Heart className="w-4 h-4 text-destructive" />}
          items={stats?.topEmotions || []}
          loading={statsLoading}
        />
        <PatternCard
          title="Hot Formats"
          icon={<Film className="w-4 h-4 text-accent-foreground" />}
          items={stats?.topFormats || []}
          loading={statsLoading}
        />
      </div>

      {/* Recent signals */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent Trend Signals</CardTitle>
        </CardHeader>
        <CardContent>
          {signalsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !signals || signals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No scraped insights in the last 7 days. Run the scraper to feed the system.</p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {signals.slice(0, 15).map(signal => (
                <div
                  key={signal.id}
                  className="flex items-start justify-between gap-3 p-2.5 rounded-md border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{signal.title || "Untitled insight"}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {signal.topics?.slice(0, 3).map(t => (
                        <Badge key={t} variant="secondary" className="text-[10px] px-1.5 py-0">
                          {t}
                        </Badge>
                      ))}
                      {signal.content_format && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {signal.content_format}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {signal.viral_score != null && (
                      <Badge
                        variant={signal.viral_score >= 80 ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {signal.viral_score}
                      </Badge>
                    )}
                    {signal.source_url && (
                      <a
                        href={signal.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="p-2 rounded-md bg-primary/10 text-primary">{icon}</div>
        <div>
          <p className="text-xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function PatternCard({
  title,
  icon,
  items,
  loading,
}: {
  title: string;
  icon: React.ReactNode;
  items: [string, number][];
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          {icon} {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {loading ? (
          <Skeleton className="h-20 w-full" />
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground">No data yet</p>
        ) : (
          items.map(([name, count]) => (
            <div key={name} className="flex items-center justify-between text-sm">
              <span className="truncate text-muted-foreground">{name}</span>
              <Badge variant="secondary" className="text-xs">{count}</Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
