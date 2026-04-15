/**
 * auto-scrape-products v2 — Quality-Gated Discovery
 * 
 * Discovers trending products and scores candidate quality BEFORE insertion.
 * Only specific, identifiable products pass the quality gate.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PRODUCT_QUERIES = [
  "viral TikTok products $30-$80 price range selling fast this week",
  "trending TikTok Shop items $30-$70 with millions of views right now",
  "best selling mid-price products $30-$60 going viral on social media this week",
  "Amazon movers and shakers $30-$80 products trending on TikTok and Instagram",
  "best selling products on TikTok Shop this week $30-$80 with high engagement",
  "viral product demos $30-$80 on TikTok Reels with millions of views this week",
  "trending gadgets and home products $30-$80 going viral on social media right now",
  "dropshipping winning products $30-$80 trending on TikTok this week",
];

const CATEGORY_QUERIES: Record<string, string[]> = {
  gadgets: [
    "trending tech gadgets $30-$80 going viral on TikTok this week with strong visual demos",
    "most satisfying gadget demos $30-$70 on TikTok and Instagram Reels this week",
    "viral car gadgets and desk accessories $30-$60 trending on TikTok",
  ],
  home: [
    "viral home products and smart devices $30-$80 trending on TikTok this week",
    "most popular home upgrade products $30-$70 on TikTok Shop with before-after demos",
    "trending kitchen gadgets and home tools $30-$60 going viral with satisfying demos",
  ],
  beauty: [
    "trending beauty tools and skincare devices $30-$80 going viral on TikTok this week",
    "best selling beauty gadgets $30-$70 on TikTok Shop with transformation demos",
    "viral self-care devices and beauty tools $30-$60 with obvious before-after results",
  ],
  toys: [
    "viral premium toys and STEM kits $30-$80 trending on TikTok this week",
    "most popular kids electronics and creative kits $30-$60 going viral right now",
  ],
  fitness: [
    "trending fitness gadgets and recovery tools $30-$80 on TikTok this week",
    "viral workout equipment and massage devices $30-$70 on TikTok Shop",
    "best selling portable fitness tools $30-$60 with strong demo videos",
  ],
};

interface DiscoveredProduct {
  name: string;
  canonical_name: string;
  brand: string;
  form_factor: string;
  core_features: string[];
  pack_count: number;
  power_source: string;
  primary_material: string;
  excluded_lookalikes: string[];
  category: string;
  price_range: string;
  source_url: string;
  image_url: string;
  why_viral: string;
  wow_factor: number;
  social_media_potential: number;
  impulse_buy_appeal: number;
  demonstrability_score: number;
  competition_level: number;
  trending_status: string;
  emotional_triggers: string[];
}

// ─── CANDIDATE QUALITY SCORING ───
// Scores how specific/validatable a discovered product is (0-100)
function computeCandidateQuality(p: DiscoveredProduct): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // Has brand name (20 pts)
  if (p.brand && p.brand.length > 1) {
    score += 20;
    reasons.push("has_brand");
  }

  // Canonical name is specific — more than 3 words (15 pts)
  const canonWords = (p.canonical_name || "").split(/\s+/).filter(w => w.length > 1);
  if (canonWords.length >= 4) {
    score += 15;
    reasons.push("specific_name");
  } else if (canonWords.length >= 3) {
    score += 8;
    reasons.push("moderate_name");
  }

  // Has core features (15 pts)
  if (p.core_features?.length >= 3) {
    score += 15;
    reasons.push("rich_features");
  } else if (p.core_features?.length >= 1) {
    score += 7;
    reasons.push("some_features");
  }

  // Has form factor (10 pts)
  if (p.form_factor && p.form_factor.length > 3) {
    score += 10;
    reasons.push("has_form_factor");
  }

  // Has excluded lookalikes (10 pts) — shows product is well-differentiated
  if (p.excluded_lookalikes?.length >= 2) {
    score += 10;
    reasons.push("has_exclusions");
  }

  // Has price range (10 pts)
  if (p.price_range && p.price_range.includes("$")) {
    score += 10;
    reasons.push("has_price");
  }

  // Has real source URL (10 pts)
  if (p.source_url && p.source_url.startsWith("http")) {
    score += 10;
    reasons.push("has_source_url");
  }

  // Has material info (5 pts)
  if (p.primary_material && p.primary_material.length > 2 && p.primary_material !== "unknown") {
    score += 5;
    reasons.push("has_material");
  }

  // Has power source (5 pts)
  if (p.power_source && p.power_source !== "unknown") {
    score += 5;
    reasons.push("has_power_source");
  }

  return { score: Math.min(score, 100), reasons };
}

// ─── DISCOVERY ───

async function discoverProducts(
  perplexityKey: string,
  openaiKey: string,
  categories: string[]
): Promise<DiscoveredProduct[]> {
  const queries = PRODUCT_QUERIES.sort(() => Math.random() - 0.5).slice(0, 3);
  for (const cat of categories) {
    const catQueries = CATEGORY_QUERIES[cat];
    if (catQueries) {
      queries.push(catQueries[Math.floor(Math.random() * catQueries.length)]);
    }
  }

  const rawTexts: string[] = [];

  for (const query of queries) {
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
            {
              role: "system",
              content: `You are a product trend researcher for dropshipping and e-commerce. Find specific products (not brands/categories) that are going viral.

CRITICAL PRICE REQUIREMENT: Only include products that retail between $30 and $80. Skip anything under $30 or over $80.

For each product include: exact product name WITH BRAND if possible, approximate retail price ($30-$80 range ONLY), why it's going viral, what platform it's trending on, and a URL if available. Focus on products that are visually demonstrable in short-form video and have obvious "wow factor" or problem-solving appeal.`,
            },
            { role: "user", content: query },
          ],
          max_tokens: 3000,
          search_recency_filter: "week",
        }),
      });

      if (!resp.ok) {
        console.warn(`[product-scrape] Perplexity query failed: ${resp.status}`);
        continue;
      }

      const data = await resp.json();
      const content = data.choices?.[0]?.message?.content || "";
      const citations = data.citations || [];
      rawTexts.push(`Query: ${query}\n\nResults:\n${content}\n\nSource URLs (REAL, USE THESE for source_url):\n${citations.map((c: string, i: number) => `[${i+1}] ${c}`).join("\n")}`);
    } catch (err) {
      console.warn(`[product-scrape] Query error:`, err);
    }

    await new Promise(r => setTimeout(r, 1500));
  }

  if (rawTexts.length === 0) return [];

  const combined = rawTexts.join("\n\n---\n\n").slice(0, 20000);

  const extractResp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a product intelligence analyst for a dropshipping business. Extract individual SPECIFIC products from the research data.

CRITICAL PRICE FILTER: Only include products with retail price between $30 and $80. REJECT anything under $30 or over $80. This is the most important filter.

CRITICAL PRODUCT IDENTITY RULES:
- Every product MUST be a specific, identifiable item — NOT a category.
- BAD: "Crystal Lamp" (too vague — there are thousands of crystal lamps)
- GOOD: "Leroxo Portable Crystal Touch Lamp USB Rechargeable 16-Color RGB"
- BAD: "Mini Projector" (category, not a product)
- GOOD: "YABER V2 Mini Projector 1080P WiFi Bluetooth 9000L"
- Include the brand name if mentioned in the research data
- Include distinguishing specs: size, capacity, color count, power source, material
- Include pack count if it's a set/bundle
- The name should be specific enough that searching it returns ONLY that exact product

SELLABILITY REQUIREMENTS — each product must have:
- Strong visual hook: can you make someone stop scrolling in 2 seconds?
- Obvious problem → solution OR "wow/satisfaction" factor
- Plausible wholesale source (not luxury/designer brands)
- Room for $10+ net profit at the retail price

PRODUCT IDENTITY FIELDS (required for each product):
- canonical_name: The precise product name with brand + key specs (3-10 words)
- brand: The brand/manufacturer if known, empty string if generic/unbranded
- form_factor: Physical shape/type (e.g. "table lamp", "handheld projector", "pendant necklace")
- core_features: 3-6 defining features that distinguish THIS product from similar ones
- pack_count: Number of units (1 for single, 2+ for sets)
- power_source: "USB rechargeable" | "battery" | "plug-in" | "solar" | "none" | "unknown"
- primary_material: Dominant material (e.g. "acrylic", "silicone", "stainless steel", "ABS plastic")
- excluded_lookalikes: 2-4 similar products that are NOT this product (helps prevent false matches)

CRITICAL - URLs:
- source_url: Use a REAL URL from the "Source URLs" section. Do NOT make up URLs.
- image_url: Include direct image URL if available, empty string otherwise.

REJECTION RULES — do NOT include:
- Products under $30 or over $80 retail price
- Products with no brand AND no distinguishing specs (too vague to validate)
- Generic category descriptions ("LED lights", "phone case")
- Products where you cannot identify the exact item being discussed
- Products with weak visual demo potential (boring utility items)
- Products that are hard to explain in one sentence

SCORING RUBRIC (1-5 scale):
- wow_factor: Visual impact for short-form video demo
- social_media_potential: Engagement/shareability
- impulse_buy_appeal: Instant buy trigger from video
- demonstrability_score: Can you show value in <10 seconds?
- competition_level: 5=oversaturated, 1=undiscovered

TRENDING STATUS: emerging | rising | peak | declining | saturated
EMOTIONAL TRIGGERS: pick 2-4 from: wow, satisfaction, transformation, curiosity, gift, before_after, problem_solved, luxury_affordable, kids, pets, convenience, fear_of_missing

Extract up to 15 unique products IN THE $30-$80 RANGE. Deduplicate similar items. REJECT anything too vague to identify or outside price range.`,
        },
        { role: "user", content: combined },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "store_products",
            description: "Store discovered products with precise identity",
            parameters: {
              type: "object",
              properties: {
                products: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string", description: "Specific product name with brand + specs" },
                      canonical_name: { type: "string", description: "Precise searchable name, 3-10 words, with brand if known" },
                      brand: { type: "string", description: "Brand/manufacturer name, empty if unknown" },
                      form_factor: { type: "string", description: "Physical type: table lamp, pendant, handheld device, etc." },
                      core_features: { type: "array", items: { type: "string" }, description: "3-6 defining features" },
                      pack_count: { type: "integer", description: "Number of units (1 for single)" },
                      power_source: { type: "string", description: "USB rechargeable, battery, plug-in, solar, none, unknown" },
                      primary_material: { type: "string", description: "Dominant material" },
                      excluded_lookalikes: { type: "array", items: { type: "string" }, description: "Similar but different products" },
                      category: { type: "string", enum: ["gadgets", "home", "beauty", "toys", "fitness", "kitchen", "fashion", "pets", "outdoor", "other"] },
                      price_range: { type: "string", description: "Approximate price like '$15-25' or '$39.99'" },
                      source_url: { type: "string", description: "URL where product was found, or empty string" },
                      image_url: { type: "string", description: "Direct URL to a product image if available, or empty string" },
                      why_viral: { type: "string", description: "1-2 sentences on why this product is trending" },
                      wow_factor: { type: "integer", minimum: 1, maximum: 5 },
                      social_media_potential: { type: "integer", minimum: 1, maximum: 5 },
                      impulse_buy_appeal: { type: "integer", minimum: 1, maximum: 5 },
                      demonstrability_score: { type: "integer", minimum: 1, maximum: 5 },
                      competition_level: { type: "integer", minimum: 1, maximum: 5 },
                      trending_status: { type: "string", enum: ["emerging", "rising", "peak", "declining", "saturated"] },
                      emotional_triggers: { type: "array", items: { type: "string" } },
                    },
                    required: ["name", "canonical_name", "form_factor", "core_features", "pack_count", "excluded_lookalikes", "category", "price_range", "wow_factor", "social_media_potential", "impulse_buy_appeal", "demonstrability_score", "competition_level", "trending_status", "emotional_triggers"],
                  },
                },
              },
              required: ["products"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "store_products" } },
      temperature: 0.3,
    }),
  });

  if (!extractResp.ok) {
    const err = await extractResp.text();
    console.error(`[product-scrape] OpenAI extraction failed: ${extractResp.status} ${err}`);
    return [];
  }

  const extractData = await extractResp.json();
  const toolCall = extractData.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) return [];

  const parsed = JSON.parse(toolCall.function.arguments);
  return parsed.products || [];
}

function parsePriceCents(priceRange: string): number | null {
  const match = priceRange.match(/\$?([\d.]+)/);
  if (!match) return null;
  return Math.round(parseFloat(match[1]) * 100);
}

function computeOverallScore(p: DiscoveredProduct): number {
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
    const perplexityKey = Deno.env.get("PERPLEXITY_API_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!perplexityKey) {
      return new Response(JSON.stringify({ error: "PERPLEXITY_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!openaiKey) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let categories = ["gadgets", "home", "beauty", "toys"];
    let qualityThreshold = 40; // minimum quality score to accept
    try {
      const body = await req.json();
      if (body.categories) categories = body.categories;
      if (body.quality_threshold) qualityThreshold = body.quality_threshold;
    } catch { /* no body is fine */ }

    console.log(`[product-scrape] Starting discovery. Categories: ${categories.join(", ")}. Quality threshold: ${qualityThreshold}`);

    const discovered = await discoverProducts(perplexityKey, openaiKey, categories);
    console.log(`[product-scrape] Discovered ${discovered.length} raw candidates`);

    if (discovered.length === 0) {
      return new Response(JSON.stringify({ success: true, products_found: 0, products_added: 0, quality_rejected: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── QUALITY GATE ───
    const qualityResults = discovered.map(p => ({
      product: p,
      quality: computeCandidateQuality(p),
    }));

    const passed = qualityResults.filter(r => r.quality.score >= qualityThreshold);
    const failed = qualityResults.filter(r => r.quality.score < qualityThreshold);

    for (const f of failed) {
      console.log(`[product-scrape] QUALITY REJECTED (${f.quality.score}): "${f.product.canonical_name || f.product.name}" — missing: ${["brand","specific_name","rich_features","has_form_factor","has_exclusions"].filter(r => !f.quality.reasons.includes(r.replace("has_",""))).join(", ")}`);
    }
    console.log(`[product-scrape] Quality gate: ${passed.length} passed, ${failed.length} rejected (threshold=${qualityThreshold})`);

    // Check for duplicates
    const { data: existing } = await supabase
      .from("products")
      .select("name, canonical_name")
      .limit(500);

    const existingNames = new Set((existing || []).map((e: any) => (e.canonical_name || e.name).toLowerCase()));
    const newProducts = passed.filter(r => {
      const cn = (r.product.canonical_name || r.product.name).toLowerCase();
      return !existingNames.has(cn);
    });

    console.log(`[product-scrape] ${newProducts.length} new products (${passed.length - newProducts.length} duplicates skipped)`);

    let added = 0;
    for (const { product: p, quality } of newProducts) {
      const priceCents = parsePriceCents(p.price_range);

      const { data: product, error: prodErr } = await supabase
        .from("products")
        .insert({
          name: p.name,
          canonical_name: p.canonical_name || p.name,
          category: p.category,
          source_url: p.source_url || null,
          image_url: p.image_url || null,
          price_cents: priceCents,
          status: "discovered",
          discovered_via: "scraper",
          notes: p.why_viral,
          distinctive_attributes: p.core_features || [],
          excluded_variants: p.excluded_lookalikes || [],
          short_description: `${p.form_factor || ""} — ${(p.core_features || []).join(", ")}`.trim(),
          candidate_quality_score: quality.score,
        })
        .select("id")
        .single();

      if (prodErr || !product) {
        console.warn(`[product-scrape] Failed to insert product "${p.name}":`, prodErr);
        continue;
      }

      const overallScore = computeOverallScore(p);
      const { error: analysisErr } = await supabase
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
          price_sweet_spot: priceCents ? priceCents >= 1500 && priceCents <= 4999 : false,
          analyzed_by: "ai",
          analyzed_at: new Date().toISOString(),
        });

      if (analysisErr) {
        console.warn(`[product-scrape] Failed to insert analysis for "${p.name}":`, analysisErr);
      }

      console.log(`[product-scrape] ✓ Added: "${p.canonical_name}" (quality=${quality.score}, reasons=${quality.reasons.join(",")})`);
      added++;
    }

    console.log(`[product-scrape] Complete. Added ${added} products, rejected ${failed.length} for quality.`);

    return new Response(
      JSON.stringify({
        success: true,
        products_found: discovered.length,
        products_added: added,
        quality_rejected: failed.length,
        quality_threshold: qualityThreshold,
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
