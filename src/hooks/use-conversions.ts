import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ProductConversion {
  id: string;
  product_id: string;
  date: string;
  source: string;
  impressions: number;
  clicks: number;
  add_to_carts: number;
  purchases: number;
  revenue_cents: number;
  refunds: number;
  refund_amount_cents: number;
  ad_spend_cents: number;
  cogs_cents: number;
  gross_profit_cents: number | null;
  net_profit_cents: number | null;
  roas: number | null;
  conversion_rate: number | null;
  cost_per_acquisition_cents: number | null;
  created_at: string;
}

export function useProductConversions(productId: string) {
  return useQuery({
    queryKey: ["product-conversions", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_conversions")
        .select("*")
        .eq("product_id", productId)
        .order("date", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data as unknown as ProductConversion[];
    },
    enabled: !!productId,
  });
}

export function useProductConversionSummary(productId: string) {
  return useQuery({
    queryKey: ["product-conversion-summary", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_conversions")
        .select("*")
        .eq("product_id", productId)
        .order("date", { ascending: false });
      if (error) throw error;
      const rows = (data || []) as unknown as ProductConversion[];
      if (rows.length === 0) return null;

      const totals = rows.reduce((acc, r) => ({
        impressions: acc.impressions + (r.impressions || 0),
        clicks: acc.clicks + (r.clicks || 0),
        purchases: acc.purchases + (r.purchases || 0),
        revenue_cents: acc.revenue_cents + (r.revenue_cents || 0),
        ad_spend_cents: acc.ad_spend_cents + (r.ad_spend_cents || 0),
        gross_profit_cents: acc.gross_profit_cents + (r.gross_profit_cents || 0),
        net_profit_cents: acc.net_profit_cents + (r.net_profit_cents || 0),
        refunds: acc.refunds + (r.refunds || 0),
        days: acc.days + 1,
      }), { impressions: 0, clicks: 0, purchases: 0, revenue_cents: 0, ad_spend_cents: 0, gross_profit_cents: 0, net_profit_cents: 0, refunds: 0, days: 0 });

      return {
        ...totals,
        roas: totals.ad_spend_cents > 0 ? Math.round((totals.revenue_cents / totals.ad_spend_cents) * 100) / 100 : null,
        conversion_rate: totals.clicks > 0 ? Math.round((totals.purchases / totals.clicks) * 10000) / 10000 : null,
        avg_daily_revenue: totals.days > 0 ? Math.round(totals.revenue_cents / totals.days) : 0,
        is_winner: totals.purchases >= 5 && (totals.net_profit_cents > 0),
      };
    },
    enabled: !!productId,
  });
}

export function useIngestConversion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      product_id: string;
      date: string;
      source?: string;
      impressions?: number;
      clicks?: number;
      add_to_carts?: number;
      purchases?: number;
      revenue_cents?: number;
      refunds?: number;
      refund_amount_cents?: number;
      ad_spend_cents?: number;
    }) => {
      const { data: result, error } = await supabase.functions.invoke("ingest-conversions", {
        body: data,
      });
      if (error) throw error;
      return result;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["product-conversions"] });
      qc.invalidateQueries({ queryKey: ["product-conversion-summary"] });
      toast.success(`Saved: ${result.purchases} purchases, $${(result.revenue_cents / 100).toFixed(2)} revenue${result.roas ? `, ROAS ${result.roas}x` : ""}`);
    },
    onError: (e) => toast.error(`Ingest failed: ${e.message}`),
  });
}
