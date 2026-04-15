/**
 * enrich-product-links — Source Listing Enrichment Layer
 * 
 * For each pending/unenriched candidate link, fetches the actual listing page
 * and extracts structured product data (title, brand, price, features, images, specs).
 * 
 * Extraction priority:
 * 1. Schema.org / JSON-LD product markup (most reliable)
 * 2. Open Graph / meta tags
 * 3. HTML structure (title, bullets, images)
 * 4. LLM normalization for gaps
 * 
 * Stores enriched data on product_links so the validator has real evidence.
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

// ─── HTML FETCHER ───

async function fetchPage(url: string): Promise<string | null> {
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
    
    if (!resp.ok) {
      console.warn(`[enrich] Fetch failed for ${url}: ${resp.status}`);
      return null;
    }
    
    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      console.warn(`[enrich] Non-HTML content type for ${url}: ${contentType}`);
      return null;
    }
    
    // Limit to 500KB to avoid memory issues
    const text = await resp.text();
    return text.slice(0, 500_000);
  } catch (e) {
    console.warn(`[enrich] Fetch error for ${url}:`, e);
    return null;
  }
}

// ─── STRUCTURED EXTRACTION (no LLM) ───

function extractJsonLd(html: string): Record<string, any> | null {
  const ldMatches = html.match(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  if (!ldMatches) return null;
  
  for (const match of ldMatches) {
    try {
      const jsonStr = match.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "").trim();
      const parsed = JSON.parse(jsonStr);
      
      // Handle @graph arrays
      const items = Array.isArray(parsed) ? parsed : parsed["@graph"] ? parsed["@graph"] : [parsed];
      
      for (const item of items) {
        const type = (item["@type"] || "").toLowerCase();
        if (type === "product" || type.includes("product")) {
          return item;
        }
      }
    } catch { /* skip malformed JSON-LD */ }
  }
  return null;
}

function extractMetaTags(html: string): Record<string, string> {
  const meta: Record<string, string> = {};
  const metaRegex = /<meta\s+(?:[^>]*?)(?:property|name)\s*=\s*["']([^"']+)["']\s+content\s*=\s*["']([^"']*?)["'][^>]*>/gi;
  let m;
  while ((m = metaRegex.exec(html)) !== null) {
    meta[m[1].toLowerCase()] = m[2];
  }
  // Also match reversed attribute order
  const metaRegex2 = /<meta\s+content\s*=\s*["']([^"']*?)["']\s+(?:property|name)\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((m = metaRegex2.exec(html)) !== null) {
    meta[m[2].toLowerCase()] = m[1];
  }
  return meta;
}

function extractTitle(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return titleMatch ? titleMatch[1].trim().replace(/\s+/g, " ") : "";
}

