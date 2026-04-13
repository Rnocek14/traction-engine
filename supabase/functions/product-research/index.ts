/**
 * product-research v4 — AI-Assisted, Human-in-the-Loop
 * 
 * Simplified pipeline:
 * 1. Search for candidate URLs via SerpAPI (Google Shopping + site-specific)
 * 2. Get market intelligence from Perplexity (context, not links)
 * 3. AI scores the product
 * 4. Store ALL candidates as "pending" — user picks the right ones in the UI
 * 
 * No auto-verification. No 8-phase pipeline. Human confirms.
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

// Reject obvious non-product pages
const NON_PRODUCT_PATTERNS = [
  /\/blog[s]?\//i, /\/article[s]?\//i, /\/wiki\//i,
  /\/help\//i, /\/about\b/i,
  /\/faq/i, /\/terms/i, /\/privacy/i,
  /aws\.amazon\.com/i, /music\.amazon\.com/i, /advertising\.amazon/i,
  /smart\.dhgate\.com/i, // DHgate blog/articles
  /\/showroom\//i, // Alibaba showroom (category pages, not products)
];

function isUsefulUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.pathname === "/") return false;
    for (const p of NON_PRODUCT_PATTERNS) {
      if (p.test(url)) return false;
    }
    // Reject search/category pages (but allow Amazon /s? with k= param which are search results we want titles from)
    if (u.pathname.includes("/search") && !u.searchParams.has("k")) return false;
    return true;
  } catch {
    return false;
  }
}

// ─── SERPAPI SEARCH ───
async function serpSearch(productName: string, serpApiKey: string): Promise<Array<{ url: string; title: string; price: string | null; thumbnail: string | null; source: string }>> {
  const results: Array<{ url: string; title: string; price: string | null; thumbnail: string | null; source: string }> = [];
  const seen = new Set<string>();

  function add(url: string, title: string, price: string | null, thumbnail: string | null, source: string) {
    if (seen.has(url) || !isUsefulUrl(url)) return;
    seen.add(url);
    results.push({ url, title, price, thumbnail, source });
  }

  // 1. Google Shopping — these give real product pages with prices
  try {
    const q = encodeURIComponent(productName);
    const resp = await fetch(`https://serpapi.com/search.json?engine=google_shopping&q=${q}&api_key=${serpApiKey}&num=20`);
    if (resp.ok) {
      const data = await resp.json();
      for (const r of (data.shopping_results || [])) {
        // Google Shopping may have link, product_link, or source
        const link = r.product_link || r.link || r.source;
        if (link?.startsWith("http")) {
          add(link, r.title || "", r.extracted_price || r.price || null, r.thumbnail || null, "google_shopping");
        }
      }
      console.log(`[research] Google Shopping: ${data.shopping_results?.length || 0} results, ${results.length} accepted`);
    }
  } catch (e) { console.warn("[research] Shopping error:", e); }

  // 2. Site-specific searches
  const sites = ["amazon.com", "walmart.com", "aliexpress.com", "alibaba.com", "dhgate.com", "temu.com", "ebay.com"];
  for (const site of sites) {
    try {
      const q = encodeURIComponent(`${productName} site:${site}`);
      const resp = await fetch(`https://serpapi.com/search.json?engine=google&q=${q}&api_key=${serpApiKey}&num=5`);
      if (!resp.ok) continue;
      const data = await resp.json();
      for (const r of (data.organic_results || [])) {
        if (r.link?.startsWith("http")) {
          add(r.link, r.title || "", null, r.thumbnail || null, `serp:${site}`);
        }
      }
    } catch { /* skip */ }
    await new Promise(r => setTimeout(r, 250));
  }

  console.log(`[research] Total candidates: ${results.length}`);
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
              estimated_retail_price_cents: { type: "integer", description: "Best guess retail price from research" },
              estimated_supplier_price_cents: { type: "integer", description: "Best guess supplier price from research" },
              summary: { type: "string", description: "2-3 sentence honest assessment" },
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

    if (!serpApiKey && !perplexityKey) {
      return new Response(JSON.stringify({ error: "SERPAPI_API_KEY or PERPLEXITY_API_KEY required" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body: ResearchRequest = await req.json();

    let productName = body.name || "";
    let productId = body.product_id;

    if (productId) {
      const { data: product } = await supabase.from("products").select("*").eq("id", productId).single();
      if (product) {
        productName = product.canonical_name || product.name;
      }
    }

    if (!productName) {
      return new Response(JSON.stringify({ error: "name required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clean search name
    const searchName = productName
      .replace(/\([^)]*\)/g, "")
      .replace(/\b(tiktok|youtube|instagram|facebook|viral)\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    console.log(`[research] ===== v4 RESEARCH: "${searchName}" =====`);

    // ─── STEP 1: Find candidate URLs ───
    let candidates: Array<{ url: string; title: string; price: string | null; thumbnail: string | null; source: string }> = [];
    
    if (serpApiKey) {
      candidates = await serpSearch(searchName, serpApiKey);
    }

    // ─── STEP 2: Get market intelligence ───
    let intelligence = { summary: "", socialProof: "" };
    if (perplexityKey) {
      intelligence = await getMarketIntelligence(searchName, perplexityKey);
    }

    // ─── STEP 3: AI scoring ───
    const scoring = await scoreProduct(searchName, intelligence, candidates.length, openaiKey);
    
    const competitionInv = 6 - (scoring.competition_level || 3);
    const overallScore = Math.round(
      ((scoring.wow_factor || 3) * 0.30 +
        (scoring.social_media_potential || 3) * 0.25 +
        (scoring.impulse_buy_appeal || 3) * 0.20 +
        (scoring.demonstrability_score || 3) * 0.15 +
        competitionInv * 0.10) / 5 * 100
    );

    // ─── STEP 4: Save everything ───

    // Create or update product
    if (!productId) {
      const { data: newProduct, error: insertErr } = await supabase
        .from("products")
        .insert({
          name: productName,
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
      analyzed_by: "ai_v4",
      analyzed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (existingAnalysis) {
      await supabase.from("product_analysis").update(analysisRow).eq("id", existingAnalysis.id);
    } else {
      await supabase.from("product_analysis").insert(analysisRow);
    }

    // Clear old unconfirmed links, keep user-confirmed ones
    await supabase.from("product_links")
      .delete()
      .eq("product_id", productId)
      .or("validation_status.eq.pending,validation_status.eq.rejected,validation_status.is.null");

    // Save ALL candidates as "pending" — user picks the right ones
    if (candidates.length > 0) {
      const linkRows = candidates.slice(0, 30).map(c => {
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
          validation_reasons: [`source:${c.source}`],
          fetch_method: "serp_candidate",
        };
      });
      const { error: linkErr } = await supabase.from("product_links").insert(linkRows);
      if (linkErr) console.warn("[research] Failed to save candidate links:", linkErr);
      else console.log(`[research] Saved ${linkRows.length} candidate links for user review`);
    }

    console.log(`[research] ===== COMPLETE: score=${overallScore}, ${candidates.length} candidates for review =====`);

    return new Response(
      JSON.stringify({
        success: true,
        product_id: productId,
        overall_score: overallScore,
        candidates_found: candidates.length,
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
