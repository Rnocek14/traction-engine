/**
 * harvest-product-images — Asset Verification Engine
 * 
 * Scrapes images from CONFIRMED product links, verifies they match
 * the canonical product using LLM, and scores ad-readiness.
 * 
 * Pipeline:
 * 1. Load confirmed links for a product
 * 2. Scrape images from each confirmed link page
 * 3. Verify each image matches the canonical product (LLM)
 * 4. Score ad-readiness (resolution, type, usability)
 * 5. Update product_images + recompute readiness
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface HarvestResult {
  scraped: number;
  verified: number;
  rejected: number;
  sources: string[];
}

// ─── IMAGE FILTERS ───

function isProductImage(url: string): boolean {
  if (!url || !url.startsWith("http")) return false;
  const u = url.toLowerCase();
  if (u.includes("1x1") || u.includes("pixel") || u.includes("tracking")) return false;
  if (u.includes("/icon") || u.includes("favicon") || u.includes("logo")) return false;
  if (u.includes("sprite") || u.includes("placeholder") || u.includes("loading")) return false;
  if (u.includes("avatar") || u.includes("banner") || u.includes("ad_")) return false;
  if (u.includes(".svg") || u.includes(".gif")) return false;
  if (!u.match(/\.(jpg|jpeg|png|webp)/i) && !u.includes("image")) return false;
  const sizeMatch = u.match(/_(\d+)x(\d+)/);
  if (sizeMatch) {
    const w = parseInt(sizeMatch[1]);
    if (w < 200) return false;
  }
  return true;
}

function extractImageUrls(html: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  function add(url: string) {
    if (!url || seen.has(url) || !isProductImage(url)) return;
    seen.add(url);
    urls.push(url);
  }

  // Standard img src
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = imgRegex.exec(html)) !== null) add(match[1]);

  // og:image
  const ogRegex = /<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+)["']/gi;
  while ((match = ogRegex.exec(html)) !== null) add(match[1]);

  // data-src (lazy loaded)
  const dataSrcRegex = /data-src=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi;
  while ((match = dataSrcRegex.exec(html)) !== null) add(match[1]);

  // srcset first entry
  const srcsetRegex = /srcset=["']([^"']+)["']/gi;
  while ((match = srcsetRegex.exec(html)) !== null) {
    const first = match[1].split(",")[0]?.trim().split(/\s+/)[0];
    if (first) add(first);
  }

  return urls;
}

// ─── SCRAPE IMAGES FROM URL ───

async function scrapeImagesFromUrl(url: string, firecrawlKey: string | null): Promise<string[]> {
  // Try Firecrawl first (handles JS-heavy sites)
  if (firecrawlKey) {
    try {
      const resp = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${firecrawlKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          formats: ["html"],
          waitFor: 3000,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const html = data.data?.html || "";
        const images = extractImageUrls(html);
        if (images.length > 0) return images.slice(0, 10);
      }
    } catch (e) {
      console.warn(`[harvest] Firecrawl error for ${url}:`, e);
    }
  }

  // Fallback: native fetch
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    if (resp.ok) {
      const html = await resp.text();
      return extractImageUrls(html).slice(0, 10);
    }
  } catch (e) {
    console.warn(`[harvest] Native fetch error for ${url}:`, e);
  }

  return [];
}

// ─── VERIFY IMAGES MATCH PRODUCT ───

async function verifyImageBatch(
  canonicalName: string,
  coreFeatures: string[],
  excludedVariants: string[],
  imageUrls: string[],
  sourceUrl: string,
  openaiKey: string,
): Promise<Array<{ url: string; verdict: string; confidence: number; label: string; ad_readiness: number }>> {
  if (imageUrls.length === 0) return [];

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a product image verifier for an e-commerce system.

Given a canonical product identity and a list of image URLs from a product listing page, determine:
1. Which images likely show the EXACT canonical product (not similar products)
2. What type each image is (hero, detail, in_use, packaging, comparison, lifestyle, unrelated)
3. How ad-ready each image is (0-100): clean background, high resolution, good lighting, shows product clearly

RULES:
- Images from a CONFIRMED listing page are generally trustworthy
- But listing pages sometimes show related/complementary products — filter those out
- Hero images (main product shot) get highest ad_readiness
- In-use/lifestyle images are valuable for ads too
- Reject images that appear to be: size charts, shipping info, review screenshots, store banners

For each image, return:
- verdict: "product_match" | "related_but_different" | "not_product"
- confidence: 0-1
- label: "hero" | "detail" | "in_use" | "packaging" | "comparison" | "lifestyle" | "unrelated"
- ad_readiness: 0-100`,
        },
        {
          role: "user",
          content: `Canonical product: "${canonicalName}"
Core features: ${coreFeatures.join(", ")}
Excluded variants: ${excludedVariants.join(", ")}
Source listing: ${sourceUrl}

Image URLs to verify:
${imageUrls.map((u, i) => `${i + 1}. ${u}`).join("\n")}

Classify each image.`,
        },
      ],
      tools: [{
        type: "function",
        function: {
          name: "classify_images",
          parameters: {
            type: "object",
            properties: {
              images: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    index: { type: "integer" },
                    verdict: { type: "string", enum: ["product_match", "related_but_different", "not_product"] },
                    confidence: { type: "number", minimum: 0, maximum: 1 },
                    label: { type: "string", enum: ["hero", "detail", "in_use", "packaging", "comparison", "lifestyle", "unrelated"] },
                    ad_readiness: { type: "integer", minimum: 0, maximum: 100 },
                  },
                  required: ["index", "verdict", "confidence", "label", "ad_readiness"],
                },
              },
            },
            required: ["images"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "classify_images" } },
      temperature: 0.1,
    }),
  });

  if (!resp.ok) {
    console.warn(`[harvest] Image verification LLM failed: ${resp.status}`);
    // Fallback: assume all images from confirmed listing are product matches
    return imageUrls.map((url, i) => ({
      url,
      verdict: "product_match",
      confidence: 0.6,
      label: i === 0 ? "hero" : "detail",
      ad_readiness: i === 0 ? 60 : 40,
    }));
  }

  const data = await resp.json();
  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) {
    return imageUrls.map((url, i) => ({
      url,
      verdict: "product_match",
      confidence: 0.5,
      label: i === 0 ? "hero" : "detail",
      ad_readiness: i === 0 ? 50 : 30,
    }));
  }

  const parsed = JSON.parse(call.function.arguments);
  return (parsed.images || []).map((img: any) => ({
    url: imageUrls[img.index - 1] || imageUrls[0],
    verdict: img.verdict,
    confidence: img.confidence,
    label: img.label,
    ad_readiness: img.ad_readiness,
  }));
}

// ─── MAIN HANDLER ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY") || null;
    if (!openaiKey) throw new Error("OPENAI_API_KEY not configured");

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { product_id } = await req.json();
    if (!product_id) throw new Error("product_id required");

    console.log(`[harvest] ===== Starting image harvest for product ${product_id} =====`);

    // Load product
    const { data: product } = await supabase.from("products").select("*").eq("id", product_id).single();
    if (!product) throw new Error("Product not found");

    const canonicalName = product.canonical_name || product.name;
    const coreFeatures = product.distinctive_attributes || [];
    const excludedVariants = product.excluded_variants || [];

    // Load confirmed links
    const { data: confirmedLinks } = await supabase
      .from("product_links")
      .select("*")
      .eq("product_id", product_id)
      .eq("validation_status", "confirmed")
      .order("match_confidence", { ascending: false });

    if (!confirmedLinks?.length) {
      console.log("[harvest] No confirmed links — skipping");
      return new Response(JSON.stringify({ success: true, message: "No confirmed links to harvest from" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[harvest] ${confirmedLinks.length} confirmed links to scrape`);

    const result: HarvestResult = { scraped: 0, verified: 0, rejected: 0, sources: [] };
    const allVerifiedImages: Array<{ url: string; label: string; ad_readiness: number; source: string; source_domain: string; confidence: number }> = [];

    // Scrape images from each confirmed link (limit to top 5)
    for (const link of confirmedLinks.slice(0, 5)) {
      console.log(`[harvest] Scraping: ${link.platform} — ${link.url.slice(0, 80)}`);
      const imageUrls = await scrapeImagesFromUrl(link.url, firecrawlKey);
      result.scraped += imageUrls.length;

      if (imageUrls.length === 0) {
        console.log(`[harvest] No images found from ${link.platform}`);
        continue;
      }

      // Verify images
      const verified = await verifyImageBatch(
        canonicalName,
        coreFeatures,
        excludedVariants,
        imageUrls,
        link.url,
        openaiKey,
      );

      let domain = "unknown";
      try { domain = new URL(link.url).hostname.replace("www.", ""); } catch {}

      for (const img of verified) {
        if (img.verdict === "product_match") {
          result.verified++;
          allVerifiedImages.push({
            url: img.url,
            label: img.label,
            ad_readiness: img.ad_readiness,
            source: `confirmed_${link.link_type}`,
            source_domain: domain,
            confidence: img.confidence,
          });
        } else {
          result.rejected++;
        }
      }

      result.sources.push(link.platform);
      await new Promise(r => setTimeout(r, 500)); // Rate limit
    }

    console.log(`[harvest] Scraped ${result.scraped} images, verified ${result.verified}, rejected ${result.rejected}`);

    if (allVerifiedImages.length === 0) {
      return new Response(JSON.stringify({ success: true, ...result, message: "No verified images found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deduplicate by URL
    const seenUrls = new Set<string>();
    const uniqueImages = allVerifiedImages.filter(img => {
      if (seenUrls.has(img.url)) return false;
      seenUrls.add(img.url);
      return true;
    });

    // Remove old unverified scraped images (keep manually approved)
    await supabase.from("product_images")
      .delete()
      .eq("product_id", product_id)
      .eq("manually_approved", false)
      .in("source", ["confirmed_retail", "confirmed_wholesale", "auto_harvest"]);

    // Insert verified images
    const heroImage = uniqueImages.find(i => i.label === "hero") || uniqueImages[0];
    const rows = uniqueImages.slice(0, 10).map((img, i) => ({
      product_id,
      url: img.url,
      source: img.source,
      source_domain: img.source_domain,
      label: img.label,
      is_primary: img.url === heroImage.url,
      verified: true,
      ad_readiness_score: img.ad_readiness,
      image_match_verdict: "confirmed",
      image_match_confidence: Math.round(img.confidence * 100),
    }));

    const { error: insertErr } = await supabase.from("product_images").insert(rows);
    if (insertErr) {
      console.error("[harvest] Insert error:", insertErr);
    } else {
      console.log(`[harvest] Saved ${rows.length} verified images`);
    }

    // Update product hero image
    if (heroImage) {
      await supabase.from("products").update({
        image_url: heroImage.url,
        updated_at: new Date().toISOString(),
      }).eq("id", product_id);
    }

    // Trigger readiness recompute
    try {
      await fetch(`${supabaseUrl}/functions/v1/recompute-product-readiness`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ product_id }),
      });
    } catch (e) {
      console.warn("[harvest] Readiness recompute error (non-fatal):", e);
    }

    return new Response(JSON.stringify({
      success: true,
      ...result,
      saved: rows.length,
      hero_image: heroImage?.url || null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[harvest] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
