/**
 * enrich-product-links v2 — Enrichment Resilience Layer
 * 
 * Multi-strategy page fetching with Firecrawl fallback, captcha detection,
 * domain-specific extraction logic, and ASIN-based confidence boosting.
 * 
 * Fetch hierarchy:
 * 1. Direct fetch (fast, free)
 * 2. Firecrawl scrape (JS-rendered, anti-bot bypass)
 * 3. SERP title/snippet fallback (last resort)
 * 
 * Domain strategy:
 * - Amazon: ASIN extraction + bullet features (high value)
 * - Shopify/DTC: clean structured data (high value)
 * - Walmart: attempt but expect blocks (medium)
 * - eBay: low priority, noisy
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── TYPES ───

interface EnrichedSource {
  title_full: string;
  brand: string | null;
  price_cents: number | null;
  features: string[];
  image_urls: string[];
  specs: Record<string, string>;
  asin: string | null;
  sku: string | null;
  model: string | null;
  pack_count: number | null;
}

interface FetchResult {
  html: string | null;
  method: string;
  blocked: boolean;
}

// ─── CAPTCHA / BOT DETECTION ───

const BLOCK_PATTERNS = [
  "robot or human",
  "pardon our interruption",
  "are you a human",
  "captcha",
  "verify you are human",
  "access denied",
  "automated access",
  "please verify",
  "browser verification",
  "challenge-platform",
  "cf-challenge",
  "px-captcha",
  "distil_r_captcha",
];

function isBlockedPage(html: string): boolean {
  const lower = html.slice(0, 50_000).toLowerCase();
  // If page is very short and contains block signals
  const visibleText = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (visibleText.length < 200) return true; // nearly empty page
  for (const p of BLOCK_PATTERNS) {
    if (lower.includes(p)) return true;
  }
  return false;
}

// ─── DOMAIN CLASSIFICATION ───

type DomainTier = "high" | "medium" | "low";

interface DomainProfile {
  tier: DomainTier;
  name: string;
}

function classifyDomain(url: string): DomainProfile {
  const u = url.toLowerCase();
  if (u.includes("amazon.com") || u.includes("amazon.co")) return { tier: "high", name: "amazon" };
  if (u.includes("shopify.com") || u.includes(".myshopify.com")) return { tier: "high", name: "shopify" };
  // DTC stores often have /products/ paths
  if (u.includes("/products/") && !u.includes("walmart") && !u.includes("ebay")) return { tier: "high", name: "dtc" };
  if (u.includes("walmart.com")) return { tier: "medium", name: "walmart" };
  if (u.includes("target.com")) return { tier: "medium", name: "target" };
  if (u.includes("ebay.com")) return { tier: "low", name: "ebay" };
  // Manufacturer / brand sites
  if (u.includes("official") || u.match(/\.(brand|store|shop)\./)) return { tier: "high", name: "brand" };
  return { tier: "medium", name: "other" };
}

// ─── FETCH STRATEGY 1: DIRECT ───

async function fetchDirect(url: string): Promise<FetchResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!resp.ok) return { html: null, method: "direct", blocked: false };
    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return { html: null, method: "direct", blocked: false };
    }
    const text = (await resp.text()).slice(0, 500_000);
    if (isBlockedPage(text)) {
      console.log(`[enrich] Direct fetch BLOCKED for ${url.slice(0, 60)}`);
      return { html: null, method: "direct", blocked: true };
    }
    return { html: text, method: "direct", blocked: false };
  } catch {
    return { html: null, method: "direct", blocked: false };
  }
}

// ─── FETCH STRATEGY 2: FIRECRAWL ───

async function fetchFirecrawl(url: string, apiKey: string): Promise<FetchResult> {
  try {
    const resp = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["html", "markdown"],
        onlyMainContent: false,
        waitFor: 3000,
      }),
    });
    if (resp.status === 402) {
      console.warn("[enrich] Firecrawl: insufficient credits");
      const body = await resp.text();
      return { html: null, method: "firecrawl", blocked: false };
    }
    if (!resp.ok) {
      const body = await resp.text();
      console.warn(`[enrich] Firecrawl error ${resp.status}: ${body.slice(0, 200)}`);
      return { html: null, method: "firecrawl", blocked: false };
    }
    const data = await resp.json();
    // Firecrawl returns { success, data: { html, markdown, metadata } }
    const html = data?.data?.html || data?.html || "";
    const markdown = data?.data?.markdown || data?.markdown || "";
    if (!html && !markdown) return { html: null, method: "firecrawl", blocked: false };
    // Use HTML if available for structured extraction, otherwise wrap markdown
    const content = html || `<html><body>${markdown}</body></html>`;
    if (isBlockedPage(content)) {
      return { html: null, method: "firecrawl", blocked: true };
    }
    return { html: content.slice(0, 500_000), method: "firecrawl", blocked: false };
  } catch (e) {
    console.warn("[enrich] Firecrawl fetch error:", e);
    return { html: null, method: "firecrawl", blocked: false };
  }
}

// ─── MULTI-STRATEGY FETCHER ───

async function fetchPageResilient(
  url: string,
  firecrawlKey: string | null,
  domain: DomainProfile,
): Promise<FetchResult> {
  // Strategy 1: Direct fetch (always try first — free and fast)
  const direct = await fetchDirect(url);
  if (direct.html) {
    console.log(`[enrich] ✓ Direct fetch success for ${domain.name}`);
    return direct;
  }

  // Strategy 2: Firecrawl (JS-rendered, anti-bot bypass)
  if (firecrawlKey && (direct.blocked || domain.tier !== "low")) {
    console.log(`[enrich] Trying Firecrawl for ${url.slice(0, 60)}...`);
    const fc = await fetchFirecrawl(url, firecrawlKey);
    if (fc.html) {
      console.log(`[enrich] ✓ Firecrawl success for ${domain.name}`);
      return fc;
    }
    if (fc.blocked) {
      console.log(`[enrich] Firecrawl also blocked for ${domain.name}`);
    }
  }

  return { html: null, method: "none", blocked: direct.blocked };
}

// ─── STRUCTURED EXTRACTION (same as v1 but with improvements) ───

function extractJsonLd(html: string): Record<string, any> | null {
  const ldMatches = html.match(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  if (!ldMatches) return null;
  for (const match of ldMatches) {
    try {
      const jsonStr = match.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "").trim();
      const parsed = JSON.parse(jsonStr);
      const items = Array.isArray(parsed) ? parsed : parsed["@graph"] ? parsed["@graph"] : [parsed];
      for (const item of items) {
        const type = (item["@type"] || "").toLowerCase();
        if (type === "product" || type.includes("product")) return item;
      }
    } catch { /* skip */ }
  }
  return null;
}

