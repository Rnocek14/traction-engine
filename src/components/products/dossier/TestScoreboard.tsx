import { Badge } from "@/components/ui/badge";
import { useProductConversionSummary } from "@/hooks/use-conversions";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Video, Eye, MousePointerClick, ShoppingCart, DollarSign, TrendingUp, AlertTriangle, Flame, Skull, FlaskConical, Rocket } from "lucide-react";

interface Props {
  productId: string;
}

function useProductVideoCount(productId: string) {
  return useQuery({
    queryKey: ["product-video-count", productId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("story_jobs")
        .select("id", { count: "exact", head: true })
        .eq("product_id", productId)
        .eq("status", "complete");
      if (error) throw error;
      return count || 0;
    },
    enabled: !!productId,
  });
}

type Verdict = "not_enough_data" | "kill" | "fix_funnel" | "test_more" | "scale";

interface DecisionRule {
  verdict: Verdict;
  label: string;
  description: string;
  icon: typeof Flame;
  color: string;
  bgColor: string;
}

function getVerdict(videos: number, clicks: number, purchases: number): DecisionRule {
  if (videos < 10) {
    return {
      verdict: "not_enough_data",
      label: "Keep Posting",
      description: `${10 - videos} more videos needed before a decision. Post daily.`,
      icon: FlaskConical,
      color: "text-muted-foreground",
      bgColor: "bg-muted/50",
    };
  }

  // 10+ videos posted — now we can judge
  if (purchases >= 3) {
    return {
      verdict: "scale",
      label: "SCALE",
      description: "This product is converting. Increase video output and promote to Scaled.",
      icon: Rocket,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    };
  }

  if (purchases >= 1) {
    return {
      verdict: "test_more",
      label: "Test More",
      description: "Early signal — keep posting. Try different hooks and angles.",
      icon: Flame,
      color: "text-yellow-500",
      bgColor: "bg-yellow-500/10",
    };
  }

  if (clicks > 0 && purchases === 0) {
    return {
      verdict: "fix_funnel",
      label: "Fix Funnel",
      description: "Getting clicks but no purchases. Check product page, price, or landing page.",
      icon: AlertTriangle,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    };
  }

  // 10+ videos, 0 clicks, 0 purchases
  return {
    verdict: "kill",
    label: "KILL",
    description: "No traction after 10+ videos. Move on to the next product.",
    icon: Skull,
    color: "text-destructive",
    bgColor: "bg-destructive/10",
  };
}

export function TestScoreboard({ productId }: Props) {
  const { data: summary } = useProductConversionSummary(productId);
  const { data: videoCount } = useProductVideoCount(productId);

  const videos = videoCount ?? 0;
  const clicks = summary?.clicks ?? 0;
  const purchases = summary?.purchases ?? 0;
  const decision = getVerdict(videos, clicks, purchases);
  const DecisionIcon = decision.icon;

  const metrics = [
    { label: "Videos", value: videos, icon: Video, color: "text-blue-500" },
    {
      label: "Impressions", value: summary?.impressions ?? 0, icon: Eye,
      color: "text-muted-foreground",
      format: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v),
    },
    { label: "Clicks", value: clicks, icon: MousePointerClick, color: "text-yellow-500" },
    { label: "Add to Cart", value: summary ? (summary as any).add_to_carts ?? 0 : 0, icon: ShoppingCart, color: "text-orange-500" },
    { label: "Purchases", value: purchases, icon: DollarSign, color: "text-green-500" },
    {
      label: "Revenue", value: summary?.revenue_cents ?? 0, icon: TrendingUp,
      color: "text-emerald-500",
      format: (v: number) => `$${(v / 100).toFixed(2)}`,
    },
  ];

  const hasAnyData = videos > 0 || (summary && summary.days > 0);

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Test Scoreboard</h3>
        <div className="flex items-center gap-2">
          {summary?.is_winner && (
            <Badge className="bg-green-500/20 text-green-500 border-green-500/30">🏆 Winner</Badge>
          )}
          {summary && summary.roas != null && (
            <Badge variant="outline" className="text-xs">ROAS {summary.roas}x</Badge>
          )}
        </div>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {metrics.map((m) => {
          const Icon = m.icon;
          const displayValue = m.format ? m.format(m.value) : String(m.value);
          return (
            <div key={m.label} className="text-center space-y-1">
              <Icon className={`w-4 h-4 mx-auto ${m.color}`} />
              <div className="text-lg font-bold">{displayValue}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{m.label}</div>
            </div>
          );
        })}
      </div>

      {/* Decision rule verdict */}
      {hasAnyData ? (
        <div className={`flex items-start gap-3 rounded-md p-3 ${decision.bgColor}`}>
          <DecisionIcon className={`w-5 h-5 mt-0.5 shrink-0 ${decision.color}`} />
          <div>
            <span className={`font-bold text-sm ${decision.color}`}>{decision.label}</span>
            <p className="text-xs text-muted-foreground mt-0.5">{decision.description}</p>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-2">
          No data yet. Generate videos and log conversions to start tracking.
        </p>
      )}
    </div>
  );
}
