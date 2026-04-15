/**
 * validate-product-links — AI Link Validator v2
 * 
 * Dual-mode validation:
 *   RETAIL mode: strict brand + model + identity matching
 *   WHOLESALE mode: relaxed brand, focused on physical product sameness
 * 
 * Pipeline:
 * 1. Build canonical product profile from DB
 * 2. For each pending link, extract structured facts
 * 3. Run deterministic hard rules (mode-aware)
 * 4. LLM validation with mode-specific prompts
 * 5. Compute weighted confidence score (mode-aware weights)
 * 6. Update product_links + parent product
 * 7. AUTO: create product_suppliers for confirmed wholesale links
 * 8. AUTO: trigger calculate-unit-economics when supplier created
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALIDATOR_VERSION = "v2.0";

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
  image_urls: string[];
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

  // Extract brand from product name
  let inferredBrand: string | null = null;
  const originalName = product.name || "";
  const canonicalName = product.canonical_name || "";
  if (originalName && canonicalName && originalName.toLowerCase() !== canonicalName.toLowerCase()) {
    const origWords = originalName.split(/\s+/);
    const canonLower = canonicalName.toLowerCase();
    const brandWords: string[] = [];
    for (const w of origWords) {
      if (!canonLower.includes(w.toLowerCase())) brandWords.push(w);
      else break;
    }
    if (brandWords.length > 0 && brandWords.length <= 3) {
      inferredBrand = brandWords.join(" ");
    }
  }

  // Check enriched links for consistent brand
  if (!inferredBrand) {
    const { data: enrichedLinks } = await supabase.from("product_links")
      .select("source_brand")
      .eq("product_id", productId)
      .eq("source_enrichment_status", "enriched")
      .not("source_brand", "is", null)
      .limit(5);
    if (enrichedLinks?.length >= 2) {
      const brands = enrichedLinks.map((l: any) => l.source_brand?.toLowerCase());
      const mostCommon = brands.sort((a: string, b: string) => 
        brands.filter((v: string) => v === a).length - brands.filter((v: string) => v === b).length
      ).pop();
      if (mostCommon && brands.filter((b: string) => b === mostCommon).length >= 2) {
        inferredBrand = enrichedLinks.find((l: any) => l.source_brand?.toLowerCase() === mostCommon)?.source_brand;
      }
    }
  }

  // Build core features from name + distinctive_attributes
  const fullName = product.name || product.canonical_name || "";
  const nameTokens = fullName.toLowerCase().split(/[\s,\-\/]+/).filter((w: string) => w.length > 2);
  const rawFeatures = [...(product.distinctive_attributes || [])];
  const featureSet = new Set(rawFeatures.map((f: string) => f.toLowerCase()));
  for (const t of nameTokens) {
    if (!featureSet.has(t) && !["the", "and", "for", "with"].includes(t)) {
      rawFeatures.push(t);
      featureSet.add(t);
    }
  }

  if (product.canonical_name && product.distinctive_attributes?.length > 0) {
    return {
      product_id: productId,
      canonical_name: inferredBrand ? `${inferredBrand} ${product.canonical_name}` : product.canonical_name,
      brand: inferredBrand,
      product_type: product.category || "",
      core_features: rawFeatures,
      variant: { pack_count: 1, color: null, size: null },
      physical_attributes: { material: null, dimensions: null },
      identity_markers: { model_number: null, sku: null, asin: null, upc: null },
      expected_price_range: {
        retail_min: product.price_cents ? Math.round(product.price_cents * 0.5) : null,
        retail_max: product.price_cents ? Math.round(product.price_cents * 2) : null,
        wholesale_min: product.price_cents ? Math.round(product.price_cents * 0.1) : null,
        wholesale_max: product.price_cents ? Math.round(product.price_cents * 0.6) : null,
      },
      excluded_variants: product.excluded_variants || [],
      distinctive_attributes: product.distinctive_attributes || [],
    };
  }

  // AI extraction fallback
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: `You extract a precise canonical product identity. Be specific — not category-level.` },
        { role: "user", content: `Product name: "${product.name}"\nCategory: ${product.category || "unknown"}\nNotes: ${product.notes || "none"}\nPrice: $${product.price_cents ? (product.price_cents / 100).toFixed(2) : "unknown"}\n\nExtract the canonical product identity.` },
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
              material: { type: "string", description: "Primary material if relevant" },
              excluded_variants: { type: "array", items: { type: "string" }, description: "Products that look similar but are NOT this product" },
              wholesale_physical_description: { type: "string", description: "How a factory would describe this product without brand, 5-15 words" },
              retail_price_min: { type: "number" },
              retail_price_max: { type: "number" },
            },
            required: ["canonical_name", "product_type", "core_features", "pack_count", "excluded_variants", "wholesale_physical_description"],
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
      wholesale_min: identity.retail_price_min ? Math.round(identity.retail_price_min * 100 * 0.1) : null,
      wholesale_max: identity.retail_price_max ? Math.round(identity.retail_price_max * 100 * 0.6) : null,
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

  let asin: string | null = null;
  const asinMatch = url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  if (asinMatch) asin = asinMatch[1].toUpperCase();

  const isEnriched = link.source_enrichment_status === "enriched";
  const enrichedSpecs = link.source_specs || {};

  const title = (isEnriched && link.source_title_full) 
    ? link.source_title_full 
    : (link.title || link.extracted_product_name || "");

  const brand = (isEnriched && link.source_brand) 
    ? link.source_brand 
    : (link.extracted_brand || null);

  const features = (isEnriched && link.source_features?.length > 0) 
    ? link.source_features 
    : [];

  const priceCents = link.structured_price_cents || link.price_cents || null;

  let packCount: number | null = null;
  const combined = `${title} ${features.join(" ")}`;
  const packMatch = combined.match(/(\d+)\s*(?:pack|pcs|pieces?|count|set of)/i);
  if (packMatch) packCount = parseInt(packMatch[1]);

  const material = enrichedSpecs.Material || enrichedSpecs.material || null;
  const dimensions = enrichedSpecs.Dimensions || enrichedSpecs.dimensions || enrichedSpecs["Product Dimensions"] || null;
  const model = enrichedSpecs.Model || enrichedSpecs["Model Number"] || null;
  const sku = enrichedSpecs.SKU || enrichedSpecs.sku || null;

  return {
    url, domain, title, brand,
    product_type: "",
    features,
    variant: { pack_count: packCount, color: null, size: null },
    physical_attributes: { material, dimensions },
    identity_markers: { model_number: model, sku, asin, upc: null },
    price_cents: priceCents,
    link_type: link.link_type || "retail",
    image_urls: link.source_image_urls || [],
  };
}

// ─── STEP 3: HARD RULES (mode-aware) ───

function applyHardRules(canonical: CanonicalProfile, source: SourceListing): ValidationResult | null {
  const titleLower = source.title.toLowerCase();
  const isWholesale = source.link_type === "wholesale";

  // HARD CONFIRM: Exact ASIN match (retail only)
  if (!isWholesale && canonical.identity_markers.asin && source.identity_markers.asin) {
    if (canonical.identity_markers.asin === source.identity_markers.asin) {
      return { verdict: "same_product", confidence: 0.99, matched_attributes: ["asin_exact_match"], mismatched_attributes: [], reasoning: "Exact ASIN match.", method: "hard_rule" };
    } else {
      return { verdict: "different_product", confidence: 0.95, matched_attributes: [], mismatched_attributes: ["asin_mismatch"], reasoning: "Different ASINs.", method: "hard_rule" };
    }
  }

  // HARD REJECT: Excluded variant terms (RETAIL ONLY)
  // Wholesale listings use different terminology — "night light" for a jellyfish lamp,
  // "espresso machine" for an espresso maker — so excluded variants should not hard-reject wholesale.
  // Let the LLM evaluate wholesale matches on physical product sameness instead.
  if (!isWholesale) {
    for (const excluded of canonical.excluded_variants) {
      const exLower = excluded.toLowerCase();
      if (titleLower.includes(exLower)) {
        return { verdict: "different_product", confidence: 0.90, matched_attributes: [], mismatched_attributes: [`excluded_variant:${excluded}`], reasoning: `Title contains excluded variant "${excluded}".`, method: "hard_rule" };
      }
    }
  }

  // HARD REJECT: Pack count mismatch (RETAIL ONLY)
  // Wholesale titles often say "2pcs", "3 pieces" to indicate quantity/MOQ, not actual pack count.
  // Let the LLM judge wholesale pack count differences.
  if (!isWholesale) {
    const packPatterns = [/(\d+)\s*(?:pack|pcs|pieces|set of|count)/i, /set\s*of\s*(\d+)/i, /(\d+)\s*in\s*1/i];
    let detectedPack: number | null = null;
    for (const p of packPatterns) {
      const m = titleLower.match(p);
      if (m) { detectedPack = parseInt(m[1]); break; }
    }
    if (detectedPack && canonical.variant.pack_count && detectedPack !== canonical.variant.pack_count) {
      if (detectedPack > 1 && canonical.variant.pack_count === 1) {
        return { verdict: "different_product", confidence: 0.92, matched_attributes: [], mismatched_attributes: [`pack_count:expected=${canonical.variant.pack_count},found=${detectedPack}`], reasoning: `Pack count mismatch.`, method: "hard_rule" };
      }
    }
  }

  // HARD REJECT: Extreme price (different thresholds for wholesale vs retail)
  if (source.price_cents) {
    if (isWholesale && canonical.expected_price_range.wholesale_max) {
      // Wholesale: reject if >3x the expected wholesale max (generous)
      if (source.price_cents > canonical.expected_price_range.wholesale_max * 3) {
        return { verdict: "different_product", confidence: 0.75, matched_attributes: [], mismatched_attributes: [`price_extreme_high_wholesale`], reasoning: `Wholesale price $${(source.price_cents / 100).toFixed(2)} exceeds 3x expected max.`, method: "hard_rule" };
      }
    } else if (!isWholesale && canonical.expected_price_range.retail_max) {
      if (source.price_cents > canonical.expected_price_range.retail_max * 5) {
        return { verdict: "different_product", confidence: 0.80, matched_attributes: [], mismatched_attributes: [`price_extreme_high`], reasoning: `Price >5x expected.`, method: "hard_rule" };
      }
      if (canonical.expected_price_range.retail_min && source.price_cents < canonical.expected_price_range.retail_min * 0.1) {
        return { verdict: "different_product", confidence: 0.70, matched_attributes: [], mismatched_attributes: [`price_extreme_low`], reasoning: `Price <10% of expected.`, method: "hard_rule" };
      }
    }
  }

  // For WHOLESALE: HARD REJECT if brand is present AND clearly different AND canonical has a distinctive brand
  // (but only for branded products where the brand IS the identity, like Nike, Apple)
  // Skip this — wholesale brand mismatch is expected and handled by LLM

  return null;
}

// ─── STEP 4: LLM VALIDATION (mode-specific prompts) ───

const RETAIL_SYSTEM_PROMPT = `You are a strict e-commerce product identity validator for RETAIL listings.

Your job: determine if a candidate listing is the EXACT SAME PRODUCT as the canonical product.

Be strict. "Similar" is NOT enough. "Same category" is NOT enough.

Meaningful differences (REJECT):
- Different brand (if canonical has a known brand AND candidate has a DIFFERENT brand)
- Different model / version
- Different pack count
- Major material differences (plastic vs glass vs metal)
- Major feature differences (rechargeable vs wired, touch vs switch)
- Different form factor (table vs wall vs floor)

NOT meaningful differences (ACCEPT):
- Color variants (Rose, Blue, Gold = same product)
- Title phrasing differences for same features ("RGB" vs "16 Color")
- Minor accessory presence/absence if core product is same
- Price within 2x range
- Brand matching canonical = strong match signal

If brand matches canonical, treat as likely same unless features are fundamentally different.`;

const WHOLESALE_SYSTEM_PROMPT = `You are a product identity validator for WHOLESALE/FACTORY listings (AliExpress, Alibaba, DHgate, Temu, 1688).

Your job: determine if this factory/supplier listing is the SAME PHYSICAL PRODUCT as the canonical retail product.

CRITICAL WHOLESALE RULES:
1. Brand mismatch is EXPECTED and NORMAL. Factory listings are typically unbranded or use a different brand. Do NOT penalize missing or different brands.
2. Focus on PHYSICAL PRODUCT SAMENESS:
   - Same form factor and shape
   - Same core function and features
   - Same size / dimensions (approximately)
   - Same material type
   - Same pack count
   - Same accessories if they define the product
3. Factory titles are often longer and more descriptive — that's normal.
4. Price should be LOWER than retail (typically 20-60% of retail price). If factory price is higher than retail, that's suspicious.
5. Generic descriptions like "portable LED lamp" or "wireless charger" are common — focus on whether the SPECIFIC product matches, not the generic category.

ACCEPT if: The physical product is clearly the same item, even with different branding, packaging, or listing style.
REJECT if: Different product type, different size/dimensions, different function, different form factor, or just "same category but different item."

Examples:
- Canonical: "Leroxo Crystal Touch Lamp 16-Color RGB" + Factory: "Crystal Ball Night Light 16 Color Touch Control LED Lamp" → SAME PRODUCT (same form, same function, same feature set)
- Canonical: "YABER V2 Projector 1080P" + Factory: "Mini Projector 720P Portable" → DIFFERENT PRODUCT (different resolution, different model)`;

async function llmValidate(
  canonical: CanonicalProfile,
  source: SourceListing,
  openaiKey: string,
): Promise<ValidationResult> {
  const isWholesale = source.link_type === "wholesale";
  const systemPrompt = isWholesale ? WHOLESALE_SYSTEM_PROMPT : RETAIL_SYSTEM_PROMPT;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Canonical product:\n${JSON.stringify({
            name: canonical.canonical_name,
            brand: canonical.brand,
            type: canonical.product_type,
            features: canonical.core_features,
            pack_count: canonical.variant.pack_count,
            material: canonical.physical_attributes.material,
          }, null, 2)}\n\nCandidate ${isWholesale ? "WHOLESALE" : "RETAIL"} listing:\n${JSON.stringify({
            title: source.title,
            brand: source.brand,
            features: source.features,
            price: source.price_cents ? `$${(source.price_cents / 100).toFixed(2)}` : "unknown",
            domain: source.domain,
            pack_count: source.variant.pack_count,
            material: source.physical_attributes.material,
          }, null, 2)}\n\nIs this the SAME PHYSICAL PRODUCT?`
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
              matched_attributes: { type: "array", items: { type: "string" }, description: "Physical attributes that match" },
              mismatched_attributes: { type: "array", items: { type: "string" }, description: "Physical attributes that differ" },
              reasoning: { type: "string", description: "1-2 sentence explanation focusing on physical sameness" },
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
    return { verdict: "uncertain", confidence: 0.5, matched_attributes: [], mismatched_attributes: ["llm_error"], reasoning: `LLM failed: ${resp.status}`, method: "llm" };
  }

  const data = await resp.json();
  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) {
    return { verdict: "uncertain", confidence: 0.5, matched_attributes: [], mismatched_attributes: ["no_tool_call"], reasoning: "No structured output", method: "llm" };
  }

  const result = JSON.parse(call.function.arguments);
  return { ...result, method: "llm" };
}

// ─── STEP 5: WEIGHTED CONFIDENCE (mode-aware) ───

function computeFinalConfidence(
  canonical: CanonicalProfile,
  source: SourceListing,
  llmResult: ValidationResult,
): number {
  const isWholesale = source.link_type === "wholesale";

  // Title keyword overlap
  const canonicalTokens = new Set(canonical.canonical_name.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const sourceTokens = new Set(source.title.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const overlap = [...canonicalTokens].filter(t => sourceTokens.has(t)).length;
  const titleScore = canonicalTokens.size > 0 ? overlap / canonicalTokens.size : 0;

  // Feature overlap
  const canonFeatures = new Set(canonical.core_features.map(f => f.toLowerCase()));
  const sourceCombined = `${source.title.toLowerCase()} ${source.features.map(f => f.toLowerCase()).join(" ")}`;
  const featureHits = [...canonFeatures].filter(f => sourceCombined.includes(f)).length;
  const featureScore = canonFeatures.size > 0 ? featureHits / canonFeatures.size : 0;

  // Brand match (mode-aware)
  let brandScore: number;
  if (isWholesale) {
    // Wholesale: brand is irrelevant — neutral baseline
    brandScore = 0.7;
  } else {
    brandScore = 0.5;
    if (canonical.brand) {
      if (source.brand && source.brand.toLowerCase() === canonical.brand.toLowerCase()) {
        brandScore = 1.0;
      } else if (source.brand && source.brand.toLowerCase() !== canonical.brand.toLowerCase()) {
        brandScore = 0.1;
      }
    }
  }

  // Identity marker match
  let identityScore = 0;
  let hasIdentityData = false;
  if (canonical.identity_markers.asin && source.identity_markers.asin) {
    hasIdentityData = true;
    identityScore = canonical.identity_markers.asin === source.identity_markers.asin ? 1.0 : 0;
  }

  // Price coherence (mode-aware ranges)
  let priceScore = 0.5;
  if (source.price_cents) {
    if (isWholesale) {
      // Wholesale price should be 10-60% of retail
      const retailRef = canonical.expected_price_range.retail_max || canonical.expected_price_range.retail_min;
      if (retailRef) {
        const ratio = source.price_cents / retailRef;
        if (ratio >= 0.05 && ratio <= 0.7) priceScore = 1.0;      // Sweet spot
        else if (ratio > 0.7 && ratio <= 1.0) priceScore = 0.6;    // Close to retail — suspicious but possible
        else if (ratio > 1.0) priceScore = 0.2;                     // More expensive than retail — bad
        else priceScore = 0.4;                                       // Very cheap — maybe bulk
      }
    } else {
      const min = canonical.expected_price_range.retail_min;
      const max = canonical.expected_price_range.retail_max;
      if (min && max) {
        if (source.price_cents >= min && source.price_cents <= max) priceScore = 1.0;
        else if (source.price_cents >= min * 0.5 && source.price_cents <= max * 2) priceScore = 0.6;
        else priceScore = 0.2;
      }
    }
  }

  // Mode-aware weights
  let weights;
  if (isWholesale) {
    // Wholesale: LLM + features dominate, brand is neutral, no identity markers expected
    weights = { identity: 0, features: 0.25, title: 0.10, brand: 0.05, price: 0.10, llm: 0.50 };
  } else if (hasIdentityData) {
    weights = { identity: 0.35, features: 0.15, title: 0.05, brand: 0.10, price: 0.05, llm: 0.30 };
  } else {
    weights = { identity: 0, features: 0.20, title: 0.10, brand: 0.20, price: 0.05, llm: 0.45 };
  }

  const finalScore = (
    identityScore * weights.identity +
    featureScore * weights.features +
    titleScore * weights.title +
    brandScore * weights.brand +
    priceScore * weights.price +
    llmResult.confidence * weights.llm
  );

  return Math.round(finalScore * 100) / 100;
}

// ─── STEP 6: MAP TO STATUS (mode-aware thresholds) ───

function mapToStatus(confidence: number, verdict: string, isWholesale: boolean): string {
  if (isWholesale) {
    // Slightly relaxed threshold for wholesale since we can't expect brand match
    if (verdict === "same_product" && confidence >= 0.65) return "confirmed";
    if (verdict === "different_product" || confidence < 0.40) return "rejected";
    return "needs_review";
  }
  // Retail: strict
  if (verdict === "same_product" && confidence >= 0.75) return "confirmed";
  if (verdict === "different_product" || confidence < 0.50) return "rejected";
  return "needs_review";
}

// ─── STEP 7: AUTO-CREATE SUPPLIER FROM CONFIRMED WHOLESALE ───

async function autoCreateSupplier(
  supabase: any,
  supabaseUrl: string,
  supabaseKey: string,
  productId: string,
  link: any,
  source: SourceListing,
  matchConfidence: number,
): Promise<void> {
  const platform = link.platform || source.domain;
  const supplierName = (source.title || platform + " listing").slice(0, 100);

  // Extract shipping estimate from enriched data
  const specs = link.source_specs || {};
  let deliveryDays: number | null = null;
  let shippingCostCents: number | null = null;

  // Try to extract shipping from specs
  const shippingText = specs["Ships From"] || specs["Shipping"] || specs.shipping || "";
  if (shippingText.toLowerCase().includes("china") || shippingText.toLowerCase().includes("cn")) {
    deliveryDays = 15; // Default China→US estimate
  }
  // Look for shipping cost in specs
  const shippingCost = specs["Shipping Cost"] || specs.shipping_cost;
  if (typeof shippingCost === "number") shippingCostCents = Math.round(shippingCost * 100);

  // Upsert supplier record
  const { data: supplier, error } = await supabase.from("product_suppliers").upsert({
    product_id: productId,
    supplier_name: supplierName,
    platform,
    supplier_url: link.url,
    unit_cost_cents: source.price_cents || null,
    shipping_cost_cents: shippingCostCents,
    delivery_days: deliveryDays,
    processing_days: deliveryDays ? 3 : null,
    verification_status: "auto_validated",
    is_preferred: true,
    notes: `Auto-created from validated wholesale link (confidence: ${matchConfidence}%)`,
    overall_supplier_score: matchConfidence,
  }, { onConflict: "product_id,supplier_url" }).select("id").single();

  if (error) {
    console.warn(`[validator] Failed to create supplier: ${error.message}`);
    return;
  }

  console.log(`[validator] ✅ Auto-created supplier: ${supplierName} (${platform})`);

  // Set as preferred and update product
  if (supplier) {
    // Unset other suppliers as preferred
    await supabase.from("product_suppliers")
      .update({ is_preferred: false })
      .eq("product_id", productId)
      .neq("id", supplier.id);

    // Update product with supplier info
    await supabase.from("products").update({
      preferred_supplier_id: supplier.id,
      supplier_url: link.url,
      supplier_price_cents: source.price_cents || null,
      updated_at: new Date().toISOString(),
    }).eq("id", productId);

    // Auto-trigger unit economics calculation
    try {
      console.log(`[validator] Triggering unit economics calculation...`);
      const econResp = await fetch(`${supabaseUrl}/functions/v1/calculate-unit-economics`, {
        method: "POST",
        headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId }),
      });
      if (econResp.ok) {
        const econData = await econResp.json();
        console.log(`[validator] Unit economics: grade=${econData.viability_grade}, net_margin=${econData.net_margin_pct}%`);
      } else {
        console.warn(`[validator] Unit economics failed: ${econResp.status}`);
      }
    } catch (e) {
      console.warn("[validator] Unit economics error (non-fatal):", e);
    }

    // Auto-trigger image scraping from supplier listing
    try {
      await fetch(`${supabaseUrl}/functions/v1/scrape-supplier-images`, {
        method: "POST",
        headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId, supplier_url: link.url }),
      });
    } catch { /* non-blocking */ }
  }
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

    console.log(`[validator] ===== Starting v2 validation for product ${product_id} =====`);

    // 1. Build canonical profile
    const canonical = await buildCanonicalProfile(supabase, product_id, openaiKey);
    console.log(`[validator] Canonical: "${canonical.canonical_name}" brand="${canonical.brand}" features=[${canonical.core_features.slice(0, 5).join(",")}]`);

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

    // Separate by type for logging
    const retailLinks = links.filter((l: any) => l.link_type !== "wholesale");
    const wholesaleLinks = links.filter((l: any) => l.link_type === "wholesale");
    console.log(`[validator] Validating ${links.length} links (${retailLinks.length} retail, ${wholesaleLinks.length} wholesale)`);

    const results = { confirmed: 0, rejected: 0, needs_review: 0, suppliers_created: 0 };

    for (const link of links) {
      try {
        // Skip unenriched links — LLM gets garbage data and wastes tokens
        const enrichStatus = link.source_enrichment_status || "pending";
        if (enrichStatus !== "enriched") {
          // For non-enriched links, require substantial data: enriched title + features
          const hasFullTitle = link.source_title_full && link.source_title_full.length > 20;
          const hasFeatures = link.source_features && link.source_features.length > 0;
          if (!hasFullTitle || !hasFeatures) {
            console.log(`[validator] ⏭️ Skipping ${link.link_type} link ${link.id} — enrichment=${enrichStatus}, insufficient data`);
            continue;
          }
        }

        const source = extractSourceListing(link);
        const isWholesale = source.link_type === "wholesale";

        // Hard rules first
        let result = applyHardRules(canonical, source);
        
        if (!result) {
          // LLM validation with mode-specific prompt
          result = await llmValidate(canonical, source, openaiKey);
          
          // Compute weighted final confidence
          const finalConfidence = computeFinalConfidence(canonical, source, result);
          result.confidence = finalConfidence;
          result.method = "combined";
        }

        const status = mapToStatus(result.confidence, result.verdict, isWholesale);
        results[status as keyof typeof results]++;

        // Update link
        const matchConfidence = Math.round(result.confidence * 100);
        await supabase.from("product_links").update({
          validation_status: status,
          match_confidence: matchConfidence,
          ai_verdict: result.verdict === "same_product",
          ai_confidence: matchConfidence,
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
            `mode:${isWholesale ? "wholesale" : "retail"}`,
          ],
          verified: status === "confirmed",
          last_checked_at: new Date().toISOString(),
        }).eq("id", link.id);

        console.log(`[validator] ${isWholesale ? "🏭" : "🏪"} ${link.platform} "${link.title?.slice(0, 50)}" → ${status} (${matchConfidence}%)`);

        // AUTO-CREATE SUPPLIER for confirmed wholesale links
        if (status === "confirmed" && isWholesale) {
          await autoCreateSupplier(supabase, supabaseUrl, supabaseKey, product_id, link, source, matchConfidence);
          results.suppliers_created++;
        }

        // Rate limit LLM calls
        if (result.method !== "hard_rule") {
          await new Promise(r => setTimeout(r, 300));
        }
      } catch (err) {
        console.warn(`[validator] Error validating link ${link.id}:`, err);
      }
    }

    // Recompute readiness
    await recomputeReadiness(supabase, product_id);

    // Auto-trigger image harvesting if confirmed retail links
    if (results.confirmed > 0) {
      try {
        const harvestResp = await fetch(`${supabaseUrl}/functions/v1/harvest-product-images`, {
          method: "POST",
          headers: { Authorization: `Bearer ${supabaseKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ product_id }),
        });
        if (harvestResp.ok) {
          const harvestData = await harvestResp.json();
          console.log(`[validator] Image harvest: ${harvestData.verified || 0} verified`);
        }
      } catch (e) {
        console.warn("[validator] Image harvest error (non-fatal):", e);
      }
    }

    console.log(`[validator] ===== Done: ${results.confirmed} confirmed, ${results.rejected} rejected, ${results.needs_review} review, ${results.suppliers_created} suppliers created =====`);

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
  const { data: economics } = await supabase.from("product_unit_economics").select("*").eq("product_id", productId).maybeSingle();

  const confirmedRetail = (links || []).filter((l: any) => l.validation_status === "confirmed" && l.link_type === "retail");
  const confirmedWholesale = (links || []).filter((l: any) => l.validation_status === "confirmed" && l.link_type === "wholesale");
  const verifiedImages = (images || []).filter((i: any) => i.verified || i.manually_approved);
  const hasPreferredSupplier = suppliers?.some((s: any) => s.is_preferred);
  const hasEconomics = economics && economics.viability_grade;

  // Score components (out of 100)
  const retailScore = Math.min(confirmedRetail.length * 15, 30);
  const wholesaleScore = Math.min(confirmedWholesale.length * 15, 20);
  const imageScore = Math.min(verifiedImages.length * 5, 20);
  const supplierScore = hasPreferredSupplier ? 15 : 0;
  const priceScore = confirmedRetail.some((l: any) => l.price_cents) ? 10 : 0;
  const economicsBonus = hasEconomics ? 5 : 0;

  const readinessScore = retailScore + wholesaleScore + imageScore + supplierScore + priceScore + economicsBonus;

  const confirmedAll = [...confirmedRetail, ...confirmedWholesale];
  const identityConfidence = confirmedAll.length > 0
    ? Math.round(confirmedAll.reduce((sum: number, l: any) => sum + (l.match_confidence || 0), 0) / confirmedAll.length)
    : 0;

  let readinessState = "research_only";
  if (readinessScore >= 60 && hasPreferredSupplier) readinessState = "ad_ready";
  else if (readinessScore >= 40) readinessState = "needs_assets";
  else if (confirmedRetail.length > 0 || confirmedWholesale.length > 0) readinessState = "links_verified";

  const bestRetail = confirmedRetail.sort((a: any, b: any) => (b.match_confidence || 0) - (a.match_confidence || 0))[0];

  await supabase.from("products").update({
    readiness_score: readinessScore,
    readiness_state: readinessState,
    identity_confidence: identityConfidence,
    purchase_url: bestRetail?.url || null,
    retail_anchor_price_cents: bestRetail?.price_cents || null,
    updated_at: new Date().toISOString(),
  }).eq("id", productId);

  console.log(`[validator] Readiness: score=${readinessScore}, state=${readinessState}, identity=${identityConfidence}%, supplier=${hasPreferredSupplier}, economics=${hasEconomics}`);
}
