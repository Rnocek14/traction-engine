/**
 * product-research v6 — Search Precision Layer
 * 
 * Tiered search strategy:
 *   Tier 1: Exact canonical name lookup (brand + model + specs)
 *   Tier 2: Site-specific exact product page patterns (Amazon, Shopify, manufacturer)
 *   Tier 3: Wholesale exact-form search (unbranded physical description)
 *   Tier 4: Fallback broader search (only if tiers 1-3 found <3 results)
 * 
 * Model-variant guard: rejects near-models (V5 when canonical is V2)
 * Source priority: Amazon > Shopify/DTC > Manufacturer > Temu > Walmart/eBay (deprioritized)
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ResearchRequest {
  product_id?: string;
  url?: string;
  name?: string;
}

interface SearchIdentity {
  corePhrase: string;
  brandName: string;
  modelIdentifier: string;       // e.g. "V2", "Pro Max", "Gen 3" — exact model string
  modifiers: string[];
  anchorTerms: string[];
  excludedConcepts: string[];
  excludedModels: string[];      // e.g. ["V5", "V3", "U5"] — near-models to reject
  queries: string[];
  wholesaleDescription: string;
  wholesaleQueries: string[];
  wholesaleAnchorTerms: string[];  // product-class words for wholesale gate (e.g. "lamp", "projector")
  wholesaleMechanism: string;      // how it works: "manual pump", "USB rechargeable", "LED"
  wholesaleFormFactor: string;     // physical shape: "handheld", "tabletop", "pendant"
  wholesaleMaterial: string;       // dominant material: "acrylic", "stainless steel"
  wholesaleKeySpecs: string[];     // distinguishing specs: "8 bar", "1080P", "16-color RGB"
  asin: string;                  // Amazon ASIN if known
  exactRetailTitle: string;      // Full exact product listing title for precision search
}

// ─── HELPERS ───

function detectPlatform(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("amazon.")) return "Amazon";
  if (u.includes("walmart.")) return "Walmart";
  if (u.includes("target.")) return "Target";
  if (u.includes("tiktok.com/") && u.includes("shop")) return "TikTok Shop";
  if (u.includes("aliexpress.")) return "AliExpress";
  if (u.includes("1688.com")) return "1688";
  if (u.includes("dhgate.")) return "DHgate";
  if (u.includes("temu.")) return "Temu";
  if (u.includes("ebay.")) return "eBay";
  if (u.includes("etsy.")) return "Etsy";
  if (u.includes("alibaba.")) return "Alibaba";
  try { return new URL(url).hostname.replace("www.", ""); } catch { return "unknown"; }
}

function classifyLinkType(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("aliexpress.") || u.includes("alibaba.") || u.includes("1688.com") || u.includes("dhgate.")) return "wholesale";
  return "retail";
}

const NON_PRODUCT_PATTERNS = [
  /\/blog[s]?\//i, /\/article[s]?\//i, /\/wiki\//i,
  /\/help\//i, /\/about\b/i,
  /\/faq/i, /\/terms/i, /\/privacy/i,
  /aws\.amazon\.com/i, /music\.amazon\.com/i, /advertising\.amazon/i,
  /smart\.dhgate\.com/i,
  /\/showroom\//i,
  /\/s\?k=/i,  // Amazon search pages
  /\/gp\/browse/i,
];

// Prefer product detail page URL patterns
const PRODUCT_PAGE_PATTERNS = [
  /amazon\.[^/]+\/dp\//i,
  /amazon\.[^/]+\/gp\/product\//i,
  /\/products?\//i,
  /\/item\//i,
  /\/itm\//i,
  /\/(p|pd|pdp)\//i,
  /\/ip\//i,  // Walmart product
];

function isUsefulUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.pathname === "/") return false;
    for (const p of NON_PRODUCT_PATTERNS) {
      if (p.test(url)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function isProductDetailPage(url: string): boolean {
  return PRODUCT_PAGE_PATTERNS.some(p => p.test(url));
}

function extractAsinFromUrl(url: string): string | null {
  const match = url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  return match ? match[1] : null;
}

// ─── MODEL-VARIANT GUARD ───
// Rejects near-models: if canonical is "V2", reject "V5", "V3", etc.
function passesModelGuard(title: string, identity: SearchIdentity): { passes: boolean; reason: string } {
  if (!identity.modelIdentifier && identity.excludedModels.length === 0) {
    return { passes: true, reason: "no_model_constraint" };
  }

  const titleLower = title.toLowerCase();

  // Check excluded models
  for (const excludedModel of identity.excludedModels) {
    const exLower = excludedModel.toLowerCase();
    // Look for the excluded model as a distinct token
    const regex = new RegExp(`\\b${exLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(titleLower)) {
      // But also check if the canonical model is present — if both are present, it might be a comparison page
      if (identity.modelIdentifier) {
        const canonRegex = new RegExp(`\\b${identity.modelIdentifier.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (!canonRegex.test(titleLower)) {
          return { passes: false, reason: `wrong_model:${excludedModel}` };
        }
      } else {
        return { passes: false, reason: `excluded_model:${excludedModel}` };
      }
    }
  }

  return { passes: true, reason: "model_ok" };
}

// ─── ANCHOR GATE (enhanced with model guard) ───

function passesAnchorGate(
  title: string,
  url: string,
  identity: SearchIdentity,
): { passes: boolean; reason: string } {
  const titleLower = (title || "").toLowerCase();
  const urlLower = url.toLowerCase();
  const combined = `${titleLower} ${urlLower}`;

  // Model variant guard first
  const modelCheck = passesModelGuard(title, identity);
  if (!modelCheck.passes) return modelCheck;

  // Check excluded concepts
  for (const ex of identity.excludedConcepts) {
    const exLower = ex.toLowerCase();
    if (combined.includes(exLower)) {
      const hasAnchor = identity.anchorTerms.some(a => combined.includes(a.toLowerCase()));
      if (!hasAnchor) {
        return { passes: false, reason: `excluded_concept:${ex}` };
      }
    }
  }

  // At least ONE anchor term must appear
  if (identity.anchorTerms.length > 0) {
    const hasAnchor = identity.anchorTerms.some(a => combined.includes(a.toLowerCase()));
    if (!hasAnchor) {
      return { passes: false, reason: `missing_anchor:[${identity.anchorTerms.join(",")}]` };
    }
  }

  return { passes: true, reason: "anchor_matched" };
}

// ─── WHOLESALE GATE (relaxed — no model guard, no excluded concepts) ───
// For wholesale/factory listings, only check product-class anchors.
// Brand mismatches and model variants are EXPECTED on wholesale sites.
function passesWholesaleGate(
  title: string,
  url: string,
  identity: SearchIdentity,
): { passes: boolean; reason: string } {
  const titleLower = (title || "").toLowerCase();
  const urlLower = url.toLowerCase();
  const combined = `${titleLower} ${urlLower}`;

  // Use wholesale-specific anchor terms (product class words like "lamp", "projector", "espresso")
  const wholesaleAnchors = identity.wholesaleAnchorTerms?.length > 0
    ? identity.wholesaleAnchorTerms
    : identity.anchorTerms;

  if (wholesaleAnchors.length > 0) {
    const hasAnchor = wholesaleAnchors.some(a => combined.includes(a.toLowerCase()));
    if (!hasAnchor) {
      return { passes: false, reason: `wholesale_missing_anchor:[${wholesaleAnchors.join(",")}]` };
    }
  }

  // Only reject truly wrong product CATEGORIES (not model/brand mismatches)
  // e.g. reject "car charger" when looking for "table lamp" — but allow brand differences
  const hardCategoryRejects = ["replacement parts", "carrying case", "screen protector", "phone case", "charger cable"];
  for (const reject of hardCategoryRejects) {
    if (combined.includes(reject) && !wholesaleAnchors.some(a => reject.includes(a.toLowerCase()))) {
      return { passes: false, reason: `wholesale_wrong_category:${reject}` };
    }
  }

  return { passes: true, reason: "wholesale_anchor_matched" };
}

// ─── STEP 1: EXTRACT CANONICAL SEARCH IDENTITY ───

async function extractSearchIdentity(productName: string, openaiKey: string, existingProduct?: any): Promise<SearchIdentity> {
  const existingFeatures = existingProduct?.distinctive_attributes || [];
  const existingExclusions = existingProduct?.excluded_variants || [];
  const existingCanonical = existingProduct?.canonical_name || "";
  const existingDescription = existingProduct?.short_description || "";
  
  const contextBlock = existingCanonical ? `
Known canonical name: "${existingCanonical}"
Known features: ${existingFeatures.join(", ") || "none"}
Known exclusions: ${existingExclusions.join(", ") || "none"}
Description: ${existingDescription || "none"}
Price: $${existingProduct?.price_cents ? (existingProduct.price_cents / 100).toFixed(2) : "unknown"}` : "";

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You extract a precise search identity for a SPECIFIC product to find it on marketplaces.

CRITICAL: You are identifying ONE specific product, not a product category.
- The goal is to find EXACTLY THIS product on Amazon, Shopify stores, and wholesale sites.
- Be as specific as possible with brand, model, and distinguishing specs.

Fields:
- brandName: The brand/manufacturer. Empty string if generic/unbranded.
- modelIdentifier: The specific model number/name (e.g. "V2", "Pro Max", "Gen 3", "MK-200"). Empty if no model.
- corePhrase: The full specific product phrase (3-10 words). Include brand + model + key type. E.g. "YABER V2 Mini Projector 1080P WiFi Bluetooth"
- modifiers: Additional qualifying words (color, size, capacity)
- anchorTerms: 1-3 words that MUST appear in any valid result. Product CLASS words.
- excludedConcepts: Related but wrong product types.
- excludedModels: CRITICAL — List 3-5 specific model variants that are NOT this product. If the product is "YABER V2", list ["V5", "V3", "U5", "V10", "Y60"]. If "Leroxo Crystal Lamp", list similar lamp brands/models.
- queries: Generate 4-6 EXACT retail search queries, ordered by precision:
  1. Exact full name in quotes: "YABER V2 Mini Projector 1080P WiFi Bluetooth"
  2. Brand + model: "YABER V2 projector"
  3. Site-specific: site:amazon.com "YABER V2"
  4. Brand + key specs: YABER V2 1080P projector
- asin: Amazon ASIN if you know it (e.g. from the product name or context). Empty string if unknown.
- exactRetailTitle: The EXACT product listing title as it would appear on Amazon/Walmart. Be as precise as possible.
- wholesaleDescription: Physical description for factory sourcing. NO brand names. Include: specs, dimensions, materials, connectors.
- wholesaleQueries: 2-3 unbranded queries for AliExpress/Alibaba.`
        },
        {
          role: "user",
          content: `Product: "${productName}"
${contextBlock}

Extract the canonical search identity. We need to find THIS EXACT product, not similar ones. Pay special attention to model variants that should be EXCLUDED.`
        }
      ],
      tools: [{
        type: "function",
        function: {
          name: "set_search_identity",
          parameters: {
            type: "object",
            properties: {
              brandName: { type: "string" },
              modelIdentifier: { type: "string", description: "Exact model number/name, empty if none" },
              corePhrase: { type: "string" },
              modifiers: { type: "array", items: { type: "string" } },
              anchorTerms: { type: "array", items: { type: "string" } },
              excludedConcepts: { type: "array", items: { type: "string" } },
              excludedModels: { type: "array", items: { type: "string" }, description: "3-5 near-model variants to reject" },
              queries: { type: "array", items: { type: "string" }, description: "4-6 precision-ordered retail queries" },
              asin: { type: "string", description: "Amazon ASIN if known, empty string otherwise" },
              exactRetailTitle: { type: "string", description: "Exact expected product listing title" },
              wholesaleDescription: { type: "string" },
              wholesaleQueries: { type: "array", items: { type: "string" } },
            },
            required: ["brandName", "modelIdentifier", "corePhrase", "modifiers", "anchorTerms", "excludedConcepts", "excludedModels", "queries", "asin", "exactRetailTitle", "wholesaleDescription", "wholesaleQueries"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "set_search_identity" } },
      temperature: 0.1,
    }),
  });

  if (!resp.ok) {
    console.warn(`[research] Identity extraction failed (${resp.status}), using fallback`);
    return fallbackIdentity(productName);
  }

  const data = await resp.json();
  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) return fallbackIdentity(productName);

  const identity: SearchIdentity = JSON.parse(call.function.arguments);
  console.log(`[research] Identity: brand="${identity.brandName}" model="${identity.modelIdentifier}" core="${identity.corePhrase}" anchors=[${identity.anchorTerms}] excludedModels=[${identity.excludedModels}] asin="${identity.asin}"`);
  return identity;
}

function fallbackIdentity(productName: string): SearchIdentity {
  const words = productName.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  return {
    corePhrase: productName,
    brandName: "",
    modelIdentifier: "",
    modifiers: [],
    anchorTerms: words.slice(0, 2),
    excludedConcepts: [],
    excludedModels: [],
    queries: [`"${productName}"`],
    wholesaleDescription: productName,
    wholesaleQueries: [`"${productName}"`],
    asin: "",
    exactRetailTitle: productName,
  };
}

// ─── TIERED SEARCH ───

interface SearchCandidate {
  url: string;
  title: string;
  price: string | null;
  thumbnail: string | null;
  source: string;
  gateResult: string;
  tier: number;
  isProductPage: boolean;
}

async function tieredSearch(
  identity: SearchIdentity,
  serpApiKey: string,
): Promise<SearchCandidate[]> {
  const results: SearchCandidate[] = [];
  const seen = new Set<string>();
  let gatedOut = 0;

  function tryAdd(url: string, title: string, price: string | null, thumbnail: string | null, source: string, tier: number): boolean {
    if (seen.has(url) || !isUsefulUrl(url)) return false;
    seen.add(url);

    const gate = passesAnchorGate(title, url, identity);
    if (!gate.passes) {
      gatedOut++;
      if (gatedOut <= 10) console.log(`[research] GATED: "${title?.slice(0, 60)}" → ${gate.reason}`);
      return false;
    }

    results.push({ url, title, price, thumbnail, source, gateResult: gate.reason, tier, isProductPage: isProductDetailPage(url) });
    return true;
  }

  async function serpGoogle(query: string, num: number = 10): Promise<Array<{ link: string; title: string; thumbnail?: string }>> {
    try {
      const q = encodeURIComponent(query);
      const resp = await fetch(`https://serpapi.com/search.json?engine=google&q=${q}&api_key=${serpApiKey}&num=${num}`);
      if (!resp.ok) return [];
      const data = await resp.json();
      return (data.organic_results || []).map((r: any) => ({ link: r.link, title: r.title || "", thumbnail: r.thumbnail }));
    } catch { return []; }
  }

  async function serpShopping(query: string, num: number = 10): Promise<Array<{ link: string; title: string; price?: string; thumbnail?: string }>> {
    try {
      const q = encodeURIComponent(query);
      const resp = await fetch(`https://serpapi.com/search.json?engine=google_shopping&q=${q}&api_key=${serpApiKey}&num=${num}`);
      if (!resp.ok) return [];
      const data = await resp.json();
      return (data.shopping_results || []).map((r: any) => ({
        link: r.product_link || r.link || r.source || "",
        title: r.title || "",
        price: r.extracted_price || r.price || null,
        thumbnail: r.thumbnail,
      }));
    } catch { return []; }
  }

  // ────────────────────────────────────────
  // TIER 1: Exact canonical name lookup
  // ────────────────────────────────────────
  console.log(`[research] === TIER 1: Exact lookup ===`);

  // 1a. If ASIN is known, go directly to Amazon
  if (identity.asin) {
    const asinUrl = `https://www.amazon.com/dp/${identity.asin}`;
    tryAdd(asinUrl, identity.exactRetailTitle, null, null, "tier1:asin_direct", 1);
  }

  // 1b. Exact quoted full name search
  const exactQuery = `"${identity.corePhrase}"`;
  const [exactShopping, exactOrganic] = await Promise.all([
    serpShopping(exactQuery, 8),
    serpGoogle(exactQuery, 5),
  ]);

  for (const r of exactShopping) {
    if (r.link?.startsWith("http")) tryAdd(r.link, r.title, r.price || null, r.thumbnail || null, "tier1:exact_shopping", 1);
  }
  for (const r of exactOrganic) {
    if (r.link?.startsWith("http")) tryAdd(r.link, r.title, null, r.thumbnail || null, "tier1:exact_organic", 1);
  }

  console.log(`[research] Tier 1 results: ${results.length} passed, ${gatedOut} gated`);
  await new Promise(r => setTimeout(r, 300));

  // ────────────────────────────────────────
  // TIER 2: Site-specific exact product pages
  // ────────────────────────────────────────
  console.log(`[research] === TIER 2: Site-specific exact lookup ===`);

  // Priority sites: Amazon first, then Shopify/DTC, then others
  const brandPrefix = identity.brandName ? `"${identity.brandName}" ` : "";
  const modelPrefix = identity.modelIdentifier ? `${identity.modelIdentifier} ` : "";
  const coreSearch = `${brandPrefix}${modelPrefix}${identity.corePhrase}`;

  // Amazon — highest priority
  const amazonQueries = [
    `site:amazon.com ${coreSearch}`,
    identity.brandName && identity.modelIdentifier ? `site:amazon.com "${identity.brandName}" "${identity.modelIdentifier}"` : null,
  ].filter(Boolean) as string[];

  for (const aq of amazonQueries) {
    const amazonResults = await serpGoogle(aq, 5);
    for (const r of amazonResults) {
      if (r.link?.startsWith("http")) {
        // Extract ASIN from URL for bonus precision tracking
        const asin = extractAsinFromUrl(r.link);
        const source = asin ? `tier2:amazon_asin:${asin}` : "tier2:amazon";
        tryAdd(r.link, r.title, null, r.thumbnail || null, source, 2);
      }
    }
    await new Promise(r => setTimeout(r, 250));
  }

  // Shopify/DTC — look for brand's own store
  if (identity.brandName) {
    const shopifyResults = await serpGoogle(`"${identity.brandName}" ${identity.corePhrase} site:*.myshopify.com OR inurl:/products/`, 5);
    for (const r of shopifyResults) {
      if (r.link?.startsWith("http")) tryAdd(r.link, r.title, null, r.thumbnail || null, "tier2:shopify_dtc", 2);
    }
    await new Promise(r => setTimeout(r, 250));
  }

  // Manufacturer/brand website
  if (identity.brandName) {
    const brandResults = await serpGoogle(`"${identity.brandName}" official ${identity.modelIdentifier || identity.corePhrase}`, 3);
    for (const r of brandResults) {
      if (r.link?.startsWith("http")) tryAdd(r.link, r.title, null, r.thumbnail || null, "tier2:brand_official", 2);
    }
    await new Promise(r => setTimeout(r, 250));
  }

  // Temu (often has exact matches for dropshipping products)
  const temuResults = await serpGoogle(`site:temu.com ${coreSearch}`, 3);
  for (const r of temuResults) {
    if (r.link?.startsWith("http")) tryAdd(r.link, r.title, null, r.thumbnail || null, "tier2:temu", 2);
  }

  console.log(`[research] Tier 2 results: ${results.length} passed, ${gatedOut} gated`);
  await new Promise(r => setTimeout(r, 300));

  // ────────────────────────────────────────
  // TIER 3: Wholesale exact-form search
  // ────────────────────────────────────────
  console.log(`[research] === TIER 3: Wholesale exact-form ===`);

  const wholesaleSites = ["aliexpress.com", "alibaba.com"];  // DHgate deprioritized — too noisy
  for (const site of wholesaleSites) {
    for (const wq of identity.wholesaleQueries.slice(0, 2)) {
      const wResults = await serpGoogle(`${wq} site:${site}`, 5);
      for (const r of wResults) {
        if (r.link?.startsWith("http")) {
          if (seen.has(r.link) || !isUsefulUrl(r.link)) continue;
          seen.add(r.link);
          const gate = passesAnchorGate(r.title || "", r.link, identity);
          if (!gate.passes) {
            gatedOut++;
            continue;
          }
          results.push({
            url: r.link, title: r.title || "", price: null, thumbnail: r.thumbnail || null,
            source: `tier3:wholesale:${site}`, gateResult: gate.reason, tier: 3, isProductPage: isProductDetailPage(r.link),
          });
        }
      }
      await new Promise(r => setTimeout(r, 250));
    }
  }

  console.log(`[research] Tier 3 results: ${results.length} passed, ${gatedOut} gated`);

  // ────────────────────────────────────────
  // TIER 4: Fallback broader search (only if <3 results from tiers 1-3)
  // ────────────────────────────────────────
  const productPageResults = results.filter(r => r.isProductPage);
  if (productPageResults.length < 3) {
    console.log(`[research] === TIER 4: Fallback (only ${productPageResults.length} product pages found) ===`);

    // Broader shopping search without exact quotes
    const fallbackQuery = `${identity.brandName} ${identity.corePhrase} ${identity.modifiers.slice(0, 2).join(" ")}`.trim();
    const fallbackResults = await serpShopping(fallbackQuery, 15);
    for (const r of fallbackResults) {
      if (r.link?.startsWith("http")) tryAdd(r.link, r.title, r.price || null, r.thumbnail || null, "tier4:broad_shopping", 4);
    }

    // Also try Walmart/eBay as fallback only
    for (const site of ["walmart.com", "ebay.com"]) {
      const fbResults = await serpGoogle(`${fallbackQuery} site:${site}`, 3);
      for (const r of fbResults) {
        if (r.link?.startsWith("http")) tryAdd(r.link, r.title, null, r.thumbnail || null, `tier4:fallback:${site}`, 4);
      }
      await new Promise(r => setTimeout(r, 200));
    }

    console.log(`[research] Tier 4 results: ${results.length} passed, ${gatedOut} gated`);
  } else {
    console.log(`[research] Skipping Tier 4 — ${productPageResults.length} product pages already found`);
  }

  // Sort: product detail pages first, then by tier, then Amazon first
  results.sort((a, b) => {
    if (a.isProductPage !== b.isProductPage) return a.isProductPage ? -1 : 1;
    if (a.tier !== b.tier) return a.tier - b.tier;
    const aIsAmazon = a.url.includes("amazon.") ? 0 : 1;
    const bIsAmazon = b.url.includes("amazon.") ? 0 : 1;
    return aIsAmazon - bIsAmazon;
  });

  console.log(`[research] TOTAL: ${results.length} candidates (${productPageResults.length} product pages), ${gatedOut} gated out`);
  return results;
}

// ─── PERPLEXITY INTELLIGENCE ───
async function getMarketIntelligence(productName: string, perplexityKey: string): Promise<{ summary: string; socialProof: string }> {
  async function ask(query: string, system: string): Promise<string> {
    try {
      const resp = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${perplexityKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "sonar",
          messages: [{ role: "system", content: system }, { role: "user", content: query }],
          max_tokens: 2000,
          search_recency_filter: "month",
        }),
      });
      if (!resp.ok) return "";
      const data = await resp.json();
      return data.choices?.[0]?.message?.content || "";
    } catch { return ""; }
  }

  const [summary, socialProof] = await Promise.all([
    ask(
      `What is "${productName}"? What is the typical retail price? What makes it popular? Is it a good dropshipping product?`,
      `You are a product market analyst. Provide a brief, factual summary of this product: what it is, price range, why it's popular, and any concerns. Be concise.`
    ),
    ask(
      `"${productName}" TikTok viral views creators competition. How many views? Is it saturated?`,
      `You are a social media trend analyst. Briefly assess this product's social presence: approximate view counts, creator competition level, and whether it's emerging or saturated. Be specific with numbers when available.`
    ),
  ]);

  return { summary, socialProof };
}

// ─── AI SCORING ───
async function scoreProduct(
  productName: string,
  intelligence: { summary: string; socialProof: string },
  candidateCount: number,
  openaiKey: string,
): Promise<Record<string, any>> {
  const context = `Product: "${productName}"

Market Intelligence:
${intelligence.summary}

Social Proof:
${intelligence.socialProof}

Search Results: ${candidateCount} product listings found across marketplaces.`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You score dropshipping products. Be honest and conservative.

SCORING (1-5):
- wow_factor: Visual impact for short-form video
- social_media_potential: Engagement/shareability
- impulse_buy_appeal: Instant buy trigger
- demonstrability_score: Can you show value in <10 seconds?
- competition_level: 5=saturated, 1=untapped

TRENDING STATUS: emerging | rising | peak | declining | saturated
EMOTIONAL TRIGGERS (pick 2-4): wow, satisfaction, transformation, curiosity, gift, before_after, problem_solved, luxury_affordable, convenience`,
        },
        { role: "user", content: context },
      ],
      tools: [{
        type: "function",
        function: {
          name: "score_product",
          parameters: {
            type: "object",
            properties: {
              category: { type: "string" },
              subcategory: { type: "string" },
              wow_factor: { type: "integer", minimum: 1, maximum: 5 },
              social_media_potential: { type: "integer", minimum: 1, maximum: 5 },
              impulse_buy_appeal: { type: "integer", minimum: 1, maximum: 5 },
              demonstrability_score: { type: "integer", minimum: 1, maximum: 5 },
              competition_level: { type: "integer", minimum: 1, maximum: 5 },
              trending_status: { type: "string", enum: ["emerging", "rising", "peak", "declining", "saturated"] },
              emotional_triggers: { type: "array", items: { type: "string" } },
              price_sweet_spot: { type: "boolean" },
              estimated_retail_price_cents: { type: "integer" },
              estimated_supplier_price_cents: { type: "integer" },
              summary: { type: "string" },
            },
            required: ["category", "wow_factor", "social_media_potential", "impulse_buy_appeal", "demonstrability_score", "competition_level", "trending_status", "emotional_triggers", "summary"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "score_product" } },
      temperature: 0.3,
    }),
  });

  if (!resp.ok) throw new Error(`Scoring failed: ${resp.status}`);
  const data = await resp.json();
  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error("No tool call");
  return JSON.parse(call.function.arguments);
}

// ─── MAIN HANDLER ───
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY")!;
    const perplexityKey = Deno.env.get("PERPLEXITY_API_KEY") || null;
    const serpApiKey = Deno.env.get("SERPAPI_API_KEY") || null;

    if (!serpApiKey) {
      return new Response(JSON.stringify({ error: "SERPAPI_API_KEY required" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body: ResearchRequest = await req.json();

    let productName = body.name || "";
    let productId = body.product_id;
    let existingProduct: any = null;

    if (productId) {
      const { data: product } = await supabase.from("products").select("*").eq("id", productId).single();
      if (product) {
        productName = product.canonical_name || product.name;
        existingProduct = product;
      }
    }

    if (!productName) {
      return new Response(JSON.stringify({ error: "name required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const searchName = productName
      .replace(/\([^)]*\)/g, "")
      .replace(/\b(tiktok|youtube|instagram|facebook|viral)\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    console.log(`[research] ===== v6 PRECISION RESEARCH: "${searchName}" =====`);

    // STEP 1: Extract canonical search identity
    const identity = await extractSearchIdentity(searchName, openaiKey, existingProduct);
    
    if (productId) {
      await supabase.from("products").update({
        distinctive_attributes: identity.anchorTerms,
        excluded_variants: [...identity.excludedConcepts, ...identity.excludedModels],
        canonical_name: identity.corePhrase,
      }).eq("id", productId);
    }

    // STEP 2: Tiered precision search
    const candidates = await tieredSearch(identity, serpApiKey);

    // STEP 3: Market intelligence
    let intelligence = { summary: "", socialProof: "" };
    if (perplexityKey) {
      intelligence = await getMarketIntelligence(searchName, perplexityKey);
    }

    // STEP 4: AI scoring
    const scoring = await scoreProduct(searchName, intelligence, candidates.length, openaiKey);
    
    const competitionInv = 6 - (scoring.competition_level || 3);
    const overallScore = Math.round(
      ((scoring.wow_factor || 3) * 0.30 +
        (scoring.social_media_potential || 3) * 0.25 +
        (scoring.impulse_buy_appeal || 3) * 0.20 +
        (scoring.demonstrability_score || 3) * 0.15 +
        competitionInv * 0.10) / 5 * 100
    );

    // STEP 5: Save everything
    if (!productId) {
      const { data: newProduct, error: insertErr } = await supabase
        .from("products")
        .insert({
          name: productName,
          canonical_name: identity.corePhrase,
          distinctive_attributes: identity.anchorTerms,
          excluded_variants: [...identity.excludedConcepts, ...identity.excludedModels],
          category: scoring.category || null,
          subcategory: scoring.subcategory || null,
          price_cents: scoring.estimated_retail_price_cents || null,
          supplier_price_cents: scoring.estimated_supplier_price_cents || null,
          status: "researching",
          discovered_via: "manual",
          notes: scoring.summary || null,
        })
        .select("id")
        .single();
      if (insertErr || !newProduct) throw new Error(`Failed to create product: ${insertErr?.message}`);
      productId = newProduct.id;
    } else {
      await supabase.from("products").update({
        category: scoring.category || undefined,
        subcategory: scoring.subcategory || undefined,
        price_cents: scoring.estimated_retail_price_cents || undefined,
        supplier_price_cents: scoring.estimated_supplier_price_cents || undefined,
        status: "researching",
        notes: scoring.summary || undefined,
        updated_at: new Date().toISOString(),
      }).eq("id", productId);
    }

    // Save/update analysis
    const { data: existingAnalysis } = await supabase
      .from("product_analysis")
      .select("id")
      .eq("product_id", productId)
      .maybeSingle();

    const analysisRow = {
      product_id: productId,
      wow_factor: scoring.wow_factor,
      social_media_potential: scoring.social_media_potential,
      impulse_buy_appeal: scoring.impulse_buy_appeal,
      demonstrability_score: scoring.demonstrability_score,
      competition_level: scoring.competition_level,
      trending_status: scoring.trending_status,
      emotional_triggers: scoring.emotional_triggers || [],
      price_sweet_spot: scoring.price_sweet_spot ?? false,
      overall_score: overallScore,
      analyzed_by: "ai_v6_precision",
      analyzed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (existingAnalysis) {
      await supabase.from("product_analysis").update(analysisRow).eq("id", existingAnalysis.id);
    } else {
      await supabase.from("product_analysis").insert(analysisRow);
    }

    // Clear old unconfirmed links
    await supabase.from("product_links")
      .delete()
      .eq("product_id", productId)
      .or("validation_status.eq.pending,validation_status.eq.rejected,validation_status.is.null");

    // Save candidates — prioritize product pages, limit to top 20
    if (candidates.length > 0) {
      const topCandidates = candidates.slice(0, 20);
      const linkRows = topCandidates.map(c => {
        const priceCents = c.price ? parsePriceToCents(c.price) : null;
        return {
          product_id: productId,
          url: c.url,
          link_type: classifyLinkType(c.url),
          platform: detectPlatform(c.url),
          price_cents: priceCents,
          title: c.title || null,
          verified: false,
          match_confidence: 0,
          validation_status: "pending",
          validation_reasons: [`source:${c.source}`, `gate:${c.gateResult}`, `tier:${c.tier}`, c.isProductPage ? "is_pdp" : "not_pdp"],
          fetch_method: `serp_v6_tier${c.tier}`,
        };
      });
      const { error: linkErr } = await supabase.from("product_links").insert(linkRows);
      if (linkErr) console.warn("[research] Failed to save candidate links:", linkErr);
      else {
        const pdpCount = topCandidates.filter(c => c.isProductPage).length;
        const tierCounts = [1,2,3,4].map(t => topCandidates.filter(c => c.tier === t).length);
        console.log(`[research] Saved ${linkRows.length} candidates (${pdpCount} PDPs) — Tier breakdown: T1=${tierCounts[0]} T2=${tierCounts[1]} T3=${tierCounts[2]} T4=${tierCounts[3]}`);
      }

      // Auto-chain: enrich → validate
      if (productId && linkRows.length > 0) {
        try {
          console.log(`[research] Auto-triggering enrichment for ${linkRows.length} candidates...`);
          const enrichResp = await fetch(`${supabaseUrl}/functions/v1/enrich-product-links`, {
            method: "POST",
            headers: { Authorization: `Bearer ${supabaseServiceKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ product_id: productId, max_links: 15 }),
          });
          if (enrichResp.ok) {
            const enrichData = await enrichResp.json();
            console.log(`[research] Enrichment: ${enrichData.enriched} enriched, ${enrichData.failed} failed`);
          }

          console.log(`[research] Auto-triggering validation...`);
          const validateResp = await fetch(`${supabaseUrl}/functions/v1/validate-product-links`, {
            method: "POST",
            headers: { Authorization: `Bearer ${supabaseServiceKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ product_id: productId, mode: "all_pending" }),
          });
          if (validateResp.ok) {
            const validateData = await validateResp.json();
            console.log(`[research] Validation: ${validateData.confirmed} confirmed, ${validateData.rejected} rejected`);
          }
        } catch (e) {
          console.warn("[research] Auto-chain error (non-fatal):", e);
        }
      }
    }

    const pdpCount = candidates.filter(c => c.isProductPage).length;
    console.log(`[research] ===== COMPLETE: score=${overallScore}, ${candidates.length} candidates (${pdpCount} PDPs) =====`);

    return new Response(
      JSON.stringify({
        success: true,
        product_id: productId,
        overall_score: overallScore,
        candidates_found: candidates.length,
        product_pages_found: pdpCount,
        identity: {
          corePhrase: identity.corePhrase,
          brandName: identity.brandName,
          modelIdentifier: identity.modelIdentifier,
          anchorTerms: identity.anchorTerms,
          excludedModels: identity.excludedModels,
          asin: identity.asin,
        },
        analysis: scoring,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[research] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function parsePriceToCents(priceStr: string): number | null {
  const match = priceStr.replace(/[^0-9.,]/g, "").match(/([\d,]+\.?\d{0,2})/);
  if (!match) return null;
  return Math.round(parseFloat(match[1].replace(",", "")) * 100);
}
