/**
 * PerformanceDashboard
 * 
 * Aggregate view of all tracked video performance with winner/loser signals.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { usePerformanceDashboard, type PerformanceEntry } from "@/hooks/use-performance-dashboard";
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  Eye,
  Heart,
  Share2,
  Bookmark,
  MessageCircle,
  BarChart3,
  Target,
  AlertTriangle,
} from "lucide-react";

const SIGNAL_CONFIG: Record<PerformanceEntry["signal"], { label: string; color: string; icon: typeof Trophy }> = {
  winner: { label: "Winner 🔥", color: "text-green-500 bg-green-500/10 border-green-500/30", icon: Trophy },
  promising: { label: "Promising", color: "text-blue-500 bg-blue-500/10 border-blue-500/30", icon: TrendingUp },
  neutral: { label: "Neutral", color: "text-muted-foreground bg-muted/50 border-border", icon: BarChart3 },
  underperformer: { label: "Weak", color: "text-orange-500 bg-orange-500/10 border-orange-500/30", icon: TrendingDown },
  loser: { label: "Cut ❌", color: "text-destructive bg-destructive/10 border-destructive/30", icon: AlertTriangle },
};

export function PerformanceDashboard() {
  const { data, isLoading } = usePerformanceDashboard();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
      </div>
    );
  }

  const { entries, summary } = data ?? { entries: [], summary: { totalTracked: 0, avgOutcomeScore: 0, winners: 0, losers: 0, totalViews: 0, totalEngagements: 0, bestPlatform: null } };

  if (entries.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No performance data yet</p>
          <p className="text-sm mt-1">Post videos and log metrics from the Videos tab to start tracking</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <SummaryCard label="Tracked" value={summary.totalTracked} icon={<Target className="w-4 h-4" />} />
        <SummaryCard label="Avg Score" value={summary.avgOutcomeScore} icon={<BarChart3 className="w-4 h-4" />} highlight={summary.avgOutcomeScore >= 50} />
        <SummaryCard label="Winners" value={summary.winners} icon={<Trophy className="w-4 h-4 text-green-500" />} highlight={summary.winners > 0} />
        <SummaryCard label="Cut" value={summary.losers} icon={<AlertTriangle className="w-4 h-4 text-destructive" />} />
        <SummaryCard label="Total Views" value={summary.totalViews.toLocaleString()} icon={<Eye className="w-4 h-4" />} />
        <SummaryCard label="Engagements" value={summary.totalEngagements.toLocaleString()} icon={<Heart className="w-4 h-4" />} />
      </div>

      {/* Winner/Loser Sections */}
      {entries.filter(e => e.signal === "winner").length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-1.5 text-green-500">
            <Trophy className="w-4 h-4" /> Winners — Scale These
          </h3>
          {entries.filter(e => e.signal === "winner").map(e => (
            <PerformanceRow key={e.id} entry={e} />
          ))}
        </div>
      )}

      {entries.filter(e => e.signal === "loser").length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-1.5 text-destructive">
            <AlertTriangle className="w-4 h-4" /> Underperformers — Cut or Rework
          </h3>
          {entries.filter(e => e.signal === "loser").map(e => (
            <PerformanceRow key={e.id} entry={e} />
          ))}
        </div>
      )}

      {/* All entries */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">All Tracked ({entries.length})</h3>
        {entries.map(e => (
          <PerformanceRow key={e.id} entry={e} />
        ))}
      </div>
    </div>
  );
}

function PerformanceRow({ entry }: { entry: PerformanceEntry }) {
  const config = SIGNAL_CONFIG[entry.signal];
  const Icon = config.icon;

  return (
    <Card className="border-border/50">
      <CardContent className="py-2.5 px-4 flex items-center gap-3">
        <Badge variant="outline" className={`text-xs shrink-0 gap-1 ${config.color}`}>
          <Icon className="w-3 h-3" />
          {config.label}
        </Badge>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{entry.title || "Untitled"}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {entry.product_name && <span className="truncate max-w-[120px]">📦 {entry.product_name}</span>}
            {entry.platform && <Badge variant="outline" className="text-[10px] h-4 capitalize">{entry.platform}</Badge>}
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
          {entry.views != null && (
            <span className="flex items-center gap-0.5">
              <Eye className="w-3 h-3" /> {entry.views.toLocaleString()}
            </span>
          )}
          {entry.likes != null && (
            <span className="flex items-center gap-0.5">
              <Heart className="w-3 h-3" /> {entry.likes.toLocaleString()}
            </span>
          )}
          {entry.shares != null && (
            <span className="flex items-center gap-0.5">
              <Share2 className="w-3 h-3" /> {entry.shares.toLocaleString()}
            </span>
          )}
          {entry.saves != null && (
            <span className="flex items-center gap-0.5">
              <Bookmark className="w-3 h-3" /> {entry.saves.toLocaleString()}
            </span>
          )}
          {entry.watch_3s_rate != null && (
            <span>3s: {entry.watch_3s_rate}%</span>
          )}
        </div>

        <div className="shrink-0 text-right">
          <span className={`text-lg font-bold ${
            (entry.outcome_score ?? 0) >= 70 ? "text-green-500" :
            (entry.outcome_score ?? 0) >= 40 ? "text-primary" :
            "text-muted-foreground"
          }`}>
            {entry.outcome_score ?? "—"}
          </span>
          <p className="text-[10px] text-muted-foreground">score</p>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryCard({ label, value, icon, highlight }: { label: string; value: string | number; icon: React.ReactNode; highlight?: boolean }) {
  return (
    <Card className={highlight ? "ring-1 ring-primary/30" : ""}>
      <CardContent className="p-3 flex flex-col items-center text-center gap-1">
        <div className="text-muted-foreground">{icon}</div>
        <p className={`text-xl font-bold ${highlight ? "text-primary" : ""}`}>{value}</p>
        <p className="text-[10px] text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}
