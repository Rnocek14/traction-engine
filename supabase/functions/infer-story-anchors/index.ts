/**
 * infer-story-anchors
 * 
 * Uses GPT-4o to analyze scene prompts and extract consistent
 * character, environment, and camera details for story continuity.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InferRequest {
  scene_prompts: string;
}

interface InferredAnchors {
  character?: {
    description: string;
    wardrobe: string;
    identity_lock_tokens: string[];
  };
  environment?: {
    location: string;
    time_of_day: string;
    props: string[];
  };
  camera_language?: {
    lens: string;
    movement_style: string;
    framing_rules: string;
  };
  negative_list?: string[];
}

const SYSTEM_PROMPT = `You are a cinematography and continuity expert. Analyze the provided scene descriptions and extract consistent details that should be maintained across all scenes.

Your job is to infer:
1. CHARACTER: Physical description, wardrobe, and key identity tokens (distinctive features that must stay consistent)
2. ENVIRONMENT: Location setting, time of day, and key props that appear
3. CAMERA LANGUAGE: Suggested lens (24mm/35mm/50mm/85mm/135mm), movement style (static/smooth/handheld/dolly/crane/drone), and framing rules
4. NEGATIVE LIST: Visual artifacts to avoid (always include: flicker, jitter, identity drift, morph)

If scenes don't mention characters, leave character fields empty.
If scenes are abstract or don't have a clear setting, make reasonable inferences.
Be concise but specific - these will be used to maintain visual consistency.

Respond ONLY with valid JSON in this exact format:
{
  "character": {
    "description": "Brief physical description or empty string",
    "wardrobe": "Clothing/accessories or empty string",
    "identity_lock_tokens": ["distinctive", "features", "list"]
  },
  "environment": {
    "location": "Setting description",
    "time_of_day": "dawn|morning|midday|golden_hour|dusk|night",
    "props": ["key", "props", "list"]
  },
  "camera_language": {
    "lens": "50mm",
    "movement_style": "smooth",
    "framing_rules": "Framing guidance"
  },
  "negative_list": ["flicker", "jitter", "identity drift", "morph"]
}`;

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const body = await req.json() as InferRequest;
    const { scene_prompts } = body;

    if (!scene_prompts?.trim()) {
      return new Response(
        JSON.stringify({ error: "scene_prompts required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call GPT-4o to analyze scenes
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Analyze these scene descriptions and extract continuity anchors:\n\n${scene_prompts}` },
        ],
        temperature: 0.3,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse JSON response
    let anchors: InferredAnchors;
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }
      anchors = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      // Return sensible defaults
      anchors = {
        environment: {
          location: "Cinematic setting",
          time_of_day: "golden_hour",
          props: [],
        },
        camera_language: {
          lens: "50mm",
          movement_style: "smooth",
          framing_rules: "16:9 cinematic framing, rule of thirds",
        },
        negative_list: ["flicker", "jitter", "identity drift", "morph"],
      };
    }

    // Ensure negative_list always has base items
    const baseNegatives = ["flicker", "jitter", "identity drift", "morph"];
    anchors.negative_list = [
      ...new Set([...(anchors.negative_list || []), ...baseNegatives])
    ];

    return new Response(
      JSON.stringify(anchors),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("infer-story-anchors error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        // Return defaults on error
        environment: {
          location: "Cinematic setting",
          time_of_day: "golden_hour",
          props: [],
        },
        camera_language: {
          lens: "50mm",
          movement_style: "smooth",
          framing_rules: "16:9 cinematic framing",
        },
        negative_list: ["flicker", "jitter", "identity drift", "morph"],
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
