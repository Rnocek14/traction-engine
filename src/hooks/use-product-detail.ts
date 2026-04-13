import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ProductWithAnalysis } from "./use-products";

export function useProductDetail(productId: string | undefined) {
  return useQuery({
    queryKey: ["product-detail", productId],
    queryFn: async () => {
      if (!productId) throw new Error("No product ID");
      const { data, error } = await supabase
        .from("products")
        .select("*, product_analysis(*), product_images(*), product_links(*), product_suppliers!product_suppliers_product_id_fkey(*), product_unit_economics(*)")
        .eq("id", productId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Product not found");
      
      // Normalize one-to-one relations that come back as objects into arrays
      const normalized = {
        ...data,
        product_analysis: data.product_analysis
          ? Array.isArray(data.product_analysis) ? data.product_analysis : [data.product_analysis]
          : [],
        product_images: Array.isArray(data.product_images) ? data.product_images : data.product_images ? [data.product_images] : [],
        product_links: Array.isArray(data.product_links) ? data.product_links : data.product_links ? [data.product_links] : [],
        product_suppliers: Array.isArray(data.product_suppliers) ? data.product_suppliers : data.product_suppliers ? [data.product_suppliers] : [],
        product_unit_economics: data.product_unit_economics
          ? Array.isArray(data.product_unit_economics) ? data.product_unit_economics : [data.product_unit_economics]
          : [],
      };
      return normalized as unknown as ProductWithAnalysis;
    },
    enabled: !!productId,
  });
}

export function useProductDecisions(productId: string | undefined) {
  return useQuery({
    queryKey: ["product-decisions", productId],
    queryFn: async () => {
      if (!productId) throw new Error("No product ID");
      const { data, error } = await supabase
        .from("product_decisions")
        .select("*")
        .eq("product_id", productId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!productId,
  });
}

export function useProductMarketSnapshot(productId: string | undefined) {
  return useQuery({
    queryKey: ["product-market-snapshot", productId],
    queryFn: async () => {
      if (!productId) throw new Error("No product ID");
      const { data, error } = await supabase
        .from("product_market_snapshots")
        .select("*")
        .eq("product_id", productId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!productId,
  });
}
