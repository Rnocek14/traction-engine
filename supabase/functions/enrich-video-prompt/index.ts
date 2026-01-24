import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EnrichRequest {
  prompt: string;
  provider?: "sora" | "runway" | "luma";
  style_hints?: string;
}

const SYSTEM_PROMPT = `You are a cinematographer writing video generation prompts for AI video models.

Given a concept, create a rich, photorealistic video prompt that includes:
1. SUBJECT: Who/what is the main focus? Be specific (person, vehicle, animal, object).
2. ACTION: What motion is happening? Describe the movement dynamically.
3. ENVIRONMENT: Where is this? Time of day, weather, setting details.
4. CAMERA: Shot type (close-up, wide, tracking, aerial), movement (pan, dolly, static, handheld).
5. LIGHTING: Natural light, golden hour, dramatic shadows, neon, etc.
6. MOOD: The emotional feel of the scene.

CRITICAL RULES:
- Always describe REAL, PHOTOREALISTIC content only
- NEVER use words like "animated", "3D render", "cartoon", "illustration", "CGI", "digital art"
- Focus on ONE continuous 5-10 second moment
- Keep under 100 words total
- Make it visually specific and filmable
- Describe what the CAMERA SEES, not abstract concepts
- Include motion verbs: glides, rushes, sweeps, drifts, accelerates
- Avoid UI elements, text overlays, or screen recordings

Output ONLY the enriched prompt, nothing else.`;

const PROVIDER_HINTS: Record<string, string> = {
  sora: "\n\nOptimize for Sora: Use detailed 'Director's Brief' style with specific lens choices, color grading hints, and cinematic terminology.",
  runway: "\n\nOptimize for Runway: Focus on motion and action. Be concise but motion-rich. Emphasize what MOVES and HOW.",
  luma: "\n\nOptimize for Luma: Emphasize physics-based motion, environmental interactions, and natural movement. Describe how elements flow and interact.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, provider, style_hints } = await req.json() as EnrichRequest;

    if (!prompt || prompt.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Prompt is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build system prompt with optional provider hints
    let systemPrompt = SYSTEM_PROMPT;
    if (provider && PROVIDER_HINTS[provider]) {
      systemPrompt += PROVIDER_HINTS[provider];
    }

    // Build user message
    let userMessage = `Concept: "${prompt}"`;
    if (style_hints) {
      userMessage += `\n\nStyle hints to incorporate: ${style_hints}`;
    }

    console.log(`Enriching prompt for ${provider || "general"}: "${prompt.substring(0, 50)}..."`);

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
          { role: "user", content: userMessage },
        ],
        temperature: 0.8,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to enrich prompt", details: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const enrichedPrompt = data.choices?.[0]?.message?.content?.trim();

    if (!enrichedPrompt) {
      console.error("No content in OpenAI response:", data);
      return new Response(
        JSON.stringify({ error: "No enriched prompt generated", original: prompt, enriched: prompt }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Enriched: "${enrichedPrompt.substring(0, 80)}..."`);

    return new Response(
      JSON.stringify({
        original: prompt,
        enriched: enrichedPrompt,
        provider: provider || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error enriching prompt:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
