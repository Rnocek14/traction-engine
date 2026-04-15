/**
 * select-best-supplier
 * 
 * Scores top enriched wholesale candidates for a product and picks the best one.
 * Creates/updates the preferred supplier record and triggers economics.
 * 
 * Scoring weights:
 *   Price (30%) — lower unit cost wins
 *   Shipping (25%) — faster delivery wins  
 *   Match Confidence (25%) — higher validation confidence wins
 *   Asset Quality (10%) — more usable images wins
 *   Completeness (10%) — more structured data wins
 * 
 * Called after enrich-product-links + validate-product-links have run.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── SCORING WEIGHTS ───

const WEIGHTS = {
  price: 0.30,
  shipping: 0.25,
  match_confidence: 0.25,
  asset_quality: 0.10,
  completeness: 0.10,
};

// ─── SCORING HELPERS ───

interface CandidateLink {
  id: string;
  url: string;
  platform: string;
  title: string | null;
  extracted_product_name: string | null;
  price_cents: number | null;
  structured_price_cents: number | null;
  match_confidence: number | null;
  source_image_urls: string[] | null;
  source_features: string[] | null;
  source_specs: any;
  source_title_full: string | null;
  source_brand: string | null;
  fetch_method: string | null;
  validation_status: string | null;
}

interface ScoredCandidate {
  link: CandidateLink;
  price_cents: number | null;
  scores: {
    price: number;
    shipping: number;
    match_confidence: number;
    asset_quality: number;
    completeness: number;
    total: number;
  };
}

function detectShippingScore(platform: string, url: string): number {
  // Platform-based shipping heuristics
  // AliExpress standard: ~15-25 days → moderate
  // Alibaba: varies, but usually slower for small orders
  // 1688: China domestic, fast internally but slow internationally
  // DHgate: similar to AliExpress
  // US-based/Amazon wholesale: fastest
  const lower = (platform + " " + url).toLowerCase();
  if (lower.includes("amazon") || lower.includes(".com/dp/")) return 90;
  if (lower.includes("aliexpress")) return 50;
  if (lower.includes("dhgate")) return 45;
  if (lower.includes("alibaba.com")) return 40;
  if (lower.includes("1688")) return 30;
  if (lower.includes("temu")) return 55;
  return 40; // unknown
}

function scoreCandidate(link: CandidateLink, allPrices: number[]): ScoredCandidate {
  const priceCents = link.price_cents || link.structured_price_cents;
  
  // ── Price score (0-100): lower is better, relative to group ──
  let priceScore = 50; // default if no price
  if (priceCents && allPrices.length > 0) {
    const minPrice = Math.min(...allPrices);
    const maxPrice = Math.max(...allPrices);
    if (maxPrice > minPrice) {
      // 100 = cheapest, 0 = most expensive
      priceScore = Math.round(((maxPrice - priceCents) / (maxPrice - minPrice)) * 100);
    } else {
      priceScore = 80; // all same price
    }
  } else if (!priceCents) {
    priceScore = 20; // no price = penalized
  }

  // ── Shipping score (0-100): platform-based heuristic ──
  const shippingScore = detectShippingScore(link.platform || "", link.url);

  // ── Match confidence (0-100): from validation ──
  const matchScore = Math.min(100, Math.max(0, link.match_confidence || 0));

  // ── Asset quality (0-100): based on image count ──
  const imageCount = link.source_image_urls?.length || 0;
  const assetScore = Math.min(100, imageCount * 20); // 5+ images = 100

  // ── Completeness (0-100): how much structured data exists ──
  let completenessPoints = 0;
  if (link.source_title_full) completenessPoints += 20;
  if (link.source_brand) completenessPoints += 15;
  if (priceCents) completenessPoints += 25;
  if (link.source_features && link.source_features.length > 0) completenessPoints += 20;
  if (link.source_specs && Object.keys(link.source_specs).length > 0) completenessPoints += 20;
  const completenessScore = Math.min(100, completenessPoints);

  // ── Weighted total ──
  const total = Math.round(
    priceScore * WEIGHTS.price +
    shippingScore * WEIGHTS.shipping +
    matchScore * WEIGHTS.match_confidence +
    assetScore * WEIGHTS.asset_quality +
    completenessScore * WEIGHTS.completeness
  );

  return {
    link,
    price_cents: priceCents,
    scores: {
      price: priceScore,
      shipping: shippingScore,
      match_confidence: matchScore,
      asset_quality: assetScore,
      completeness: completenessScore,
      total,
    },
  };
}

// ─── MAIN HANDLER ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { product_id, top_n = 3, dry_run = false } = await req.json();

    if (!product_id) {
      return new Response(JSON.stringify({ error: "product_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Fetch product ──
    const { data: product, error: prodErr } = await supabase
      .from("products")
      .select("id, name, price_cents, supplier_price_cents, preferred_supplier_id")
      .eq("id", product_id)
      .single();

    if (prodErr || !product) {
      return new Response(JSON.stringify({ error: "Product not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Get top enriched wholesale links ──
    // Include all enrichment statuses that indicate data was fetched
    const { data: candidates, error: linkErr } = await supabase
      .from("product_links")
      .select("id, url, platform, title, extracted_product_name, price_cents, structured_price_cents, match_confidence, source_image_urls, source_features, source_specs, source_title_full, source_brand, fetch_method, validation_status")
      .eq("product_id", product_id)
      .eq("link_type", "wholesale")
      .in("source_enrichment_status", ["done", "partial", "enriched"])
      .order("match_confidence", { ascending: false })
      .limit(top_n * 3);

    if (linkErr) throw new Error(`Failed to fetch candidates: ${linkErr.message}`);

    // First try: non-rejected candidates with data
    let validCandidates = (candidates || []).filter((c: CandidateLink) => {
      if (!c.source_title_full && !c.price_cents && !c.structured_price_cents) return false;
      if (c.validation_status === "rejected") return false;
      return true;
    }).slice(0, top_n);

    // Fallback: if no non-rejected candidates, use best-available (even rejected)
    // This handles the case where validator is strict but candidates are real
    if (validCandidates.length === 0) {
      validCandidates = (candidates || []).filter((c: CandidateLink) => {
        if (!c.source_title_full && !c.price_cents && !c.structured_price_cents) return false;
        // Still require minimum confidence even for rejected
        if ((c.match_confidence || 0) < 50) return false;
        return true;
      }).slice(0, top_n);
      if (validCandidates.length > 0) {
        console.log(`[select-best-supplier] Using ${validCandidates.length} best-available candidates (validator rejected all)`);
      }
    }

    if (validCandidates.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        product_id,
        reason: "no_enriched_candidates",
        message: "No enriched wholesale candidates available. Run enrich-product-links first.",
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Score all candidates ──
    const allPrices = validCandidates
      .map((c: CandidateLink) => c.price_cents || c.structured_price_cents)
      .filter((p: number | null): p is number => p !== null && p > 0);

    const scored: ScoredCandidate[] = validCandidates
      .map((c: CandidateLink) => scoreCandidate(c, allPrices))
      .sort((a: ScoredCandidate, b: ScoredCandidate) => b.scores.total - a.scores.total);

    const winner = scored[0];
    const winnerLink = winner.link;

    console.log(`[select-best-supplier] ${product.name}: ${scored.length} candidates scored`);
    scored.forEach((s: ScoredCandidate, i: number) => {
      console.log(`  #${i + 1}: ${s.link.platform} | total=${s.scores.total} | price=${s.scores.price} ship=${s.scores.shipping} match=${s.scores.match_confidence} asset=${s.scores.asset_quality} complete=${s.scores.completeness} | $${s.price_cents ? (s.price_cents / 100).toFixed(2) : "?"}`);
    });

    if (dry_run) {
      return new Response(JSON.stringify({
        success: true,
        dry_run: true,
        product_id,
        product_name: product.name,
        candidates_scored: scored.length,
        ranking: scored.map((s: ScoredCandidate, i: number) => ({
          rank: i + 1,
          url: s.link.url,
          platform: s.link.platform,
          price_dollars: s.price_cents ? (s.price_cents / 100).toFixed(2) : null,
          scores: s.scores,
        })),
        selected: {
          url: winnerLink.url,
          platform: winnerLink.platform,
          total_score: winner.scores.total,
        },
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Create/update supplier record ──
    const supplierName = (winnerLink.extracted_product_name || winnerLink.title || winnerLink.platform + " listing").slice(0, 100);
    const supplierPlatform = winnerLink.platform || "Other";

    const { data: supplier, error: supErr } = await supabase
      .from("product_suppliers")
      .upsert({
        product_id,
        supplier_name: supplierName,
        platform: supplierPlatform,
        supplier_url: winnerLink.url,
        unit_cost_cents: winner.price_cents || null,
        verification_status: "auto_selected",
        is_preferred: true,
      }, { onConflict: "product_id,supplier_name" })
      .select("id")
      .single();

    if (supErr) throw new Error(`Failed to create supplier: ${supErr.message}`);

    // ── Unset other suppliers as preferred ──
    await supabase
      .from("product_suppliers")
      .update({ is_preferred: false })
      .eq("product_id", product_id)
      .neq("id", supplier.id);

    // ── Update product with preferred supplier ──
    await supabase.from("products").update({
      preferred_supplier_id: supplier.id,
      supplier_url: winnerLink.url,
      supplier_price_cents: winner.price_cents || product.supplier_price_cents,
      updated_at: new Date().toISOString(),
    }).eq("id", product_id);

    // ── Mark winner link as verified ──
    await supabase.from("product_links").update({
      validation_status: "verified",
      verified: true,
    }).eq("id", winnerLink.id);

    // ── Trigger economics ──
    let economicsResult = null;
    try {
      const { data } = await supabase.functions.invoke("calculate-unit-economics", {
        body: { product_id },
      });
      economicsResult = data;
      console.log(`[select-best-supplier] Economics triggered: grade=${data?.viability_grade}, net_margin=${data?.net_margin_pct}%`);
    } catch (e) {
      console.warn(`[select-best-supplier] Economics trigger failed: ${e}`);
    }

    // ── Scrape images from winner ──
    try {
      await supabase.functions.invoke("scrape-supplier-images", {
        body: { product_id, supplier_url: winnerLink.url },
      });
    } catch { /* non-blocking */ }

    console.log(`[select-best-supplier] ✅ ${product.name}: selected "${supplierName}" from ${supplierPlatform} @ $${winner.price_cents ? (winner.price_cents / 100).toFixed(2) : "?"} (score=${winner.scores.total})`);

    return new Response(JSON.stringify({
      success: true,
      product_id,
      product_name: product.name,
      selected_supplier: {
        id: supplier.id,
        name: supplierName,
        platform: supplierPlatform,
        url: winnerLink.url,
        price_dollars: winner.price_cents ? (winner.price_cents / 100).toFixed(2) : null,
        total_score: winner.scores.total,
        scores: winner.scores,
      },
      candidates_scored: scored.length,
      ranking: scored.map((s: ScoredCandidate, i: number) => ({
        rank: i + 1,
        platform: s.link.platform,
        price_dollars: s.price_cents ? (s.price_cents / 100).toFixed(2) : null,
        total_score: s.scores.total,
      })),
      economics: economicsResult,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[select-best-supplier] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