function extractMetaTags(html: string): Record<string, string> {
  const meta: Record<string, string> = {};
  const r1 = /<meta\s+(?:[^>]*?)(?:property|name)\s*=\s*["']([^"']+)["']\s+content\s*=\s*["']([^"']*?)["'][^>]*>/gi;
  let m;
  while ((m = r1.exec(html)) !== null) meta[m[1].toLowerCase()] = m[2];
  const r2 = /<meta\s+content\s*=\s*["']([^"']*?)["']\s+(?:property|name)\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((m = r2.exec(html)) !== null) meta[m[2].toLowerCase()] = m[1];
  return meta;
}

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? m[1].trim().replace(/\s+/g, " ") : "";
}

function extractBulletFeatures(html: string): string[] {
  const features: string[] = [];
  // Amazon feature bullets
  const bulletSection = html.match(/id\s*=\s*["']feature-bullets["'][^>]*>([\s\S]*?)<\/div>/i);
  if (bulletSection) {
    const liMatches = bulletSection[1].match(/<li[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/gi);
    if (liMatches) {
      for (const li of liMatches) {
        const text = li.replace(/<[^>]+>/g, "").trim();
        if (text.length > 5 && text.length < 500) features.push(text);
      }
    }
  }
  // Generic product bullet lists
  if (features.length === 0) {
    const listMatches = html.match(/<ul[^>]*class\s*=\s*["'][^"']*(?:feature|spec|detail|bullet|product|description)[^"']*["'][^>]*>([\s\S]*?)<\/ul>/gi);
    if (listMatches) {
      for (const list of listMatches.slice(0, 2)) {
        const items = list.match(/<li[^>]*>([\s\S]*?)<\/li>/gi);
        if (items) {
          for (const item of items.slice(0, 10)) {
            const text = item.replace(/<[^>]+>/g, "").trim();
            if (text.length > 5 && text.length < 500) features.push(text);
          }
        }
      }
    }
  }
  return features.slice(0, 15);
}

function extractProductImages(html: string): string[] {
  const images: string[] = [];
  const seen = new Set<string>();
  // Hi-res images
  const hiRes = html.match(/(?:hiRes|data-old-hires|data-a-dynamic-image)\s*["':]\s*["']?(https?:\/\/[^"'\s,}]+)/gi);
  if (hiRes) {
    for (const m of hiRes) {
      const u = m.match(/(https?:\/\/[^"'\s,}]+)/);
      if (u && !seen.has(u[1])) { seen.add(u[1]); images.push(u[1]); }
    }
  }
  // OG image
  const og = html.match(/<meta\s+(?:property|name)\s*=\s*["']og:image["']\s+content\s*=\s*["']([^"']+)["']/i)
    || html.match(/content\s*=\s*["']([^"']+)["']\s+(?:property|name)\s*=\s*["']og:image["']/i);
  if (og && !seen.has(og[1])) { seen.add(og[1]); images.push(og[1]); }
  // Product images
  const imgs = html.match(/<img[^>]+(?:class|id|data-)[^>]*(?:product|gallery|main|hero|primary)[^>]*src\s*=\s*["']([^"']+)["']/gi);
  if (imgs) {
    for (const m of imgs) {
      const s = m.match(/src\s*=\s*["'](https?:\/\/[^"']+)["']/i);
      if (s && !seen.has(s[1])) { seen.add(s[1]); images.push(s[1]); }
    }
  }
  return images.filter(u => {
    const l = u.toLowerCase();
    return !l.includes("1x1") && !l.includes("pixel") && !l.includes("logo")
      && !l.includes("icon") && !l.includes("sprite") && !l.includes("badge")
      && !l.includes("rating") && !l.includes("star");
  }).slice(0, 10);
}

function extractPrice(html: string, meta: Record<string, string>, jsonLd: Record<string, any> | null): number | null {
  if (jsonLd) {
    const offers = jsonLd.offers || jsonLd.offer;
    if (offers) {
      const offer = Array.isArray(offers) ? offers[0] : offers;
      const price = offer.price || offer.lowPrice;
      if (price) return Math.round(parseFloat(String(price)) * 100);
    }
  }
  const metaPrice = meta["product:price:amount"] || meta["og:price:amount"];
  if (metaPrice) return Math.round(parseFloat(metaPrice) * 100);
  const priceMatch = html.match(/itemprop\s*=\s*["']price["']\s+content\s*=\s*["']([^"']+)["']/i);
  if (priceMatch) return Math.round(parseFloat(priceMatch[1]) * 100);
  return null;
}

function extractBrand(html: string, meta: Record<string, string>, jsonLd: Record<string, any> | null): string | null {
  if (jsonLd?.brand) {
    const b = typeof jsonLd.brand === "string" ? jsonLd.brand : jsonLd.brand.name;
    if (b) return b;
  }
  const mb = meta["product:brand"] || meta["og:brand"];
  if (mb) return mb;
  const bm = html.match(/itemprop\s*=\s*["']brand["'][^>]*content\s*=\s*["']([^"']+)["']/i);
  if (bm) return bm[1];
  const byline = html.match(/id\s*=\s*["']bylineInfo["'][^>]*>[\s\S]*?(?:Visit the|Brand:)\s*([^<]+)/i);
  if (byline) return byline[1].trim();
  return null;
}

function extractAsin(url: string, html: string): string | null {
  const urlMatch = url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  if (urlMatch) return urlMatch[1].toUpperCase();
  const htmlMatch = html.match(/(?:"ASIN"|data-asin)\s*[:=]\s*["']([A-Z0-9]{10})["']/i);
  if (htmlMatch) return htmlMatch[1].toUpperCase();
  return null;
}

function extractPackCount(title: string, features: string[]): number | null {
  const combined = `${title} ${features.join(" ")}`;
  const patterns = [
    /(\d+)\s*(?:pack|pcs|pieces?|count|set of)/i,
    /set\s*of\s*(\d+)/i,
    /(\d+)\s*in\s*1/i,
    /quantity:\s*(\d+)/i,
  ];
  for (const p of patterns) {
    const m = combined.match(p);
    if (m) return parseInt(m[1]);
  }
  return null;
}

function extractStructuredData(html: string, url: string): EnrichedSource {
  const jsonLd = extractJsonLd(html);
  const meta = extractMetaTags(html);
  const pageTitle = extractTitle(html);
  const features = extractBulletFeatures(html);
  const images = extractProductImages(html);
  const titleFull = jsonLd?.name || meta["og:title"] || pageTitle;
  const brand = extractBrand(html, meta, jsonLd);
  const priceCents = extractPrice(html, meta, jsonLd);
  const asin = extractAsin(url, html);
  const specs: Record<string, string> = {};
  if (jsonLd?.additionalProperty) {
    for (const prop of (Array.isArray(jsonLd.additionalProperty) ? jsonLd.additionalProperty : [jsonLd.additionalProperty])) {
      if (prop.name && prop.value) specs[prop.name] = String(prop.value);
    }
  }
  const sku = jsonLd?.sku || jsonLd?.mpn || null;
  const model = jsonLd?.model || specs["Model Number"] || specs["Model"] || null;
  const packCount = extractPackCount(titleFull || "", features);
  return {
    title_full: titleFull || "",
    brand,
    price_cents: priceCents,
    features,
    image_urls: images,
    specs,
    asin,
    sku: sku ? String(sku) : null,
    model: model ? String(model) : null,
    pack_count: packCount,
  };
}

// ─── LLM GAP-FILL ───

async function llmEnrich(
  html: string,
  url: string,
  partial: EnrichedSource,
  openaiKey: string,
): Promise<EnrichedSource> {
  const hasTitleGap = !partial.title_full || partial.title_full.length < 10;
  const hasBrandGap = !partial.brand;
  const hasFeatureGap = partial.features.length < 2;
  const hasPriceGap = !partial.price_cents;
  const gaps = [hasTitleGap && "title", hasBrandGap && "brand", hasFeatureGap && "features", hasPriceGap && "price"]
    .filter(Boolean);
  if (gaps.length === 0) return partial;

  const visibleText = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 3000);
  if (visibleText.length < 50) return partial;

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You extract product listing facts from page text. Only return facts explicitly stated. Do NOT infer or guess." },
          { role: "user", content: `URL: ${url}\n\nPage text:\n${visibleText}\n\nMissing: ${gaps.join(", ")}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_listing",
            parameters: {
              type: "object",
              properties: {
                product_title: { type: "string" },
                brand: { type: "string" },
                price_dollars: { type: "number" },
                features: { type: "array", items: { type: "string" } },
                model_number: { type: "string" },
              },
              required: ["product_title", "brand", "price_dollars", "features"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "extract_listing" } },
        temperature: 0,
      }),
    });
    if (!resp.ok) { await resp.text(); return partial; }
    const data = await resp.json();
    const call = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) return partial;
    const ex = JSON.parse(call.function.arguments);
    return {
      ...partial,
      title_full: partial.title_full || ex.product_title || "",
      brand: partial.brand || (ex.brand || null),
      price_cents: partial.price_cents || (ex.price_dollars ? Math.round(ex.price_dollars * 100) : null),
      features: partial.features.length >= 2 ? partial.features : (ex.features || partial.features),
      model: partial.model || ex.model_number || null,
    };
  } catch (e) {
    console.warn("[enrich] LLM gap-fill failed:", e);
    return partial;
  }
}

// ─── ENRICHMENT QUALITY SCORE ───

function scoreEnrichment(e: EnrichedSource): number {
  let score = 0;
  if (e.title_full && e.title_full.length >= 10) score += 25;
  if (e.brand) score += 20;
  if (e.price_cents) score += 15;
  if (e.features.length >= 3) score += 15;
  else if (e.features.length >= 1) score += 8;
  if (e.image_urls.length >= 2) score += 10;
  else if (e.image_urls.length >= 1) score += 5;
  if (e.asin) score += 10;
  if (e.model || e.sku) score += 5;
  return score;
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
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY") || null;
    if (!openaiKey) throw new Error("OPENAI_API_KEY not configured");

    console.log(`[enrich] Firecrawl available: ${!!firecrawlKey}`);

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body = await req.json();
    const { product_id, link_ids, max_links = 10 } = body;
    if (!product_id) throw new Error("product_id required");

    console.log(`[enrich-v2] ===== Starting resilient enrichment for ${product_id} =====`);

    // Also retry previously blocked links
    let query = supabase
      .from("product_links")
      .select("*")
      .eq("product_id", product_id)
      .or("source_enrichment_status.eq.pending,source_enrichment_status.is.null,source_enrichment_status.eq.blocked");

    if (link_ids?.length) {
      query = query.in("id", link_ids);
    }

    const { data: links, error: linkErr } = await query.limit(max_links);
    if (linkErr) throw new Error(`Failed to fetch links: ${linkErr.message}`);

    if (!links?.length) {
      return new Response(JSON.stringify({ success: true, enriched: 0, message: "No unenriched links" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[enrich-v2] Processing ${links.length} links`);

    const results = { enriched: 0, failed: 0, skipped: 0, blocked: 0, firecrawl_used: 0 };

    // Sort: high-tier domains first
    const sorted = [...links].sort((a, b) => {
      const da = classifyDomain(a.url || "");
      const db = classifyDomain(b.url || "");
      const tierOrder = { high: 0, medium: 1, low: 2 };
      return tierOrder[da.tier] - tierOrder[db.tier];
    });

    for (const link of sorted) {
      try {
        const url = link.url || "";
        if (!url.startsWith("http")) { results.skipped++; continue; }

        const domain = classifyDomain(url);
        console.log(`[enrich-v2] [${domain.name}/${domain.tier}] ${url.slice(0, 80)}`);

        // Skip low-tier domains if we already have enriched high-tier links
        if (domain.tier === "low" && results.enriched >= 3) {
          console.log(`[enrich-v2] Skipping low-tier — already have ${results.enriched} enriched`);
          results.skipped++;
          continue;
        }

        const fetchResult = await fetchPageResilient(url, firecrawlKey, domain);

        if (fetchResult.method === "firecrawl") results.firecrawl_used++;

        if (!fetchResult.html) {
          const status = fetchResult.blocked ? "blocked" : "failed";
          await supabase.from("product_links").update({
            source_enrichment_status: status,
            source_enriched_at: new Date().toISOString(),
            fetch_method: fetchResult.method,
          }).eq("id", link.id);
          if (fetchResult.blocked) results.blocked++;
          else results.failed++;
          continue;
        }

        // Extract structured data
        let enriched = extractStructuredData(fetchResult.html, url);
        const structScore = scoreEnrichment(enriched);
        console.log(`[enrich-v2] Structured score=${structScore}: title="${enriched.title_full?.slice(0, 50)}" brand="${enriched.brand}" asin=${enriched.asin}`);

        // LLM gap-fill if structured extraction is thin
        if (structScore < 60) {
          enriched = await llmEnrich(fetchResult.html, url, enriched, openaiKey);
        }

        const finalScore = scoreEnrichment(enriched);

        // Save enriched data
        await supabase.from("product_links").update({
          source_title_full: enriched.title_full || null,
          source_brand: enriched.brand,
          source_features: enriched.features,
          source_image_urls: enriched.image_urls,
          source_specs: enriched.specs,
          source_enrichment_status: finalScore >= 30 ? "enriched" : "thin",
          source_enriched_at: new Date().toISOString(),
          content_quality_score: finalScore,
          fetch_method: fetchResult.method,
          extracted_product_name: enriched.title_full || link.extracted_product_name,
          extracted_brand: enriched.brand || link.extracted_brand,
          structured_price_cents: enriched.price_cents || link.structured_price_cents,
        }).eq("id", link.id);

        results.enriched++;
        console.log(`[enrich-v2] ✓ [${fetchResult.method}] score=${finalScore} "${enriched.title_full?.slice(0, 50)}" brand=${enriched.brand} price=$${enriched.price_cents ? (enriched.price_cents / 100).toFixed(2) : "?"} features=${enriched.features.length} images=${enriched.image_urls.length}`);

        // Rate limit
        await new Promise(r => setTimeout(r, fetchResult.method === "firecrawl" ? 1000 : 500));
      } catch (err) {
        console.warn(`[enrich-v2] Error processing link ${link.id}:`, err);
        await supabase.from("product_links").update({
          source_enrichment_status: "failed",
          source_enriched_at: new Date().toISOString(),
        }).eq("id", link.id);
        results.failed++;
      }
    }

    console.log(`[enrich-v2] ===== Done: ${results.enriched} enriched, ${results.blocked} blocked, ${results.failed} failed, ${results.skipped} skipped, ${results.firecrawl_used} firecrawl calls =====`);

    return new Response(JSON.stringify({ success: true, ...results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[enrich-v2] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
