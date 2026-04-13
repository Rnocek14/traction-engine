/**
 * ingest-conversions
 * 
 * Accepts manual or API conversion data for products/videos.
 * Computes derived metrics (ROAS, profit, conversion rate).
 * Upserts into product_conversions and/or video_conversions.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ConversionInput {
  product_id: string;
  date: string; // YYYY-MM-DD
  source?: string; // tiktok_shop, shopify, manual
  
  // Funnel
  impressions?: number;
  clicks?: number;
  add_to_carts?: number;
  purchases?: number;
  
  // Revenue
  revenue_cents?: number;
  refunds?: number;
  refund_amount_cents?: number;
  
  // Costs
  ad_spend_cents?: number;
  
  // Optional video-level data
  video_entries?: {
    story_job_id?: string;
    platform?: string;
    external_post_id?: string;
    impressions?: number;
    clicks?: number;
    add_to_carts?: number;
    purchases?: number;
    revenue_cents?: number;
    ad_spend_cents?: number;
  }[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: ConversionInput = await req.json();
    const { product_id, date } = body;

    if (!product_id || !date) {
      return new Response(JSON.stringify({ error: "product_id and date required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get product economics for COGS calculation
    const { data: economics } = await supabase
      .from("product_unit_economics")
      .select("supplier_cost_cents, shipping_cost_cents")
      .eq("product_id", product_id)
      .maybeSingle();

    const cogsPerUnit = economics 
      ? (economics.supplier_cost_cents || 0) + (economics.shipping_cost_cents || 0) 
      : 0;

    const source = body.source || "manual";
    const purchases = body.purchases || 0;
    const revenueCents = body.revenue_cents || 0;
    const adSpendCents = body.ad_spend_cents || 0;
    const refundAmountCents = body.refund_amount_cents || 0;
    const clicks = body.clicks || 0;

    const cogsCents = cogsPerUnit * purchases;
    const grossProfitCents = revenueCents - cogsCents - refundAmountCents;
    const netProfitCents = grossProfitCents - adSpendCents;
    const roas = adSpendCents > 0 ? Math.round((revenueCents / adSpendCents) * 100) / 100 : null;
    const conversionRate = clicks > 0 ? Math.round((purchases / clicks) * 10000) / 10000 : null;
    const cpaCents = purchases > 0 ? Math.round(adSpendCents / purchases) : null;

    // Upsert product conversion
    const { error: pcErr } = await supabase
      .from("product_conversions")
      .upsert({
        product_id,
        date,
        source,
        impressions: body.impressions || 0,
        clicks,
        add_to_carts: body.add_to_carts || 0,
        purchases,
        revenue_cents: revenueCents,
        refunds: body.refunds || 0,
        refund_amount_cents: refundAmountCents,
        ad_spend_cents: adSpendCents,
        cogs_cents: cogsCents,
        gross_profit_cents: grossProfitCents,
        net_profit_cents: netProfitCents,
        roas,
        conversion_rate: conversionRate,
        cost_per_acquisition_cents: cpaCents,
      }, { onConflict: "product_id,date,source" });

    if (pcErr) throw new Error(`Failed to save product conversion: ${pcErr.message}`);

    // Process video-level entries if provided
    let videosSaved = 0;
    if (body.video_entries?.length) {
      for (const v of body.video_entries) {
        const vClicks = v.clicks || 0;
        const vPurchases = v.purchases || 0;
        const vRevenue = v.revenue_cents || 0;
        const vAdSpend = v.ad_spend_cents || 0;

        const { error: vcErr } = await supabase
          .from("video_conversions")
          .upsert({
            story_job_id: v.story_job_id || null,
            product_id,
            platform: v.platform || "tiktok",
            external_post_id: v.external_post_id || null,
            date,
            impressions: v.impressions || 0,
            clicks: vClicks,
            add_to_carts: v.add_to_carts || 0,
            purchases: vPurchases,
            revenue_cents: vRevenue,
            ad_spend_cents: vAdSpend,
            roas: vAdSpend > 0 ? Math.round((vRevenue / vAdSpend) * 100) / 100 : null,
            ctr: (v.impressions || 0) > 0 ? Math.round((vClicks / (v.impressions || 1)) * 10000) / 10000 : null,
            conversion_rate: vClicks > 0 ? Math.round((vPurchases / vClicks) * 10000) / 10000 : null,
          }, { onConflict: "story_job_id,date,platform" });

        if (vcErr) console.warn("[ingest-conversions] Video entry error:", vcErr);
        else videosSaved++;
      }
    }

    console.log(`[ingest-conversions] ${product_id} ${date}: ${purchases} purchases, $${(revenueCents/100).toFixed(2)} revenue, ROAS=${roas}, profit=$${(netProfitCents/100).toFixed(2)}`);

    return new Response(JSON.stringify({
      success: true,
      product_id,
      date,
      purchases,
      revenue_cents: revenueCents,
      gross_profit_cents: grossProfitCents,
      net_profit_cents: netProfitCents,
      roas,
      conversion_rate: conversionRate,
      videos_saved: videosSaved,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[ingest-conversions] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
