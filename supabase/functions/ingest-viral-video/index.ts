/**
 * ingest-viral-video
 * 
 * Accepts a video URL, extracts metadata via AI, identifies the product,
 * and optionally links to an existing product or creates a new one.
 * Then triggers the research pipeline.
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

interface ExtractionResult {
  product_name: string | null;
  product_description: string | null;
  hook: string | null;
  demand_signals: {
    purchase_intent_phrases: string[];
    estimated_demand_level: string;
  };
  suggested_category: string | null;
}

async function extractProductFromVideo(
  url: string,
  platform: string,
  caption: string | null,
  openaiKey: string
): Promise<ExtractionResult> {
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
          content: `You are a product extraction specialist for viral video commerce. Given a video URL and caption, identify the EXACT physical product being promoted or featured. Be specific about the product — not generic categories. Also identify the hook/angle used and any purchase-intent signals from the caption.

Return JSON:
{
  "product_name": "specific product name (e.g. 'Rotating Fruit Slicer with Container')",
  "product_description": "1-2 sentence description of the exact product shown",
  "hook": "the hook or angle used in the video (e.g. 'before/after transformation')",
  "demand_signals": {
    "purchase_intent_phrases": ["phrases from caption indicating buying intent"],
    "estimated_demand_level": "high|medium|low"
  },
  "suggested_category": "product category"
}

If you cannot determine the product, set product_name to null.`,
        },
        {
          role: "user",
          content: `Platform: ${platform}\nVideo URL: ${url}\nCaption: ${caption || "(no caption provided)"}\n\nExtract the product information.`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 500,
    }),
  });

  if (!resp.ok) {
    console.error(`OpenAI extraction failed: ${resp.status}`);
    return {
      product_name: null,
      product_description: null,
      hook: null,
      demand_signals: { purchase_intent_phrases: [], estimated_demand_level: "unknown" },
      suggested_category: null,
    };
  }

  const data = await resp.json();
  try {
    return JSON.parse(data.choices[0].message.content);
  } catch {
    return {
      product_name: null,
      product_description: null,
      hook: null,
      demand_signals: { purchase_intent_phrases: [], estimated_demand_level: "unknown" },
      suggested_category: null,
    };
  }
}

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

    // Check if already ingested
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
          already_exists: true 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert the video record
    const { data: video, error: insertErr } = await supabase
      .from("viral_videos")
      .insert({
        url,
        platform,
        caption: caption || null,
        views: views || null,
        likes: likes || null,
        comments_count: comments_count || null,
        shares: shares || null,
        creator_handle: creator_handle || null,
        processing_status: "processing",
      })
      .select()
      .single();

    if (insertErr) throw insertErr;
    console.log(`[ingest-viral] Created viral_video ${video.id} for ${platform} URL`);

    // Extract product info via AI
    const extraction = await extractProductFromVideo(url, platform, caption, openaiKey);
    console.log(`[ingest-viral] Extracted product: ${extraction.product_name}`);

    // Update the video with extraction results
    const updatePayload: Record<string, unknown> = {
      extracted_product_name: extraction.product_name,
      extracted_product_description: extraction.product_description,
      source_hook: extraction.hook,
      demand_signals: extraction.demand_signals,
      processing_status: "done",
      processed_at: new Date().toISOString(),
    };

    let linkedProductId = link_product_id || null;

    // If we got a product name and no explicit link, try to find or create
    if (extraction.product_name && !linkedProductId) {
      // Search for existing product with similar name
      const searchName = extraction.product_name.toLowerCase();
      const { data: candidates } = await supabase
        .from("products")
        .select("id, name")
        .limit(50);

      const match = (candidates || []).find(p => {
        const pName = p.name.toLowerCase();
        // Simple fuzzy: check if significant words overlap
        const extractWords = searchName.split(/\s+/).filter(w => w.length > 3);
        const productWords = pName.split(/\s+/).filter(w => w.length > 3);
        const overlap = extractWords.filter(w => productWords.some(pw => pw.includes(w) || w.includes(pw)));
        return overlap.length >= 2 || pName.includes(searchName) || searchName.includes(pName);
      });

      if (match) {
        linkedProductId = match.id;
        console.log(`[ingest-viral] Matched to existing product: ${match.name}`);
      } else {
        // Create new product
        const { data: newProduct, error: createErr } = await supabase
          .from("products")
          .insert({
            name: extraction.product_name,
            short_description: extraction.product_description,
            category: extraction.suggested_category,
            discovered_via: "viral_video",
            status: "discovered",
          })
          .select()
          .single();

        if (!createErr && newProduct) {
          linkedProductId = newProduct.id;
          console.log(`[ingest-viral] Created new product: ${newProduct.name} (${newProduct.id})`);
        }
      }
    }

    if (linkedProductId) {
      updatePayload.linked_product_id = linkedProductId;
    }

    await supabase
      .from("viral_videos")
      .update(updatePayload)
      .eq("id", video.id);

    // Trigger research pipeline for the linked product
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