function extractBulletFeatures(html: string): string[] {
  const features: string[] = [];
  
  // Amazon-style feature bullets
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
  
  // Generic bullet lists near product content
  const listMatches = html.match(/<ul[^>]*class\s*=\s*["'][^"']*(?:feature|spec|detail|bullet|product)[^"']*["'][^>]*>([\s\S]*?)<\/ul>/gi);
  if (listMatches && features.length === 0) {
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
  
  return features.slice(0, 15);
}

function extractProductImages(html: string, baseUrl: string): string[] {
  const images: string[] = [];
  const seen = new Set<string>();
  
  // High-res product images (Amazon hiRes, data-old-hires, etc.)
  const hiResMatches = html.match(/(?:hiRes|data-old-hires|data-a-dynamic-image)\s*["':]\s*["']?(https?:\/\/[^"'\s,}]+)/gi);
  if (hiResMatches) {
    for (const m of hiResMatches) {
      const urlMatch = m.match(/(https?:\/\/[^"'\s,}]+)/);
      if (urlMatch && !seen.has(urlMatch[1])) {
        seen.add(urlMatch[1]);
        images.push(urlMatch[1]);
      }
    }
  }
  
  // OG image
  const ogImage = html.match(/<meta\s+(?:property|name)\s*=\s*["']og:image["']\s+content\s*=\s*["']([^"']+)["']/i)
    || html.match(/content\s*=\s*["']([^"']+)["']\s+(?:property|name)\s*=\s*["']og:image["']/i);
  if (ogImage && !seen.has(ogImage[1])) {
    seen.add(ogImage[1]);
    images.push(ogImage[1]);
  }
  
  // Product images from img tags with product-related attributes
  const imgMatches = html.match(/<img[^>]+(?:class|id|data-)[^>]*(?:product|gallery|main|hero|primary)[^>]*src\s*=\s*["']([^"']+)["']/gi);
  if (imgMatches) {
    for (const m of imgMatches) {
      const srcMatch = m.match(/src\s*=\s*["'](https?:\/\/[^"']+)["']/i);
      if (srcMatch && !seen.has(srcMatch[1])) {
        seen.add(srcMatch[1]);
        images.push(srcMatch[1]);
      }
    }
  }
  
  // Filter out tiny icons, tracking pixels, logos
  return images.filter(url => {
    const u = url.toLowerCase();
    return !u.includes("1x1") && !u.includes("pixel") && !u.includes("logo") 
      && !u.includes("icon") && !u.includes("sprite") && !u.includes("badge")
      && !u.includes("rating") && !u.includes("star");
  }).slice(0, 10);
}

function extractPrice(html: string, meta: Record<string, string>, jsonLd: Record<string, any> | null): number | null {
  // JSON-LD price
  if (jsonLd) {
    const offers = jsonLd.offers || jsonLd.offer;
    if (offers) {
      const offer = Array.isArray(offers) ? offers[0] : offers;
      const price = offer.price || offer.lowPrice;
      if (price) return Math.round(parseFloat(String(price)) * 100);
    }
  }
  
  // Meta tag price
  const metaPrice = meta["product:price:amount"] || meta["og:price:amount"];
  if (metaPrice) return Math.round(parseFloat(metaPrice) * 100);
  
  // Schema price from HTML
  const priceMatch = html.match(/itemprop\s*=\s*["']price["']\s+content\s*=\s*["']([^"']+)["']/i);
  if (priceMatch) return Math.round(parseFloat(priceMatch[1]) * 100);
  
  return null;
}

function extractBrand(html: string, meta: Record<string, string>, jsonLd: Record<string, any> | null): string | null {
  // JSON-LD brand
  if (jsonLd?.brand) {
    const brand = typeof jsonLd.brand === "string" ? jsonLd.brand : jsonLd.brand.name;
    if (brand) return brand;
  }
  
  // Meta brand
  const metaBrand = meta["product:brand"] || meta["og:brand"];
  if (metaBrand) return metaBrand;
  
  // Schema brand from HTML
  const brandMatch = html.match(/itemprop\s*=\s*["']brand["'][^>]*content\s*=\s*["']([^"']+)["']/i);
  if (brandMatch) return brandMatch[1];
  
  // Amazon "bylineInfo" style
  const bylineMatch = html.match(/id\s*=\s*["']bylineInfo["'][^>]*>[\s\S]*?(?:Visit the|Brand:)\s*([^<]+)/i);
  if (bylineMatch) return bylineMatch[1].trim();
  
  return null;
}

function extractAsin(url: string, html: string): string | null {
  // From URL
  const urlMatch = url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  if (urlMatch) return urlMatch[1].toUpperCase();
  
  // From HTML
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

// ─── FULL EXTRACTION PIPELINE ───

function extractStructuredData(html: string, url: string): EnrichedSource {
  const jsonLd = extractJsonLd(html);
  const meta = extractMetaTags(html);
  const pageTitle = extractTitle(html);
  const features = extractBulletFeatures(html);
  const images = extractProductImages(html, url);
  
  const titleFull = jsonLd?.name || meta["og:title"] || pageTitle;
  const brand = extractBrand(html, meta, jsonLd);
  const priceCents = extractPrice(html, meta, jsonLd);
  const asin = extractAsin(url, html);
  
  // Extract specs from JSON-LD additionalProperty
  const specs: Record<string, string> = {};
  if (jsonLd?.additionalProperty) {
    for (const prop of (Array.isArray(jsonLd.additionalProperty) ? jsonLd.additionalProperty : [jsonLd.additionalProperty])) {
      if (prop.name && prop.value) specs[prop.name] = String(prop.value);
    }
  }
  
  // Extract SKU/model
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

// ─── LLM GAP-FILL (only when structured extraction is thin) ───

async function llmEnrich(
  html: string,
  url: string,
  partial: EnrichedSource,
  openaiKey: string,
): Promise<EnrichedSource> {
  // Only call LLM if we're missing critical fields
  const hasTitleGap = !partial.title_full || partial.title_full.length < 10;
  const hasBrandGap = !partial.brand;
  const hasFeatureGap = partial.features.length < 2;
  const hasPriceGap = !partial.price_cents;
  
  const gaps = [hasTitleGap && "title", hasBrandGap && "brand", hasFeatureGap && "features", hasPriceGap && "price"]
    .filter(Boolean);
  
  if (gaps.length === 0) {
    console.log(`[enrich] No gaps to fill for ${url}`);
    return partial;
  }
  
  // Extract a text snippet from the page (first 3000 chars of visible text)
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
          {
            role: "system",
            content: `You extract product listing facts from page text. Only return facts explicitly stated on the page. Do NOT infer or guess.`,
          },
          {
            role: "user",
            content: `URL: ${url}\n\nPage text:\n${visibleText}\n\nExtract the product listing details. Missing fields to focus on: ${gaps.join(", ")}`,
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_listing",
            parameters: {
              type: "object",
              properties: {
                product_title: { type: "string", description: "Full product title as shown on listing" },
                brand: { type: "string", description: "Brand name, empty if not found" },
                price_dollars: { type: "number", description: "Price in dollars, 0 if not found" },
                features: { type: "array", items: { type: "string" }, description: "Product features/bullet points" },
                model_number: { type: "string", description: "Model number or SKU if found" },
              },
              required: ["product_title", "brand", "price_dollars", "features"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "extract_listing" } },
        temperature: 0,
      }),
    });
    
    if (!resp.ok) return partial;
    
    const data = await resp.json();
    const call = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) return partial;
    
    const extracted = JSON.parse(call.function.arguments);
    
    // Merge — only fill gaps, don't overwrite structured data
    return {
      ...partial,
      title_full: partial.title_full || extracted.product_title || "",
      brand: partial.brand || (extracted.brand || null),
      price_cents: partial.price_cents || (extracted.price_dollars ? Math.round(extracted.price_dollars * 100) : null),
      features: partial.features.length >= 2 ? partial.features : (extracted.features || partial.features),
      model: partial.model || extracted.model_number || null,
    };
  } catch (e) {
    console.warn(`[enrich] LLM gap-fill failed:`, e);
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
    if (!openaiKey) throw new Error("OPENAI_API_KEY not configured");

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body = await req.json();
    const { product_id, link_ids, max_links = 10 } = body;

    if (!product_id) throw new Error("product_id required");

    console.log(`[enrich] ===== Starting enrichment for product ${product_id} =====`);

    // Fetch unenriched links, prioritized by search rank / title length
    let query = supabase
      .from("product_links")
      .select("*")
      .eq("product_id", product_id)
      .or("source_enrichment_status.eq.pending,source_enrichment_status.is.null");
    
    if (link_ids?.length) {
      query = query.in("id", link_ids);
    }
    
    const { data: links, error: linkErr } = await query.limit(max_links);
    if (linkErr) throw new Error(`Failed to fetch links: ${linkErr.message}`);
    
    if (!links?.length) {
      console.log("[enrich] No unenriched links found");
      return new Response(JSON.stringify({ success: true, enriched: 0, message: "No unenriched links" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[enrich] Processing ${links.length} links`);
    
    const results = { enriched: 0, failed: 0, skipped: 0 };

    for (const link of links) {
      try {
        // Skip non-product URLs
        const url = link.url || "";
        if (!url.startsWith("http")) {
          results.skipped++;
          continue;
        }
        
        console.log(`[enrich] Fetching: ${url.slice(0, 80)}...`);
        
        const html = await fetchPage(url);
        if (!html) {
          await supabase.from("product_links").update({
            source_enrichment_status: "failed",
            source_enriched_at: new Date().toISOString(),
          }).eq("id", link.id);
          results.failed++;
          continue;
        }

        // Step 1: Structured extraction (fast, no LLM)
        let enriched = extractStructuredData(html, url);
        
        console.log(`[enrich] Structured: title="${enriched.title_full?.slice(0, 60)}" brand="${enriched.brand}" price=${enriched.price_cents} features=${enriched.features.length} images=${enriched.image_urls.length}`);
        
        // Step 2: LLM gap-fill if needed
        enriched = await llmEnrich(html, url, enriched, openaiKey);
        
        // Step 3: Save enriched data
        await supabase.from("product_links").update({
          source_title_full: enriched.title_full || null,
          source_brand: enriched.brand,
          source_features: enriched.features,
          source_image_urls: enriched.image_urls,
          source_specs: enriched.specs,
          source_enrichment_status: "enriched",
          source_enriched_at: new Date().toISOString(),
          // Also update existing fields if we got better data
          extracted_product_name: enriched.title_full || link.extracted_product_name,
          extracted_brand: enriched.brand || link.extracted_brand,
          structured_price_cents: enriched.price_cents || link.structured_price_cents,
        }).eq("id", link.id);
        
        results.enriched++;
        console.log(`[enrich] ✓ Enriched: "${enriched.title_full?.slice(0, 50)}" brand=${enriched.brand} price=$${enriched.price_cents ? (enriched.price_cents / 100).toFixed(2) : "?"} features=${enriched.features.length} images=${enriched.image_urls.length}`);
        
        // Rate limit page fetches
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        console.warn(`[enrich] Error processing link ${link.id}:`, err);
        await supabase.from("product_links").update({
          source_enrichment_status: "failed",
          source_enriched_at: new Date().toISOString(),
        }).eq("id", link.id);
        results.failed++;
      }
    }

    console.log(`[enrich] ===== Done: ${results.enriched} enriched, ${results.failed} failed, ${results.skipped} skipped =====`);

    return new Response(JSON.stringify({
      success: true,
      ...results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[enrich] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
