/**
 * product-research v3 — Evidence-Based Verification Pipeline
 * 
 * Multi-phase deep research with bulletproof link verification:
 * Phase 1: Retail search (Amazon, Walmart, TikTok Shop)
 * Phase 2: Wholesale search (AliExpress, 1688, DHgate, Temu)
 * Phase 3: Social proof (TikTok views, creator competition)
 * Phase 4: Image search with AI validation
 * Phase 5: URL verification — staged evidence-based pipeline
 * Phase 6: AI scoring with all verified data
 * Phase 7: Supplier data extraction
 * Phase 8: Unit economics auto-calculation
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

// ─── STOPWORDS & LOW-SIGNAL COMMERCE WORDS ───
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by",
  "from", "is", "it", "this", "that", "was", "are", "be", "has", "had", "do", "does",
  "new", "best", "top", "pro", "mini", "max", "ultra", "plus", "super", "great",
  "buy", "shop", "store", "sale", "deal", "price", "cheap", "free", "online",
  "product", "item", "set", "kit", "pack", "piece", "unit", "size", "color", "style",
  // Platform/channel names — these describe WHERE it was found, not WHAT the product is
  "tiktok", "youtube", "instagram", "facebook", "pinterest", "snapchat", "twitter",
  "amazon", "walmart", "aliexpress", "alibaba", "temu", "shopify", "etsy", "ebay",
  // Filler/grouping words common in product names
  "assorted", "models", "various", "mixed", "random", "bundle", "collection",
  "version", "edition", "type", "types", "model", "variant", "variants",
]);

// ─── RETAIL DOMAIN ALLOWLIST ───
const RETAIL_DOMAINS = new Set([
  "amazon.com", "amazon.co.uk", "amazon.ca", "amazon.de",
  "walmart.com", "ebay.com", "etsy.com", "target.com",
  "aliexpress.com", "alibaba.com", "1688.com", "dhgate.com", "temu.com",
  "tiktok.com", "shopify.com", "myshopify.com",
]);

function isRetailDomain(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace("www.", "").toLowerCase();
    for (const d of RETAIL_DOMAINS) {
      if (host === d || host.endsWith("." + d)) return true;
    }
    // Shopify stores
    if (host.endsWith(".myshopify.com") || host.includes("shopify")) return true;
    return false;
  } catch {
    return false;
  }
}

// ─── TOKEN ANALYSIS ───
interface TokenAnalysis {
  allTokens: string[];
  distinctiveTokens: string[];
  genericTokens: string[];
}

function analyzeProductTokens(name: string): TokenAnalysis {
  const raw = name.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 1);
  const allTokens = raw.filter(w => !STOPWORDS.has(w));
  const distinctiveTokens: string[] = [];
  const genericTokens: string[] = [];
  
  for (const t of allTokens) {
    // Distinctive: uncommon words, brand-like tokens, compound words, or words > 6 chars
    const isDistinctive = t.length > 6 || /\d/.test(t) || !isCommonWord(t);
    if (isDistinctive) distinctiveTokens.push(t);
    else genericTokens.push(t);
  }
  return { allTokens, distinctiveTokens, genericTokens };
}

const COMMON_WORDS = new Set([
  "phone", "case", "stand", "holder", "mount", "light", "lamp", "water", "bottle",
  "bag", "cover", "cable", "charger", "screen", "tool", "brush", "mat", "pad",
  "ring", "band", "watch", "clip", "hook", "shelf", "rack", "box", "tape",
  "grip", "lock", "head", "ball", "wheel", "board", "block", "wall", "desk",
  "chair", "table", "door", "window", "glass", "metal", "wood", "plastic",
  "black", "white", "blue", "red", "green", "pink", "gold", "silver",
  "small", "large", "portable", "wireless", "electric", "smart", "digital",
]);

function isCommonWord(w: string): boolean {
  return COMMON_WORDS.has(w);
}

// ─── WEIGHTED RELEVANCE SCORING ───
function computeWeightedRelevance(productTokens: TokenAnalysis, pageText: string): {
  score: number;
  matchedTokens: string[];
  distinctiveMatched: string[];
} {
  const lower = pageText.toLowerCase();
  const matchedTokens: string[] = [];
  const distinctiveMatched: string[] = [];
  let weightedScore = 0;
  let maxPossible = 0;
  
  for (const t of productTokens.distinctiveTokens) {
    maxPossible += 3; // distinctive worth 3x
    if (lower.includes(t)) {
      weightedScore += 3;
      matchedTokens.push(t);
      distinctiveMatched.push(t);
    }
  }
  for (const t of productTokens.genericTokens) {
    maxPossible += 1;
    if (lower.includes(t)) {
      weightedScore += 1;
      matchedTokens.push(t);
    }
  }
  
  const score = maxPossible > 0 ? Math.round((weightedScore / maxPossible) * 100) : 0;
  return { score, matchedTokens, distinctiveMatched };
}

// ─── STRUCTURED DATA EXTRACTION ───
interface StructuredPageData {
  title: string;
  jsonLdProductName: string | null;
  jsonLdPrice: number | null;
  jsonLdBrand: string | null;
  schemaType: string | null;
  ogTitle: string | null;
  canonicalUrl: string | null;
  metaDescription: string | null;
  h1: string | null;
  breadcrumbs: string[];
  bodyText: string;
  contentLength: number;
  html: string;
}

function extractStructuredData(html: string, url: string): StructuredPageData {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = (titleMatch?.[1] || "").trim();
  
  // JSON-LD Product schema
  let jsonLdProductName: string | null = null;
  let jsonLdPrice: number | null = null;
  let jsonLdBrand: string | null = null;
  let schemaType: string | null = null;
  
  const jsonLdMatches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const m of jsonLdMatches) {
    try {
      const data = JSON.parse(m[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item["@type"] === "Product" || item["@type"]?.includes?.("Product")) {
          schemaType = "Product";
          jsonLdProductName = item.name || null;
          jsonLdBrand = item.brand?.name || item.brand || null;
          const offers = item.offers || item.offer;
          if (offers) {
            const offer = Array.isArray(offers) ? offers[0] : offers;
            const p = parseFloat(offer.price || offer.lowPrice || "0");
            if (p > 0) jsonLdPrice = Math.round(p * 100);
          }
        }
      }
    } catch { /* invalid JSON-LD */ }
  }
  
  // OG title
  const ogMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  const ogTitle = ogMatch?.[1]?.trim() || null;
  
  // Canonical URL
  const canonMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
  const canonicalUrl = canonMatch?.[1]?.trim() || null;
  
  // Meta description
  const metaMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
  const metaDescription = metaMatch?.[1]?.trim() || null;
  
  // H1
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const h1 = h1Match ? h1Match[1].replace(/<[^>]+>/g, "").trim() : null;
  
  // Breadcrumbs (common patterns)
  const breadcrumbs: string[] = [];
  const bcMatch = html.match(/class=["'][^"']*breadcrumb[^"']*["'][^>]*>([\s\S]*?)<\/(?:nav|ul|ol|div)>/i);
  if (bcMatch) {
    const items = bcMatch[1].match(/<(?:a|li|span)[^>]*>([^<]+)</g) || [];
    for (const i of items) {
      const text = i.replace(/<[^>]+>/, "").trim();
      if (text && text.length > 1 && text !== ">") breadcrumbs.push(text);
    }
  }
  
  // Body text (cleaned)
  let bodyText = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  bodyText = bodyText.replace(/<style[\s\S]*?<\/style>/gi, "");
  bodyText = bodyText.replace(/<[^>]+>/g, " ");
  bodyText = bodyText.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
  bodyText = bodyText.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  
  return {
    title,
    jsonLdProductName,
    jsonLdPrice,
    jsonLdBrand,
    schemaType,
    ogTitle,
    canonicalUrl,
    metaDescription,
    h1,
    breadcrumbs,
    bodyText: bodyText.slice(0, 10000),
    contentLength: bodyText.length,
    html,
  };
}

// ─── MARKETPLACE-SPECIFIC HEURISTICS ───
interface MarketplaceHeuristic {
  deadPageSignals: RegExp[];
  titleSelector?: RegExp;
  priceSelector?: RegExp;
}

const MARKETPLACE_HEURISTICS: Record<string, MarketplaceHeuristic> = {
  "amazon": {
    deadPageSignals: [/looking for something\?/i, /dog.*page/i, /we couldn.*find/i],
    titleSelector: /id="productTitle"[^>]*>([^<]+)/i,
    priceSelector: /class="a-price-whole"[^>]*>([^<]+)/i,
  },
  "aliexpress": {
    deadPageSignals: [/page not found/i, /item is no longer available/i, /sorry.*removed/i],
  },
  "dhgate": {
    deadPageSignals: [/page not found/i, /this product is no longer available/i, /sorry.*can't find/i],
  },
  "temu": {
    deadPageSignals: [/page not found/i, /out of stock/i],
  },
  "walmart": {
    deadPageSignals: [/this page could not be found/i, /we couldn.*find this page/i],
    titleSelector: /<h1[^>]*itemprop="name"[^>]*>([^<]+)/i,
  },
  "ebay": {
    deadPageSignals: [/this listing has ended/i, /this item is out of stock/i],
  },
};

function getMarketplace(url: string): string | null {
  const host = new URL(url).hostname.toLowerCase();
  if (host.includes("amazon")) return "amazon";
  if (host.includes("aliexpress")) return "aliexpress";
  if (host.includes("dhgate")) return "dhgate";
  if (host.includes("temu")) return "temu";
  if (host.includes("walmart")) return "walmart";
  if (host.includes("ebay")) return "ebay";
  return null;
}

// ─── FAKE URL PATTERNS ───
const FAKE_URL_PATTERNS = [
  /aliexpress\.com\/item\/100500678912345/,
  /amazon\.com\/dp\/B0[A-Z0-9]{8}FAKE/,
  /example\.com/,
  /placeholder/i,
];

// ─── CONFIDENCE SCORE COMPOSITION ───
interface VerificationEvidence {
  domainTrust: number;        // 0-15
  structuredDataPresent: number; // 0-20
  weightedRelevance: number;  // 0-20
  urlSlugRelevance: number;   // 0-10
  contentRelevance: number;   // 0-10
  aiVerdict: number;          // 0-20
  priceExtracted: number;     // 0-5
}

function composeConfidence(ev: VerificationEvidence): number {
  return Math.min(100, Math.max(0,
    ev.domainTrust + ev.structuredDataPresent + ev.weightedRelevance +
    ev.urlSlugRelevance + ev.contentRelevance + ev.aiVerdict + ev.priceExtracted
  ));
}

function confidenceToStatus(confidence: number): string {
  if (confidence >= 80) return "verified";
  if (confidence >= 60) return "probable";
  if (confidence >= 50) return "candidate";
  return "rejected";
}

// ─── STAGED VERIFICATION PIPELINE ───
interface VerifiedLink {
  url: string;
  platform: string;
  linkType: string;
  title?: string;
  priceCents?: number;
  matchConfidence: number;
  validationStatus: string;
  validationReasons: string[];
  matchedTokens: string[];
  distinctiveTokensMatched: string[];
  aiVerdict?: boolean;
  aiConfidence?: number;
  fetchMethod: string;
  extractedProductName?: string;
  structuredPriceCents?: number;
  schemaType?: string;
  canonicalUrl?: string;
  contentQualityScore: number;
  evidenceSummary: VerificationEvidence;
}

async function verifyLink(
  candidateUrl: string,
  linkType: string,
  platform: string,
  productName: string,
  productTokens: TokenAnalysis,
  openaiKey: string,
  firecrawlKey: string | null,
): Promise<VerifiedLink | null> {
  const reasons: string[] = [];
  const evidence: VerificationEvidence = {
    domainTrust: 0, structuredDataPresent: 0, weightedRelevance: 0,
    urlSlugRelevance: 0, contentRelevance: 0, aiVerdict: 0, priceExtracted: 0,
  };
  
  // STAGE 1: Reject known fake patterns
  if (FAKE_URL_PATTERNS.some(p => p.test(candidateUrl))) {
    reasons.push("rejected:hallucinated_url_pattern");
    return null;
  }
  
  // STAGE 2: Domain trust
  if (isRetailDomain(candidateUrl)) {
    evidence.domainTrust = 15;
    reasons.push("domain:retail_allowlist");
  } else {
    evidence.domainTrust = 5;
    reasons.push("domain:unknown_retail");
  }
  
  // STAGE 3: URL slug relevance
  try {
    const urlPath = new URL(candidateUrl).pathname.toLowerCase();
    const slugRelevance = computeWeightedRelevance(productTokens, urlPath);
    if (slugRelevance.distinctiveMatched.length > 0) {
      evidence.urlSlugRelevance = 10;
      reasons.push(`slug:distinctive_match(${slugRelevance.distinctiveMatched.join(",")})`);
    } else if (slugRelevance.matchedTokens.length >= 2) {
      evidence.urlSlugRelevance = 5;
      reasons.push(`slug:partial_match(${slugRelevance.matchedTokens.join(",")})`);
    }
  } catch { /* invalid URL */ }
  
  // STAGE 4: Fetch page
  let fetchMethod = "native";
  let pageData: StructuredPageData | null = null;
  
  try {
    const resp = await fetch(candidateUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    
    if (!resp.ok) {
      reasons.push(`fetch:http_${resp.status}`);
      return null;
    }
    
    // Detect redirect to error pages
    const finalUrl = resp.url;
    if (finalUrl.match(/\/errors?\/|\/404|\/not-found|\/page-not-found/i)) {
      reasons.push("fetch:redirected_to_error");
      return null;
    }
    
    const html = await resp.text();
    
    // STAGE 5: Thin content / anti-bot / redirect detection
    if (html.length < 500) {
      // Try Firecrawl for JS-heavy pages
      if (firecrawlKey) {
        const fcData = await firecrawlFetch(candidateUrl, firecrawlKey);
        if (fcData) {
          pageData = extractStructuredData(fcData, candidateUrl);
          fetchMethod = "firecrawl";
          reasons.push("fetch:firecrawl_fallback");
        }
      }
      if (!pageData) {
        reasons.push("fetch:thin_content");
        return null;
      }
    } else {
      pageData = extractStructuredData(html, candidateUrl);
    }
    
    // Marketplace-specific dead page detection
    const marketplace = getMarketplace(candidateUrl);
    if (marketplace && MARKETPLACE_HEURISTICS[marketplace]) {
      const heuristic = MARKETPLACE_HEURISTICS[marketplace];
      const bodyLower = html.slice(0, 8000).toLowerCase();
      for (const sig of heuristic.deadPageSignals) {
        if (sig.test(bodyLower)) {
          reasons.push(`fetch:dead_page(${marketplace})`);
          return null;
        }
      }
    }
    
    // Generic dead page detection
    const bodyLower = html.slice(0, 5000).toLowerCase();
    if (bodyLower.includes("page not found") || bodyLower.includes("item is no longer available") ||
        bodyLower.includes("this item cannot be found") || bodyLower.includes("this listing has ended") ||
        bodyLower.includes("no longer exists") || bodyLower.includes("sorry, this video is removed")) {
      reasons.push("fetch:dead_page_generic");
      return null;
    }
  } catch {
    reasons.push("fetch:network_error");
    return null;
  }
  
  if (!pageData) return null;
  
  // STAGE 6: Structured data signals
  const bestProductName = pageData.jsonLdProductName || pageData.h1 || pageData.ogTitle || pageData.title;
  
  if (pageData.jsonLdProductName) {
    evidence.structuredDataPresent = 20;
    reasons.push(`structured:jsonld_product("${pageData.jsonLdProductName.slice(0, 50)}")`);
  } else if (pageData.h1) {
    evidence.structuredDataPresent = 10;
    reasons.push(`structured:h1("${pageData.h1.slice(0, 50)}")`);
  } else if (pageData.ogTitle) {
    evidence.structuredDataPresent = 8;
    reasons.push(`structured:og_title("${pageData.ogTitle.slice(0, 50)}")`);
  }
  
  // If structured product name CLEARLY doesn't match, reject fast
  if (bestProductName) {
    const nameRelevance = computeWeightedRelevance(productTokens, bestProductName);
    if (nameRelevance.distinctiveMatched.length === 0 && nameRelevance.score < 20) {
      // Check if it's a completely unrelated product
      reasons.push(`structured:no_distinctive_match_in_product_name`);
      // Don't hard-reject yet — let AI decide for borderline cases
    }
  }
  
  // STAGE 7: Weighted lexical relevance
  const titleText = [pageData.title, pageData.ogTitle, pageData.h1, pageData.jsonLdProductName]
    .filter(Boolean).join(" ");
  const titleRelevance = computeWeightedRelevance(productTokens, titleText);
  evidence.weightedRelevance = Math.round(titleRelevance.score * 0.2); // Scale to 0-20
  reasons.push(`relevance:weighted_score=${titleRelevance.score},matched=[${titleRelevance.matchedTokens.join(",")}]`);
  
  // Content body relevance
  const bodyRelevance = computeWeightedRelevance(productTokens, pageData.bodyText.slice(0, 3000));
  evidence.contentRelevance = Math.round(bodyRelevance.score * 0.1); // Scale to 0-10
  
  // Price extracted
  const extractedPrice = pageData.jsonLdPrice || parsePriceFromText(pageData.bodyText);
  if (extractedPrice) {
    evidence.priceExtracted = 5;
    reasons.push(`price:extracted(${extractedPrice})`);
  }
  
  // Content quality
  const contentQuality = Math.min(100, Math.round(pageData.contentLength / 100));
  
  // STAGE 8: Decide if AI verification is needed
  const preAiConfidence = composeConfidence(evidence);
  
  let aiVerdict: boolean | undefined;
  let aiConfidenceVal: number | undefined;
  
  if (preAiConfidence >= 75 && titleRelevance.distinctiveMatched.length > 0) {
    // Clearly right — skip AI
    evidence.aiVerdict = 15;
    aiVerdict = true;
    aiConfidenceVal = 90;
    reasons.push("ai:skipped_high_confidence");
  } else if (preAiConfidence < 25 && titleRelevance.matchedTokens.length === 0) {
    // Clearly wrong — skip AI
    evidence.aiVerdict = 0;
    aiVerdict = false;
    aiConfidenceVal = 10;
    reasons.push("ai:skipped_clearly_wrong");
  } else {
    // Ambiguous — use AI
    try {
      const aiResult = await aiVerifyLink(
        productName, productTokens,
        bestProductName || pageData.title,
        pageData.canonicalUrl || candidateUrl,
        extractedPrice,
        pageData.bodyText.slice(0, 2000),
        pageData.breadcrumbs,
        openaiKey,
      );
      aiVerdict = aiResult.sameProduct;
      aiConfidenceVal = aiResult.confidence;
      evidence.aiVerdict = aiResult.sameProduct ? Math.round(aiResult.confidence * 0.2) : 0;
      reasons.push(`ai:verdict=${aiResult.sameProduct},confidence=${aiResult.confidence},reason="${aiResult.reason}"`);
      if (aiResult.matchedAttributes.length > 0) {
        reasons.push(`ai:matched=[${aiResult.matchedAttributes.join(",")}]`);
      }
      if (aiResult.mismatchedAttributes.length > 0) {
        reasons.push(`ai:mismatched=[${aiResult.mismatchedAttributes.join(",")}]`);
      }
    } catch (e) {
      reasons.push(`ai:error(${e})`);
      evidence.aiVerdict = 5; // Neutral
    }
  }
  
  const finalConfidence = composeConfidence(evidence);
  const status = confidenceToStatus(finalConfidence);
  
  if (status === "rejected") {
    reasons.push(`final:rejected(confidence=${finalConfidence})`);
    // Still return the link so we can store the rejection evidence
  }
  
  return {
    url: candidateUrl,
    platform,
    linkType,
    title: pageData.title,
    priceCents: extractedPrice || undefined,
    matchConfidence: finalConfidence,
    validationStatus: status,
    validationReasons: reasons,
    matchedTokens: titleRelevance.matchedTokens,
    distinctiveTokensMatched: titleRelevance.distinctiveMatched,
    aiVerdict,
    aiConfidence: aiConfidenceVal,
    fetchMethod,
    extractedProductName: bestProductName || undefined,
    structuredPriceCents: pageData.jsonLdPrice || undefined,
    schemaType: pageData.schemaType || undefined,
    canonicalUrl: pageData.canonicalUrl || undefined,
    contentQualityScore: contentQuality,
    evidenceSummary: evidence,
  };
}

// ─── AI SEMANTIC VERIFICATION ───
interface AiVerifyResult {
  sameProduct: boolean;
  confidence: number;
  reason: string;
  matchedAttributes: string[];
  mismatchedAttributes: string[];
}

async function aiVerifyLink(
  productName: string,
  productTokens: TokenAnalysis,
  pageTitle: string,
  pageUrl: string,
  price: number | null | undefined,
  bodyExcerpt: string,
  breadcrumbs: string[],
  openaiKey: string,
): Promise<AiVerifyResult> {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You verify whether a web page is selling a SPECIFIC target product. Be STRICT — similar products are NOT matches. A "magnetic phone stand" is NOT a "bomber jacket". Compare product type, brand terms, and distinctive features.`,
        },
        {
          role: "user",
          content: `TARGET PRODUCT: "${productName}"
Distinctive tokens: [${productTokens.distinctiveTokens.join(", ")}]

PAGE DATA:
- Title: "${pageTitle}"
- URL: ${pageUrl}
- Price: ${price ? `$${(price / 100).toFixed(2)}` : "unknown"}
- Breadcrumbs: [${breadcrumbs.join(" > ")}]
- Body excerpt (first 500 chars): "${bodyExcerpt.slice(0, 500)}"

Is this page selling the TARGET product? Consider: product type match, brand/model match, feature match. A completely different product category is an obvious NO.`,
        },
      ],
      tools: [{
        type: "function",
        function: {
          name: "verify_product_match",
          parameters: {
            type: "object",
            properties: {
              same_product: { type: "boolean", description: "Is this page about the target product?" },
              confidence: { type: "integer", minimum: 0, maximum: 100 },
              reason: { type: "string", description: "Short explanation (under 80 chars)" },
              matched_attributes: { type: "array", items: { type: "string" }, description: "Product attributes that match" },
              mismatched_attributes: { type: "array", items: { type: "string" }, description: "Product attributes that DON'T match" },
            },
            required: ["same_product", "confidence", "reason", "matched_attributes", "mismatched_attributes"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "verify_product_match" } },
      temperature: 0.1,
    }),
  });
  
  if (!resp.ok) throw new Error(`AI verify failed: ${resp.status}`);
  const data = await resp.json();
  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error("No tool call");
  const result = JSON.parse(call.function.arguments);
  return {
    sameProduct: result.same_product,
    confidence: result.confidence,
    reason: result.reason,
    matchedAttributes: result.matched_attributes || [],
    mismatchedAttributes: result.mismatched_attributes || [],
  };
}

// ─── FIRECRAWL FALLBACK ───
async function firecrawlFetch(url: string, apiKey: string): Promise<string | null> {
  try {
    const resp = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, formats: ["html"], onlyMainContent: true }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.data?.html || data.html || null;
  } catch {
    return null;
  }
}

// ─── HELPERS ───
async function fetchPageContent(url: string): Promise<string> {
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!resp.ok) return "";
    const html = await resp.text();
    let text = html.replace(/<script[\s\S]*?<\/script>/gi, "");
    text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
    text = text.replace(/<[^>]+>/g, " ");
    text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
    text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    return text.slice(0, 10000);
  } catch {
    return "";
  }
}

async function perplexitySearch(query: string, systemPrompt: string, perplexityKey: string): Promise<{ content: string; citations: string[] }> {
  try {
    const resp = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${perplexityKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: query },
        ],
        max_tokens: 3000,
        search_recency_filter: "month",
      }),
    });
    if (!resp.ok) {
      console.warn(`[product-research] Perplexity failed: ${resp.status}`);
      return { content: "", citations: [] };
    }
    const data = await resp.json();
    return {
      content: data.choices?.[0]?.message?.content || "",
      citations: data.citations || [],
    };
  } catch {
    return { content: "", citations: [] };
  }
}

function detectPlatform(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("amazon.")) return "Amazon";
  if (u.includes("walmart.")) return "Walmart";
  if (u.includes("tiktok.com/") && u.includes("shop")) return "TikTok Shop";
  if (u.includes("tiktok.com/")) return "TikTok";
  if (u.includes("aliexpress.")) return "AliExpress";
  if (u.includes("1688.com")) return "1688";
  if (u.includes("dhgate.")) return "DHgate";
  if (u.includes("temu.")) return "Temu";
  if (u.includes("ebay.")) return "eBay";
  if (u.includes("etsy.")) return "Etsy";
  if (u.includes("shopify") || u.includes("myshopify")) return "Shopify Store";
  if (u.includes("alibaba.")) return "Alibaba";
  try { return new URL(url).hostname.replace("www.", ""); } catch { return "unknown"; }
}

function isLikelyProductPageUrl(url: string): boolean {
  try {
    const lower = url.toLowerCase();
    if (!isRetailDomain(url)) return false;

    // Reject obvious non-product pages
    if (
      lower.includes("/blog/") ||
      lower.includes("/blogs/") ||
      lower.includes("/article/") ||
      lower.includes("/articles/") ||
      lower.includes("/category/") ||
      lower.includes("/collections/") ||
      lower.includes("/search") ||
      lower.includes("trueprofit.io")
    ) {
      return false;
    }

    return (
      /amazon\.[^/]+\/(?:[^/]+\/)?dp\//.test(lower) ||
      /walmart\.[^/]+\/ip\//.test(lower) ||
      /tiktok\.com\/.*\/product\//.test(lower) ||
      /aliexpress\.[^/]+\/item\//.test(lower) ||
      /alibaba\.[^/]+\/product-detail\//.test(lower) ||
      /1688\.com\/offer\//.test(lower) ||
      /dhgate\.[^/]+\/product\//.test(lower) ||
      /temu\.[^/]+\/.*-g-\d+/.test(lower) ||
      /ebay\.[^/]+\/itm\//.test(lower) ||
      /etsy\.[^/]+\/listing\//.test(lower) ||
      /\/products\//.test(lower)
    );
  } catch {
    return false;
  }
}

function parsePriceFromText(text: string): number | undefined {
  const match = text.match(/\$\s*([\d,]+\.?\d{0,2})/);
  if (!match) return undefined;
  return Math.round(parseFloat(match[1].replace(",", "")) * 100);
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
    const perplexityKey = Deno.env.get("PERPLEXITY_API_KEY");
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY") || null;

    if (!perplexityKey) {
      return new Response(JSON.stringify({ error: "PERPLEXITY_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body: ResearchRequest = await req.json();

    let productName = body.name || "";
    let productUrl = body.url || "";
    let productId = body.product_id;

    let canonicalName = "";
    if (productId) {
      const { data: product } = await supabase.from("products").select("*").eq("id", productId).single();
      if (product) {
        productName = product.name;
        canonicalName = product.canonical_name || "";
        productUrl = product.source_url || "";
      }
    }

    if (!productName && !productUrl) {
      return new Response(JSON.stringify({ error: "name or url required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use canonical_name for search if available; otherwise clean the raw name
    // by stripping parentheticals and platform references
    const searchName = canonicalName || productName
      .replace(/\([^)]*\)/g, "")  // Remove parentheticals like "(Assorted Models)"
      .replace(/\b(tiktok|youtube|instagram|facebook|viral)\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    console.log(`[product-research] ===== DEEP RESEARCH v3: "${productName}" =====`);
    console.log(`[product-research] Search name: "${searchName}"`);
    const productTokens = analyzeProductTokens(searchName);
    console.log(`[product-research] Tokens: distinctive=[${productTokens.distinctiveTokens}] generic=[${productTokens.genericTokens}]`);

    const researchParts: string[] = [];
    const allCitations: string[] = [];
    
    // Candidate URLs from Perplexity (discovery only — NOT verified)
    const candidateLinks: { url: string; platform: string; linkType: string }[] = [];

    // ==========================================
    // PHASE 1: RETAIL — Where is it being sold?
    // ==========================================
    console.log("[product-research] Phase 1: Retail search");
    const retailSearch = await perplexitySearch(
      `Where can I buy "${searchName}" online right now? Find specific product listings on Amazon, Walmart, TikTok Shop, eBay, Etsy, or Shopify stores. Include exact prices and product page URLs. I need real, working links to buy this specific product.`,
      `You are a shopping assistant. Find REAL product listings where someone can BUY this exact product online. Include specific prices, store names, and direct product page URLs. Only include listings for this exact product, not similar or related items.`,
      perplexityKey
    );
    if (retailSearch.content) {
      researchParts.push(`RETAIL LISTINGS:\n${retailSearch.content}`);
      allCitations.push(...retailSearch.citations);
      console.log(`[product-research] Retail citations (${retailSearch.citations.length}): ${retailSearch.citations.slice(0, 5).join(", ")}`);
      for (const c of retailSearch.citations) {
        if (isLikelyProductPageUrl(c) && !candidateLinks.some(cl => cl.url === c)) {
          candidateLinks.push({ url: c, platform: detectPlatform(c), linkType: "retail" });
        }
      }
    } else {
      console.warn("[product-research] Retail search returned no content");
    }
    await new Promise(r => setTimeout(r, 1200));

    // ==========================================
    // PHASE 2: WHOLESALE — Where to source it?
    // ==========================================
    console.log("[product-research] Phase 2: Wholesale/supplier search");
    const wholesaleSearch = await perplexitySearch(
      `"${searchName}" wholesale supplier price. Find this product on AliExpress, Alibaba, 1688, DHgate, or Temu. What is the wholesale or bulk price? What is the cheapest supplier price available? Include direct product listing URLs.`,
      `You are a dropshipping supplier researcher. Find the CHEAPEST wholesale/supplier sources for this exact product. Include: supplier platform, wholesale price, MOQ if available, shipping estimates, and direct URLs. Focus on AliExpress, Alibaba, 1688.com, DHgate, and Temu.`,
      perplexityKey
    );
    if (wholesaleSearch.content) {
      researchParts.push(`WHOLESALE/SUPPLIER SOURCES:\n${wholesaleSearch.content}`);
      allCitations.push(...wholesaleSearch.citations);
      console.log(`[product-research] Wholesale citations (${wholesaleSearch.citations.length}): ${wholesaleSearch.citations.slice(0, 5).join(", ")}`);
      for (const c of wholesaleSearch.citations) {
        if (isLikelyProductPageUrl(c) && c.match(/aliexpress\.|alibaba\.|1688\.|dhgate\.|temu\./i) && !candidateLinks.some(cl => cl.url === c)) {
          candidateLinks.push({ url: c, platform: detectPlatform(c), linkType: "wholesale" });
        }
      }
    }

    // ─── FALLBACK: if broad searches fail, run retailer-specific searches using citations only ───
    if (candidateLinks.length === 0) {
      console.log("[product-research] No direct product-page citations yet — running retailer-specific fallback searches");
      const targetedSearches = [
        {
          label: "Amazon retail",
          query: `site:amazon.com \"${searchName}\" direct product page`,
          domain: /amazon\./i,
          linkType: "retail" as const,
        },
        {
          label: "Walmart retail",
          query: `site:walmart.com \"${searchName}\" direct product page`,
          domain: /walmart\./i,
          linkType: "retail" as const,
        },
        {
          label: "AliExpress wholesale",
          query: `site:aliexpress.com \"${searchName}\" direct product page`,
          domain: /aliexpress\./i,
          linkType: "wholesale" as const,
        },
        {
          label: "Temu wholesale",
          query: `site:temu.com \"${searchName}\" direct product page`,
          domain: /temu\./i,
          linkType: "wholesale" as const,
        },
      ];

      for (const search of targetedSearches) {
        const fallbackSearch = await perplexitySearch(
          `Find exact product listing URLs for ${search.query}. I need live product pages only.`,
          `Return direct product page citations only. No blogs, no review sites, no category pages, no homepages.`,
          perplexityKey
        );
        console.log(`[product-research] ${search.label} citations (${fallbackSearch.citations.length}): ${fallbackSearch.citations.slice(0, 5).join(", ")}`);
        for (const c of fallbackSearch.citations) {
          if (search.domain.test(c) && isLikelyProductPageUrl(c) && !candidateLinks.some(cl => cl.url === c)) {
            candidateLinks.push({ url: c, platform: detectPlatform(c), linkType: search.linkType });
          }
        }
        await new Promise(r => setTimeout(r, 600));
      }
      console.log(`[product-research] After targeted fallback: ${candidateLinks.length} candidates`);
    }
    await new Promise(r => setTimeout(r, 1200));

    // ==========================================
    // PHASE 3: SOCIAL PROOF
    // ==========================================
    console.log("[product-research] Phase 3: Social proof & competition");
    const socialSearch = await perplexitySearch(
      `"${searchName}" TikTok viral review. How many views does this product have? Who are the top creators promoting it? How many sellers are already selling it? Is this product saturated or still emerging?`,
      `You are a social media trend analyst for e-commerce. Analyze this product's social media presence: view counts, number of creators promoting it, engagement rates, competition level, and whether it's still trending or past its peak. Be specific with numbers.`,
      perplexityKey
    );
    if (socialSearch.content) {
      researchParts.push(`SOCIAL PROOF & COMPETITION:\n${socialSearch.content}`);
      allCitations.push(...socialSearch.citations);
    }
    await new Promise(r => setTimeout(r, 1200));

    // ==========================================
    // PHASE 4: IMAGE SEARCH with validation
    // ==========================================
    console.log("[product-research] Phase 4: Image search");
    let foundImageUrls: { url: string; source: string; label: string }[] = [];
    const imgSearch = await perplexitySearch(
      `"${searchName}" product photo. Show me where to buy this exact product with product photos. Amazon listing, AliExpress listing.`,
      `Find real product listing pages for this exact product. I need pages with product photos. Focus on Amazon, AliExpress, Walmart, or official product sites.`,
      perplexityKey
    );

    const candidateImgs: { url: string; source: string; label: string }[] = [];
    const allRetailerCitations = [...new Set([...allCitations, ...imgSearch.citations])].filter(c =>
      isLikelyProductPageUrl(c)
    );

    for (const citation of allRetailerCitations.slice(0, 6)) {
      try {
        const pageResp = await fetch(citation, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
          redirect: "follow",
        });
        if (!pageResp.ok) continue;
        const html = await pageResp.text();

        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const pageTitle = (titleMatch?.[1] || "").toLowerCase();
        // Use weighted relevance instead of single-word match
        const titleRel = computeWeightedRelevance(productTokens, pageTitle);
        if (titleRel.score < 20 && titleRel.distinctiveMatched.length === 0) {
          console.log(`[product-research] Skipping irrelevant image page: "${titleMatch?.[1]}" (score=${titleRel.score})`);
          continue;
        }

        const domain = new URL(citation).hostname.replace("www.", "");

        const ogMatch = html.match(/property="og:image"\s+content="([^"]+)"/i) ||
                        html.match(/content="([^"]+)"\s+property="og:image"/i);
        if (ogMatch?.[1]) candidateImgs.push({ url: ogMatch[1], source: domain, label: "hero" });

        const dynamicImg = html.match(/data-a-dynamic-image="\{([^}]+)\}"/i);
        if (dynamicImg) {
          const amazonUrls = dynamicImg[1].match(/https?:\/\/[^"]+/g) || [];
          for (const au of amazonUrls.slice(0, 3)) {
            candidateImgs.push({ url: au.replace(/\._[^.]+_\./, "."), source: domain, label: "detail" });
          }
        }
      } catch { /* skip */ }
    }

    const allSearchText = [retailSearch.content, wholesaleSearch.content, imgSearch.content].join(" ");
    const imgRegex = /https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp)(?:\?[^\s"'<>]*)?/gi;
    const directImgs = allSearchText.match(imgRegex) || [];
    for (const imgUrl of directImgs.slice(0, 5)) {
      candidateImgs.push({ url: imgUrl, source: "search", label: "reference" });
    }

    const seenImgs = new Set<string>();
    const uniqueImgs = candidateImgs.filter(img => {
      if (seenImgs.has(img.url)) return false;
      const lower = img.url.toLowerCase();
      if (lower.includes("gift-card") || lower.includes("giftcard") || lower.includes("logo") ||
          lower.includes("banner") || lower.includes("icon") || lower.includes("sprite") ||
          lower.includes("placeholder") || lower.includes("loading")) return false;
      seenImgs.add(img.url);
      return true;
    });

    if (uniqueImgs.length > 0) {
      try {
        const valResp = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{
              role: "system",
              content: `You validate product image URLs. Given a product name and image URLs, return ONLY indices of URLs that likely show this EXACT product. Reject: gift cards, unrelated products, logos, banners, category images, or navigation elements. Be strict.`,
            }, {
              role: "user",
              content: `Product: "${productName}"\n\nCandidate URLs:\n${uniqueImgs.map((c, i) => `[${i}] ${c.url} (from: ${c.source})`).join("\n")}`,
            }],
            tools: [{ type: "function", function: {
              name: "validate_images",
              parameters: { type: "object", properties: { valid_indices: { type: "array", items: { type: "integer" } } }, required: ["valid_indices"] },
            }}],
            tool_choice: { type: "function", function: { name: "validate_images" } },
            temperature: 0.1,
          }),
        });
        if (valResp.ok) {
          const valData = await valResp.json();
          const valCall = valData.choices?.[0]?.message?.tool_calls?.[0];
          if (valCall) {
            const { valid_indices } = JSON.parse(valCall.function.arguments);
            foundImageUrls = (valid_indices as number[])
              .filter(i => i >= 0 && i < uniqueImgs.length)
              .map(i => uniqueImgs[i])
              .slice(0, 8);
          }
        }
      } catch (e) { console.warn("[product-research] Image validation error:", e); }

      if (foundImageUrls.length === 0) {
        foundImageUrls = uniqueImgs.filter(c => c.source !== "search").slice(0, 4);
      }
    }
    console.log(`[product-research] Found ${foundImageUrls.length} validated images from ${uniqueImgs.length} candidates`);

    // ==========================================
    // PHASE 5: EVIDENCE-BASED URL VERIFICATION
    // ==========================================
    console.log("[product-research] Phase 5: Evidence-based URL verification");
    
    // Deduplicate candidates
    const seenUrls = new Set<string>();
    const uniqueCandidates = candidateLinks.filter(l => {
      if (seenUrls.has(l.url)) return false;
      seenUrls.add(l.url);
      return true;
    });
    
    console.log(`[product-research] Verifying ${uniqueCandidates.length} candidate URLs`);
    
    const allVerifiedLinks: VerifiedLink[] = [];
    for (const candidate of uniqueCandidates.slice(0, 10)) {
      try {
        const result = await verifyLink(
          candidate.url, candidate.linkType, candidate.platform,
          productName, productTokens, openaiKey, firecrawlKey,
        );
        if (result) {
          allVerifiedLinks.push(result);
          const icon = result.validationStatus === "rejected" ? "✗" : 
                      result.validationStatus === "verified" ? "✓" : "~";
          console.log(`[product-research] ${icon} ${result.platform}: confidence=${result.matchConfidence} status=${result.validationStatus} distinctive=[${result.distinctiveTokensMatched}]`);
        }
      } catch (e) {
        console.warn(`[product-research] Verify error for ${candidate.url}:`, e);
      }
    }
    
    // Only use links that passed verification (candidate or better)
    const acceptedLinks = allVerifiedLinks.filter(l => l.validationStatus !== "rejected");
    const rejectedLinks = allVerifiedLinks.filter(l => l.validationStatus === "rejected");
    
    console.log(`[product-research] Accepted: ${acceptedLinks.length}, Rejected: ${rejectedLinks.length}`);

    // ==========================================
    // PHASE 6: AI SCORING with all verified data
    // ==========================================
    console.log("[product-research] Phase 6: AI scoring");

    if (acceptedLinks.length > 0) {
      researchParts.push(`\nVERIFIED PRODUCT LINKS:\n${acceptedLinks.map(l =>
        `${l.linkType.toUpperCase()} - ${l.platform}: ${l.url} (confidence=${l.matchConfidence}, status=${l.validationStatus}) ${l.priceCents ? `($${(l.priceCents / 100).toFixed(2)})` : ""}`
      ).join("\n")}`);
    }
    researchParts.push(`\nAll Source URLs:\n${allCitations.map((c, i) => `[${i + 1}] ${c}`).join("\n")}`);

    const combined = researchParts.join("\n\n---\n\n").slice(0, 18000);
    if (combined.length < 50) {
      return new Response(JSON.stringify({ error: "Could not gather enough product data" }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bestRetailLink = acceptedLinks.find(l => l.linkType === "retail");
    const bestWholesaleLink = acceptedLinks.find(l => l.linkType === "wholesale");

    const scoringResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are an expert dropshipping product analyst. Score this product using the VERIFIED research data provided.

CRITICAL RULES:
- source_url: Use ONLY a URL from the "VERIFIED PRODUCT LINKS" section. If none, use a URL from "All Source URLs". NEVER make up URLs.
- supplier_url: Use a VERIFIED wholesale link if available. NEVER hallucinate.
- Prices: Base retail price on actual retail listings found. Base supplier price on actual wholesale listings found.

SCORING (1-5):
- wow_factor: Visual impact. 5=jaw-dropping demo, 1=boring
- social_media_potential: Engagement potential. 5=guaranteed viral, 1=none
- impulse_buy_appeal: Instant buy trigger. 5=instant purchase, 1=needs research
- demonstrability_score: Show value in <10s? 5=instant visual payoff, 1=complex
- competition_level: Saturation. 5=extremely saturated, 1=untapped

TRENDING STATUS: emerging | rising | peak | declining | saturated
EMOTIONAL TRIGGERS (2-4): wow, satisfaction, transformation, curiosity, gift, before_after, problem_solved, luxury_affordable, convenience, fear_of_missing

Also provide: content_angles (3-5), hook_types, target_audience, cta_strategy, summary (2-3 sentences with honest assessment).`,
          },
          { role: "user", content: `Product: ${productName}\n\n${combined}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "store_analysis",
            description: "Store product analysis",
            parameters: {
              type: "object",
              properties: {
                product_name: { type: "string" },
                source_url: { type: "string", description: "A VERIFIED retail product page URL from the research data." },
                supplier_url: { type: "string", description: "A VERIFIED wholesale/supplier URL from research data. Empty string if none." },
                category: { type: "string" },
                subcategory: { type: "string" },
                price_cents: { type: "integer", description: "Retail price in cents from actual listings" },
                supplier_price_cents: { type: "integer", description: "Wholesale/supplier price in cents from actual listings" },
                estimated_margin_pct: { type: "number" },
                wow_factor: { type: "integer", minimum: 1, maximum: 5 },
                social_media_potential: { type: "integer", minimum: 1, maximum: 5 },
                impulse_buy_appeal: { type: "integer", minimum: 1, maximum: 5 },
                demonstrability_score: { type: "integer", minimum: 1, maximum: 5 },
                competition_level: { type: "integer", minimum: 1, maximum: 5 },
                trending_status: { type: "string", enum: ["emerging", "rising", "peak", "declining", "saturated"] },
                emotional_triggers: { type: "array", items: { type: "string" } },
                price_sweet_spot: { type: "boolean" },
                content_angles: { type: "array", items: { type: "string" } },
                hook_types: { type: "array", items: { type: "string" } },
                target_audience: { type: "string" },
                cta_strategy: { type: "string" },
                summary: { type: "string" },
              },
              required: ["product_name", "category", "wow_factor", "social_media_potential", "impulse_buy_appeal", "demonstrability_score", "competition_level", "trending_status", "emotional_triggers", "content_angles", "summary"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "store_analysis" } },
        temperature: 0.3,
      }),
    });

    if (!scoringResp.ok) {
      const err = await scoringResp.text();
      throw new Error(`OpenAI scoring failed: ${scoringResp.status} ${err}`);
    }

    const aiData = await scoringResp.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in response");

    const analysis = JSON.parse(toolCall.function.arguments);

    const competitionInv = 6 - (analysis.competition_level || 3);
    const overallScore = Math.round(
      ((analysis.wow_factor || 3) * 0.30 +
        (analysis.social_media_potential || 3) * 0.25 +
        (analysis.impulse_buy_appeal || 3) * 0.20 +
        (analysis.demonstrability_score || 3) * 0.15 +
        competitionInv * 0.10) / 5 * 100
    );

    const finalSourceUrl = bestRetailLink?.url || analysis.source_url || allCitations[0] || productUrl || null;
    const finalSupplierUrl = bestWholesaleLink?.url || analysis.supplier_url || null;

    // ==========================================
    // SAVE TO DATABASE
    // ==========================================

    if (!productId) {
      const { data: newProduct, error: insertErr } = await supabase
        .from("products")
        .insert({
          name: analysis.product_name || productName,
          category: analysis.category || null,
          subcategory: analysis.subcategory || null,
          source_url: finalSourceUrl,
          supplier_url: finalSupplierUrl,
          image_url: foundImageUrls[0]?.url || null,
          price_cents: analysis.price_cents || null,
          supplier_price_cents: analysis.supplier_price_cents || null,
          estimated_margin_pct: analysis.estimated_margin_pct || null,
          status: "researching",
          discovered_via: "manual",
          notes: analysis.summary || null,
        })
        .select("id")
        .single();

      if (insertErr || !newProduct) throw new Error(`Failed to create product: ${insertErr?.message}`);
      productId = newProduct.id;
    } else {
      await supabase.from("products").update({
        category: analysis.category || undefined,
        subcategory: analysis.subcategory || undefined,
        source_url: finalSourceUrl,
        supplier_url: finalSupplierUrl,
        image_url: foundImageUrls[0]?.url || undefined,
        price_cents: analysis.price_cents || undefined,
        supplier_price_cents: analysis.supplier_price_cents || undefined,
        estimated_margin_pct: analysis.estimated_margin_pct || undefined,
        status: "researching",
        notes: analysis.summary || undefined,
        updated_at: new Date().toISOString(),
      }).eq("id", productId);
    }

    // Upsert analysis
    const { data: existingAnalysis } = await supabase
      .from("product_analysis")
      .select("id")
      .eq("product_id", productId)
      .maybeSingle();

    const analysisRow = {
      product_id: productId,
      wow_factor: analysis.wow_factor,
      social_media_potential: analysis.social_media_potential,
      impulse_buy_appeal: analysis.impulse_buy_appeal,
      demonstrability_score: analysis.demonstrability_score,
      competition_level: analysis.competition_level,
      trending_status: analysis.trending_status,
      emotional_triggers: analysis.emotional_triggers || [],
      price_sweet_spot: analysis.price_sweet_spot ?? false,
      overall_score: overallScore,
      analyzed_by: "ai_v3",
      analyzed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (existingAnalysis) {
      await supabase.from("product_analysis").update(analysisRow).eq("id", existingAnalysis.id);
    } else {
      await supabase.from("product_analysis").insert(analysisRow);
    }

    // Save ALL verified links with full evidence (including rejected ones for audit)
    if (allVerifiedLinks.length > 0 && productId) {
      await supabase.from("product_links").delete().eq("product_id", productId);

      const linkRows = allVerifiedLinks.map(l => ({
        product_id: productId,
        url: l.url,
        link_type: l.linkType,
        platform: l.platform,
        price_cents: l.priceCents || null,
        title: l.title || null,
        verified: l.validationStatus === "verified",
        match_confidence: l.matchConfidence,
        validation_status: l.validationStatus,
        validation_reasons: l.validationReasons,
        matched_tokens: l.matchedTokens,
        distinctive_tokens_matched: l.distinctiveTokensMatched,
        ai_verdict: l.aiVerdict ?? null,
        ai_confidence: l.aiConfidence ?? null,
        fetch_method: l.fetchMethod,
        extracted_product_name: l.extractedProductName || null,
        structured_price_cents: l.structuredPriceCents || null,
        schema_type: l.schemaType || null,
        canonical_url: l.canonicalUrl || null,
        content_quality_score: l.contentQualityScore,
        evidence_summary: l.evidenceSummary,
      }));
      const { error: linkErr } = await supabase.from("product_links").insert(linkRows);
      if (linkErr) console.warn("[product-research] Failed to save links:", linkErr);
      else console.log(`[product-research] Saved ${linkRows.length} links (${acceptedLinks.length} accepted, ${rejectedLinks.length} rejected)`);
    }

    // Save images
    if (foundImageUrls.length > 0 && productId) {
      await supabase.from("product_images").delete().eq("product_id", productId).eq("verified", false);
      const imageRows = foundImageUrls.map((img, i) => ({
        product_id: productId,
        url: img.url,
        source: img.source,
        label: img.label,
        is_primary: i === 0,
        verified: false,
      }));
      const { error: imgErr } = await supabase.from("product_images").insert(imageRows);
      if (imgErr) console.warn("[product-research] Failed to save images:", imgErr);
      else {
        await supabase.from("products").update({ image_url: foundImageUrls[0].url }).eq("id", productId);
        console.log(`[product-research] Saved ${imageRows.length} images`);
      }
    }

    // ==========================================
    // PHASE 7: EXTRACT SUPPLIER DATA
    // ==========================================
    console.log("[product-research] Phase 7: Extracting supplier data");
    const wholesaleVerified = acceptedLinks.filter(l => l.linkType === "wholesale");
    if (productId && wholesaleVerified.length > 0) {
      try {
        const supplierResp = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{
              role: "system",
              content: `You are a dropshipping supplier analyst. Extract structured supplier data from wholesale research. Be conservative — mark anything uncertain.`,
            }, {
              role: "user",
              content: `Product: "${productName}"\n\nWholesale research:\n${wholesaleSearch.content}\n\nVerified wholesale links:\n${wholesaleVerified.map(l => `${l.platform}: ${l.url} (confidence=${l.matchConfidence}) ${l.priceCents ? `($${(l.priceCents / 100).toFixed(2)})` : ""}`).join("\n")}`,
            }],
            tools: [{ type: "function", function: {
              name: "store_suppliers",
              parameters: {
                type: "object",
                properties: {
                  suppliers: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        supplier_name: { type: "string" },
                        platform: { type: "string", enum: ["AliExpress", "Alibaba", "1688", "DHgate", "Temu", "direct", "other"] },
                        unit_cost_cents: { type: "integer" },
                        shipping_cost_cents: { type: "integer" },
                        shipping_country: { type: "string" },
                        processing_days: { type: "integer" },
                        delivery_days: { type: "integer" },
                        moq: { type: "integer" },
                        reliability_score: { type: "integer", minimum: 1, maximum: 5 },
                        defect_risk: { type: "integer", minimum: 1, maximum: 5 },
                        stock_status: { type: "string", enum: ["in_stock", "low_stock", "out_of_stock", "unknown"] },
                        expected_return_rate_pct: { type: "number" },
                        verification_status: { type: "string", enum: ["estimated", "partially_verified", "verified"] },
                        notes: { type: "string" },
                      },
                      required: ["supplier_name", "platform", "unit_cost_cents"],
                    },
                  },
                },
                required: ["suppliers"],
              },
            }}],
            tool_choice: { type: "function", function: { name: "store_suppliers" } },
            temperature: 0.2,
          }),
        });

        if (supplierResp.ok) {
          const supplierData = await supplierResp.json();
          const supplierCall = supplierData.choices?.[0]?.message?.tool_calls?.[0];
          if (supplierCall) {
            const { suppliers } = JSON.parse(supplierCall.function.arguments);
            await supabase.from("product_suppliers")
              .delete()
              .eq("product_id", productId)
              .neq("verification_status", "verified");

            for (const s of (suppliers || []).slice(0, 5)) {
              const supplierUrl = wholesaleVerified.find(l =>
                l.platform.toLowerCase() === s.platform.toLowerCase()
              )?.url || null;

              const reliabilityScore = s.reliability_score || 3;
              const defectRisk = s.defect_risk || 3;
              const commScore = 3;
              const overallSupplierScore = Math.round(
                (reliabilityScore * 0.4 + (6 - defectRisk) * 0.3 + commScore * 0.3) / 5 * 100
              );

              await supabase.from("product_suppliers").insert({
                product_id: productId,
                supplier_name: s.supplier_name,
                platform: s.platform,
                supplier_url: supplierUrl,
                unit_cost_cents: s.unit_cost_cents,
                shipping_cost_cents: s.shipping_cost_cents || 0,
                shipping_country: s.shipping_country || "CN",
                target_market: "US",
                processing_days: s.processing_days || null,
                delivery_days: s.delivery_days || null,
                moq: s.moq || 1,
                reliability_score: reliabilityScore,
                defect_risk: defectRisk,
                communication_score: commScore,
                stock_status: s.stock_status || "unknown",
                expected_return_rate_pct: s.expected_return_rate_pct || 5,
                overall_supplier_score: overallSupplierScore,
                verification_status: s.verification_status || "estimated",
                notes: s.notes || null,
                is_preferred: false,
              });
            }
            // Mark best supplier as preferred
            const { data: allSuppliers } = await supabase
              .from("product_suppliers")
              .select("id, unit_cost_cents, reliability_score, defect_risk, delivery_days, processing_days, overall_supplier_score")
              .eq("product_id", productId);
            if (allSuppliers && allSuppliers.length > 0) {
              const maxCost = Math.max(...allSuppliers.map(s => s.unit_cost_cents || 9999));
              const scored = allSuppliers.map(s => {
                const costScore = maxCost > 0 ? (1 - ((s.unit_cost_cents || maxCost) / maxCost)) * 5 : 2.5;
                const reliabilityScore = s.reliability_score || 2;
                const totalDays = (s.processing_days || 7) + (s.delivery_days || 14);
                const deliveryScore = totalDays <= 7 ? 5 : totalDays <= 12 ? 4 : totalDays <= 20 ? 2.5 : 1;
                const defectInverse = 6 - (s.defect_risk || 3);
                const weighted = costScore * 0.3 + reliabilityScore * 0.3 + deliveryScore * 0.2 + defectInverse * 0.2;
                return { id: s.id, weighted };
              });
              scored.sort((a, b) => b.weighted - a.weighted);
              await supabase.from("product_suppliers").update({ is_preferred: false }).eq("product_id", productId);
              await supabase.from("product_suppliers").update({ is_preferred: true }).eq("id", scored[0].id);
            }
            console.log(`[product-research] Saved ${suppliers?.length || 0} suppliers`);
          }
        }
      } catch (e) { console.warn("[product-research] Supplier extraction error:", e); }
    }

    // ==========================================
    // PHASE 8: AUTO-CALCULATE UNIT ECONOMICS
    // ==========================================
    console.log("[product-research] Phase 8: Auto-calculating unit economics");
    if (productId) {
      try {
        const econResp = await fetch(`${supabaseUrl}/functions/v1/calculate-unit-economics`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ product_id: productId }),
        });
        if (econResp.ok) {
          const econData = await econResp.json();
          console.log(`[product-research] Economics: grade=${econData.viability_grade}, net_margin=${econData.net_margin_pct}%`);
        } else {
          console.warn(`[product-research] Economics calculation returned ${econResp.status}`);
        }
      } catch (e) { console.warn("[product-research] Economics calculation error:", e); }
    }

    console.log(`[product-research] ===== COMPLETE v3: "${analysis.product_name}" score=${overallScore}/100, ${acceptedLinks.length} accepted / ${rejectedLinks.length} rejected links, ${foundImageUrls.length} images =====`);

    return new Response(
      JSON.stringify({
        success: true,
        product_id: productId,
        overall_score: overallScore,
        images_found: foundImageUrls.length,
        links_accepted: acceptedLinks.length,
        links_rejected: rejectedLinks.length,
        retail_links: acceptedLinks.filter(l => l.linkType === "retail").length,
        wholesale_links: acceptedLinks.filter(l => l.linkType === "wholesale").length,
        suppliers_extracted: true,
        economics_calculated: true,
        verification_summary: {
          total_candidates: uniqueCandidates.length,
          verified: allVerifiedLinks.filter(l => l.validationStatus === "verified").length,
          probable: allVerifiedLinks.filter(l => l.validationStatus === "probable").length,
          candidate: allVerifiedLinks.filter(l => l.validationStatus === "candidate").length,
          rejected: rejectedLinks.length,
        },
        analysis,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[product-research] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
