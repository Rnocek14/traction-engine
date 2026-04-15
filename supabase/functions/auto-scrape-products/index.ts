/**
 * auto-scrape-products v3 — Real Product Retrieval Engine
 * 
 * Searches Google Shopping via SerpAPI for REAL products that exist and are being sold.
 * No AI generation of product names/brands. Every product must have a real URL.
 * 
 * Flow: SerpAPI Google Shopping → extract real listings → OpenAI scoring → quality gate → insert
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── GOOGLE SHOPPING QUERIES ───
// These search for real products on real marketplaces
const SHOPPING_QUERIES: Record<string, string[]> = {
  gadgets: [
    "electric spin scrubber cordless",
    "portable neck fan rechargeable",
    "wireless lavalier microphone phone",
    "car phone mount magnetic dashboard",
    "mini portable projector 1080p",
    "desk cable organizer magnetic",
    "smart LED desk lamp touch",
    "portable Bluetooth speaker waterproof",
    "electric hand warmer rechargeable",
    "gravity phone holder car mount",
  ],
  home: [
    "LED sunset lamp projector",
    "electric milk frother handheld",
    "smart plug WiFi outlet",
    "portable blender rechargeable USB",
    "steam iron handheld garment",
    "electric wine opener rechargeable",
    "smart water bottle temperature",
    "ultrasonic jewelry cleaner machine",
    "electric lighter rechargeable arc",
    "motion sensor trash can",
  ],
  beauty: [
    "LED face mask light therapy",
    "facial cleansing brush silicone",
    "hair dryer brush one step",
    "jade roller gua sha set",
    "electric dermaplaning tool face",
    "scalp massager electric",
    "teeth whitening LED kit",
    "heated eyelash curler electric",
    "micro current facial toning device",
    "ice roller for face",
  ],
  fitness: [
    "massage gun mini portable",
    "resistance bands set exercise",
    "smart jump rope digital counter",
    "electric foam roller vibrating",
    "posture corrector smart vibration",
    "wrist forearm strengthener grip",
    "ab roller wheel exercise",
    "acupressure mat pillow set",
  ],
  kitchen: [
    "electric vegetable chopper rechargeable",
    "pour over coffee kettle gooseneck",
    "silicone baking mat set",
    "electric can opener one touch",
    "herb garden indoor LED grow",
    "vacuum sealer machine bags",
    "electric salt pepper grinder set",
  ],
};

interface ShoppingResult {
  title: string;
  price: number; // dollars
  source: string; // store name
  link: string;
  thumbnail?: string;
  snippet?: string;
  product_id?: string;
}

interface ScoredProduct {
  name: string;
  canonical_name: string;
  brand: string;
  form_factor: string;
  core_features: string[];
  category: string;
  price_cents: number;
  source_url: string;
  image_url: string;
  store_name: string;
  why_viral: string;
  wow_factor: number;
  social_media_potential: number;
  impulse_buy_appeal: number;
  demonstrability_score: number;
  competition_level: number;
  trending_status: string;
  emotional_triggers: string[];
}

// ─── SERPAPI GOOGLE SHOPPING SEARCH ───
async function searchGoogleShopping(
  serpApiKey: string,
  query: string,
  minPrice: number,
  maxPrice: number,
): Promise<ShoppingResult[]> {
  const params = new URLSearchParams({
    engine: "google_shopping",
    q: query,
    api_key: serpApiKey,
    num: "20",
    tbs: `mr:1,price:1,ppr_min:${minPrice},ppr_max:${maxPrice}`,
    gl: "us",
    hl: "en",
  });

  const resp = await fetch(`https://serpapi.com/search.json?${params}`);
  if (!resp.ok) {
    const errBody = await resp.text().catch(() => "");
    console.warn(`[product-scrape] SerpAPI failed for "${query}": ${resp.status} — ${errBody.slice(0, 300)}`);
    return [];
  }

  const data = await resp.json();
  const results: ShoppingResult[] = [];

  for (const item of data.shopping_results || []) {
    const price = parseFloat(String(item.extracted_price || item.price || "0").replace(/[^0-9.]/g, ""));
    if (!price || price < minPrice || price > maxPrice) continue;
    if (!item.link && !item.product_link) continue;

    results.push({
      title: item.title || "",
      price,
      source: item.source || "",
      link: item.link || item.product_link || "",
      thumbnail: item.thumbnail || "",
      snippet: item.snippet || "",
      product_id: item.product_id || "",
    });
  }

  return results;
}

// ─── FETCH WITH RETRY ───
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 2): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const resp = await fetch(url, options);
    if (resp.status === 429 && attempt < maxRetries) {
      const delay = (attempt + 1) * 10000; // 10s, 20s
      console.warn(`[product-scrape] 429 rate limit — retry ${attempt + 1} in ${delay / 1000}s`);
      await new Promise(r => setTimeout(r, delay));
      continue;
    }
    return resp;
  }
  throw new Error("Unreachable");
}

// ─── SCORE REAL PRODUCTS WITH AI ───
// AI evaluates real products for dropshipping viability — does NOT invent products
async function scoreProducts(
  openaiKey: string,
  products: ShoppingResult[],
  category: string,
): Promise<ScoredProduct[]> {
  if (products.length === 0) return [];

  const productList = products.map((p, i) =>
    `[${i + 1}] "${p.title}" — $${p.price.toFixed(2)} from ${p.source}\n    URL: ${p.link}\n    Image: ${p.thumbnail || "none"}`
  ).join("\n\n");

  const requestBody = JSON.stringify({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are a product analyst for a dropshipping business. You are evaluating REAL products from Google Shopping results.

CRITICAL RULES:
- These are REAL products that exist. Do NOT change their names, brands, or URLs.
- Use the EXACT title and URL from the listing. Do NOT invent or modify.
- Extract the brand from the product title if present.
- Your job is to SCORE each product for dropshipping viability, not to create new products.

For each product, evaluate:
- wow_factor (1-5): Would this stop someone scrolling on TikTok?
- social_media_potential (1-5): Would people share/engage with a demo video?
- impulse_buy_appeal (1-5): Instant buy trigger from seeing a video?
- demonstrability_score (1-5): Can you show the value in <10 seconds?
- competition_level (1-5): 5=oversaturated, 1=undiscovered
- trending_status: emerging | rising | peak | declining | saturated
- emotional_triggers: pick 2-4 from: wow, satisfaction, transformation, curiosity, gift, before_after, problem_solved, luxury_affordable, convenience

REJECTION CRITERIA — mark rejected=true for:
- Generic commodities with no visual hook (plain cables, basic cases)
- Products impossible to demo in short video
- Items where you can't explain the value in one sentence
- Consumables with no repeat visual appeal

Only return products worth pursuing for video-commerce.`,
      },
      {
        role: "user",
        content: `Category: ${category}\n\nProducts to evaluate:\n\n${productList}`,
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "score_products",
          description: "Score real products for dropshipping viability",
          parameters: {
            type: "object",
            properties: {
              scored: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    index: { type: "integer", description: "1-based index from the input list" },
                    rejected: { type: "boolean", description: "true if product fails rejection criteria" },
                    rejection_reason: { type: "string" },
                    canonical_name: { type: "string", description: "Clean product name from listing (DO NOT invent)" },
                    brand: { type: "string", description: "Brand extracted from title, empty if generic" },
                    form_factor: { type: "string", description: "Physical type: handheld device, table lamp, etc." },
                    core_features: { type: "array", items: { type: "string" }, description: "3-5 key features from the listing" },
                    why_viral: { type: "string", description: "1-2 sentences on why this could work for video commerce" },
                    wow_factor: { type: "integer", minimum: 1, maximum: 5 },
                    social_media_potential: { type: "integer", minimum: 1, maximum: 5 },
                    impulse_buy_appeal: { type: "integer", minimum: 1, maximum: 5 },
                    demonstrability_score: { type: "integer", minimum: 1, maximum: 5 },
                    competition_level: { type: "integer", minimum: 1, maximum: 5 },
                    trending_status: { type: "string", enum: ["emerging", "rising", "peak", "declining", "saturated"] },
                    emotional_triggers: { type: "array", items: { type: "string" } },
                  },
                  required: ["index", "rejected"],
                },
              },
            },
            required: ["scored"],
          },
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "score_products" } },
    temperature: 0.2,
  });

  const resp = await fetchWithRetry("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: requestBody,
  });

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => "");
    console.error(`[product-scrape] OpenAI scoring failed: ${resp.status} — ${errBody.slice(0, 200)}`);
    return [];
  }

  const data = await resp.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) return [];

  const parsed = JSON.parse(toolCall.function.arguments);
  const scoredResults: ScoredProduct[] = [];

  for (const item of parsed.scored || []) {
    if (item.rejected) {
      console.log(`[product-scrape] AI rejected [${item.index}]: ${item.rejection_reason || "no reason"}`);
      continue;
    }

    const originalProduct = products[item.index - 1];
    if (!originalProduct) continue;

    scoredResults.push({
      name: originalProduct.title,
      canonical_name: item.canonical_name || originalProduct.title,
      brand: item.brand || "",
      form_factor: item.form_factor || "",
      core_features: item.core_features || [],
      category,
      price_cents: Math.round(originalProduct.price * 100),
      source_url: originalProduct.link,
      image_url: originalProduct.thumbnail || "",
      store_name: originalProduct.source || "",
      why_viral: item.why_viral || "",
      wow_factor: item.wow_factor || 3,
      social_media_potential: item.social_media_potential || 3,
      impulse_buy_appeal: item.impulse_buy_appeal || 3,
      demonstrability_score: item.demonstrability_score || 3,
      competition_level: item.competition_level || 3,
      trending_status: item.trending_status || "rising",
      emotional_triggers: item.emotional_triggers || [],
    });
  }

  return scoredResults;
}

function computeOverallScore(p: ScoredProduct): number {
  const competitionInv = 6 - p.competition_level;
  const raw = (p.wow_factor * 0.30 + p.social_media_potential * 0.25 + p.impulse_buy_appeal * 0.20 + p.demonstrability_score * 0.15 + competitionInv * 0.10);
  return Math.round((raw / 5) * 100);
}

// ─── MAIN HANDLER ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serpApiKey = Deno.env.get("SERPAPI_API_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!serpApiKey) {
      return new Response(JSON.stringify({ error: "SERPAPI_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!openaiKey) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let categories = ["gadgets", "home", "beauty"];
    let minPrice = 30;
    let maxPrice = 80;
    let queriesPerCategory = 3;
    try {
      const body = await req.json();
      if (body.categories) categories = body.categories;
      if (body.min_price) minPrice = body.min_price;
      if (body.max_price) maxPrice = body.max_price;
      if (body.queries_per_category) queriesPerCategory = body.queries_per_category;
    } catch { /* no body is fine */ }

    console.log(`[product-scrape] v3 Real Product Retrieval. Categories: ${categories.join(", ")}. Price: $${minPrice}-$${maxPrice}`);

    // ─── SEARCH GOOGLE SHOPPING ───
    const allResults: { category: string; products: ShoppingResult[] }[] = [];

    for (const cat of categories) {
      const queries = (SHOPPING_QUERIES[cat] || [])
        .sort(() => Math.random() - 0.5)
        .slice(0, queriesPerCategory);

      for (const query of queries) {
        console.log(`[product-scrape] Searching: "${query}" ($${minPrice}-$${maxPrice})`);
        const results = await searchGoogleShopping(serpApiKey, query, minPrice, maxPrice);
        console.log(`[product-scrape] → ${results.length} results for "${query}"`);

        if (results.length > 0) {
          allResults.push({ category: cat, products: results });
        }

        // Rate limit: be conservative to avoid 429s
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    const totalRaw = allResults.reduce((sum, r) => sum + r.products.length, 0);
    console.log(`[product-scrape] Total raw shopping results: ${totalRaw}`);

    if (totalRaw === 0) {
      return new Response(JSON.stringify({ success: true, products_found: 0, products_added: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── SCORE WITH AI ───
    const allScored: ScoredProduct[] = [];
    for (const { category, products } of allResults) {
      const scored = await scoreProducts(openaiKey, products, category);
      allScored.push(...scored);
      // Avoid OpenAI rate limits between batches
      await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`[product-scrape] ${allScored.length} products passed AI scoring`);

    // ─── DEDUPLICATE AGAINST EXISTING ───
    const { data: existing } = await supabase
      .from("products")
      .select("name, canonical_name, source_url")
      .limit(1000);

    const existingNames = new Set((existing || []).map((e: any) => (e.canonical_name || e.name).toLowerCase()));
    const existingUrls = new Set((existing || []).map((e: any) => e.source_url).filter(Boolean));

    const newProducts = allScored.filter(p => {
      const cn = p.canonical_name.toLowerCase();
      // Dedupe by name similarity or exact URL
      if (existingUrls.has(p.source_url)) return false;
      if (existingNames.has(cn)) return false;
      return true;
    });

    console.log(`[product-scrape] ${newProducts.length} new products after dedup (${allScored.length - newProducts.length} duplicates)`);

    // ─── INSERT ───
    let added = 0;
    let priceRejected = 0;

    for (const p of newProducts) {
      // Hard price gate
      if (p.price_cents < minPrice * 100 || p.price_cents > maxPrice * 100) {
        console.log(`[product-scrape] PRICE REJECTED: "${p.canonical_name}" — $${(p.price_cents / 100).toFixed(2)}`);
        priceRejected++;
        continue;
      }

      const overallScore = computeOverallScore(p);

      const { data: product, error: prodErr } = await supabase
        .from("products")
        .insert({
          name: p.name,
          canonical_name: p.canonical_name,
          category: p.category,
          source_url: p.source_url,
          image_url: p.image_url || null,
          price_cents: p.price_cents,
          status: "discovered",
          discovered_via: "google_shopping",
          notes: p.why_viral,
          distinctive_attributes: p.core_features,
          short_description: `${p.form_factor} — ${p.core_features.join(", ")}`.trim(),
          candidate_quality_score: 80, // real products start at 80 (they exist!)
        })
        .select("id")
        .single();

      if (prodErr || !product) {
        console.warn(`[product-scrape] Insert failed for "${p.name}":`, prodErr);
        continue;
      }

      await supabase
        .from("product_analysis")
        .insert({
          product_id: product.id,
          wow_factor: p.wow_factor,
          social_media_potential: p.social_media_potential,
          impulse_buy_appeal: p.impulse_buy_appeal,
          demonstrability_score: p.demonstrability_score,
          competition_level: p.competition_level,
          trending_status: p.trending_status,
          emotional_triggers: p.emotional_triggers,
          overall_score: overallScore,
          price_sweet_spot: true,
          analyzed_by: "ai",
          analyzed_at: new Date().toISOString(),
        });

      console.log(`[product-scrape] ✓ REAL product added: "${p.canonical_name}" — $${(p.price_cents / 100).toFixed(2)} from ${p.store_name} (score=${overallScore})`);
      added++;
    }

    console.log(`[product-scrape] Complete. Added ${added} real products.`);

    return new Response(
      JSON.stringify({
        success: true,
        version: "v3-real-retrieval",
        products_found: totalRaw,
        products_scored: allScored.length,
        products_added: added,
        price_rejected: priceRejected,
        price_range: `$${minPrice}-$${maxPrice}`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[product-scrape] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
