import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface VerticalSummary {
  vertical: string;
  accounts: Array<{
    id: string;
    account_id: string;
    account_name: string | null;
    platform: string;
    monetization_mode: string;
    handle: string | null;
  }>;
  monetization_mode: "app_first" | "product_first" | "mixed";
  stats: {
    totalContent: number;
    generating: number;
    assembled: number;
    approved: number;
    products: number;
    ideas: number;
  };
}

export function useVerticals() {
  return useQuery({
    queryKey: ["verticals-summary"],
    queryFn: async (): Promise<VerticalSummary[]> => {
      const [accountsRes, storiesRes, productsRes, ideasRes] = await Promise.all([
        supabase.from("account_configs").select("id, account_id, account_name, platform, vertical, monetization_mode, handle, status").eq("status", "active"),
        supabase.from("story_jobs").select("id, account_id, status, assembled_status, review_status").order("created_at", { ascending: false }).limit(500),
        supabase.from("products").select("id, status, marketing_plan").neq("status", "dead"),
        supabase.from("content_ideas").select("id, account_id, status").limit(500),
      ]);

      const accounts = accountsRes.data || [];
      const stories = storiesRes.data || [];
      const products = productsRes.data || [];
      const ideas = ideasRes.data || [];

      // Group accounts by vertical
      const verticalMap = new Map<string, typeof accounts>();
      accounts.forEach(a => {
        const list = verticalMap.get(a.vertical) || [];
        list.push(a);
        verticalMap.set(a.vertical, list);
      });

      // Build account_id -> vertical lookup
      const accountVertical = new Map<string, string>();
      accounts.forEach(a => accountVertical.set(a.account_id, a.vertical));

      // Count stories per vertical
      const verticalStories = new Map<string, typeof stories>();
      stories.forEach(s => {
        const v = accountVertical.get(s.account_id);
        if (v) {
          const list = verticalStories.get(v) || [];
          list.push(s);
          verticalStories.set(v, list);
        }
      });

      // Count ideas per vertical
      const verticalIdeas = new Map<string, number>();
      ideas.forEach(i => {
        const v = accountVertical.get(i.account_id);
        if (v) verticalIdeas.set(v, (verticalIdeas.get(v) || 0) + 1);
      });

      // Products with marketing_plan that reference accounts
      // For now, count all non-dead products as available
      const totalProducts = products.length;

      const verticals: VerticalSummary[] = [];
      
      for (const [vertical, accts] of verticalMap) {
        const vStories = verticalStories.get(vertical) || [];
        const modes = accts.map(a => a.monetization_mode);
        const allApp = modes.every(m => m === "app_first");
        const allProduct = modes.every(m => m === "product_first");

        verticals.push({
          vertical,
          accounts: accts.map(a => ({
            id: a.id,
            account_id: a.account_id,
            account_name: a.account_name,
            platform: a.platform,
            monetization_mode: a.monetization_mode,
            handle: a.handle,
          })),
          monetization_mode: allApp ? "app_first" : allProduct ? "product_first" : "mixed",
          stats: {
            totalContent: vStories.length,
            generating: vStories.filter(s => s.status === "generating").length,
            assembled: vStories.filter(s => s.assembled_status === "succeeded").length,
            approved: vStories.filter(s => s.review_status === "approved").length,
            products: totalProducts, // will refine with product-vertical assignment later
            ideas: verticalIdeas.get(vertical) || 0,
          },
        });
      }

      // Sort: product_first verticals first (more actionable), then by account count
      verticals.sort((a, b) => {
        if (a.monetization_mode === "product_first" && b.monetization_mode !== "product_first") return -1;
        if (b.monetization_mode === "product_first" && a.monetization_mode !== "product_first") return 1;
        return b.accounts.length - a.accounts.length;
      });

      return verticals;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
