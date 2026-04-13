import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type ProductStatus = "discovered" | "researching" | "approved" | "active" | "test_listing" | "scaled_listing" | "paused" | "dead";
export type TrendingStatus = "emerging" | "rising" | "peak" | "declining" | "saturated";

export interface Product {
  id: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  source_url: string | null;
  image_url: string | null;
  price_cents: number | null;
  supplier_price_cents: number | null;
  estimated_margin_pct: number | null;
  supplier_url: string | null;
  shipping_days: number | null;
  status: ProductStatus;
  discovered_via: string;
  notes: string | null;
  marketing_plan: any | null;
  plan_generated_at: string | null;
  plan_version: number;
  plan_status: string;
  created_at: string;
  purchase_url: string | null;
  updated_at: string;
}

export interface ProductAnalysis {
  id: string;
  product_id: string;
  wow_factor: number | null;
  social_media_potential: number | null;
  impulse_buy_appeal: number | null;
  demonstrability_score: number | null;
  competition_level: number | null;
  price_sweet_spot: boolean | null;
  emotional_triggers: string[];
  trending_status: string | null;
  overall_score: number | null;
  analyzed_by: string | null;
  analyzed_at: string | null;
}

export interface ProductImage {
  id: string;
  url: string;
  source: string;
  label: string;
  is_primary: boolean;
  verified: boolean;
}

export interface ProductLink {
  id: string;
  url: string;
  link_type: string;
  platform: string;
  price_cents: number | null;
  title: string | null;
  verified: boolean;
  match_confidence: number | null;
  validation_status: string | null;
  validation_reasons: string[] | null;
  matched_tokens: string[] | null;
  distinctive_tokens_matched: string[] | null;
  ai_verdict: boolean | null;
  ai_confidence: number | null;
  fetch_method: string | null;
  extracted_product_name: string | null;
  structured_price_cents: number | null;
  content_quality_score: number | null;
  evidence_summary: Record<string, number> | null;
}

export interface ProductSupplier {
  id: string;
  supplier_name: string;
  platform: string;
  supplier_url: string | null;
  unit_cost_cents: number | null;
  shipping_cost_cents: number | null;
  shipping_country: string | null;
  target_market: string | null;
  processing_days: number | null;
  delivery_days: number | null;
  moq: number | null;
  reliability_score: number | null;
  defect_risk: number | null;
  communication_score: number | null;
  stock_status: string;
  expected_return_rate_pct: number | null;
  overall_supplier_score: number | null;
  verification_status: string;
  is_preferred: boolean;
  notes: string | null;
}

export interface ProductUnitEconomics {
  id: string;
  retail_price_cents: number;
  supplier_cost_cents: number;
  shipping_cost_cents: number;
  packaging_cost_cents: number;
  platform_fee_pct: number;
  payment_fee_pct: number;
  expected_return_rate_pct: number;
  content_cost_per_sale_cents: number;
  gross_margin_cents: number | null;
  gross_margin_pct: number | null;
  net_margin_cents: number | null;
  net_margin_pct: number | null;
  break_even_units: number | null;
  break_even_cpa_cents: number | null;
  break_even_roas: number | null;
  viability_grade: string | null;
  calculated_at: string;
}

export interface ProductWithAnalysis extends Product {
  product_analysis: ProductAnalysis[] | null;
  product_images: ProductImage[] | null;
  product_links: ProductLink[] | null;
  product_suppliers: ProductSupplier[] | null;
  product_unit_economics: ProductUnitEconomics[] | null;
}

export function useProducts(statusFilter?: ProductStatus) {
  return useQuery({
    queryKey: ["products", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("products")
        .select("*, product_analysis(*), product_images(*), product_links(*), product_suppliers!product_suppliers_product_id_fkey(*), product_unit_economics(*)")
        .order("created_at", { ascending: false });

      if (statusFilter) {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as ProductWithAnalysis[];
    },
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (product: {
      name: string;
      category?: string;
      subcategory?: string;
      source_url?: string;
      image_url?: string;
      price_cents?: number;
      supplier_price_cents?: number;
      supplier_url?: string;
      shipping_days?: number;
      notes?: string;
    }) => {
      const margin =
        product.price_cents && product.supplier_price_cents
          ? Math.round(((product.price_cents - product.supplier_price_cents) / product.price_cents) * 100)
          : null;

      const { data, error } = await supabase
        .from("products")
        .insert({ ...product, estimated_margin_pct: margin })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Product added");
    },
    onError: (e) => toast.error(`Failed to add product: ${e.message}`),
  });
}

export function useUpdateProductStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ProductStatus }) => {
      const { error } = await supabase.from("products").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Status updated");
    },
    onError: (e) => toast.error(e.message),
  });
}

export function useResearchProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { product_id?: string; url?: string; name?: string }) => {
      const { data, error } = await supabase.functions.invoke("product-research", {
        body: params,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["products"] });
      const parts = [`Score: ${data.overall_score}/100`];
      if (data.images_found) parts.push(`${data.images_found} images`);
      if (data.links_found) parts.push(`${data.links_found} verified links`);
      toast.success(`Research complete — ${parts.join(", ")}`);
    },
    onError: (e) => toast.error(`Research failed: ${e.message}`),
  });
}

export function useDiscoverProducts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (categories?: string[] | void) => {
      const { data, error } = await supabase.functions.invoke("auto-scrape-products", {
        body: categories ? { categories } : {},
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success(`Discovered ${data.products_added} new products`);
    },
    onError: (e) => toast.error(`Discovery failed: ${e.message}`),
  });
}

export function useSaveProductAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (analysis: {
      product_id: string;
      wow_factor: number;
      social_media_potential: number;
      impulse_buy_appeal: number;
      demonstrability_score: number;
      competition_level: number;
      price_sweet_spot: boolean;
      emotional_triggers: string[];
      trending_status: string;
    }) => {
      const overall = Math.round(
        ((analysis.wow_factor + analysis.social_media_potential + analysis.impulse_buy_appeal + analysis.demonstrability_score + (6 - analysis.competition_level)) / 25) * 100
      );

      const { data, error } = await supabase
        .from("product_analysis")
        .upsert(
          { ...analysis, overall_score: overall, analyzed_by: "manual", analyzed_at: new Date().toISOString() },
          { onConflict: "product_id" }
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Analysis saved");
    },
    onError: (e) => toast.error(e.message),
  });
}

export function useGenerateProductPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (productId: string) => {
      const { data, error } = await supabase.functions.invoke("generate-product-plan", {
        body: { product_id: productId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["content-ideas"] });
      toast.success(`Marketing plan v${data.plan_version} generated with ${data.ideas_created} content ideas`);
    },
    onError: (e) => toast.error(`Plan generation failed: ${e.message}`),
  });
}

export function useProductLinkedIdeas(productId: string) {
  return useQuery({
    queryKey: ["product-ideas", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_ideas")
        .select("id, title, status, angle, suggested_format, account_id")
        .eq("product_id", productId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!productId,
  });
}

export function useAssignProductAccounts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (productId: string) => {
      const { data, error } = await supabase.functions.invoke("assign-product-accounts", {
        body: { product_id: productId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["product-ideas", data.product_id] });
      qc.invalidateQueries({ queryKey: ["content-ideas"] });
      toast.success(`Assigned to ${data.assignments?.length || 0} accounts, ${data.ideas_created || 0} ideas created`);
    },
    onError: (e) => toast.error(`Assignment failed: ${e.message}`),
  });
}
