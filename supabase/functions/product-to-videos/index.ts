/**
 * Product-to-Videos: UGC Ad Engine
 * 
 * Generates "starving artist" style UGC ad concepts using enriched product truth:
 * - Confirmed links (real prices, real features)
 * - Verified product images (real product shots)
 * - Account identity (tone, hook style, audience)
 * 
 * Every video follows: Hook → Problem → Discovery → Demo → Reaction → Soft CTA
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

/** Enriched product profile built from confirmed links + verified images */
interface ProductTruth {
  name: string;
  canonicalName: string | null;
  category: string | null;
  priceCents: number;
  description: string | null;
  purchaseUrl: string | null;
  // From confirmed links
  confirmedRetailPrice: number | null;
  confirmedBrand: string | null;
  confirmedFeatures: string[];
  confirmedSpecs: Record<string, unknown>;
  // From verified images
  verifiedImages: Array<{ url: string; label: string; isPrimary: boolean; adReadiness: number | null }>;
  // Marketing plan
  marketingPlan: Record<string, unknown> | null;
  distinctiveAttributes: string[];
}

const UGC_ANGLES = [
  "accidental_discovery",   // "I randomly found this..."
  "skeptic_converted",      // "I thought this was fake but..."
  "problem_solver",         // "I've been struggling with X..."
  "comparison_shock",       // "vs the $80 version..."
  "gift_find",              // "found the perfect gift..."
  "aesthetic_upgrade",      // "my space went from 0 to 100..."
  "hack_reveal",            // "nobody talks about this trick..."
  "impulse_justified",      // "okay I know I didn't need this but..."
  "before_after",           // "watch this transformation..."
  "obsessed_review",        // "I've used this every day for a week..."
];

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

    // Build enriched product truth from confirmed links + verified images
    const productTruth = await buildProductTruth(supabase, product_id, product);

    // Fetch account identity
    let accountIdentity: Record<string, unknown> | null = null;
    if (account_id) {
      const { data: acct } = await supabase
        .from("account_configs").select("*").eq("account_id", account_id).single();
      accountIdentity = acct;
    }

    if (mode === "generate") {
      const concepts = await generateUGCConcepts(productTruth, openaiKey, accountIdentity);
      return new Response(
        JSON.stringify({ success: true, concepts, image_count: productTruth.verifiedImages.length }),
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

// ─── PRODUCT TRUTH BUILDER ───
// Assembles real evidence from confirmed links + verified images

async function buildProductTruth(
  supabase: any,
  productId: string,
  product: Record<string, unknown>,
): Promise<ProductTruth> {
  // Fetch confirmed links with enriched data
  const { data: confirmedLinks } = await supabase
    .from("product_links")
    .select("*")
    .eq("product_id", productId)
    .eq("validation_status", "confirmed")
    .order("match_confidence", { ascending: false })
    .limit(10);

  // Fetch verified images (prefer high ad_readiness)
  const { data: verifiedImages } = await supabase
    .from("product_images")
    .select("*")
    .eq("product_id", productId)
    .or("verified.eq.true,manually_approved.eq.true")
    .order("ad_readiness_score", { ascending: false, nullsFirst: false })
    .limit(8);

  // Fall back to any images if none verified
  let images = verifiedImages || [];
  if (images.length === 0) {
    const { data: anyImages } = await supabase
      .from("product_images")
      .select("*")
      .eq("product_id", productId)
      .order("is_primary", { ascending: false })
      .limit(8);
    images = anyImages || [];
  }
  // Last resort: product.image_url
  if (images.length === 0 && product.image_url) {
    images = [{ url: product.image_url, label: "hero", is_primary: true, ad_readiness_score: null }];
  }

  // Extract confirmed features from best links
  const allFeatures: string[] = [];
  let confirmedBrand: string | null = null;
  let confirmedRetailPrice: number | null = null;
  let confirmedSpecs: Record<string, unknown> = {};

  for (const link of (confirmedLinks || [])) {
    if (link.source_brand && !confirmedBrand) confirmedBrand = link.source_brand;
    if (link.price_cents && !confirmedRetailPrice) confirmedRetailPrice = link.price_cents;
    if (link.source_features?.length) allFeatures.push(...link.source_features);
    if (link.source_specs) confirmedSpecs = { ...confirmedSpecs, ...link.source_specs };
  }

  // Deduplicate features
  const uniqueFeatures = [...new Set(allFeatures.map(f => f.toLowerCase().trim()))].slice(0, 15);

  return {
    name: product.name as string,
    canonicalName: product.canonical_name as string | null,
    category: product.category as string | null,
    priceCents: (product.price_cents as number) || 0,
    description: product.short_description as string | null,
    purchaseUrl: product.purchase_url as string | null,
    confirmedRetailPrice,
    confirmedBrand,
    confirmedFeatures: uniqueFeatures,
    confirmedSpecs,
    verifiedImages: images.map((img: any) => ({
      url: img.url,
      label: img.label || "product",
      isPrimary: !!img.is_primary,
      adReadiness: img.ad_readiness_score,
    })),
    marketingPlan: product.marketing_plan as Record<string, unknown> | null,
    distinctiveAttributes: (product.distinctive_attributes as string[]) || [],
  };
}

// ─── ACCOUNT BLOCK ───

function buildAccountBlock(acct: Record<string, unknown> | null): string {
  if (!acct) return "";

  const persona = acct.persona as Record<string, unknown> | null;
  const audience = acct.audience as Record<string, unknown> | null;

  return `ACCOUNT VOICE:
- Tone: ${(persona as any)?.tone || "casual"}, Vibe: ${(persona as any)?.vibe || "relatable"}
- Audience: ${(audience as any)?.who || "18-35 impulse buyers"} 
- Pain points: ${JSON.stringify((audience as any)?.pain_points || [])}
- Hook style: ${acct.hook_style || "curiosity"}
- CTA style: ${acct.cta_style || "soft"} — phrases: ${((acct.cta_phrases as string[]) || ["link in bio"]).join(" | ")}`;
}

// ─── UGC CONCEPT GENERATOR ───

async function generateUGCConcepts(
  truth: ProductTruth,
  openaiKey: string,
  accountIdentity: Record<string, unknown> | null,
): Promise<VideoConcept[]> {
  const price = truth.confirmedRetailPrice
    ? `$${(truth.confirmedRetailPrice / 100).toFixed(2)}`
    : truth.priceCents
      ? `$${(truth.priceCents / 100).toFixed(2)}`
      : "unknown";

  const imageBlock = truth.verifiedImages.length > 0
    ? truth.verifiedImages.map((img, i) =>
        `  ${i + 1}. [${img.label}${img.isPrimary ? " PRIMARY" : ""}${img.adReadiness ? ` readiness:${img.adReadiness}` : ""}] ${img.url}`
      ).join("\n")
    : "  NO IMAGES — use only ai_generated and text_overlay scenes";

  const featuresBlock = truth.confirmedFeatures.length > 0
    ? `CONFIRMED FEATURES (from real product listings):\n${truth.confirmedFeatures.map(f => `  • ${f}`).join("\n")}`
    : "No confirmed features available.";

  const specsBlock = Object.keys(truth.confirmedSpecs).length > 0
    ? `CONFIRMED SPECS: ${JSON.stringify(truth.confirmedSpecs)}`
    : "";

  const accountBlock = buildAccountBlock(accountIdentity);

  const systemPrompt = `You are a viral UGC creator who makes "starving artist" style product review videos. Your videos look like a real person discovered a product, tried it, and filmed their genuine reaction. They are NOT polished ads — they feel raw, authentic, and personal.

${accountBlock}

YOUR CREATIVE PHILOSOPHY:
- Every video must feel like "I found this random thing and it actually works"
- You are NOT a brand. You are a regular person sharing a discovery.
- The viewer should feel like they're watching a friend's story, not an ad.
- Imperfection = trust. Slight messiness = authentic.
- Never use corporate language. Never say "introducing" or "revolutionary."
- The product must feel SPECIFIC and REAL — use actual features, actual price, actual details.

MANDATORY VIDEO STRUCTURE (every concept MUST follow this):
1. HOOK (0-2s) — Stop the scroll. Make them curious. Match the angle.
2. PROBLEM/CONTEXT (2-5s) — Why this matters. What sucked before.
3. DISCOVERY (5-8s) — "I found this on [platform]" / "someone told me about this"
4. DEMO (8-18s) — Show the product. Use REAL product images. Visual proof.
5. REACTION (18-22s) — Genuine surprise. "wait... this actually works?"
6. SOFT CTA (22-25s) — "link's in bio if you want it" — never pushy.

SCENE TYPES:
- "image_motion": Uses a REAL product photo with pan/zoom. REQUIRED for demo scenes. This is your most powerful tool — it makes the product feel REAL.
- "ai_generated": AI lifestyle/context shots. Use for problem/context scenes. Should look like phone-quality UGC, NOT cinematic.
- "text_overlay": Bold text on screen. Use sparingly (max 1 per video, for hook or reaction emphasis).

CRITICAL RULES:
1. MINIMUM 2 image_motion scenes per video using real product images
2. Each concept must use a DIFFERENT angle from: ${UGC_ANGLES.join(", ")}
3. Total video length: 15-25 seconds (short = higher retention)
4. Voiceover must sound like casual speech — fragments, pauses, "like", "honestly", "wait"
5. Caption must include 3-5 relevant hashtags
6. The hook determines everything — it must match the angle perfectly
7. NEVER mention AI, automation, or anything that breaks the illusion of a real review

REFERENCE ANGLES AND HOOKS:
- accidental_discovery: "okay I was NOT expecting this to actually work..."
- skeptic_converted: "I literally bought this as a joke but..."
- problem_solver: "if your [problem] is as bad as mine was..."
- comparison_shock: "I compared this $${price} one to the $80 version and..."
- gift_find: "I found the perfect gift and it's under $${price}..."
- aesthetic_upgrade: "my [space] literally went from a 3 to a 10..."
- hack_reveal: "nobody is talking about this but..."
- impulse_justified: "okay I know I didn't NEED this but..."
- before_after: "watch this transformation. I'm not kidding..."
- obsessed_review: "I've used this every single day for two weeks..."

OUTPUT: Return JSON: { "videos": [...] } with exactly 5 concepts.`;

  const userPrompt = `Create 5 UGC ad concepts for this REAL, CONFIRMED product:

PRODUCT: ${truth.canonicalName || truth.name}
${truth.confirmedBrand ? `BRAND: ${truth.confirmedBrand}` : ""}
${truth.description ? `DESCRIPTION: ${truth.description}` : ""}
${truth.category ? `CATEGORY: ${truth.category}` : ""}
RETAIL PRICE: ${price}
${truth.distinctiveAttributes.length > 0 ? `DISTINCTIVE ATTRIBUTES: ${truth.distinctiveAttributes.join(", ")}` : ""}

${featuresBlock}
${specsBlock}

${truth.marketingPlan ? `MARKETING INSIGHTS:
- Best Hook: ${(truth.marketingPlan as any).best_hook_type || "curiosity"}
- Audience: ${JSON.stringify((truth.marketingPlan as any).target_audience || {})}
- Angles: ${JSON.stringify((truth.marketingPlan as any).content_angles || [])}
- Emotional Triggers: ${JSON.stringify((truth.marketingPlan as any).emotional_triggers || [])}` : ""}

REAL PRODUCT IMAGES (use these in image_motion scenes — they are actual product photos):
${imageBlock}

${truth.purchaseUrl ? `PURCHASE: ${truth.purchaseUrl}` : "Use generic 'link in bio'"}

IMPORTANT: These are CONFIRMED product details from real retail listings. Use the actual features and specs in your scripts to make videos feel grounded and specific. Do NOT invent features that aren't listed.

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
      temperature: 0.85,
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
    angle: v.angle || "accidental_discovery",
    format: v.format || "ugc_review",
    scenes: (v.scenes || []).map(s => ({
      type: s.type || "image_motion",
      referenceImageUrl: s.referenceImageUrl,
      prompt: s.prompt || "",
      duration: s.duration || 3,
      onScreenText: s.onScreenText,
    })),
    voiceover: v.voiceover || "",
    caption: v.caption || "",
    cta: v.cta || "link in bio",
  }));
}
