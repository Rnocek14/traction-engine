/**
 * ingest-viral-video
 * 
 * Demand-driven product discovery pipeline:
 * 1. Accept video URL + optional metadata
 * 2. Extract product with confidence scoring via GPT
 * 3. Compute demand score from engagement signals
 * 4. Deduplicate against existing products using canonical matching
 * 5. Trigger research pipeline
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function detectPlatform(url: string): string {
  if (/tiktok\.com/i.test(url)) return "tiktok";
  if (/instagram\.com/i.test(url)) return "instagram";
  if (/youtube\.com|youtu\.be/i.test(url)) return "youtube";
  if (/facebook\.com|fb\.watch/i.test(url)) return "facebook";
  return "other";
}

// ── Hook taxonomy (aligned with hook-optimization-framework) ──
const HOOK_TYPES = [
  "curiosity", "novelty", "social_proof", "transformation",
  "challenge", "controversy", "urgency", "myth_bust",
  "statistic_shock", "before_after", "unboxing", "comparison",
  "listicle", "story", "tutorial", "reaction",
] as const;

// ── Demand scoring ──
function computeDemandScore(
  views: number | null,
  likes: number | null,
  comments: number | null,
  shares: number | null,
  engagementRate: number,
  demandSignals: { purchase_intent_phrases?: string[]; estimated_demand_level?: string }
): number {
  let score = 0;

  // Views component (0-25pts)
  if (views) {
    if (views >= 10_000_000) score += 25;
    else if (views >= 1_000_000) score += 22;
    else if (views >= 500_000) score += 18;
    else if (views >= 100_000) score += 14;
    else if (views >= 50_000) score += 10;
    else if (views >= 10_000) score += 6;
    else score += 2;
  }

  // Engagement rate component (0-30pts)
  if (engagementRate >= 0.15) score += 30;
  else if (engagementRate >= 0.10) score += 25;
  else if (engagementRate >= 0.06) score += 20;
  else if (engagementRate >= 0.03) score += 14;
  else if (engagementRate >= 0.01) score += 8;
  else if (engagementRate > 0) score += 3;

  // Comments (purchase intent proxy) (0-20pts)
  if (comments) {
    if (comments >= 5000) score += 20;
    else if (comments >= 1000) score += 16;
    else if (comments >= 500) score += 12;
    else if (comments >= 100) score += 8;
    else if (comments >= 20) score += 4;
  }

  // Shares (virality signal) (0-15pts)
  if (shares) {
    if (shares >= 10000) score += 15;
    else if (shares >= 1000) score += 12;
    else if (shares >= 100) score += 8;
    else if (shares >= 10) score += 4;
  }

  // AI-detected demand signals (0-10pts)
  const intentPhrases = demandSignals?.purchase_intent_phrases?.length || 0;
  const demandLevel = demandSignals?.estimated_demand_level || "unknown";
  if (demandLevel === "high") score += 7;
  else if (demandLevel === "medium") score += 4;
  else if (demandLevel === "low") score += 1;
  score += Math.min(intentPhrases, 3); // up to 3 bonus pts

  return Math.min(score, 100);
}

function computeEngagementRate(views: number | null, likes: number | null, comments: number | null): number {
  if (!views || views === 0) return 0;
  return ((likes || 0) + (comments || 0)) / views;
}

function computeCreativeStrength(
  demandScore: number,
  extractionConfidence: number,
  hookType: string | null
): number {
  // Demand: 50%, Extraction quality: 30%, Hook presence: 20%
  let score = demandScore * 0.5 + extractionConfidence * 0.3;
  if (hookType && hookType !== "unknown") score += 20;
  return Math.round(Math.min(score, 100));
}

// ── Product extraction ──
interface ExtractionResult {
  product_name: string | null;
  product_description: string | null;
  key_attributes: string[];
  use_case: string | null;
  hook: string | null;
  hook_type: string | null;
  confidence: number;
  demand_signals: {
    purchase_intent_phrases: string[];
    estimated_demand_level: string;
  };
  suggested_category: string | null;
  variant_signals: string[];
}

async function extractProductFromVideo(
  url: string,
  platform: string,
  caption: string | null,
  openaiKey: string
): Promise<ExtractionResult> {
  const hookTypesStr = HOOK_TYPES.join(", ");

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
          content: `You are an expert product extraction specialist for viral video commerce. Your job is to identify the EXACT physical product being promoted in a video based on URL patterns, platform context, and caption text.

CRITICAL RULES:
1. Be SPECIFIC — "Rotating Fruit Slicer with Built-in Container" not "fruit slicer"
2. Extract key_attributes that distinguish this EXACT product from similar ones (color, size, features, brand)
3. Identify variant_signals — anything suggesting multiple versions/models (e.g. "assorted colors", "3 sizes")
4. Categorize the hook into one of: ${hookTypesStr}
5. Assess purchase intent from caption language (phrases like "link in bio", "shop now", "need this", "just ordered")
6. Rate your confidence 0-100:
   - 90-100: Product is explicitly named/shown with clear identifying details
   - 70-89: Product is clearly identifiable but some attributes uncertain
   - 50-69: Product category is clear but exact model/variant uncertain
   - 30-49: Vague or generic product reference
   - 0-29: Cannot determine product with any confidence

Return JSON:
{
  "product_name": "specific product name or null if unidentifiable",
  "product_description": "1-2 sentence description of the exact product",
  "key_attributes": ["distinguishing features", "brand if known", "material", "color"],
  "use_case": "primary use case shown in the video",
  "hook": "the exact hook/angle used (describe it)",
  "hook_type": "one of the hook categories or 'unknown'",
  "confidence": 0-100,
  "demand_signals": {
    "purchase_intent_phrases": ["extracted phrases indicating buying intent from caption"],
    "estimated_demand_level": "high|medium|low"
  },
  "suggested_category": "product category",
  "variant_signals": ["any signals of multiple variants/models"]
}`,
        },
        {
          role: "user",
          content: `Platform: ${platform}\nVideo URL: ${url}\n\nCaption/Description:\n${caption || "(no caption provided — use URL patterns and platform context only)"}\n\nExtract the product information with confidence scoring.`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 800,
    }),
  });

  const fallback: ExtractionResult = {
    product_name: null,
    product_description: null,
    key_attributes: [],
    use_case: null,
    hook: null,
    hook_type: null,
    confidence: 0,
    demand_signals: { purchase_intent_phrases: [], estimated_demand_level: "unknown" },
    suggested_category: null,
    variant_signals: [],
  };

  if (!resp.ok) {
    console.error(`[ingest-viral] OpenAI failed: ${resp.status}`);
    return fallback;
  }

  const data = await resp.json();
  try {
    const parsed = JSON.parse(data.choices[0].message.content);
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

// ── Product deduplication ──
function normalizeProductName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[''""]/g, "'")
    .replace(/\([^)]*\)/g, "")          // remove parentheticals
    .replace(/\b(with|and|for|the|a|an|in|on|by|to|of)\b/gi, "") // stop words
    .replace(/[^a-z0-9\s]/g, "")        // strip punctuation
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(name: string): string[] {
  return normalizeProductName(name).split(" ").filter(w => w.length > 2);
}

function computeSimilarity(nameA: string, nameB: string): number {
  const tokensA = tokenize(nameA);
  const tokensB = tokenize(nameB);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  // Jaccard + substring matching
  let matches = 0;
  for (const a of tokensA) {
    for (const b of tokensB) {
      if (a === b || (a.length >= 4 && b.includes(a)) || (b.length >= 4 && a.includes(b))) {
        matches++;
        break;
      }
    }
  }

  const jaccard = matches / Math.max(tokensA.length, tokensB.length);

  // Bonus: if the normalized names are substrings of each other
  const normA = normalizeProductName(nameA);
  const normB = normalizeProductName(nameB);
  const substringBonus = (normA.includes(normB) || normB.includes(normA)) ? 0.2 : 0;

  return Math.min(jaccard + substringBonus, 1.0);
}

interface ProductCandidate {
  id: string;
  name: string;
  canonical_name: string | null;
  distinctive_attributes: string[] | null;
  synonyms: string[] | null;
}

function findBestMatch(
  extractedName: string,
  extractedAttributes: string[],
  candidates: ProductCandidate[]
): { match: ProductCandidate | null; score: number } {
  let bestMatch: ProductCandidate | null = null;
  let bestScore = 0;

  for (const c of candidates) {
    // Check main name
    let score = computeSimilarity(extractedName, c.canonical_name || c.name);

    // Check synonyms
    if (c.synonyms) {
      for (const syn of c.synonyms) {
        const synScore = computeSimilarity(extractedName, syn);
        score = Math.max(score, synScore);
      }
    }

    // Attribute overlap bonus
    if (extractedAttributes.length > 0 && c.distinctive_attributes?.length) {
      const attrOverlap = extractedAttributes.filter(a =>
        c.distinctive_attributes!.some(da =>
          da.toLowerCase().includes(a.toLowerCase()) || a.toLowerCase().includes(da.toLowerCase())
        )
      ).length;
      score += attrOverlap * 0.05;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = c;
    }
  }

  return { match: bestScore >= 0.45 ? bestMatch : null, score: bestScore };
}

// ── Main handler ──
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { url, caption, views, likes, comments_count, shares, creator_handle, link_product_id } = body;

    if (!url || typeof url !== "string") {
      return new Response(
        JSON.stringify({ error: "url is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const platform = detectPlatform(url);

    // Check duplicate video
    const { data: existing } = await supabase
      .from("viral_videos")
      .select("id, linked_product_id, processing_status")
      .eq("url", url)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({
          success: true,
          viral_video_id: existing.id,
          linked_product_id: existing.linked_product_id,
          already_exists: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Compute engagement metrics early
    const viewCount = views || null;
    const likeCount = likes || null;
    const commentCount = comments_count || null;
    const shareCount = shares || null;
    const engagementRate = computeEngagementRate(viewCount, likeCount, commentCount);

    // Insert video record
    const { data: video, error: insertErr } = await supabase
      .from("viral_videos")
      .insert({
        url,
        platform,
        caption: caption || null,
        views: viewCount,
        likes: likeCount,
        comments_count: commentCount,
        shares: shareCount,
        creator_handle: creator_handle || null,
        engagement_rate: engagementRate,
        processing_status: "processing",
      })
      .select()
      .single();

    if (insertErr) throw insertErr;
    console.log(`[ingest-viral] Created viral_video ${video.id} for ${platform}`);

    // Extract product via AI
    const extraction = await extractProductFromVideo(url, platform, caption, openaiKey);
    console.log(`[ingest-viral] Extracted: "${extraction.product_name}" (confidence: ${extraction.confidence})`);

    // Compute scores
    const demandScore = computeDemandScore(
      viewCount, likeCount, commentCount, shareCount,
      engagementRate, extraction.demand_signals
    );
    const creativeStrength = computeCreativeStrength(demandScore, extraction.confidence, extraction.hook_type);

    // Build update payload
    const updatePayload: Record<string, unknown> = {
      extracted_product_name: extraction.product_name,
      extracted_product_description: extraction.product_description,
      source_hook: extraction.hook,
      hook_type: extraction.hook_type,
      demand_signals: {
        ...extraction.demand_signals,
        key_attributes: extraction.key_attributes,
        variant_signals: extraction.variant_signals,
        use_case: extraction.use_case,
      },
      extraction_confidence: extraction.confidence,
      demand_score: demandScore,
      engagement_rate: engagementRate,
      creative_strength_score: creativeStrength,
      processing_status: "done",
      processed_at: new Date().toISOString(),
    };

    let linkedProductId = link_product_id || null;

    // Product deduplication + matching
    if (extraction.product_name && extraction.confidence >= 30 && !linkedProductId) {
      const { data: candidates } = await supabase
        .from("products")
        .select("id, name, canonical_name, distinctive_attributes, synonyms")
        .limit(200);

      const { match, score: matchScore } = findBestMatch(
        extraction.product_name,
        extraction.key_attributes || [],
        (candidates || []) as ProductCandidate[]
      );

      if (match) {
        linkedProductId = match.id;
        console.log(`[ingest-viral] Dedup matched → "${match.name}" (similarity: ${matchScore.toFixed(2)})`);
      } else if (extraction.confidence >= 50) {
        // Only create product if we're reasonably confident
        const { data: newProduct, error: createErr } = await supabase
          .from("products")
          .insert({
            name: extraction.product_name,
            canonical_name: normalizeProductName(extraction.product_name),
            short_description: extraction.product_description,
            category: extraction.suggested_category,
            distinctive_attributes: extraction.key_attributes,
            discovered_via: "viral_video",
            status: "discovered",
          })
          .select()
          .single();

        if (createErr) {
          console.error(`[ingest-viral] Product create failed:`, JSON.stringify(createErr));
        } else if (newProduct) {
          linkedProductId = newProduct.id;
          console.log(`[ingest-viral] Created product: "${newProduct.name}" (${newProduct.id})`);
        }
      } else {
        console.log(`[ingest-viral] Confidence too low (${extraction.confidence}) to create product`);
      }
    }

    if (linkedProductId) {
      updatePayload.linked_product_id = linkedProductId;
    }

    await supabase.from("viral_videos").update(updatePayload).eq("id", video.id);

    // Trigger research pipeline if linked
    if (linkedProductId) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/product-research`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ product_id: linkedProductId }),
        });
        console.log(`[ingest-viral] Triggered research for product ${linkedProductId}`);
      } catch (err) {
        console.warn(`[ingest-viral] Research trigger failed:`, err);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        viral_video_id: video.id,
        linked_product_id: linkedProductId,
        extracted_product: extraction.product_name,
        extraction_confidence: extraction.confidence,
        demand_score: demandScore,
        creative_strength: creativeStrength,
        hook_type: extraction.hook_type,
        platform,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[ingest-viral] Error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
