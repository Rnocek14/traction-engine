/**
 * validate-product-links — AI Link Validator
 * 
 * The missing gate between "search result" and "verified product link."
 * For each pending link, determines if it's the EXACT same product as the canonical record.
 * 
 * Pipeline:
 * 1. Build canonical product profile from DB
 * 2. For each pending link, extract structured facts
 * 3. Run deterministic hard rules (instant reject/confirm)
 * 4. LLM validation for ambiguous cases
 * 5. Compute weighted confidence score
 * 6. Update product_links + parent product
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALIDATOR_VERSION = "v1.0";

// ─── TYPES ───

interface CanonicalProfile {
  product_id: string;
  canonical_name: string;
  brand: string | null;
  product_type: string;
  core_features: string[];
  variant: { pack_count: number | null; color: string | null; size: string | null };
  physical_attributes: { material: string | null; dimensions: string | null };
  identity_markers: { model_number: string | null; sku: string | null; asin: string | null; upc: string | null };
  expected_price_range: { retail_min: number | null; retail_max: number | null; wholesale_min: number | null; wholesale_max: number | null };
  excluded_variants: string[];
  distinctive_attributes: string[];
}

interface SourceListing {
  url: string;
  domain: string;
  title: string;
  brand: string | null;
  product_type: string;
  features: string[];
  variant: { pack_count: number | null; color: string | null; size: string | null };
  physical_attributes: { material: string | null; dimensions: string | null };
  identity_markers: { model_number: string | null; sku: string | null; asin: string | null; upc: string | null };
  price_cents: number | null;
  link_type: string;
}

interface ValidationResult {
  verdict: "same_product" | "different_product" | "uncertain";
  confidence: number;
  matched_attributes: string[];
  mismatched_attributes: string[];
  reasoning: string;
  method: "hard_rule" | "llm" | "combined";
}

// ─── STEP 1: BUILD CANONICAL PROFILE ───

async function buildCanonicalProfile(supabase: any, productId: string, openaiKey: string): Promise<CanonicalProfile> {
  const { data: product } = await supabase.from("products").select("*").eq("id", productId).single();
  if (!product) throw new Error("Product not found");

  const { data: analysis } = await supabase.from("product_analysis").select("*").eq("product_id", productId).maybeSingle();
  
  // If we already have good canonical data, use it
  if (product.canonical_name && product.distinctive_attributes?.length > 0) {
    return {
      product_id: productId,
      canonical_name: product.canonical_name || product.name,
      brand: null,
      product_type: product.category || "",
      core_features: product.distinctive_attributes || [],
      variant: { pack_count: 1, color: null, size: null },
      physical_attributes: { material: null, dimensions: null },
      identity_markers: { model_number: null, sku: null, asin: null, upc: null },
      expected_price_range: {
        retail_min: product.price_cents ? Math.round(product.price_cents * 0.5) : null,
        retail_max: product.price_cents ? Math.round(product.price_cents * 2) : null,
        wholesale_min: product.supplier_price_cents ? Math.round(product.supplier_price_cents * 0.5) : null,
        wholesale_max: product.supplier_price_cents ? Math.round(product.supplier_price_cents * 2) : null,
      },
      excluded_variants: product.excluded_variants || [],
      distinctive_attributes: product.distinctive_attributes || [],
    };
  }

  // Otherwise, use AI to extract canonical identity
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You extract a precise canonical product identity. Be specific — not category-level.
Return the exact physical product being described, not a category of products.`
        },
        {
          role: "user",
          content: `Product name: "${product.name}"
Category: ${product.category || "unknown"}
Notes: ${product.notes || "none"}
Price: $${product.price_cents ? (product.price_cents / 100).toFixed(2) : "unknown"}

Extract the canonical product identity.`
        },
      ],
      tools: [{
        type: "function",
        function: {
          name: "set_canonical_identity",
          parameters: {
            type: "object",
            properties: {
              canonical_name: { type: "string", description: "Precise product name, 3-8 words" },
              brand: { type: "string", description: "Brand if known, empty string if generic" },
              product_type: { type: "string", description: "Product category/type, 1-3 words" },
              core_features: { type: "array", items: { type: "string" }, description: "3-8 defining features" },
              pack_count: { type: "integer", description: "Number of units (1 for single)" },
              material: { type: "string", description: "Primary material if relevant, empty if unknown" },
              excluded_variants: { type: "array", items: { type: "string" }, description: "Products that look similar but are NOT this product" },
              retail_price_min: { type: "number" },
              retail_price_max: { type: "number" },
            },
            required: ["canonical_name", "product_type", "core_features", "pack_count", "excluded_variants"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "set_canonical_identity" } },
      temperature: 0.1,
    }),
  });

  if (!resp.ok) throw new Error(`Canonical extraction failed: ${resp.status}`);
  const data = await resp.json();
  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error("No tool call from canonical extraction");
  const identity = JSON.parse(call.function.arguments);

  // Save canonical identity back to product
  await supabase.from("products").update({
    canonical_name: identity.canonical_name,
    distinctive_attributes: identity.core_features,
    excluded_variants: identity.excluded_variants,
    updated_at: new Date().toISOString(),
  }).eq("id", productId);

  return {
    product_id: productId,
    canonical_name: identity.canonical_name,
    brand: identity.brand || null,
    product_type: identity.product_type,
    core_features: identity.core_features,
    variant: { pack_count: identity.pack_count || 1, color: null, size: null },
    physical_attributes: { material: identity.material || null, dimensions: null },
    identity_markers: { model_number: null, sku: null, asin: null, upc: null },
    expected_price_range: {
      retail_min: identity.retail_price_min ? Math.round(identity.retail_price_min * 100) : null,
      retail_max: identity.retail_price_max ? Math.round(identity.retail_price_max * 100) : null,
      wholesale_min: null,
      wholesale_max: null,
    },
    excluded_variants: identity.excluded_variants || [],
    distinctive_attributes: identity.core_features || [],
  };
}

// ─── STEP 2: EXTRACT SOURCE LISTING FACTS ───

function extractSourceListing(link: any): SourceListing {
  const url = link.url || "";
  let domain = "unknown";
  try { domain = new URL(url).hostname.replace("www.", ""); } catch {}

  // Extract ASIN from Amazon URLs
  let asin: string | null = null;
  const asinMatch = url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  if (asinMatch) asin = asinMatch[1].toUpperCase();

  return {
    url,
    domain,
    title: link.title || link.extracted_product_name || "",
    brand: link.extracted_brand || null,
    product_type: "",
    features: [],
    variant: { pack_count: null, color: null, size: null },
    physical_attributes: { material: null, dimensions: null },
    identity_markers: { model_number: null, sku: null, asin, upc: null },
    price_cents: link.price_cents || link.structured_price_cents || null,
    link_type: link.link_type || "retail",
  };
}

// ─── STEP 3: HARD RULES ───

function applyHardRules(canonical: CanonicalProfile, source: SourceListing): ValidationResult | null {
  const titleLower = source.title.toLowerCase();
  
  // HARD CONFIRM: Exact ASIN match
  if (canonical.identity_markers.asin && source.identity_markers.asin) {
    if (canonical.identity_markers.asin === source.identity_markers.asin) {
      return {
        verdict: "same_product",
        confidence: 0.99,
        matched_attributes: ["asin_exact_match"],
        mismatched_attributes: [],
        reasoning: "Exact ASIN match confirms identical product.",
        method: "hard_rule",
      };
    } else {
      return {
        verdict: "different_product",
        confidence: 0.95,
        matched_attributes: [],
        mismatched_attributes: ["asin_mismatch"],
        reasoning: "Different ASINs indicate different products.",
        method: "hard_rule",
      };
    }
  }

  // HARD REJECT: Excluded variant terms in title
  for (const excluded of canonical.excluded_variants) {
    const exLower = excluded.toLowerCase();
    if (titleLower.includes(exLower)) {
      return {
        verdict: "different_product",
        confidence: 0.90,
        matched_attributes: [],
        mismatched_attributes: [`excluded_variant:${excluded}`],
        reasoning: `Title contains excluded variant "${excluded}".`,
        method: "hard_rule",
      };
    }
  }

  // HARD REJECT: Pack count mismatch detection
  const packPatterns = [
    /(\d+)\s*(?:pack|pcs|pieces|set of|count)/i,
    /set\s*of\s*(\d+)/i,
    /(\d+)\s*in\s*1/i,
  ];
  let detectedPack: number | null = null;
  for (const p of packPatterns) {
    const m = titleLower.match(p);
    if (m) { detectedPack = parseInt(m[1]); break; }
  }
  if (detectedPack && canonical.variant.pack_count && detectedPack !== canonical.variant.pack_count) {
    if (detectedPack > 1 && canonical.variant.pack_count === 1) {
      return {
        verdict: "different_product",
        confidence: 0.92,
        matched_attributes: [],
        mismatched_attributes: [`pack_count:expected=${canonical.variant.pack_count},found=${detectedPack}`],
        reasoning: `Pack count mismatch: canonical is single unit, listing is ${detectedPack}-pack.`,
        method: "hard_rule",
      };
    }
  }

  // HARD REJECT: Extreme price mismatch (>5x expected range)
  if (source.price_cents && canonical.expected_price_range.retail_max) {
    const isRetail = source.link_type === "retail";
    const maxExpected = isRetail ? canonical.expected_price_range.retail_max : canonical.expected_price_range.wholesale_max;
    const minExpected = isRetail ? canonical.expected_price_range.retail_min : canonical.expected_price_range.wholesale_min;
    
    if (maxExpected && source.price_cents > maxExpected * 5) {
      return {
        verdict: "different_product",
        confidence: 0.80,
        matched_attributes: [],
        mismatched_attributes: [`price_extreme_high:${source.price_cents}vs_max_${maxExpected}`],
        reasoning: `Price $${(source.price_cents / 100).toFixed(2)} is >5x the expected maximum.`,
        method: "hard_rule",
      };
    }
    if (minExpected && isRetail && source.price_cents < minExpected * 0.1) {
      return {
        verdict: "different_product",
        confidence: 0.70,
        matched_attributes: [],
        mismatched_attributes: [`price_extreme_low:${source.price_cents}vs_min_${minExpected}`],
        reasoning: `Price $${(source.price_cents / 100).toFixed(2)} is <10% of expected minimum.`,
        method: "hard_rule",
      };
    }
  }

  return null; // No hard rule triggered — needs LLM
}

// ─── STEP 4: LLM VALIDATION ───

async function llmValidate(
  canonical: CanonicalProfile,
  source: SourceListing,
  openaiKey: string,
): Promise<ValidationResult> {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a strict e-commerce product identity validator.

Your job is to determine whether a candidate listing is the EXACT SAME PRODUCT as the canonical product.

Be strict.
"Similar" is NOT enough.
"Same category" is NOT enough.
"Likely same" is NOT enough.

Treat these as meaningful differences:
- brand (if canonical has a known brand)
- model / version
- size if it changes the product significantly
- color if color is core to identity
- pack count
- included accessories that change the bundle
- major material differences (plastic vs glass vs metal)
- major feature differences (RGB vs non-RGB, rechargeable vs wired)
- form factor (table vs wall vs floor)

Context matters:
- For WHOLESALE links (AliExpress, Alibaba, DHgate), the brand will be different or absent — that's expected. Focus on physical form, features, and specs.
- For RETAIL links (Amazon, Walmart), brand and exact specs matter more.`
        },
        {
          role: "user",
          content: `Canonical product:
${JSON.stringify(canonical, null, 2)}

Candidate listing:
${JSON.stringify(source, null, 2)}

Is this the EXACT same product?`
        },
      ],
      tools: [{
        type: "function",
        function: {
          name: "validate_product_match",
          parameters: {
            type: "object",
            properties: {
              verdict: { type: "string", enum: ["same_product", "different_product", "uncertain"] },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              matched_attributes: { type: "array", items: { type: "string" } },
              mismatched_attributes: { type: "array", items: { type: "string" } },
              reasoning: { type: "string", description: "1-2 sentence explanation" },
            },
            required: ["verdict", "confidence", "matched_attributes", "mismatched_attributes", "reasoning"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "validate_product_match" } },
      temperature: 0.1,
    }),
  });

  if (!resp.ok) {
    console.warn(`[validator] LLM call failed: ${resp.status}`);
    return {
      verdict: "uncertain",
      confidence: 0.5,
      matched_attributes: [],
      mismatched_attributes: ["llm_error"],
      reasoning: `LLM validation failed with status ${resp.status}`,
      method: "llm",
    };
  }

  const data = await resp.json();
  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) {
    return {
      verdict: "uncertain",
      confidence: 0.5,
      matched_attributes: [],
      mismatched_attributes: ["no_tool_call"],
      reasoning: "LLM did not return structured output",
      method: "llm",
    };
  }

  const result = JSON.parse(call.function.arguments);
  return { ...result, method: "llm" };
}

// ─── STEP 5: COMPUTE WEIGHTED CONFIDENCE ───

function computeFinalConfidence(
  canonical: CanonicalProfile,
  source: SourceListing,
  llmResult: ValidationResult,
): number {
  // Title keyword overlap
  const canonicalTokens = new Set(canonical.canonical_name.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const sourceTokens = new Set(source.title.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const overlap = [...canonicalTokens].filter(t => sourceTokens.has(t)).length;
  const titleScore = canonicalTokens.size > 0 ? overlap / canonicalTokens.size : 0;

  // Feature overlap
  const canonFeatures = new Set(canonical.core_features.map(f => f.toLowerCase()));
  const titleLower = source.title.toLowerCase();
  const featureHits = [...canonFeatures].filter(f => titleLower.includes(f)).length;
  const featureScore = canonFeatures.size > 0 ? featureHits / canonFeatures.size : 0;

  // Identity marker match
  let identityScore = 0;
  if (canonical.identity_markers.asin && source.identity_markers.asin) {
    identityScore = canonical.identity_markers.asin === source.identity_markers.asin ? 1.0 : 0;
  }

  // Price coherence
  let priceScore = 0.5; // default neutral
  if (source.price_cents && canonical.expected_price_range.retail_min && canonical.expected_price_range.retail_max) {
    const min = source.link_type === "wholesale" ? (canonical.expected_price_range.wholesale_min || 0) : canonical.expected_price_range.retail_min;
    const max = source.link_type === "wholesale" ? (canonical.expected_price_range.wholesale_max || Infinity) : canonical.expected_price_range.retail_max;
    if (source.price_cents >= min && source.price_cents <= max) priceScore = 1.0;
    else if (source.price_cents >= min * 0.5 && source.price_cents <= max * 2) priceScore = 0.6;
    else priceScore = 0.2;
  }

  // Weighted combination (35% identity, 15% type, 15% features, 10% variant, 10% brand, 5% price, 5% title, 5% LLM)
  const weights = {
    identity: 0.35,
    features: 0.15,
    title: 0.10,
    price: 0.05,
    llm: 0.35,
  };

  const finalScore = (
    identityScore * weights.identity +
    featureScore * weights.features +
    titleScore * weights.title +
    priceScore * weights.price +
    llmResult.confidence * weights.llm
  );

  return Math.round(finalScore * 100) / 100;
}

// ─── STEP 6: MAP TO VALIDATION STATUS ───

function mapToStatus(confidence: number, verdict: string): string {
  if (verdict === "same_product" && confidence >= 0.75) return "confirmed";
  if (verdict === "different_product" || confidence < 0.50) return "rejected";
  return "needs_review";
}

// ─── MAIN HANDLER ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) throw new Error("OPENAI_API_KEY not configured");

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body = await req.json();
    const { product_id, link_ids, mode = "all_pending" } = body;

    if (!product_id) throw new Error("product_id required");

    console.log(`[validator] ===== Starting validation for product ${product_id} =====`);

    // 1. Build canonical profile
    const canonical = await buildCanonicalProfile(supabase, product_id, openaiKey);
    console.log(`[validator] Canonical: "${canonical.canonical_name}" features=[${canonical.core_features.join(",")}]`);

    // 2. Fetch pending links
    let query = supabase.from("product_links").select("*").eq("product_id", product_id);
    if (mode === "all_pending") {
      query = query.in("validation_status", ["pending", null]);
    } else if (link_ids?.length) {
      query = query.in("id", link_ids);
    }
    const { data: links, error: linkErr } = await query;
    if (linkErr) throw new Error(`Failed to fetch links: ${linkErr.message}`);
    if (!links?.length) {
      console.log("[validator] No pending links to validate");
      return new Response(JSON.stringify({ success: true, validated: 0, message: "No pending links" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[validator] Validating ${links.length} links`);

    const results = { confirmed: 0, rejected: 0, needs_review: 0 };

    for (const link of links) {
      try {
        const source = extractSourceListing(link);

        // Hard rules first
        let result = applyHardRules(canonical, source);
        
        if (!result) {
          // LLM validation
          result = await llmValidate(canonical, source, openaiKey);
          
          // Compute weighted final confidence
          const finalConfidence = computeFinalConfidence(canonical, source, result);
          result.confidence = finalConfidence;
          result.method = "combined";
        }

        const status = mapToStatus(result.confidence, result.verdict);
        results[status as keyof typeof results]++;

        // Update link
        await supabase.from("product_links").update({
          validation_status: status,
          match_confidence: Math.round(result.confidence * 100),
          ai_verdict: result.verdict === "same_product",
          ai_confidence: Math.round(result.confidence * 100),
          ai_reasoning: result.reasoning,
          matched_attributes: result.matched_attributes,
          mismatched_attributes: result.mismatched_attributes,
          canonical_snapshot: canonical,
          source_snapshot: source,
          validation_version: VALIDATOR_VERSION,
          validation_reasons: [
            `method:${result.method}`,
            `verdict:${result.verdict}`,
            `confidence:${result.confidence}`,
          ],
          verified: status === "confirmed",
          last_checked_at: new Date().toISOString(),
        }).eq("id", link.id);

        console.log(`[validator] ${link.platform} "${link.title?.slice(0, 50)}" → ${status} (${Math.round(result.confidence * 100)}%)`);

        // Rate limit LLM calls
        if (result.method !== "hard_rule") {
          await new Promise(r => setTimeout(r, 300));
        }
      } catch (err) {
        console.warn(`[validator] Error validating link ${link.id}:`, err);
      }
    }

    // 3. Recompute product readiness
    await recomputeReadiness(supabase, product_id);

    console.log(`[validator] ===== Done: ${results.confirmed} confirmed, ${results.rejected} rejected, ${results.needs_review} needs_review =====`);

    return new Response(JSON.stringify({
      success: true,
      validated: links.length,
      ...results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[validator] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ─── READINESS RECOMPUTATION ───

async function recomputeReadiness(supabase: any, productId: string) {
  const { data: links } = await supabase.from("product_links").select("*").eq("product_id", productId);
  const { data: images } = await supabase.from("product_images").select("*").eq("product_id", productId);
  const { data: suppliers } = await supabase.from("product_suppliers").select("*").eq("product_id", productId);

  const confirmedRetail = (links || []).filter((l: any) => l.validation_status === "confirmed" && l.link_type === "retail");
  const confirmedWholesale = (links || []).filter((l: any) => l.validation_status === "confirmed" && l.link_type === "wholesale");
  const verifiedImages = (images || []).filter((i: any) => i.verified || i.manually_approved);

  // Score components (out of 100)
  const retailScore = Math.min(confirmedRetail.length * 15, 30);    // max 30 for 2+ confirmed retail
  const wholesaleScore = Math.min(confirmedWholesale.length * 15, 20); // max 20 for wholesale
  const imageScore = Math.min(verifiedImages.length * 5, 20);       // max 20 for 4+ images
  const supplierScore = suppliers?.some((s: any) => s.is_preferred) ? 15 : 0; // 15 for preferred supplier
  const priceScore = confirmedRetail.some((l: any) => l.price_cents) ? 15 : 0; // 15 for known price

  const readinessScore = retailScore + wholesaleScore + imageScore + supplierScore + priceScore;

  // Identity confidence = average of confirmed link confidences
  const confirmedAll = [...confirmedRetail, ...confirmedWholesale];
  const identityConfidence = confirmedAll.length > 0
    ? Math.round(confirmedAll.reduce((sum: number, l: any) => sum + (l.match_confidence || 0), 0) / confirmedAll.length)
    : 0;

  // Readiness state
  let readinessState = "research_only";
  if (readinessScore >= 60) readinessState = "ad_ready";
  else if (readinessScore >= 40) readinessState = "needs_assets";
  else if (confirmedRetail.length > 0) readinessState = "links_verified";

  // Best retail link
  const bestRetail = confirmedRetail.sort((a: any, b: any) => (b.match_confidence || 0) - (a.match_confidence || 0))[0];

  await supabase.from("products").update({
    readiness_score: readinessScore,
    readiness_state: readinessState,
    identity_confidence: identityConfidence,
    purchase_url: bestRetail?.url || null,
    retail_anchor_price_cents: bestRetail?.price_cents || null,
    updated_at: new Date().toISOString(),
  }).eq("id", productId);

  console.log(`[validator] Readiness: score=${readinessScore}, state=${readinessState}, identity=${identityConfidence}%`);
}
