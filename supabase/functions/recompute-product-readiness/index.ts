/**
 * recompute-product-readiness
 * 
 * Standalone function to recalculate a product's readiness score,
 * identity confidence, and preferred links after any changes.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { product_id } = await req.json();
    if (!product_id) throw new Error("product_id required");

    const { data: links } = await supabase.from("product_links").select("*").eq("product_id", product_id);
    const { data: images } = await supabase.from("product_images").select("*").eq("product_id", product_id);
    const { data: suppliers } = await supabase.from("product_suppliers").select("*").eq("product_id", product_id);
    const { data: economics } = await supabase.from("product_unit_economics").select("*").eq("product_id", product_id).maybeSingle();

    const confirmedRetail = (links || []).filter((l: any) => l.validation_status === "confirmed" && l.link_type === "retail");
    const confirmedWholesale = (links || []).filter((l: any) => l.validation_status === "confirmed" && l.link_type === "wholesale");
    const verifiedImages = (images || []).filter((i: any) => i.verified || i.manually_approved);

    const retailScore = Math.min(confirmedRetail.length * 15, 30);
    const wholesaleScore = Math.min(confirmedWholesale.length * 15, 20);
    const imageScore = Math.min(verifiedImages.length * 5, 20);
    const supplierScore = suppliers?.some((s: any) => s.is_preferred) ? 15 : 0;
    const priceScore = confirmedRetail.some((l: any) => l.price_cents) ? 15 : 0;

    const readinessScore = retailScore + wholesaleScore + imageScore + supplierScore + priceScore;

    const confirmedAll = [...confirmedRetail, ...confirmedWholesale];
    const identityConfidence = confirmedAll.length > 0
      ? Math.round(confirmedAll.reduce((sum: number, l: any) => sum + (l.match_confidence || 0), 0) / confirmedAll.length)
      : 0;

    let readinessState = "research_only";
    if (readinessScore >= 60) readinessState = "ad_ready";
    else if (readinessScore >= 40) readinessState = "needs_assets";
    else if (confirmedRetail.length > 0) readinessState = "links_verified";

    const bestRetail = confirmedRetail.sort((a: any, b: any) => (b.match_confidence || 0) - (a.match_confidence || 0))[0];

    await supabase.from("products").update({
      readiness_score: readinessScore,
      readiness_state: readinessState,
      identity_confidence: identityConfidence,
      purchase_url: bestRetail?.url || null,
      retail_anchor_price_cents: bestRetail?.price_cents || null,
      updated_at: new Date().toISOString(),
    }).eq("id", product_id);

    return new Response(JSON.stringify({
      success: true,
      readiness_score: readinessScore,
      readiness_state: readinessState,
      identity_confidence: identityConfidence,
      confirmed_retail: confirmedRetail.length,
      confirmed_wholesale: confirmedWholesale.length,
      verified_images: verifiedImages.length,
      has_economics: !!economics,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
