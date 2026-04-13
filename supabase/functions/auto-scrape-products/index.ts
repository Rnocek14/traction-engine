/**
 * auto-scrape-products
 * 
 * Discovers trending products from TikTok Shop, Amazon, AliExpress, etc.
 * Uses Perplexity to find product URLs and OpenAI to score them.
 * Inserts into products + product_analysis tables.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PRODUCT_QUERIES = [
  "viral TikTok products this week that are selling fast",
  "trending TikTok Shop items with millions of views right now",
  "most popular impulse buy products going viral on social media this week",
  "Amazon movers and shakers products trending on TikTok and Instagram",
  "best selling products on TikTok Shop this week with high engagement",
  "viral product demos on TikTok Reels with millions of views this week",
  "trending gadgets and home products going viral on social media right now",
  "dropshipping winning products trending on TikTok this week",
];

const CATEGORY_QUERIES: Record<string, string[]> = {
  gadgets: [
    "trending tech gadgets going viral on TikTok this week under $50",
    "most satisfying gadget demos on TikTok and Instagram Reels this week",
  ],
  home: [
    "viral home products and LED lamps trending on TikTok this week",
    "most popular home organization products on TikTok Shop right now",
  ],
  beauty: [
    "trending beauty and skincare products going viral on TikTok this week",
    "best selling beauty tools on TikTok Shop with demo videos",
  ],
  toys: [
    "viral toys and fidget products trending on TikTok this week",
    "most popular kids toys and games going viral on social media right now",
  ],
  fitness: [
    "trending fitness products and workout gadgets on TikTok this week",
    "viral fitness equipment and accessories on TikTok Shop",
  ],
};

interface DiscoveredProduct {
  name: string;
  category: string;
  price_range: string;
  source_url: string;
  why_viral: string;
  wow_factor: number;
  social_media_potential: number;
  impulse_buy_appeal: number;
  demonstrability_score: number;
  competition_level: number;
  trending_status: string;
  emotional_triggers: string[];
}

async function discoverProducts(
  perplexityKey: string,
  openaiKey: string,
  categories: string[]
): Promise<DiscoveredProduct[]> {
  // Select queries: 3 general + 1 per category
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
              content: `You are a product trend researcher for dropshipping and e-commerce. Find specific products (not brands/categories) that are going viral. For each product include: exact product name, approximate price, why it's going viral, what platform it's trending on, and a URL if available. Focus on products that are visually demonstrable in short-form video.`,
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
      rawTexts.push(`Query: ${query}\n\nResults:\n${content}\n\nSources: ${citations.join(", ")}`);
    } catch (err) {
      console.warn(`[product-scrape] Query error:`, err);
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 1500));
  }

  if (rawTexts.length === 0) return [];

  // Use OpenAI to extract structured products from all the raw text
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
          content: `You are a product intelligence analyst for a dropshipping business. Extract individual products from the research data. For each product, provide structured scoring.

SCORING RUBRIC (1-5 scale):
- wow_factor: How visually impressive/surprising is this product? 5=jaw-dropping demo potential, 1=boring
- social_media_potential: How likely to generate engagement/shares? 5=guaranteed viral, 1=no social appeal
- impulse_buy_appeal: Would someone buy this on impulse from a video? 5=instant buy, 1=needs research
- demonstrability_score: Can you show what it does in <10 seconds? 5=instant visual payoff, 1=needs explanation
- competition_level: How many sellers/creators already push this? 5=oversaturated, 1=undiscovered

TRENDING STATUS: emerging (just appearing), rising (gaining momentum), peak (maximum attention), declining (past peak), saturated (overdone)

EMOTIONAL TRIGGERS: pick 2-4 from: wow, satisfaction, transformation, curiosity, gift, before_after, problem_solved, luxury_affordable, kids, pets, convenience, fear_of_missing

Extract up to 15 unique products. Deduplicate similar items.`,
        },
        { role: "user", content: combined },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "store_products",
            description: "Store discovered products",
            parameters: {
              type: "object",
              properties: {
                products: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string", description: "Specific product name" },
                      category: { type: "string", enum: ["gadgets", "home", "beauty", "toys", "fitness", "kitchen", "fashion", "pets", "outdoor", "other"] },
                      price_range: { type: "string", description: "Approximate price like '$15-25' or '$39.99'" },
                      source_url: { type: "string", description: "URL where product was found, or empty string" },
                      why_viral: { type: "string", description: "1-2 sentences on why this product is trending" },
                      wow_factor: { type: "integer", minimum: 1, maximum: 5 },
                      social_media_potential: { type: "integer", minimum: 1, maximum: 5 },
                      impulse_buy_appeal: { type: "integer", minimum: 1, maximum: 5 },
                      demonstrability_score: { type: "integer", minimum: 1, maximum: 5 },
                      competition_level: { type: "integer", minimum: 1, maximum: 5 },
                      trending_status: { type: "string", enum: ["emerging", "rising", "peak", "declining", "saturated"] },
                      emotional_triggers: { type: "array", items: { type: "string" } },
                    },
                    required: ["name", "category", "price_range", "wow_factor", "social_media_potential", "impulse_buy_appeal", "demonstrability_score", "competition_level", "trending_status", "emotional_triggers"],
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
  // Weighted: wow 30%, social 25%, impulse 20%, demo 15%, competition 10% (inverted)
  const competitionInv = 6 - p.competition_level;
  const raw = (p.wow_factor * 0.30 + p.social_media_potential * 0.25 + p.impulse_buy_appeal * 0.20 + p.demonstrability_score * 0.15 + competitionInv * 0.10);
  return Math.round((raw / 5) * 100);
}

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

    // Parse optional body
    let categories = ["gadgets", "home", "beauty", "toys"];
    try {
      const body = await req.json();
      if (body.categories) categories = body.categories;
    } catch { /* no body is fine */ }

    console.log(`[product-scrape] Starting discovery for categories: ${categories.join(", ")}`);

    const discovered = await discoverProducts(perplexityKey, openaiKey, categories);
    console.log(`[product-scrape] Discovered ${discovered.length} products`);

    if (discovered.length === 0) {
      return new Response(JSON.stringify({ success: true, products_found: 0, products_added: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for duplicates by name (case-insensitive)
    const names = discovered.map(p => p.name.toLowerCase());
    const { data: existing } = await supabase
      .from("products")
      .select("name")
      .limit(500);

    const existingNames = new Set((existing || []).map((e: { name: string }) => e.name.toLowerCase()));
    const newProducts = discovered.filter(p => !existingNames.has(p.name.toLowerCase()));

    console.log(`[product-scrape] ${newProducts.length} new products (${discovered.length - newProducts.length} duplicates skipped)`);

    let added = 0;
    for (const p of newProducts) {
      const priceCents = parsePriceCents(p.price_range);

      // Insert product
      const { data: product, error: prodErr } = await supabase
        .from("products")
        .insert({
          name: p.name,
          category: p.category,
          source_url: p.source_url || null,
          price_cents: priceCents,
          status: "discovered",
          discovered_via: "scraper",
          notes: p.why_viral,
        })
        .select("id")
        .single();

      if (prodErr || !product) {
        console.warn(`[product-scrape] Failed to insert product "${p.name}":`, prodErr);
        continue;
      }

      // Insert analysis
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

      added++;
    }

    console.log(`[product-scrape] Complete. Added ${added} products.`);

    return new Response(
      JSON.stringify({ success: true, products_found: discovered.length, products_added: added }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[product-scrape] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
