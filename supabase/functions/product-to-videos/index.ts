/**
 * Product-to-Videos: Bridge between product discovery and video production.
 * 
 * Takes a product_id, fetches verified images + marketing plan,
 * uses GPT to generate 3-5 structured video concepts with diverse angles,
 * and returns them for preview/approval before queueing.
 * 
 * Two modes:
 * 1. "generate" - Generate concepts (returns JSON for preview)
 * 2. "queue"    - Queue approved concepts as story_jobs + video generation
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

const VIDEO_FORMATS = [
  "slideshow_ad",
  "ugc_review",
  "problem_solution",
  "comparison",
  "curiosity_reveal",
];

const ANGLE_DIVERSITY = [
  "Problem → Solution: Open with the pain point, reveal product as the fix",
  "Curiosity Hook: Start with an intriguing question or shocking fact",
  "Social Proof: 'TikTok made me buy it' or review-style testimonial",
  "Comparison: Before/after or cheap vs this product",
  "Visual Demo: Pure product demonstration with wow factor",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    
    if (!openaiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body = await req.json();
    const { product_id, mode = "generate", approved_concepts, account_id } = body;

    if (!product_id) {
      throw new Error("product_id is required");
    }

    // Fetch product data
    const { data: product, error: prodError } = await supabase
      .from("products")
      .select("*")
      .eq("id", product_id)
      .single();

    if (prodError || !product) {
      throw new Error("Product not found");
    }

    // Fetch images — priority: pinned_supplier > verified > any
    let { data: images } = await supabase
      .from("product_images")
      .select("*")
      .eq("product_id", product_id)
      .eq("source", "pinned_supplier")
      .order("is_primary", { ascending: false })
      .limit(8);

    // If no pinned supplier images, try verified/approved
    if (!images || images.length === 0) {
      const { data: verifiedImages } = await supabase
        .from("product_images")
        .select("*")
        .eq("product_id", product_id)
        .or("verified.eq.true,manually_approved.eq.true")
        .order("is_primary", { ascending: false })
        .limit(8);
      images = verifiedImages || [];
    }

    // If no verified images, try all images
    if (images.length === 0) {
      const { data: allImages } = await supabase
        .from("product_images")
        .select("*")
        .eq("product_id", product_id)
        .order("is_primary", { ascending: false })
        .limit(8);
      images = allImages || [];
    }

    // Fall back to product.image_url if no images in table
    if (images.length === 0 && product.image_url) {
      images = [{ url: product.image_url, label: "hero", is_primary: true }] as any;
    }

    if (images.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "No product images found. Run AI Research first to scrape product images, or add images manually.",
          image_count: 0,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (mode === "generate") {
      // MODE 1: Generate concepts for preview
      const concepts = await generateConcepts(product, images, openaiKey);
      
      return new Response(
        JSON.stringify({ success: true, concepts, image_count: images.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (mode === "queue") {
      // MODE 2: Queue approved concepts as story_jobs
      if (!approved_concepts || !Array.isArray(approved_concepts) || approved_concepts.length === 0) {
        throw new Error("approved_concepts array is required for queue mode");
      }
      if (!account_id) {
        throw new Error("account_id is required for queue mode");
      }

      const jobIds: string[] = [];

      for (const concept of approved_concepts as VideoConcept[]) {
        // Build storyboard JSON from concept scenes
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
          .from("story_jobs")
          .insert({
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
          })
          .select("id")
          .single();

        if (jobError) {
          console.error("Error creating story_job:", jobError);
          continue;
        }

        jobIds.push(job.id);
      }

      return new Response(
        JSON.stringify({ success: true, job_ids: jobIds, queued: jobIds.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error(`Unknown mode: ${mode}. Use 'generate' or 'queue'.`);

  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("product-to-videos error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function generateConcepts(
  product: Record<string, unknown>,
  images: Array<Record<string, unknown>>,
  openaiKey: string
): Promise<VideoConcept[]> {
  const marketingPlan = product.marketing_plan as Record<string, unknown> | null;
  
  const imageList = images.map((img, i) => ({
    index: i + 1,
    url: img.url,
    label: img.label || "hero",
    is_primary: img.is_primary,
  }));

  const systemPrompt = `You are a TikTok/Reels ad creative director. You generate structured video concepts that sell physical products using short-form video.

CRITICAL RULES:
1. Each video MUST visually demonstrate the product within the FIRST 2 SECONDS
2. Use the provided product images as reference frames (image_motion scenes)
3. Every concept must use a DIFFERENT angle from the list provided
4. Keep total video length between 15-30 seconds
5. Scenes should be 3-5 seconds each
6. The hook text must stop the scroll — be specific, not generic
7. Voiceover must be conversational, not salesy

AVAILABLE FORMATS: ${VIDEO_FORMATS.join(", ")}

SCENE TYPES:
- "image_motion": Uses a product photo with pan/zoom/motion effects (PREFERRED for product shots)
- "ai_generated": AI-generated video clip from prompt (use for lifestyle/context shots)
- "text_overlay": Bold text on dark background (use sparingly, for hooks or stats)

OUTPUT: Return a JSON array of exactly 5 video concepts. Each must have a different angle.`;

  const userPrompt = `Generate 5 TikTok ad concepts for this product:

PRODUCT: ${product.name}
${product.short_description ? `DESCRIPTION: ${product.short_description}` : ""}
${product.category ? `CATEGORY: ${product.category}` : ""}
PRICE: $${((product.price_cents as number) || 0) / 100}

${marketingPlan ? `MARKETING INSIGHTS:
- Best Hook Type: ${(marketingPlan as any).best_hook_type || "not specified"}
- Best First 3 Seconds: ${(marketingPlan as any).best_first_3_seconds || "not specified"}
- Target Audience: ${JSON.stringify((marketingPlan as any).target_audience || {})}
- Key Angles: ${JSON.stringify((marketingPlan as any).content_angles || [])}
- Emotional Triggers: ${JSON.stringify((marketingPlan as any).emotional_triggers || [])}` : "No marketing plan available — use your best judgment."}

${product.purchase_url ? `PURCHASE URL: ${product.purchase_url}
IMPORTANT: Use this exact URL in all CTAs. Example: "Shop now → ${product.purchase_url}" or "Link in bio"` : "No purchase URL set — use generic CTA like 'Link in bio | Shop now'"}

AVAILABLE PRODUCT IMAGES (use their URLs as referenceImageUrl):
${imageList.map(img => `  ${img.index}. [${img.label}${img.is_primary ? " PRIMARY" : ""}] ${img.url}`).join("\n")}

REQUIRED ANGLES (one per video, in this order):
${ANGLE_DIVERSITY.map((a, i) => `${i + 1}. ${a}`).join("\n")}

Return ONLY valid JSON matching this schema:
{
  "videos": [
    {
      "hook": "scroll-stopping opening line",
      "angle": "Problem → Solution",
      "format": "problem_solution",
      "scenes": [
        {
          "type": "image_motion",
          "referenceImageUrl": "https://...",
          "prompt": "Slow zoom into product hero shot, warm lighting...",
          "duration": 3,
          "onScreenText": "optional bold text overlay"
        }
      ],
      "voiceover": "Full voiceover script for the video",
      "caption": "Post caption with hashtags",
      "cta": "Link in bio | Shop now"
    }
  ]
}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
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

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  
  if (!content) {
    throw new Error("No response from GPT");
  }

  const parsed = JSON.parse(content);
  const videos: VideoConcept[] = parsed.videos || parsed;

  // Validate structure
  if (!Array.isArray(videos) || videos.length === 0) {
    throw new Error("GPT returned invalid structure — no videos array");
  }

  // Ensure each concept has required fields
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
