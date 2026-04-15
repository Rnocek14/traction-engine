/**
 * Product-to-Videos: Account-aware video concept generator.
 * 
 * Takes a product_id + account_id, fetches account identity (style, persona, audience),
 * and generates concepts tailored to that specific account's brand.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VideoConcept {
  hook: string;
  angle: string;
  format: string;
  scenes: Array<{
    type: "image_motion" | "ai_generated" | "text_overlay";
    referenceImageUrl?: string;
    prompt: string;
    duration: number;
    onScreenText?: string;
  }>;
  voiceover: string;
  caption: string;
  cta: string;
}

const VIDEO_FORMATS = ["slideshow_ad", "ugc_review", "problem_solution", "comparison", "curiosity_reveal"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) throw new Error("OPENAI_API_KEY not configured");

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body = await req.json();
    const { product_id, mode = "generate", approved_concepts, account_id } = body;

    if (!product_id) throw new Error("product_id is required");

    // Fetch product
    const { data: product, error: prodError } = await supabase
      .from("products").select("*").eq("id", product_id).single();
    if (prodError || !product) throw new Error("Product not found");

    // ─── READINESS GATE ───
    // Block ad generation unless product identity is verified
    const readinessScore = product.readiness_score || 0;
    const readinessState = product.readiness_state || "research_only";
    if (readinessScore < 40 || readinessState === "research_only") {
      const { count: confirmedLinks } = await supabase
        .from("product_links")
        .select("id", { count: "exact", head: true })
        .eq("product_id", product_id)
        .eq("validation_status", "confirmed");
      
      if (!confirmedLinks || confirmedLinks === 0) {
        throw new Error(
          `Product "${product.name}" is not ready for ad generation. ` +
          `Readiness: ${readinessScore}/100 (${readinessState}). ` +
          `Run validate-product-links first to verify product identity.`
        );
      }
    }

    // Fetch account identity (if provided)
    let accountIdentity: Record<string, unknown> | null = null;
    if (account_id) {
      const { data: acct } = await supabase
        .from("account_configs").select("*").eq("account_id", account_id).single();
      accountIdentity = acct;
    }

    // Fetch images
    const images = await fetchProductImages(supabase, product_id, product.image_url);

    if (mode === "generate") {
      const concepts = await generateConcepts(product, images, openaiKey, accountIdentity);
      return new Response(
        JSON.stringify({ success: true, concepts, image_count: images.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (mode === "queue") {
      if (!approved_concepts?.length) throw new Error("approved_concepts array required");
      if (!account_id) throw new Error("account_id required for queue mode");

      const jobIds: string[] = [];
      for (const concept of approved_concepts as VideoConcept[]) {
        const storyboardScenes = concept.scenes.map((scene, i) => ({
          scene_id: crypto.randomUUID(),
          order: i + 1,
          prompt: scene.prompt,
          duration_sec: scene.duration,
          reference_image_url: scene.referenceImageUrl || null,
          scene_type: scene.type,
          on_screen_text: scene.onScreenText || null,
        }));

        const { data: job, error: jobError } = await supabase
          .from("story_jobs").insert({
            account_id,
            product_id,
            title: `${concept.angle}: ${concept.hook.substring(0, 60)}`,
            story_type: "product_ad",
            status: "draft",
            total_clips: storyboardScenes.length,
            storyboard_json: {
              scenes: storyboardScenes,
              voiceover_script: concept.voiceover,
              caption: concept.caption,
              cta: concept.cta,
              format: concept.format,
              angle: concept.angle,
              hook: concept.hook,
            },
          }).select("id").single();

        if (!jobError) jobIds.push(job.id);
      }

      return new Response(
        JSON.stringify({ success: true, job_ids: jobIds, queued: jobIds.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error(`Unknown mode: ${mode}`);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function fetchProductImages(supabase: any, productId: string, fallbackUrl?: string) {
  // Priority: pinned_supplier > verified > any > fallback
  for (const filter of [
    (q: any) => q.eq("source", "pinned_supplier"),
    (q: any) => q.or("verified.eq.true,manually_approved.eq.true"),
    (q: any) => q,
  ]) {
    const query = supabase.from("product_images").select("*")
      .eq("product_id", productId).order("is_primary", { ascending: false }).limit(8);
    const { data } = await filter(query);
    if (data?.length) return data;
  }
  if (fallbackUrl) return [{ url: fallbackUrl, label: "hero", is_primary: true }];
  return [];
}

function buildAccountBlock(acct: Record<string, unknown> | null): string {
  if (!acct) return "No account context — generate for a general audience.";

  const persona = acct.persona as Record<string, unknown> | null;
  const audience = acct.audience as Record<string, unknown> | null;
  const pillars = (acct.content_pillars as string[]) || [];

  return `ACCOUNT IDENTITY — tailor ALL content to this brand:
- Account: ${acct.account_name || acct.account_id}
- Promise: ${acct.promise || "not set"}
- Content Style: ${acct.content_style || "not set"}
- Hook Style: ${acct.hook_style || "curiosity"}
- Tone: ${persona?.tone || "informative"}, Vibe: ${persona?.vibe || "friendly"}
- Audience: ${audience?.who || "general"} | Pain points: ${JSON.stringify((audience as any)?.pain_points || [])}
- Content Pillars: ${pillars.join(", ") || "general"}
- CTA Style: ${acct.cta_style || "soft"}
- CTA Phrases: ${((acct.cta_phrases as string[]) || []).join(" | ") || "Link in bio"}
- Monetization: ${acct.monetization_mode || "product_first"}

CRITICAL: Every hook, voiceover, and caption MUST match this account's tone and style.
If hook_style is "shock" → use surprising/alarming openers.
If hook_style is "curiosity" → use questions or teasers.
If hook_style is "problem" → lead with the pain point.
If hook_style is "aesthetic" → focus on visual beauty, minimal text.
If hook_style is "demo" → show the product in action immediately.
If hook_style is "listicle" → use numbered format ("3 reasons...").`;
}

async function generateConcepts(
  product: Record<string, unknown>,
  images: Array<Record<string, unknown>>,
  openaiKey: string,
  accountIdentity: Record<string, unknown> | null,
): Promise<VideoConcept[]> {
  const marketingPlan = product.marketing_plan as Record<string, unknown> | null;
  const imageList = images.map((img, i) => ({
    index: i + 1, url: img.url, label: img.label || "hero", is_primary: img.is_primary,
  }));

  const accountBlock = buildAccountBlock(accountIdentity);

  const systemPrompt = `You are a TikTok/Reels ad creative director. You generate structured video concepts that sell physical products using short-form video.

${accountBlock}

CRITICAL RULES:
1. Each video MUST visually demonstrate the product within the FIRST 2 SECONDS
2. Use the provided product images as reference frames (image_motion scenes)
3. Every concept must use a DIFFERENT angle
4. Keep total video length between 15-30 seconds
5. Scenes should be 3-5 seconds each
6. The hook text must stop the scroll — match the account's hook_style
7. Voiceover must match the account's tone (${(accountIdentity?.persona as any)?.tone || "conversational"})

AVAILABLE FORMATS: ${VIDEO_FORMATS.join(", ")}

SCENE TYPES:
- "image_motion": Uses a product photo with pan/zoom/motion effects (PREFERRED for product shots)
- "ai_generated": AI-generated video clip from prompt (use for lifestyle/context shots)
- "text_overlay": Bold text on dark background (use sparingly)

${images.length === 0 ? "IMPORTANT: No product images available. Use ONLY 'ai_generated' and 'text_overlay' scene types." : ""}

OUTPUT: Return a JSON array of exactly 5 video concepts.`;

  const userPrompt = `Generate 5 TikTok ad concepts for this product:

PRODUCT: ${product.name}
${product.short_description ? `DESCRIPTION: ${product.short_description}` : ""}
${product.category ? `CATEGORY: ${product.category}` : ""}
PRICE: $${((product.price_cents as number) || 0) / 100}

${marketingPlan ? `MARKETING INSIGHTS:
- Best Hook Type: ${(marketingPlan as any).best_hook_type || "not specified"}
- Target Audience: ${JSON.stringify((marketingPlan as any).target_audience || {})}
- Key Angles: ${JSON.stringify((marketingPlan as any).content_angles || [])}
- Emotional Triggers: ${JSON.stringify((marketingPlan as any).emotional_triggers || [])}` : "No marketing plan — use your best judgment."}

${product.purchase_url ? `PURCHASE URL: ${product.purchase_url}` : "No purchase URL — use generic CTA like 'Link in bio'"}

AVAILABLE PRODUCT IMAGES:
${imageList.map(img => `  ${img.index}. [${img.label}${img.is_primary ? " PRIMARY" : ""}] ${img.url}`).join("\n")}

Return ONLY valid JSON: { "videos": [...] }`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.8,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("No response from GPT");

  const parsed = JSON.parse(content);
  const videos: VideoConcept[] = parsed.videos || parsed;
  if (!Array.isArray(videos) || videos.length === 0) throw new Error("Invalid GPT response");

  return videos.slice(0, 5).map(v => ({
    hook: v.hook || "Untitled hook",
    angle: v.angle || "General",
    format: v.format || "slideshow_ad",
    scenes: (v.scenes || []).map(s => ({
      type: s.type || "image_motion",
      referenceImageUrl: s.referenceImageUrl,
      prompt: s.prompt || "",
      duration: s.duration || 3,
      onScreenText: s.onScreenText,
    })),
    voiceover: v.voiceover || "",
    caption: v.caption || "",
    cta: v.cta || "Link in bio",
  }));
}
