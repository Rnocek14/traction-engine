import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface AccountConfig {
  account_id: string;
  vertical: string;
  persona: { tone: string; vibe: string };
  audience: { who: string; pain_points: string[] };
  promise: string;
  content_pillars: string[];
  banned_topics: string[];
  claim_policy: string;
  cta_style: string;
  cta_phrases: string[];
  style_rules: {
    max_length_seconds: number;
    pacing: string;
    profanity: boolean;
    emoji_allowed: boolean;
  };
  disclaimer_rules: {
    always_required: boolean;
    trigger_keywords: string[];
  };
}

interface Topic {
  id: string;
  topic_prompt: string;
  hook_variants: string[];
  pillar: string;
  motif_hints: string[];
  suggested_cta?: string;
}

interface ScriptContent {
  hook: string;
  voiceover: string;
  on_screen_text: Array<{ timestamp: number; text: string }>;
  scene_prompts: string[];
  broll_keywords: string[];
  caption: string;
  hashtags: string[];
  cta: string;
  disclaimer?: string;
}

interface GenerateRequest {
  account_config: AccountConfig;
  topic: Topic;
}

function buildSystemPrompt(config: AccountConfig): string {
  const disclaimerNote = config.vertical === "health" 
    ? "\n\nCRITICAL: This is health content. You MUST include a disclaimer. NEVER use words like 'cure', 'heal', 'treatment', 'diagnosis', or make medical claims. Focus on emotional support, community, and general wellness. Always suggest consulting healthcare providers."
    : config.disclaimer_rules.always_required
    ? "\n\nInclude a disclaimer in your response."
    : "";

  const bannedNote = config.banned_topics.length > 0
    ? `\n\nNEVER mention these topics: ${config.banned_topics.join(", ")}`
    : "";

  return `You are a content scriptwriter for short-form video (TikTok/Instagram Reels).

ACCOUNT PROFILE:
- Vertical: ${config.vertical}
- Persona Tone: ${config.persona.tone}
- Persona Vibe: ${config.persona.vibe}
- Target Audience: ${config.audience.who}
- Audience Pain Points: ${config.audience.pain_points.join(", ")}
- Content Promise: ${config.promise}
- Content Pillars: ${config.content_pillars.join(", ")}
- CTA Style: ${config.cta_style}
- Max Length: ${config.style_rules.max_length_seconds} seconds (~${Math.round(config.style_rules.max_length_seconds * 2.5)} words)
- Pacing: ${config.style_rules.pacing}
- Emoji Allowed: ${config.style_rules.emoji_allowed}
${bannedNote}${disclaimerNote}

APPROVED CTAs (use one of these): ${config.cta_phrases.join(" | ")}

OUTPUT RULES:
1. Hook MUST be specific - include concrete objects (phone, settings, resume, etc.) or numbers
2. Hook should NOT be vague like "Did you know this?" or "Here's a tip"
3. Voiceover should be conversational and match the persona tone
4. Keep voiceover under ${Math.round(config.style_rules.max_length_seconds * 2.5)} words
5. Scene prompts should be detailed enough for AI video generation
6. CTA must be from the approved list above
7. Return ONLY valid JSON, no markdown`;
}

function buildUserPrompt(topic: Topic, config: AccountConfig): string {
  const hookOptions = topic.hook_variants.length > 0
    ? `\n\nHook inspiration (use as starting point, improve it):\n${topic.hook_variants.map((h, i) => `${i + 1}. ${h}`).join("\n")}`
    : "";

  return `Generate a script for this topic:

TOPIC: ${topic.topic_prompt}
PILLAR: ${topic.pillar}
VISUAL HINTS: ${topic.motif_hints.join(", ") || "none specified"}
${hookOptions}

Return JSON in this exact schema:
{
  "hook": "Opening 2 seconds - specific, attention-grabbing",
  "voiceover": "Full script text for TTS",
  "on_screen_text": [
    {"timestamp": 0, "text": "Key phrase 1"},
    {"timestamp": 5, "text": "Key phrase 2"}
  ],
  "scene_prompts": [
    "Detailed scene description for AI video generation"
  ],
  "broll_keywords": ["keyword1", "keyword2"],
  "caption": "Caption for the post",
  "hashtags": ["tag1", "tag2"],
  "cta": "One of the approved CTAs",
  "disclaimer": ${config.vertical === "health" || config.disclaimer_rules.always_required ? '"Required disclaimer text"' : "null or omit if not needed"}
}`;
}

async function generateWithOpenAI(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string
): Promise<ScriptContent> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4-turbo-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 1500,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;

  if (!content) {
    throw new Error("No content returned from OpenAI");
  }

  const parsed = JSON.parse(content);
  
  // Validate required fields
  if (!parsed.hook || !parsed.voiceover || !parsed.cta) {
    throw new Error("Missing required fields in generated script");
  }

  // Ensure arrays exist
  return {
    hook: parsed.hook,
    voiceover: parsed.voiceover,
    on_screen_text: parsed.on_screen_text || [],
    scene_prompts: parsed.scene_prompts || [],
    broll_keywords: parsed.broll_keywords || [],
    caption: parsed.caption || "",
    hashtags: parsed.hashtags || [],
    cta: parsed.cta,
    disclaimer: parsed.disclaimer || undefined,
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const { account_config, topic }: GenerateRequest = await req.json();

    if (!account_config || !topic) {
      return new Response(
        JSON.stringify({ error: "Missing account_config or topic" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = buildSystemPrompt(account_config);
    const userPrompt = buildUserPrompt(topic, account_config);

    console.log("Generating script for account:", account_config.account_id);
    console.log("Topic:", topic.topic_prompt);

    const scriptContent = await generateWithOpenAI(systemPrompt, userPrompt, apiKey);

    console.log("Script generated successfully");

    return new Response(
      JSON.stringify({
        success: true,
        script_content: scriptContent,
        generation_cost_cents: 3, // Approximate cost for GPT-4 turbo
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating script:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
