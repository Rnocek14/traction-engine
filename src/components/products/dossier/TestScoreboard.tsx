import { Badge } from "@/components/ui/badge";
import { useProductConversionSummary } from "@/hooks/use-conversions";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Video, Eye, MousePointerClick, ShoppingCart, DollarSign, TrendingUp } from "lucide-react";

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

export function TestScoreboard({ productId }: Props) {
  const { data: summary } = useProductConversionSummary(productId);
  const { data: videoCount } = useProductVideoCount(productId);

  const metrics = [
    {
      label: "Videos",
      value: videoCount ?? 0,
      icon: Video,
      color: "text-blue-500",
    },
    {
      label: "Impressions",
      value: summary?.impressions ?? 0,
      icon: Eye,
      color: "text-muted-foreground",
      format: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v),
    },
    {
      label: "Clicks",
      value: summary?.clicks ?? 0,
      icon: MousePointerClick,
      color: "text-yellow-500",
    },
    {
      label: "Add to Cart",
      value: summary ? (summary as any).add_to_carts ?? 0 : 0,
      icon: ShoppingCart,
      color: "text-orange-500",
    },
    {
      label: "Purchases",
      value: summary?.purchases ?? 0,
      icon: DollarSign,
      color: "text-green-500",
    },
    {
      label: "Revenue",
      value: summary?.revenue_cents ?? 0,
      icon: TrendingUp,
      color: "text-emerald-500",
      format: (v: number) => `$${(v / 100).toFixed(2)}`,
    },
  ];

  const hasAnyData = (videoCount ?? 0) > 0 || (summary && summary.days > 0);

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Test Scoreboard</h3>
        {summary?.is_winner && (
          <Badge className="bg-green-500/20 text-green-500 border-green-500/30">🏆 Winner</Badge>
        )}
        {summary && summary.roas != null && (
          <Badge variant="outline" className="text-xs">
            ROAS {summary.roas}x
          </Badge>
        )}
      </div>

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

      {!hasAnyData && (
        <p className="text-xs text-muted-foreground text-center py-2">
          No data yet. Generate videos and log conversions to start tracking.
        </p>
      )}
    </div>
  );
}
