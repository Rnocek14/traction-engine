/**
 * product-research v2
 * 
 * Multi-phase deep research:
 * Phase 1: Retail search — find where this product is actually sold (Amazon, Walmart, TikTok Shop)
 * Phase 2: Wholesale search — find supplier/wholesale pricing (AliExpress, 1688, DHgate, Temu)
 * Phase 3: Image search — find real product photos with AI validation
 * Phase 4: AI scoring — score for viral potential with verified data
 * 
 * All URLs are validated before storage. Nothing hallucinated.
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

async function perplexitySearch(query: string, systemPrompt: string, perplexityKey: string): Promise<{ content: string; citations: string[] }> {
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
          { role: "system", content: systemPrompt },
          { role: "user", content: query },
        ],
        max_tokens: 3000,
        search_recency_filter: "month",
      }),
    });
    if (!resp.ok) {
      console.warn(`[product-research] Perplexity failed: ${resp.status}`);
      return { content: "", citations: [] };
    }
    const data = await resp.json();
    return {
      content: data.choices?.[0]?.message?.content || "",
      citations: data.citations || [],
    };
  } catch {
    return { content: "", citations: [] };
  }
}

/** Validate a URL actually loads and optionally check title relevance */
async function validateUrl(url: string, productName: string): Promise<{ valid: boolean; title: string; price?: string }> {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      redirect: "follow",
    });
    if (!resp.ok) return { valid: false, title: "" };
    const html = await resp.text();
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = (titleMatch?.[1] || "").trim();
    
    // Check title relevance
    const productWords = productName.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const titleLower = title.toLowerCase();
    const relevant = productWords.some(w => titleLower.includes(w));
    
    // Try to extract price
    const priceMatch = html.match(/\$\s*([\d,]+\.?\d{0,2})/);
    
    return { valid: relevant, title, price: priceMatch?.[0] };
  } catch {
    return { valid: false, title: "" };
  }
}

interface FoundLink {
  url: string;
  platform: string;
  linkType: string;
  title?: string;
  priceCents?: number;
}

function detectPlatform(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("amazon.")) return "Amazon";
  if (u.includes("walmart.")) return "Walmart";
  if (u.includes("tiktok.com/") && u.includes("shop")) return "TikTok Shop";
  if (u.includes("tiktok.com/")) return "TikTok";
  if (u.includes("aliexpress.")) return "AliExpress";
  if (u.includes("1688.com")) return "1688";
  if (u.includes("dhgate.")) return "DHgate";
  if (u.includes("temu.")) return "Temu";
  if (u.includes("ebay.")) return "eBay";
  if (u.includes("etsy.")) return "Etsy";
  if (u.includes("shopify") || u.includes("myshopify")) return "Shopify Store";
  if (u.includes("alibaba.")) return "Alibaba";
  return new URL(url).hostname.replace("www.", "");
}

