import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface VerticalConfig {
  id: string;
  vertical: string;
  daily_growth_target: number;
  daily_product_target: number;
  daily_app_target: number;
  growth_ratio: number;
  auto_generate: boolean;
  last_engine_run_at: string | null;
}

export interface TodaysPlan {
  config: VerticalConfig | null;
  todayGrowth: number;
  todayProduct: number;
  todayTotal: number;
  growthTarget: number;
  productTarget: number;
  growthPct: number;
  needsContent: boolean;
  suggestedProducts: Array<{
    id: string;
    name: string;
    image_url: string | null;
    price_cents: number | null;
    estimated_margin_pct: number | null;
    has_images: boolean;
    score: number;
  }>;
  topIdeas: Array<{
    id: string;
    title: string;
    opportunity_score: number | null;
    angle: string | null;
    content_type: string;
  }>;
  pendingReview: Array<{
    id: string;
    title: string | null;
    assembled_video_url: string | null;
    product_id: string | null;
    content_type: string | null;
    created_at: string;
  }>;
}

export function useVerticalEngine(vertical: string | undefined) {
  return useQuery({
    queryKey: ["vertical-engine", vertical],
    queryFn: async (): Promise<TodaysPlan> => {
      if (!vertical) throw new Error("No vertical");

      // Parallel fetch all data
      const [configRes, accountsRes, productsRes, ideasRes, imagesRes] = await Promise.all([
        supabase.from("vertical_configs").select("*").eq("vertical", vertical).single(),
        supabase.from("account_configs").select("account_id").eq("vertical", vertical as any).eq("status", "active"),
        supabase.from("products").select("id, name, image_url, price_cents, estimated_margin_pct, status, verticals").neq("status", "dead").contains("verticals", [vertical]),
        supabase.from("content_ideas").select("id, title, opportunity_score, angle, content_type, account_id, status").eq("status", "proposed").order("opportunity_score", { ascending: false }).limit(10),
        supabase.from("product_images").select("product_id").eq("verified", false),
      ]);

      const config = configRes.data as VerticalConfig | null;
      const accountIds = new Set((accountsRes.data || []).map(a => a.account_id));

      // Filter ideas to this vertical's accounts
      const verticalIdeas = (ideasRes.data || []).filter(i => accountIds.has(i.account_id));

      // Today's story jobs
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data: todayJobs } = await supabase
        .from("story_jobs")
        .select("id, title, account_id, product_id, content_type, status, assembled_status, review_status, assembled_video_url, created_at")
        .in("account_id", Array.from(accountIds))
        .gte("created_at", todayStart.toISOString());

      const jobs = todayJobs || [];
      const todayGrowth = jobs.filter(j => !j.product_id).length;
      const todayProduct = jobs.filter(j => j.product_id).length;

      // Pending review (assembled but not approved)
      const { data: reviewJobs } = await supabase
        .from("story_jobs")
        .select("id, title, assembled_video_url, product_id, content_type, created_at")
        .in("account_id", Array.from(accountIds))
        .eq("assembled_status", "succeeded")
        .or("review_status.eq.pending,review_status.is.null")
        .order("created_at", { ascending: false })
        .limit(10);

      // Score products for recommendations
      const imagesByProduct = new Map<string, number>();
      (imagesRes.data || []).forEach(img => {
        imagesByProduct.set(img.product_id, (imagesByProduct.get(img.product_id) || 0) + 1);
      });

      const scoredProducts = (productsRes.data || []).map(p => {
        let score = 0;
        if (p.image_url) score += 30;
        if (imagesByProduct.has(p.id)) score += 20;
        if (p.estimated_margin_pct && p.estimated_margin_pct > 40) score += 25;
        if (p.price_cents && p.price_cents >= 1500 && p.price_cents <= 5000) score += 15; // sweet spot
        if (p.status === "approved" || p.status === "active") score += 10;
        return {
          ...p,
          has_images: !!p.image_url || imagesByProduct.has(p.id),
          score,
        };
      }).sort((a, b) => b.score - a.score).slice(0, 5);

      const growthTarget = config?.daily_growth_target || 3;
      const productTarget = config?.daily_product_target || 1;
      const totalToday = todayGrowth + todayProduct;
      const totalTarget = growthTarget + productTarget;

      return {
        config,
        todayGrowth,
        todayProduct,
        todayTotal: totalToday,
        growthTarget,
        productTarget,
        growthPct: totalToday > 0 ? Math.round((todayGrowth / totalToday) * 100) : (config?.growth_ratio || 80),
        needsContent: totalToday < totalTarget,
        suggestedProducts: scoredProducts,
        topIdeas: verticalIdeas.slice(0, 5),
        pendingReview: reviewJobs || [],
      };
    },
    enabled: !!vertical,
    staleTime: 30_000,
  });
}

export function useRunEngine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vertical: string) => {
      const { data, error } = await supabase.functions.invoke("daily-content-engine", {
        body: { vertical },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Engine failed");
      return data;
    },
    onSuccess: (data, vertical) => {
      toast.success(`Created ${data.created} content jobs for ${vertical}`);
      queryClient.invalidateQueries({ queryKey: ["vertical-engine", vertical] });
      queryClient.invalidateQueries({ queryKey: ["vertical-detail", vertical] });
    },
    onError: (err: Error) => toast.error("Engine failed", { description: err.message }),
  });
}

export function useMatchProducts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (productId?: string) => {
      const { data, error } = await supabase.functions.invoke("match-products-verticals", {
        body: productId ? { product_id: productId } : {},
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Matched ${data.updated} products to verticals`);
      queryClient.invalidateQueries({ queryKey: ["vertical-engine"] });
    },
    onError: (err: Error) => toast.error("Matching failed", { description: err.message }),
  });
}

export function useUpdateVerticalConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ vertical, updates }: { vertical: string; updates: Partial<VerticalConfig> }) => {
      const { error } = await supabase
        .from("vertical_configs")
        .update(updates)
        .eq("vertical", vertical);
      if (error) throw error;
    },
    onSuccess: (_, { vertical }) => {
      toast.success("Config updated");
      queryClient.invalidateQueries({ queryKey: ["vertical-engine", vertical] });
    },
  });
}
