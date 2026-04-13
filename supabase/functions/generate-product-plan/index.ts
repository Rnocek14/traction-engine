/**
 * generate-product-plan
 * 
 * For an approved product, generates:
 * 1. Marketing plan (audience, angles, CTA strategy)
 * 2. Content pack (5-10 ideas inserted into content_ideas)
 * 3. Product page draft (headline, benefits, FAQ, CTA copy, description)
 * 
 * Manual trigger only — called when operator clicks "Generate Marketing Plan"
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { product_id } = await req.json();

    if (!product_id) {
      return new Response(JSON.stringify({ error: "product_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch product + analysis
    const { data: product, error: prodErr } = await supabase
      .from("products")
      .select("*, product_analysis(*)")
      .eq("id", product_id)
      .single();

    if (prodErr || !product) {
      return new Response(JSON.stringify({ error: "Product not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark as generating
    await supabase.from("products").update({ plan_status: "generating" }).eq("id", product_id);

    const analysis = product.product_analysis?.[0] || {};
    const priceDollars = product.price_cents ? (product.price_cents / 100).toFixed(2) : "unknown";
    const costDollars = product.supplier_price_cents ? (product.supplier_price_cents / 100).toFixed(2) : "unknown";

    const productContext = `
Product: ${product.name}
Category: ${product.category || "uncategorized"} / ${product.subcategory || ""}
Price: $${priceDollars} | Cost: $${costDollars} | Margin: ${product.estimated_margin_pct ?? "unknown"}%
Status: ${product.status}
Notes: ${product.notes || "none"}
Source URL: ${product.source_url || "none"}
Image URL: ${product.image_url || "none"}

Analysis Scores:
- Wow Factor: ${analysis.wow_factor || "?"}/5
- Social Media Potential: ${analysis.social_media_potential || "?"}/5  
- Impulse Buy Appeal: ${analysis.impulse_buy_appeal || "?"}/5
- Demonstrability: ${analysis.demonstrability_score || "?"}/5
- Competition Level: ${analysis.competition_level || "?"}/5
- Trending Status: ${analysis.trending_status || "unknown"}
- Emotional Triggers: ${(analysis.emotional_triggers || []).join(", ") || "none"}
- Overall Score: ${analysis.overall_score || "?"}/100
`.trim();

    console.log(`[generate-product-plan] Generating plan for "${product.name}" (${product_id})`);

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
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
            content: `You are an expert e-commerce marketing strategist specializing in short-form video marketing for dropshipping products. Generate a comprehensive marketing asset stack for this product.

Your output must include three sections:

1. MARKETING PLAN:
- target_audience: Who buys this? Age, gender, interests, pain points
- winning_angles: 3-5 video angle concepts (e.g., "demo reveal", "problem→solution", "gift idea", "before/after transformation")
- cta_strategy: What CTA works best? (e.g., "Link in bio", "TikTok Shop", "Comment LINK")
- recommended_accounts: What type of accounts should push this? (e.g., "gadget review", "home hacks", "gift ideas")
- key_selling_points: 3-5 bullet points for why someone should buy NOW
- objection_handling: 2-3 common objections and how to address them

2. CONTENT IDEAS (5-10):
Each idea should be a specific video concept with:
- title: Catchy video title
- hook: Opening line or visual hook (first 3 seconds)
- angle: The specific approach (demo, story, comparison, etc.)
- emotional_trigger: Primary emotion targeted
- suggested_format: video style (product_demo, transformation, storytelling, comparison, unboxing, lifestyle)

3. PAGE DRAFT:
- headline: Short, punchy headline for the product page
- subheadline: Supporting line
- benefits: 4-6 benefit bullets (outcome-focused, not feature-focused)
- faq: 3-5 common questions with answers
- cta_copy: Call-to-action button text and surrounding copy
- product_description: 2-3 paragraph product description for listing
- social_proof_suggestions: What kind of proof to add (reviews, UGC, stats)
- media_suggestions: What photos/videos to feature on the page`,
          },
          { role: "user", content: productContext },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "store_marketing_plan",
              description: "Store the complete marketing asset stack",
              parameters: {
                type: "object",
                properties: {
                  marketing_plan: {
                    type: "object",
                    properties: {
                      target_audience: { type: "string" },
                      winning_angles: { type: "array", items: { type: "object", properties: { name: { type: "string" }, description: { type: "string" }, demo_concept: { type: "string" } }, required: ["name", "description"] } },
                      cta_strategy: { type: "string" },
                      cta_url_suggestion: { type: "string", description: "Suggested CTA destination type: tiktok_shop, affiliate_link, landing_page, link_in_bio" },
                      recommended_accounts: { type: "array", items: { type: "string" } },
                      key_selling_points: { type: "array", items: { type: "string" } },
                      objection_handling: { type: "array", items: { type: "object", properties: { objection: { type: "string" }, response: { type: "string" } }, required: ["objection", "response"] } },
                    },
                    required: ["target_audience", "winning_angles", "cta_strategy", "key_selling_points"],
                  },
                  content_ideas: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        hook: { type: "string" },
                        angle: { type: "string" },
                        emotional_trigger: { type: "string" },
                        suggested_format: { type: "string" },
                      },
                      required: ["title", "hook", "angle", "emotional_trigger", "suggested_format"],
                    },
                  },
                  page_draft: {
                    type: "object",
                    properties: {
                      headline: { type: "string" },
                      subheadline: { type: "string" },
                      benefits: { type: "array", items: { type: "string" } },
                      faq: { type: "array", items: { type: "object", properties: { question: { type: "string" }, answer: { type: "string" } }, required: ["question", "answer"] } },
                      cta_copy: { type: "string" },
                      product_description: { type: "string" },
                      social_proof_suggestions: { type: "array", items: { type: "string" } },
                      media_suggestions: { type: "array", items: { type: "string" } },
                    },
                    required: ["headline", "subheadline", "benefits", "faq", "cta_copy", "product_description"],
                  },
                },
                required: ["marketing_plan", "content_ideas", "page_draft"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "store_marketing_plan" } },
        temperature: 0.7,
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      await supabase.from("products").update({ plan_status: "none" }).eq("id", product_id);
      throw new Error(`OpenAI failed: ${resp.status} ${err}`);
    }

    const aiData = await resp.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      await supabase.from("products").update({ plan_status: "none" }).eq("id", product_id);
      throw new Error("No tool call in AI response");
    }

    const plan = JSON.parse(toolCall.function.arguments);

    // Store the full plan on the product
    const newVersion = (product.plan_version || 0) + 1;
    await supabase.from("products").update({
      marketing_plan: plan,
      plan_generated_at: new Date().toISOString(),
      plan_version: newVersion,
      plan_status: "ready",
      updated_at: new Date().toISOString(),
    }).eq("id", product_id);

    // Insert content ideas linked to product
    const ideasToInsert = (plan.content_ideas || []).map((idea: any) => ({
      account_id: "ecommerce_default",
      title: idea.title,
      subject: product.name,
      angle: idea.angle,
      vertical: "ecommerce",
      suggested_hook_type: idea.hook,
      suggested_format: idea.suggested_format,
      emotional_triggers: [idea.emotional_trigger].filter(Boolean),
      product_id: product_id,
      cta_type: plan.marketing_plan?.cta_url_suggestion || null,
      cta_url: product.source_url || null,
      status: "proposed",
      opportunity_score: analysis.overall_score || 50,
      reasoning: `Auto-generated from product marketing plan v${newVersion} for "${product.name}"`,
      generated_by: "product_plan",
    }));

    if (ideasToInsert.length > 0) {
      const { error: ideasErr } = await supabase.from("content_ideas").insert(ideasToInsert);
      if (ideasErr) {
        console.warn(`[generate-product-plan] Failed to insert ideas:`, ideasErr);
      }
    }

    console.log(`[generate-product-plan] Plan v${newVersion} generated for "${product.name}" with ${ideasToInsert.length} content ideas`);

    return new Response(
      JSON.stringify({
        success: true,
        product_id,
        plan_version: newVersion,
        ideas_created: ideasToInsert.length,
        plan,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[generate-product-plan] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