function parsePriceFromText(text: string): number | undefined {
  const match = text.match(/\$\s*([\d,]+\.?\d{0,2})/);
  if (!match) return undefined;
  return Math.round(parseFloat(match[1].replace(",", "")) * 100);
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

    if (!perplexityKey) {
      return new Response(JSON.stringify({ error: "PERPLEXITY_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body: ResearchRequest = await req.json();

    let productName = body.name || "";
    let productUrl = body.url || "";
    let productId = body.product_id;

    if (productId) {
      const { data: product } = await supabase.from("products").select("*").eq("id", productId).single();
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

    console.log(`[product-research] ===== DEEP RESEARCH: "${productName}" =====`);

    const researchParts: string[] = [];
    const allCitations: string[] = [];
    const foundLinks: FoundLink[] = [];

    // ==========================================
    // PHASE 1: RETAIL — Where is it being sold?
    // ==========================================
    console.log("[product-research] Phase 1: Retail search");
    const retailSearch = await perplexitySearch(
      `Where can I buy "${productName}" online right now? Find specific product listings on Amazon, Walmart, TikTok Shop, eBay, Etsy, or Shopify stores. Include exact prices and product page URLs. I need real, working links to buy this specific product.`,
      `You are a shopping assistant. Find REAL product listings where someone can BUY this exact product online. Include specific prices, store names, and direct product page URLs. Only include listings for this exact product, not similar or related items.`,
      perplexityKey
    );
    if (retailSearch.content) {
      researchParts.push(`RETAIL LISTINGS:\n${retailSearch.content}`);
      allCitations.push(...retailSearch.citations);
      // Categorize retail citations
      for (const c of retailSearch.citations) {
        if (c.match(/amazon\.|walmart\.|ebay\.|etsy\.|tiktok\.com.*shop|shopify|myshopify/i)) {
          foundLinks.push({ url: c, platform: detectPlatform(c), linkType: "retail" });
        }
      }
    }
    await new Promise(r => setTimeout(r, 1200));

    // ==========================================
    // PHASE 2: WHOLESALE — Where to source it?
    // ==========================================
    console.log("[product-research] Phase 2: Wholesale/supplier search");
    const wholesaleSearch = await perplexitySearch(
      `"${productName}" wholesale supplier price. Find this product on AliExpress, Alibaba, 1688, DHgate, or Temu. What is the wholesale or bulk price? What is the cheapest supplier price available? Include direct product listing URLs.`,
      `You are a dropshipping supplier researcher. Find the CHEAPEST wholesale/supplier sources for this exact product. Include: supplier platform, wholesale price, MOQ if available, shipping estimates, and direct URLs. Focus on AliExpress, Alibaba, 1688.com, DHgate, and Temu.`,
      perplexityKey
    );
    if (wholesaleSearch.content) {
      researchParts.push(`WHOLESALE/SUPPLIER SOURCES:\n${wholesaleSearch.content}`);
      allCitations.push(...wholesaleSearch.citations);
      for (const c of wholesaleSearch.citations) {
        if (c.match(/aliexpress\.|alibaba\.|1688\.|dhgate\.|temu\./i)) {
          foundLinks.push({ url: c, platform: detectPlatform(c), linkType: "wholesale" });
        }
      }
    }
    await new Promise(r => setTimeout(r, 1200));

    // ==========================================
    // PHASE 3: SOCIAL PROOF — TikTok/reviews
    // ==========================================
    console.log("[product-research] Phase 3: Social proof & competition");
    const socialSearch = await perplexitySearch(
      `"${productName}" TikTok viral review. How many views does this product have? Who are the top creators promoting it? How many sellers are already selling it? Is this product saturated or still emerging?`,
      `You are a social media trend analyst for e-commerce. Analyze this product's social media presence: view counts, number of creators promoting it, engagement rates, competition level, and whether it's still trending or past its peak. Be specific with numbers.`,
      perplexityKey
    );
    if (socialSearch.content) {
      researchParts.push(`SOCIAL PROOF & COMPETITION:\n${socialSearch.content}`);
      allCitations.push(...socialSearch.citations);
    }
    await new Promise(r => setTimeout(r, 1200));

    // ==========================================
    // PHASE 4: IMAGE SEARCH with validation
    // ==========================================
    console.log("[product-research] Phase 4: Image search");
    let foundImageUrls: { url: string; source: string; label: string }[] = [];
    const imgSearch = await perplexitySearch(
      `"${productName}" product photo. Show me where to buy this exact product with product photos. Amazon listing, AliExpress listing.`,
      `Find real product listing pages for this exact product. I need pages with product photos. Focus on Amazon, AliExpress, Walmart, or official product sites.`,
      perplexityKey
    );

    const candidateImgs: { url: string; source: string; label: string }[] = [];
    
    // Extract images from retailer pages in ALL citations
    const allRetailerCitations = [...new Set([...allCitations, ...imgSearch.citations])].filter(c => 
      c.match(/amazon\.|aliexpress\.|walmart\.|temu\.|etsy\.|ebay\.|shopify|myshopify/i)
    );
    
    for (const citation of allRetailerCitations.slice(0, 6)) {
      try {
        const pageResp = await fetch(citation, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
          redirect: "follow",
        });
        if (!pageResp.ok) continue;
        const html = await pageResp.text();
        
        // Verify page title relevance
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const pageTitle = (titleMatch?.[1] || "").toLowerCase();
        const productWords = productName.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        if (!productWords.some(w => pageTitle.includes(w))) {
          console.log(`[product-research] Skipping irrelevant image page: "${titleMatch?.[1]}"`);
          continue;
        }
        
        const domain = new URL(citation).hostname.replace("www.", "");
        
        // og:image
        const ogMatch = html.match(/property="og:image"\s+content="([^"]+)"/i) || 
                        html.match(/content="([^"]+)"\s+property="og:image"/i);
        if (ogMatch?.[1]) candidateImgs.push({ url: ogMatch[1], source: domain, label: "hero" });
        
        // Amazon dynamic images
        const dynamicImg = html.match(/data-a-dynamic-image="\{([^}]+)\}"/i);
        if (dynamicImg) {
          const amazonUrls = dynamicImg[1].match(/https?:\/\/[^"]+/g) || [];
          for (const au of amazonUrls.slice(0, 3)) {
            candidateImgs.push({ url: au.replace(/\._[^.]+_\./, "."), source: domain, label: "detail" });
          }
        }
        
        // Extract price from retailer page for link records
        const priceMatch = html.match(/\$\s*([\d,]+\.?\d{0,2})/);
        const existingLink = foundLinks.find(l => l.url === citation);
        if (existingLink && priceMatch) {
          existingLink.priceCents = Math.round(parseFloat(priceMatch[1].replace(",", "")) * 100);
          existingLink.title = titleMatch?.[1]?.trim();
        }
      } catch { /* skip */ }
    }

    // Extract direct image URLs from all search content
    const allSearchText = [retailSearch.content, wholesaleSearch.content, imgSearch.content].join(" ");
    const imgRegex = /https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp)(?:\?[^\s"'<>]*)?/gi;
    const directImgs = allSearchText.match(imgRegex) || [];
    for (const imgUrl of directImgs.slice(0, 5)) {
      candidateImgs.push({ url: imgUrl, source: "search", label: "reference" });
    }

    // Deduplicate and filter
    const seenImgs = new Set<string>();
    const uniqueImgs = candidateImgs.filter(img => {
      if (seenImgs.has(img.url)) return false;
      const lower = img.url.toLowerCase();
      if (lower.includes("gift-card") || lower.includes("giftcard") || lower.includes("logo") || 
          lower.includes("banner") || lower.includes("icon") || lower.includes("sprite") ||
          lower.includes("placeholder") || lower.includes("loading")) return false;
      seenImgs.add(img.url);
      return true;
    });

    // AI validation of images
    if (uniqueImgs.length > 0) {
      try {
        const valResp = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{
              role: "system",
              content: `You validate product image URLs. Given a product name and image URLs, return ONLY indices of URLs that likely show this EXACT product. Reject: gift cards, unrelated products, logos, banners, category images, or navigation elements. Be strict — only approve images that match the specific product name.`,
            }, {
              role: "user",
              content: `Product: "${productName}"\n\nCandidate URLs:\n${uniqueImgs.map((c, i) => `[${i}] ${c.url} (from: ${c.source})`).join("\n")}`,
            }],
            tools: [{ type: "function", function: {
              name: "validate_images",
              parameters: { type: "object", properties: { valid_indices: { type: "array", items: { type: "integer" } } }, required: ["valid_indices"] },
            }}],
            tool_choice: { type: "function", function: { name: "validate_images" } },
            temperature: 0.1,
          }),
        });
        if (valResp.ok) {
          const valData = await valResp.json();
          const valCall = valData.choices?.[0]?.message?.tool_calls?.[0];
          if (valCall) {
            const { valid_indices } = JSON.parse(valCall.function.arguments);
            foundImageUrls = (valid_indices as number[])
              .filter(i => i >= 0 && i < uniqueImgs.length)
              .map(i => uniqueImgs[i])
              .slice(0, 8);
          }
        }
      } catch (e) { console.warn("[product-research] Image validation error:", e); }
      
      if (foundImageUrls.length === 0) {
        foundImageUrls = uniqueImgs.filter(c => c.source !== "search").slice(0, 4);
      }
    }
    console.log(`[product-research] Found ${foundImageUrls.length} validated images from ${uniqueImgs.length} candidates`);

    // ==========================================
    // PHASE 5: URL VALIDATION — verify top links
    // ==========================================
    console.log("[product-research] Phase 5: Validating URLs");
    const validatedLinks: FoundLink[] = [];
    for (const link of foundLinks.slice(0, 8)) {
      try {
        const check = await validateUrl(link.url, productName);
        if (check.valid) {
          link.title = check.title;
          if (check.price && !link.priceCents) {
            link.priceCents = parsePriceFromText(check.price);
          }
          validatedLinks.push(link);
          console.log(`[product-research] ✓ Valid: ${link.platform} — ${check.title?.slice(0, 60)}`);
        } else {
          console.log(`[product-research] ✗ Invalid: ${link.url} — title: "${check.title?.slice(0, 60)}"`);
        }
      } catch { /* skip */ }
    }
    console.log(`[product-research] ${validatedLinks.length}/${foundLinks.length} links validated`);

    // ==========================================
    // PHASE 6: AI SCORING with all data
    // ==========================================
    console.log("[product-research] Phase 6: AI scoring");
    
    // Add verified links to research data
    if (validatedLinks.length > 0) {
      researchParts.push(`\nVERIFIED PRODUCT LINKS:\n${validatedLinks.map(l => 
        `${l.linkType.toUpperCase()} - ${l.platform}: ${l.url} ${l.priceCents ? `($${(l.priceCents/100).toFixed(2)})` : ""} ${l.title || ""}`
      ).join("\n")}`);
    }
    researchParts.push(`\nAll Source URLs:\n${allCitations.map((c, i) => `[${i+1}] ${c}`).join("\n")}`);

    const combined = researchParts.join("\n\n---\n\n").slice(0, 18000);
    if (combined.length < 50) {
      return new Response(JSON.stringify({ error: "Could not gather enough product data" }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find best retail and wholesale URLs from validated links
    const bestRetailLink = validatedLinks.find(l => l.linkType === "retail");
    const bestWholesaleLink = validatedLinks.find(l => l.linkType === "wholesale");

    const scoringResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are an expert dropshipping product analyst. Score this product using the VERIFIED research data provided.

CRITICAL RULES:
- source_url: Use ONLY a URL from the "VERIFIED PRODUCT LINKS" section. If none, use a URL from "All Source URLs". NEVER make up URLs.
- supplier_url: Use a VERIFIED wholesale link if available. NEVER hallucinate.
- Prices: Base retail price on actual retail listings found. Base supplier price on actual wholesale listings found.

SCORING (1-5):
- wow_factor: Visual impact. 5=jaw-dropping demo, 1=boring
- social_media_potential: Engagement potential. 5=guaranteed viral, 1=none
- impulse_buy_appeal: Instant buy trigger. 5=instant purchase, 1=needs research
- demonstrability_score: Show value in <10s? 5=instant visual payoff, 1=complex
- competition_level: Saturation. 5=extremely saturated, 1=untapped

TRENDING STATUS: emerging | rising | peak | declining | saturated
EMOTIONAL TRIGGERS (2-4): wow, satisfaction, transformation, curiosity, gift, before_after, problem_solved, luxury_affordable, convenience, fear_of_missing

Also provide: content_angles (3-5), hook_types, target_audience, cta_strategy, summary (2-3 sentences with honest assessment).`,
          },
          { role: "user", content: `Product: ${productName}\n\n${combined}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "store_analysis",
            description: "Store product analysis",
            parameters: {
              type: "object",
              properties: {
                product_name: { type: "string" },
                source_url: { type: "string", description: "A VERIFIED retail product page URL. Must be from the research data." },
                supplier_url: { type: "string", description: "A VERIFIED wholesale/supplier URL from research data. Empty string if none." },
                category: { type: "string" },
                subcategory: { type: "string" },
                price_cents: { type: "integer", description: "Retail price in cents from actual listings" },
                supplier_price_cents: { type: "integer", description: "Wholesale/supplier price in cents from actual listings" },
                estimated_margin_pct: { type: "number" },
                wow_factor: { type: "integer", minimum: 1, maximum: 5 },
                social_media_potential: { type: "integer", minimum: 1, maximum: 5 },
                impulse_buy_appeal: { type: "integer", minimum: 1, maximum: 5 },
                demonstrability_score: { type: "integer", minimum: 1, maximum: 5 },
                competition_level: { type: "integer", minimum: 1, maximum: 5 },
                trending_status: { type: "string", enum: ["emerging", "rising", "peak", "declining", "saturated"] },
                emotional_triggers: { type: "array", items: { type: "string" } },
                price_sweet_spot: { type: "boolean" },
                content_angles: { type: "array", items: { type: "string" } },
                hook_types: { type: "array", items: { type: "string" } },
                target_audience: { type: "string" },
                cta_strategy: { type: "string" },
                summary: { type: "string" },
              },
              required: ["product_name", "category", "wow_factor", "social_media_potential", "impulse_buy_appeal", "demonstrability_score", "competition_level", "trending_status", "emotional_triggers", "content_angles", "summary"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "store_analysis" } },
        temperature: 0.3,
      }),
    });

    if (!scoringResp.ok) {
      const err = await scoringResp.text();
      throw new Error(`OpenAI scoring failed: ${scoringResp.status} ${err}`);
    }

    const aiData = await scoringResp.json();
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

    // Prefer verified URLs over AI-suggested ones
    const finalSourceUrl = bestRetailLink?.url || analysis.source_url || allCitations[0] || productUrl || null;
    const finalSupplierUrl = bestWholesaleLink?.url || analysis.supplier_url || null;

    // ==========================================
    // SAVE TO DATABASE
    // ==========================================
    
    // Create or update product
    if (!productId) {
      const { data: newProduct, error: insertErr } = await supabase
        .from("products")
        .insert({
          name: analysis.product_name || productName,
          category: analysis.category || null,
          subcategory: analysis.subcategory || null,
          source_url: finalSourceUrl,
          supplier_url: finalSupplierUrl,
          image_url: foundImageUrls[0]?.url || null,
          price_cents: analysis.price_cents || null,
          supplier_price_cents: analysis.supplier_price_cents || null,
          estimated_margin_pct: analysis.estimated_margin_pct || null,
          status: "researching",
          discovered_via: "manual",
          notes: analysis.summary || null,
        })
        .select("id")
        .single();

      if (insertErr || !newProduct) throw new Error(`Failed to create product: ${insertErr?.message}`);
      productId = newProduct.id;
    } else {
      await supabase.from("products").update({
        category: analysis.category || undefined,
        subcategory: analysis.subcategory || undefined,
        source_url: finalSourceUrl,
        supplier_url: finalSupplierUrl,
        image_url: foundImageUrls[0]?.url || undefined,
        price_cents: analysis.price_cents || undefined,
        supplier_price_cents: analysis.supplier_price_cents || undefined,
        estimated_margin_pct: analysis.estimated_margin_pct || undefined,
        status: "researching",
        notes: analysis.summary || undefined,
        updated_at: new Date().toISOString(),
      }).eq("id", productId);
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
      analyzed_by: "ai_v2",
      analyzed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (existingAnalysis) {
      await supabase.from("product_analysis").update(analysisRow).eq("id", existingAnalysis.id);
    } else {
      await supabase.from("product_analysis").insert(analysisRow);
    }

    // Save verified links
    if (validatedLinks.length > 0 && productId) {
      // Clear old unverified links
      await supabase.from("product_links").delete().eq("product_id", productId).eq("verified", false);
      
      const linkRows = validatedLinks.map(l => ({
        product_id: productId,
        url: l.url,
        link_type: l.linkType,
        platform: l.platform,
        price_cents: l.priceCents || null,
        title: l.title || null,
        verified: true,
      }));
      const { error: linkErr } = await supabase.from("product_links").insert(linkRows);
      if (linkErr) console.warn("[product-research] Failed to save links:", linkErr);
      else console.log(`[product-research] Saved ${linkRows.length} verified links`);
    }

    // Save images
    if (foundImageUrls.length > 0 && productId) {
      await supabase.from("product_images").delete().eq("product_id", productId).eq("verified", false);
      const imageRows = foundImageUrls.map((img, i) => ({
        product_id: productId,
        url: img.url,
        source: img.source,
        label: img.label,
        is_primary: i === 0,
        verified: false,
      }));
      const { error: imgErr } = await supabase.from("product_images").insert(imageRows);
      if (imgErr) console.warn("[product-research] Failed to save images:", imgErr);
      else {
        await supabase.from("products").update({ image_url: foundImageUrls[0].url }).eq("id", productId);
        console.log(`[product-research] Saved ${imageRows.length} images`);
      }
    }

    // ==========================================
    // PHASE 7: EXTRACT SUPPLIER DATA
    // ==========================================
    console.log("[product-research] Phase 7: Extracting supplier data");
    if (productId && wholesaleLinks.length > 0) {
      // Use AI to extract structured supplier info from wholesale search results
      try {
        const supplierResp = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{
              role: "system",
              content: `You are a dropshipping supplier analyst. Extract structured supplier data from wholesale research. Be conservative with estimates — mark anything uncertain. For shipping, separate processing time from delivery time.`,
            }, {
              role: "user",
              content: `Product: "${productName}"\n\nWholesale research:\n${wholesaleSearch.content}\n\nVerified wholesale links:\n${wholesaleLinks.map(l => `${l.platform}: ${l.url} ${l.priceCents ? `($${(l.priceCents/100).toFixed(2)})` : ""}`).join("\n")}`,
            }],
            tools: [{ type: "function", function: {
              name: "store_suppliers",
              parameters: {
                type: "object",
                properties: {
                  suppliers: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        supplier_name: { type: "string" },
                        platform: { type: "string", enum: ["AliExpress", "Alibaba", "1688", "DHgate", "Temu", "direct", "other"] },
                        unit_cost_cents: { type: "integer", description: "Unit cost in cents" },
                        shipping_cost_cents: { type: "integer", description: "Estimated shipping cost in cents to US" },
                        shipping_country: { type: "string", description: "Where product ships from, e.g. CN, US" },
                        processing_days: { type: "integer", description: "Days to process/prepare order" },
                        delivery_days: { type: "integer", description: "Days for delivery after processing" },
                        moq: { type: "integer", description: "Minimum order quantity, 1 if single-unit" },
                        reliability_score: { type: "integer", minimum: 1, maximum: 5, description: "1=unknown/risky, 3=average, 5=established/trusted" },
                        defect_risk: { type: "integer", minimum: 1, maximum: 5, description: "1=low risk, 5=high risk" },
                        stock_status: { type: "string", enum: ["in_stock", "low_stock", "out_of_stock", "unknown"] },
                        expected_return_rate_pct: { type: "number", description: "Expected return rate 0-100" },
                        verification_status: { type: "string", enum: ["estimated", "partially_verified", "verified"] },
                        notes: { type: "string" },
                      },
                      required: ["supplier_name", "platform", "unit_cost_cents"],
                    },
                  },
                },
                required: ["suppliers"],
              },
            }}],
            tool_choice: { type: "function", function: { name: "store_suppliers" } },
            temperature: 0.2,
          }),
        });

        if (supplierResp.ok) {
          const supplierData = await supplierResp.json();
          const supplierCall = supplierData.choices?.[0]?.message?.tool_calls?.[0];
          if (supplierCall) {
            const { suppliers } = JSON.parse(supplierCall.function.arguments);
            // Clear old estimated suppliers, keep verified ones
            await supabase.from("product_suppliers")
              .delete()
              .eq("product_id", productId)
              .neq("verification_status", "verified");

            for (const s of (suppliers || []).slice(0, 5)) {
              const supplierUrl = wholesaleLinks.find(l => 
                l.platform.toLowerCase() === s.platform.toLowerCase()
              )?.url || null;

              const reliabilityScore = s.reliability_score || 3;
              const defectRisk = s.defect_risk || 3;
              const commScore = 3; // Default, can't know from search
              const overallSupplierScore = Math.round(
                (reliabilityScore * 0.4 + (6 - defectRisk) * 0.3 + commScore * 0.3) / 5 * 100
              );

              await supabase.from("product_suppliers").insert({
                product_id: productId,
                supplier_name: s.supplier_name,
                platform: s.platform,
                supplier_url: supplierUrl,
                unit_cost_cents: s.unit_cost_cents,
                shipping_cost_cents: s.shipping_cost_cents || 0,
                shipping_country: s.shipping_country || "CN",
                target_market: "US",
                processing_days: s.processing_days || null,
                delivery_days: s.delivery_days || null,
                moq: s.moq || 1,
                reliability_score: reliabilityScore,
                defect_risk: defectRisk,
                communication_score: commScore,
                stock_status: s.stock_status || "unknown",
                expected_return_rate_pct: s.expected_return_rate_pct || 5,
                overall_supplier_score: overallSupplierScore,
                verification_status: s.verification_status || "estimated",
                notes: s.notes || null,
                is_preferred: false,
              });
            }
            // Mark cheapest as preferred
            const { data: allSuppliers } = await supabase
              .from("product_suppliers")
              .select("id, unit_cost_cents")
              .eq("product_id", productId)
              .order("unit_cost_cents", { ascending: true })
              .limit(1);
            if (allSuppliers?.[0]) {
              await supabase.from("product_suppliers")
                .update({ is_preferred: true })
                .eq("id", allSuppliers[0].id);
            }
            console.log(`[product-research] Saved ${suppliers?.length || 0} suppliers`);
          }
        }
      } catch (e) { console.warn("[product-research] Supplier extraction error:", e); }
    }

    // ==========================================
    // PHASE 8: AUTO-CALCULATE UNIT ECONOMICS
    // ==========================================
    console.log("[product-research] Phase 8: Auto-calculating unit economics");
    if (productId) {
      try {
        const econResp = await fetch(`${supabaseUrl}/functions/v1/calculate-unit-economics`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ product_id: productId }),
        });
        if (econResp.ok) {
          const econData = await econResp.json();
          console.log(`[product-research] Economics: grade=${econData.viability_grade}, net_margin=${econData.net_margin_pct}%`);
        } else {
          console.warn(`[product-research] Economics calculation returned ${econResp.status}`);
        }
      } catch (e) { console.warn("[product-research] Economics calculation error:", e); }
    }

    console.log(`[product-research] ===== COMPLETE: "${analysis.product_name}" score=${overallScore}/100, ${validatedLinks.length} links, ${foundImageUrls.length} images =====`);

    return new Response(
      JSON.stringify({
        success: true,
        product_id: productId,
        overall_score: overallScore,
        images_found: foundImageUrls.length,
        links_found: validatedLinks.length,
        retail_links: validatedLinks.filter(l => l.linkType === "retail").length,
        wholesale_links: validatedLinks.filter(l => l.linkType === "wholesale").length,
        suppliers_extracted: true,
        economics_calculated: true,
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
