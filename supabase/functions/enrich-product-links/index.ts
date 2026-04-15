/**
 * enrich-product-links v3 — Tiered Enrichment Waterfall
 * 
 * Cost-optimized pipeline:
 * 1. Direct fetch for ALL candidates (free)
 * 2. Parse structured data from HTML cheaply
 * 3. Firecrawl ONLY for top-ranked candidates that were blocked/thin
 * 4. Cap Firecrawl at 3 calls per product
 * 5. Stop early once enough supplier-quality enrichments exist
 * 
 * Fetch method tracking:
 * - direct          = free fetch succeeded
 * - thin_direct     = free fetch succeeded but data was thin
 * - blocked_direct  = free fetch was blocked by anti-bot
 * - firecrawl_used  = escalated to Firecrawl (paid)
 * - firecrawl_cap   = would have used Firecrawl but hit cap
 * - skipped_low     = skipped because enough enrichments already
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
  "robot or human", "pardon our interruption", "are you a human",
  "captcha", "verify you are human", "access denied", "automated access",
  "please verify", "browser verification", "challenge-platform",
  "cf-challenge", "px-captcha", "distil_r_captcha",
];

function isBlockedPage(html: string): boolean {
  const lower = html.slice(0, 50_000).toLowerCase();
  const visibleText = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (visibleText.length < 200) return true;
  for (const p of BLOCK_PATTERNS) {
    if (lower.includes(p)) return true;
  }
  return false;
}

// ─── DOMAIN CLASSIFICATION ───

type DomainTier = "wholesale_priority" | "high" | "medium" | "low";

interface DomainProfile {
  tier: DomainTier;
  name: string;
  firecrawlWorthy: boolean; // only these domains justify paid Firecrawl
}

function classifyDomain(url: string): DomainProfile {
  const u = url.toLowerCase();
  // Wholesale-priority domains — these are the ones we WANT to enrich for supplier matching
  if (u.includes("aliexpress.com") || u.includes("aliexpress.us")) return { tier: "wholesale_priority", name: "aliexpress", firecrawlWorthy: true };
  if (u.includes("alibaba.com") || u.includes("1688.com")) return { tier: "wholesale_priority", name: "alibaba", firecrawlWorthy: true };
  if (u.includes("dhgate.com")) return { tier: "wholesale_priority", name: "dhgate", firecrawlWorthy: true };
  if (u.includes("temu.com")) return { tier: "wholesale_priority", name: "temu", firecrawlWorthy: true };
  // Retail high-value — good for retail truth
  if (u.includes("amazon.com") || u.includes("amazon.co")) return { tier: "high", name: "amazon", firecrawlWorthy: true };
  if (u.includes("shopify.com") || u.includes(".myshopify.com")) return { tier: "high", name: "shopify", firecrawlWorthy: false };
  if (u.includes("/products/") && !u.includes("walmart") && !u.includes("ebay")) return { tier: "high", name: "dtc", firecrawlWorthy: false };
  if (u.includes("walmart.com")) return { tier: "medium", name: "walmart", firecrawlWorthy: false };
  if (u.includes("target.com")) return { tier: "medium", name: "target", firecrawlWorthy: false };
  if (u.includes("ebay.com")) return { tier: "low", name: "ebay", firecrawlWorthy: false };
  if (u.includes("official") || u.match(/\.(brand|store|shop)\./)) return { tier: "high", name: "brand", firecrawlWorthy: false };
  return { tier: "medium", name: "other", firecrawlWorthy: false };
}

// ─── CANDIDATE RANKING ───
// Rank candidates so best ones get expensive treatment first

function rankCandidate(link: any): number {
  let score = 0;
  const domain = classifyDomain(link.url || "");
  
  // Domain priority
  if (domain.tier === "wholesale_priority") score += 50;
  else if (domain.tier === "high") score += 30;
  else if (domain.tier === "medium") score += 15;
  
  // Link type: wholesale links are what we need most
  if (link.link_type === "wholesale") score += 30;
  else if (link.link_type === "retail") score += 10;
  
  // Match confidence from prior validation attempts
  if (link.match_confidence) score += Math.min(link.match_confidence * 0.3, 30);
  
  // Already has some data — likely a real listing
  if (link.title && link.title.length > 10) score += 5;
  if (link.price_cents) score += 5;
  
  return score;
}

// ─── FETCH STRATEGY 1: DIRECT (FREE) ───

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
      return { html: null, method: "direct", blocked: true };
    }
    return { html: text, method: "direct", blocked: false };
  } catch {
    return { html: null, method: "direct", blocked: false };
  }
}

// ─── FETCH STRATEGY 2: FIRECRAWL (PAID) ───

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
      await resp.text();
      return { html: null, method: "firecrawl", blocked: false };
    }
    if (!resp.ok) {
      const body = await resp.text();
      console.warn(`[enrich] Firecrawl error ${resp.status}: ${body.slice(0, 200)}`);
      return { html: null, method: "firecrawl", blocked: false };
    }
    const data = await resp.json();
    const html = data?.data?.html || data?.html || "";
    const markdown = data?.data?.markdown || data?.markdown || "";
    if (!html && !markdown) return { html: null, method: "firecrawl", blocked: false };
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

// ─── STRUCTURED EXTRACTION ───

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
  const hiRes = html.match(/(?:hiRes|data-old-hires|data-a-dynamic-image)\s*["':]\s*["']?(https?:\/\/[^"'\s,}]+)/gi);
  if (hiRes) {
    for (const m of hiRes) {
      const u = m.match(/(https?:\/\/[^"'\s,}]+)/);
      if (u && !seen.has(u[1])) { seen.add(u[1]); images.push(u[1]); }
    }
  }
  const og = html.match(/<meta\s+(?:property|name)\s*=\s*["']og:image["']\s+content\s*=\s*["']([^"']+)["']/i)
    || html.match(/content\s*=\s*["']([^"']+)["']\s+(?:property|name)\s*=\s*["']og:image["']/i);
  if (og && !seen.has(og[1])) { seen.add(og[1]); images.push(og[1]); }
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

// ─── LLM GAP-FILL ───

async function llmEnrich(
  html: string, url: string, partial: EnrichedSource, openaiKey: string,
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

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body = await req.json();
    const { product_id, link_ids, max_links = 20, max_firecrawl = 3 } = body;
    if (!product_id) throw new Error("product_id required");

    console.log(`[enrich-v3] ===== Tiered enrichment for ${product_id} | firecrawl=${!!firecrawlKey} | cap=${max_firecrawl} =====`);

    // Fetch all unenriched/blocked/thin links
    let query = supabase
      .from("product_links")
      .select("*")
      .eq("product_id", product_id)
      .or("source_enrichment_status.eq.pending,source_enrichment_status.is.null,source_enrichment_status.eq.blocked,source_enrichment_status.eq.thin");

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

    // ─── PHASE 1: RANK ALL CANDIDATES ───
    const ranked = links
      .map(link => ({ link, rank: rankCandidate(link), domain: classifyDomain(link.url || "") }))
      .sort((a, b) => b.rank - a.rank);

    console.log(`[enrich-v3] ${ranked.length} candidates ranked. Top 5: ${ranked.slice(0, 5).map(r => `[${r.rank}] ${r.domain.name}:${r.link.url?.slice(0, 50)}`).join(" | ")}`);

    const results = {
      enriched: 0,
      failed: 0,
      skipped: 0,
      blocked_direct: 0,
      thin_direct: 0,
      firecrawl_used: 0,
      firecrawl_capped: 0,
      supplier_quality: 0, // enrichments with score >= 50 (enough for validation)
    };

    let firecrawlBudget = max_firecrawl;
    const SUPPLIER_QUALITY_TARGET = 3; // stop early once we have this many good enrichments

    // ─── PHASE 2: DIRECT FETCH ALL (FREE) ───
    // Process in rank order. Direct fetch is free so we try everyone.
    // Track which ones need Firecrawl escalation.
    
    interface ProcessedLink {
      link: any;
      domain: DomainProfile;
      rank: number;
      directResult: FetchResult | null;
      enriched: EnrichedSource | null;
      finalScore: number;
      needsFirecrawl: boolean;
    }

    const processed: ProcessedLink[] = [];

    for (const { link, rank, domain } of ranked) {
      const url = link.url || "";
      if (!url.startsWith("http")) {
        results.skipped++;
        continue;
      }

      // Early stop: enough supplier-quality enrichments already
      if (results.supplier_quality >= SUPPLIER_QUALITY_TARGET) {
        console.log(`[enrich-v3] Early stop — ${results.supplier_quality} supplier-quality enrichments achieved`);
        await supabase.from("product_links").update({
          source_enrichment_status: "skipped_sufficient",
          fetch_method: "skipped_early",
        }).eq("id", link.id);
        results.skipped++;
        continue;
      }

      console.log(`[enrich-v3] [rank=${rank}] [${domain.name}/${domain.tier}] ${url.slice(0, 80)}`);

      // Direct fetch (free)
      const direct = await fetchDirect(url);

      if (direct.html) {
        // Extract structured data cheaply
        let enrichedData = extractStructuredData(direct.html, url);
        const structScore = scoreEnrichment(enrichedData);

        // LLM gap-fill only if structured extraction is thin
        if (structScore < 60) {
          enrichedData = await llmEnrich(direct.html, url, enrichedData, openaiKey);
        }
        const finalScore = scoreEnrichment(enrichedData);

        // Determine fetch method label
        const fetchMethod = finalScore >= 30 ? "direct" : "thin_direct";
        if (fetchMethod === "thin_direct") results.thin_direct++;

        // Save enriched data
        await supabase.from("product_links").update({
          source_title_full: enrichedData.title_full || null,
          source_brand: enrichedData.brand,
          source_features: enrichedData.features,
          source_image_urls: enrichedData.image_urls,
          source_specs: enrichedData.specs,
          source_enrichment_status: finalScore >= 30 ? "enriched" : "thin",
          source_enriched_at: new Date().toISOString(),
          content_quality_score: finalScore,
          fetch_method: fetchMethod,
          extracted_product_name: enrichedData.title_full || link.extracted_product_name,
          extracted_brand: enrichedData.brand || link.extracted_brand,
          structured_price_cents: enrichedData.price_cents || link.structured_price_cents,
        }).eq("id", link.id);

        results.enriched++;
        if (finalScore >= 50) results.supplier_quality++;

        console.log(`[enrich-v3] ✓ [${fetchMethod}] score=${finalScore} "${enrichedData.title_full?.slice(0, 50)}" brand=${enrichedData.brand} price=$${enrichedData.price_cents ? (enrichedData.price_cents / 100).toFixed(2) : "?"}`);

        processed.push({ link, domain, rank, directResult: direct, enriched: enrichedData, finalScore, needsFirecrawl: false });
      } else {
        // Direct fetch failed — mark as blocked/failed and queue for possible Firecrawl
        const needsFirecrawl = direct.blocked && domain.firecrawlWorthy && rank >= 30;
        
        if (!needsFirecrawl) {
          // Not worth Firecrawl — just mark the failure
          const status = direct.blocked ? "blocked" : "failed";
          await supabase.from("product_links").update({
            source_enrichment_status: status,
            source_enriched_at: new Date().toISOString(),
            fetch_method: direct.blocked ? "blocked_direct" : "failed_direct",
          }).eq("id", link.id);
          if (direct.blocked) results.blocked_direct++;
          else results.failed++;
        } else {
          processed.push({ link, domain, rank, directResult: direct, enriched: null, finalScore: 0, needsFirecrawl: true });
        }
      }

      // Rate limit between direct fetches
      await new Promise(r => setTimeout(r, 400));
    }

    // ─── PHASE 3: FIRECRAWL ESCALATION (PAID, CAPPED) ───
    // Only for top-ranked candidates that were blocked on direct fetch
    const firecrawlCandidates = processed
      .filter(p => p.needsFirecrawl)
      .sort((a, b) => b.rank - a.rank); // best candidates first

    if (firecrawlCandidates.length > 0 && firecrawlKey && firecrawlBudget > 0) {
      console.log(`[enrich-v3] ─── FIRECRAWL PHASE: ${firecrawlCandidates.length} candidates, budget=${firecrawlBudget} ───`);

      for (const candidate of firecrawlCandidates) {
        if (firecrawlBudget <= 0) {
          // Budget exhausted — mark remaining as capped
          await supabase.from("product_links").update({
            source_enrichment_status: "blocked",
            fetch_method: "firecrawl_cap",
          }).eq("id", candidate.link.id);
          results.firecrawl_capped++;
          continue;
        }

        // Early stop if we already have enough
        if (results.supplier_quality >= SUPPLIER_QUALITY_TARGET) {
          await supabase.from("product_links").update({
            source_enrichment_status: "skipped_sufficient",
            fetch_method: "skipped_early",
          }).eq("id", candidate.link.id);
          results.skipped++;
          continue;
        }

        const url = candidate.link.url;
        console.log(`[enrich-v3] 💰 Firecrawl [budget=${firecrawlBudget}] ${url.slice(0, 80)}`);

        const fc = await fetchFirecrawl(url, firecrawlKey);
        firecrawlBudget--;
        results.firecrawl_used++;

        if (fc.html) {
          let enrichedData = extractStructuredData(fc.html, url);
          const structScore = scoreEnrichment(enrichedData);
          if (structScore < 60) {
            enrichedData = await llmEnrich(fc.html, url, enrichedData, openaiKey);
          }
          const finalScore = scoreEnrichment(enrichedData);

          await supabase.from("product_links").update({
            source_title_full: enrichedData.title_full || null,
            source_brand: enrichedData.brand,
            source_features: enrichedData.features,
            source_image_urls: enrichedData.image_urls,
            source_specs: enrichedData.specs,
            source_enrichment_status: finalScore >= 30 ? "enriched" : "thin",
            source_enriched_at: new Date().toISOString(),
            content_quality_score: finalScore,
            fetch_method: "firecrawl_used",
            extracted_product_name: enrichedData.title_full || candidate.link.extracted_product_name,
            extracted_brand: enrichedData.brand || candidate.link.extracted_brand,
            structured_price_cents: enrichedData.price_cents || candidate.link.structured_price_cents,
          }).eq("id", candidate.link.id);

          results.enriched++;
          if (finalScore >= 50) results.supplier_quality++;
          console.log(`[enrich-v3] ✓ [firecrawl] score=${finalScore} "${enrichedData.title_full?.slice(0, 50)}"`);
        } else {
          await supabase.from("product_links").update({
            source_enrichment_status: fc.blocked ? "blocked" : "failed",
            source_enriched_at: new Date().toISOString(),
            fetch_method: "firecrawl_used",
          }).eq("id", candidate.link.id);
          results.failed++;
        }

        await new Promise(r => setTimeout(r, 1000));
      }
    } else if (firecrawlCandidates.length > 0 && !firecrawlKey) {
      console.log(`[enrich-v3] ${firecrawlCandidates.length} candidates need Firecrawl but no API key available`);
      for (const c of firecrawlCandidates) {
        await supabase.from("product_links").update({
          source_enrichment_status: "blocked",
          fetch_method: "blocked_direct",
        }).eq("id", c.link.id);
        results.blocked_direct++;
      }
    }

    console.log(`[enrich-v3] ===== DONE =====`);
    console.log(`[enrich-v3] enriched=${results.enriched} (supplier_quality=${results.supplier_quality})`);
    console.log(`[enrich-v3] blocked_direct=${results.blocked_direct} thin_direct=${results.thin_direct}`);
    console.log(`[enrich-v3] firecrawl_used=${results.firecrawl_used} firecrawl_capped=${results.firecrawl_capped}`);
    console.log(`[enrich-v3] failed=${results.failed} skipped=${results.skipped}`);

    return new Response(JSON.stringify({ success: true, ...results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[enrich-v3] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
