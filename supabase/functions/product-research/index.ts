/**
 * product-research
 * 
 * Takes a product URL or name and uses AI to score it on the 5-dimension rubric.
 * Can also re-research existing products by product_id.
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
    // Strip scripts/styles, extract text
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

async function perplexityResearch(query: string, perplexityKey: string): Promise<{ content: string; citations: string[] }> {
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
            content: "You are a product analyst for e-commerce and dropshipping. Research this product thoroughly: pricing, competition, social media presence, viral potential, suppliers, and market saturation. Include any product image URLs you find.",
          },
          { role: "user", content: query },
        ],
        max_tokens: 3000,
        search_recency_filter: "month",
      }),
    });
    if (!resp.ok) return { content: "", citations: [] };
    const data = await resp.json();
    return {
      content: data.choices?.[0]?.message?.content || "",
      citations: data.citations || [],
    };
  } catch {
    return { content: "", citations: [] };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY")!;
    const perplexityKey = Deno.env.get("PERPLEXITY_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body: ResearchRequest = await req.json();

    let productName = body.name || "";
    let productUrl = body.url || "";
    let productId = body.product_id;

    // If product_id provided, fetch existing product
    if (productId) {
      const { data: product } = await supabase
        .from("products")
        .select("*")
        .eq("id", productId)
        .single();
      if (product) {
        productName = product.name;
        productUrl = product.source_url || "";
      }
    }

    if (!productName && !productUrl) {
      return new Response(JSON.stringify({ error: "name or url required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[product-research] Researching: ${productName || productUrl}`);

    // Gather intelligence from multiple sources
    const researchParts: string[] = [];

    // 1. Fetch page content if URL provided
    if (productUrl) {
      const pageText = await fetchPageContent(productUrl);
      if (pageText) researchParts.push(`Page content from ${productUrl}:\n${pageText}`);
    }

    // 2. Perplexity deep research
    let perplexityCitations: string[] = [];
    if (perplexityKey) {
      const searchQuery = productName
        ? `"${productName}" product review TikTok viral dropshipping price competition`
        : `product at ${productUrl} - reviews, pricing, competition, viral potential, TikTok`;
      const research = await perplexityResearch(searchQuery, perplexityKey);
      if (research.content) researchParts.push(`Market research:\n${research.content}`);
      perplexityCitations = research.citations;
      if (perplexityCitations.length > 0) {
        researchParts.push(`\nReal Source URLs from research (USE THESE):\n${perplexityCitations.map((c, i) => `[${i+1}] ${c}`).join("\n")}`);
      }
    }

    // 2b. Perplexity image search - find real product images
    let foundImageUrls: { url: string; source: string; label: string }[] = [];
    if (perplexityKey && productName) {
      try {
        const imgSearch = await perplexityResearch(
          `"${productName}" product photo image high quality. Find direct image URLs for this exact product. Include Amazon, AliExpress, or official product page images.`,
          perplexityKey
        );
        // Extract image URLs from citations and content
        const allText = imgSearch.content + " " + imgSearch.citations.join(" ");
        const imgRegex = /https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp|gif)(?:\?[^\s"'<>]*)?/gi;
        const imgMatches = allText.match(imgRegex) || [];
        // Also check citations for product page URLs (Amazon, AliExpress etc)
        for (const citation of imgSearch.citations) {
          if (citation.match(/amazon\.|aliexpress\.|walmart\.|temu\.|etsy\./i)) {
            // Try to extract og:image from product pages
            try {
              const pageResp = await fetch(citation, {
                headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
                redirect: "follow",
              });
              if (pageResp.ok) {
                const html = await pageResp.text();
                const ogMatch = html.match(/property="og:image"\s+content="([^"]+)"/i) || 
                                html.match(/content="([^"]+)"\s+property="og:image"/i);
                if (ogMatch?.[1]) {
                  const domain = new URL(citation).hostname.replace("www.", "");
                  foundImageUrls.push({ url: ogMatch[1], source: domain, label: "hero" });
                }
                // Also grab additional product images
                const imgTags = html.match(/data-a-dynamic-image="([^"]+)"/i) || // Amazon
                                html.match(/"imageUrl":"([^"]+)"/g); // AliExpress
                if (imgTags) {
                  for (const tag of imgTags.slice(0, 3)) {
                    const urlMatch = tag.match(/https?:\/\/[^"\\]+/);
                    if (urlMatch) {
                      const domain2 = new URL(citation).hostname.replace("www.", "");
                      foundImageUrls.push({ url: urlMatch[0], source: domain2, label: "detail" });
                    }
                  }
                }
              }
            } catch { /* page fetch failed, skip */ }
          }
        }
        // Add direct image URLs from Perplexity content
        for (const imgUrl of imgMatches.slice(0, 5)) {
          if (!foundImageUrls.some(f => f.url === imgUrl)) {
            foundImageUrls.push({ url: imgUrl, source: "perplexity", label: "reference" });
          }
        }
        // Deduplicate
        const seen = new Set<string>();
        foundImageUrls = foundImageUrls.filter(img => {
          if (seen.has(img.url)) return false;
          seen.add(img.url);
          return true;
        }).slice(0, 8); // Max 8 images
        console.log(`[product-research] Found ${foundImageUrls.length} product images`);
      } catch (err) {
        console.warn("[product-research] Image search failed:", err);
      }

    const combined = researchParts.join("\n\n---\n\n").slice(0, 15000);
    if (combined.length < 50) {
      return new Response(JSON.stringify({ error: "Could not gather enough product data" }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. AI scoring
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
            content: `You are an expert dropshipping product analyst. Score this product for viral short-form video marketing potential.

CRITICAL - URLs:
- image_url: If you find a direct product image URL (ending in .jpg, .png, .webp) in the research data, include it. Do NOT make up image URLs.
- source_url: Use a REAL URL from the "Real Source URLs" section. Pick the most relevant product page. Do NOT hallucinate URLs.

SCORING (1-5):
- wow_factor: Visual impact and surprise value. 5=jaw-dropping demo, 1=boring/generic
- social_media_potential: Likelihood of generating engagement. 5=guaranteed viral, 1=no social appeal
- impulse_buy_appeal: Would viewers buy immediately? 5=instant purchase, 1=needs deliberation
- demonstrability_score: Can you show its value in <10 seconds? 5=instant visual payoff, 1=complex explanation needed
- competition_level: Market saturation. 5=extremely saturated, 1=untapped niche

PRICE ANALYSIS:
- Estimate retail price in cents
- Estimate supplier/cost price in cents (typical AliExpress/wholesale)
- Calculate estimated margin percentage
- Is this in the impulse buy sweet spot ($15-$49)?

TRENDING STATUS: emerging | rising | peak | declining | saturated

EMOTIONAL TRIGGERS (pick 2-4): wow, satisfaction, transformation, curiosity, gift, before_after, problem_solved, luxury_affordable, kids, pets, convenience, fear_of_missing

Also suggest:
- Best content angles (3-5)
- Best hook types for this product
- Target audience
- Recommended CTA strategy`,
          },
          { role: "user", content: `Product: ${productName || "Unknown"}\nURL: ${productUrl || "N/A"}\n\nResearch data:\n${combined}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "store_analysis",
              description: "Store product analysis results",
              parameters: {
                type: "object",
                properties: {
                  product_name: { type: "string" },
                   image_url: { type: "string", description: "Direct URL to a product image if found in the research data. Must be a real URL ending in .jpg/.png/.webp. Empty string if none found." },
                   source_url: { type: "string", description: "A real product page URL from the Source URLs section. Do NOT make up URLs. Empty string if none relevant." },
                  category: { type: "string" },
                  subcategory: { type: "string" },
                  price_cents: { type: "integer", description: "Estimated retail price in cents" },
                  supplier_price_cents: { type: "integer", description: "Estimated supplier/cost price in cents" },
                  estimated_margin_pct: { type: "number", description: "Estimated margin percentage" },
                  wow_factor: { type: "integer", minimum: 1, maximum: 5 },
                  social_media_potential: { type: "integer", minimum: 1, maximum: 5 },
                  impulse_buy_appeal: { type: "integer", minimum: 1, maximum: 5 },
                  demonstrability_score: { type: "integer", minimum: 1, maximum: 5 },
                  competition_level: { type: "integer", minimum: 1, maximum: 5 },
                  trending_status: { type: "string", enum: ["emerging", "rising", "peak", "declining", "saturated"] },
                  emotional_triggers: { type: "array", items: { type: "string" } },
                  price_sweet_spot: { type: "boolean" },
                  content_angles: { type: "array", items: { type: "string" }, description: "3-5 suggested video angles" },
                  hook_types: { type: "array", items: { type: "string" }, description: "Best hook patterns" },
                  target_audience: { type: "string" },
                  cta_strategy: { type: "string" },
                  summary: { type: "string", description: "2-3 sentence verdict on this product's potential" },
                },
                required: ["product_name", "category", "wow_factor", "social_media_potential", "impulse_buy_appeal", "demonstrability_score", "competition_level", "trending_status", "emotional_triggers", "content_angles", "summary"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "store_analysis" } },
        temperature: 0.3,
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`OpenAI scoring failed: ${resp.status} ${err}`);
    }

    const aiData = await resp.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in response");

    const analysis = JSON.parse(toolCall.function.arguments);

    // Compute overall score
    const competitionInv = 6 - (analysis.competition_level || 3);
    const overallScore = Math.round(
      ((analysis.wow_factor || 3) * 0.30 +
        (analysis.social_media_potential || 3) * 0.25 +
        (analysis.impulse_buy_appeal || 3) * 0.20 +
        (analysis.demonstrability_score || 3) * 0.15 +
        competitionInv * 0.10) / 5 * 100
    );

    // Create or update product
    if (!productId) {
      const { data: newProduct, error: insertErr } = await supabase
        .from("products")
        .insert({
          name: analysis.product_name || productName,
          category: analysis.category || null,
          subcategory: analysis.subcategory || null,
          source_url: analysis.source_url || productUrl || perplexityCitations[0] || null,
          image_url: analysis.image_url || null,
          price_cents: analysis.price_cents || null,
          supplier_price_cents: analysis.supplier_price_cents || null,
          estimated_margin_pct: analysis.estimated_margin_pct || null,
          status: "researching",
          discovered_via: "manual",
          notes: analysis.summary || null,
        })
        .select("id")
        .single();

      if (insertErr || !newProduct) {
        throw new Error(`Failed to create product: ${insertErr?.message}`);
      }
      productId = newProduct.id;
    } else {
      // Update existing product with new data
      const updatePayload: Record<string, unknown> = {
        category: analysis.category || undefined,
        subcategory: analysis.subcategory || undefined,
        image_url: analysis.image_url || undefined,
        price_cents: analysis.price_cents || undefined,
        supplier_price_cents: analysis.supplier_price_cents || undefined,
        estimated_margin_pct: analysis.estimated_margin_pct || undefined,
        status: "researching",
        notes: analysis.summary || undefined,
        updated_at: new Date().toISOString(),
      };
      // Backfill source_url if missing
      if (analysis.source_url || perplexityCitations.length > 0) {
        updatePayload.source_url = analysis.source_url || perplexityCitations[0];
      }
      await supabase.from("products").update(updatePayload).eq("id", productId);
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
      analyzed_by: "ai",
      analyzed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (existingAnalysis) {
      await supabase.from("product_analysis").update(analysisRow).eq("id", existingAnalysis.id);
    } else {
      await supabase.from("product_analysis").insert(analysisRow);
    }

    // Save found product images
    if (foundImageUrls.length > 0 && productId) {
      // Clear old AI-found images for this product (keep manually verified ones)
      await supabase
        .from("product_images")
        .delete()
        .eq("product_id", productId)
        .eq("verified", false);

      // Insert new images
      const imageRows = foundImageUrls.map((img, i) => ({
        product_id: productId,
        url: img.url,
        source: img.source,
        label: img.label,
        is_primary: i === 0,
        verified: false,
      }));
      
      const { error: imgErr } = await supabase.from("product_images").insert(imageRows);
      if (imgErr) {
        console.warn("[product-research] Failed to save images:", imgErr);
      } else {
        // Update product's primary image_url to the first found image
        await supabase.from("products")
          .update({ image_url: foundImageUrls[0].url })
          .eq("id", productId);
      }
      console.log(`[product-research] Saved ${foundImageUrls.length} images for product`);
    }

    console.log(`[product-research] Scored "${analysis.product_name}": ${overallScore}/100`);

    return new Response(
      JSON.stringify({
        success: true,
        product_id: productId,
        overall_score: overallScore,
        images_found: foundImageUrls.length,
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
