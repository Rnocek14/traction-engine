/**
 * calculate-unit-economics
 * 
 * Computes full margin model for a product using best supplier data.
 * Writes to product_unit_economics table.
 * Can be called standalone or auto-triggered after product-research.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EconomicsInput {
  product_id: string;
  // Optional overrides (if not provided, pulled from DB)
  retail_price_cents?: number;
  supplier_cost_cents?: number;
  shipping_cost_cents?: number;
  packaging_cost_cents?: number;
  platform_fee_pct?: number;
  payment_fee_pct?: number;
  expected_return_rate_pct?: number;
  content_cost_per_sale_cents?: number;
}

function computeDeliveryGrade(totalDays: number): string {
  if (totalDays <= 7) return "excellent";
  if (totalDays <= 12) return "good";
  if (totalDays <= 20) return "risky";
  return "bad";
}

function computeViabilityGrade(netMarginPct: number, supplierScore: number | null, totalDeliveryDays: number | null): string {
  const supplierFactor = supplierScore ? supplierScore / 5 : 0.5;
  const deliveryPenalty = totalDeliveryDays && totalDeliveryDays > 20 ? 0.7 : totalDeliveryDays && totalDeliveryDays > 15 ? 0.85 : 1;
  const adjustedMargin = netMarginPct * supplierFactor * deliveryPenalty;

  if (adjustedMargin >= 30) return "A";
  if (adjustedMargin >= 20) return "B";
  if (adjustedMargin >= 10) return "C";
  if (adjustedMargin >= 0) return "D";
  return "F";
}

/** Kill conditions: returns reason string or null if viable */
function checkKillConditions(netMarginPct: number, totalDeliveryDays: number | null, supplierScore: number | null): string | null {
  const reasons: string[] = [];
  if (netMarginPct < 10) reasons.push(`net margin ${netMarginPct.toFixed(1)}% < 10%`);
  if (totalDeliveryDays && totalDeliveryDays > 15) reasons.push(`delivery ${totalDeliveryDays}d > 15d`);
  if (supplierScore !== null && supplierScore < 50) reasons.push(`supplier score ${supplierScore} < 50`);
  return reasons.length > 0 ? reasons.join("; ") : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: EconomicsInput = await req.json();
    const { product_id } = body;

    if (!product_id) {
      return new Response(JSON.stringify({ error: "product_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get product
    const { data: product, error: prodErr } = await supabase
      .from("products")
      .select("id, name, price_cents, supplier_price_cents")
      .eq("id", product_id)
      .single();

    if (prodErr || !product) {
      return new Response(JSON.stringify({ error: "Product not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get best supplier (preferred first, then highest score)
    const { data: suppliers } = await supabase
      .from("product_suppliers")
      .select("*")
      .eq("product_id", product_id)
      .order("is_preferred", { ascending: false })
      .order("overall_supplier_score", { ascending: false })
      .limit(1);

    const bestSupplier = suppliers?.[0] || null;
    const totalDeliveryDays = bestSupplier 
      ? (bestSupplier.processing_days || 0) + (bestSupplier.delivery_days || 0) 
      : null;
    const deliveryGrade = totalDeliveryDays ? computeDeliveryGrade(totalDeliveryDays) : null;

    // Resolve values: overrides > supplier data > product data > defaults
    const retailPriceCents = body.retail_price_cents || product.price_cents;
    const supplierCostCents = body.supplier_cost_cents || bestSupplier?.unit_cost_cents || product.supplier_price_cents;
    const shippingCostCents = body.shipping_cost_cents ?? bestSupplier?.shipping_cost_cents ?? 0;
    const packagingCostCents = body.packaging_cost_cents ?? 0;
    const platformFeePct = body.platform_fee_pct ?? 5.00; // TikTok Shop ~5%, Shopify varies
    const paymentFeePct = body.payment_fee_pct ?? 2.90; // Stripe/PayPal standard
    const expectedReturnRatePct = body.expected_return_rate_pct ?? bestSupplier?.expected_return_rate_pct ?? 5.00;
    const contentCostPerSaleCents = body.content_cost_per_sale_cents ?? 0;

    if (!retailPriceCents || !supplierCostCents) {
      return new Response(JSON.stringify({
        error: "Cannot compute economics: missing retail_price or supplier_cost. Run product-research first or provide overrides.",
        has_retail_price: !!retailPriceCents,
        has_supplier_cost: !!supplierCostCents,
      }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === COMPUTE ECONOMICS ===
    
    // Gross margin = retail - supplier - shipping - packaging
    const cogs = supplierCostCents + shippingCostCents + packagingCostCents;
    const grossMarginCents = retailPriceCents - cogs;
    const grossMarginPct = Math.round((grossMarginCents / retailPriceCents) * 10000) / 100;

    // Platform + payment fees
    const platformFeeCents = Math.round(retailPriceCents * platformFeePct / 100);
    const paymentFeeCents = Math.round(retailPriceCents * paymentFeePct / 100);

    // Refund cost allocation (expected returns reduce margin)
    const refundCostCents = Math.round(retailPriceCents * expectedReturnRatePct / 100);

    // Net margin = gross - fees - refund allocation - content cost
    const netMarginCents = grossMarginCents - platformFeeCents - paymentFeeCents - refundCostCents - contentCostPerSaleCents;
    const netMarginPct = Math.round((netMarginCents / retailPriceCents) * 10000) / 100;

    // Break-even: how many units to cover a $50 content cost assumption
    const contentFixedCost = 5000; // $50 per content piece assumption
    const breakEvenUnits = netMarginCents > 0 ? Math.ceil(contentFixedCost / netMarginCents) : 999;

    // Break-even CPA: max you can pay per acquisition
    const breakEvenCpaCents = Math.max(0, netMarginCents);

    // Break-even ROAS: minimum return needed
    const breakEvenRoas = netMarginCents > 0
      ? Math.round((retailPriceCents / netMarginCents) * 100) / 100
      : 999.99;

    // Viability grade (now includes delivery penalty)
    const viabilityGrade = computeViabilityGrade(netMarginPct, bestSupplier?.overall_supplier_score || null, totalDeliveryDays);

    // Kill condition check
    const killReason = checkKillConditions(netMarginPct, totalDeliveryDays, bestSupplier?.overall_supplier_score || null);

    const economicsRow = {
      product_id,
      retail_price_cents: retailPriceCents,
      supplier_cost_cents: supplierCostCents,
      shipping_cost_cents: shippingCostCents,
      packaging_cost_cents: packagingCostCents,
      platform_fee_pct: platformFeePct,
      payment_fee_pct: paymentFeePct,
      expected_return_rate_pct: expectedReturnRatePct,
      content_cost_per_sale_cents: contentCostPerSaleCents,
      gross_margin_cents: grossMarginCents,
      gross_margin_pct: grossMarginPct,
      net_margin_cents: netMarginCents,
      net_margin_pct: netMarginPct,
      break_even_units: breakEvenUnits,
      break_even_cpa_cents: breakEvenCpaCents,
      break_even_roas: breakEvenRoas,
      viability_grade: viabilityGrade,
      calculator_version: "v2",
      calculated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Upsert (product_id is UNIQUE)
    const { error: upsertErr } = await supabase
      .from("product_unit_economics")
      .upsert(economicsRow, { onConflict: "product_id" });

    if (upsertErr) throw new Error(`Failed to save economics: ${upsertErr.message}`);

    // AUTO-BLOCK: If kill conditions are met, set product status to "dead"
    if (killReason) {
      console.warn(`[unit-economics] KILL: ${product.name} — ${killReason}`);
      await supabase.from("products").update({ 
        status: "dead",
        notes: `Auto-blocked: ${killReason}`,
        updated_at: new Date().toISOString(),
      }).eq("id", product_id);
    }

    console.log(`[unit-economics] ${product.name}: grade=${viabilityGrade}, net_margin=${netMarginPct}%, delivery=${totalDeliveryDays || "?"}d, kill=${killReason || "none"}`);

    return new Response(JSON.stringify({
      success: true,
      product_id,
      viability_grade: viabilityGrade,
      gross_margin_pct: grossMarginPct,
      net_margin_pct: netMarginPct,
      break_even_units: breakEvenUnits,
      break_even_cpa_cents: breakEvenCpaCents,
      break_even_roas: breakEvenRoas,
      delivery_grade: deliveryGrade,
      total_delivery_days: totalDeliveryDays,
      kill_reason: killReason,
      blocked: !!killReason,
      inputs: {
        retail_price_cents: retailPriceCents,
        supplier_cost_cents: supplierCostCents,
        shipping_cost_cents: shippingCostCents,
        packaging_cost_cents: packagingCostCents,
        platform_fee_pct: platformFeePct,
        payment_fee_pct: paymentFeePct,
        expected_return_rate_pct: expectedReturnRatePct,
      },
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[unit-economics] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
