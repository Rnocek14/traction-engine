/**
 * generate-storyboard
 * 
 * Uses GPT-4o to generate a complete multi-scene storyboard
 * from a simple concept or description.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GenerateRequest {
  concept: string;
  story_type?: "short_story" | "brainrot" | "info" | "hybrid";
  scene_count?: number;
}

interface GeneratedScene {
  prompt: string;
  duration_target: number;
  camera_direction: string;
}

interface GeneratedStoryboard {
  title: string;
  scenes: GeneratedScene[];
  anchors: {
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
    negative_list: string[];
  };
}

const STORY_TYPE_GUIDANCE: Record<string, string> = {
  short_story: `Create a narrative arc with beginning, middle, and end. 
    Focus on character continuity and emotional journey. 
    Pacing should be medium with 4-6 scenes of 5-8 seconds each.`,
  brainrot: `Fast-paced, attention-grabbing content with quick cuts.
    Each scene should be visually distinct and high-energy.
    Use 5-8 very short scenes of 3-4 seconds each.`,
  info: `Educational or informational content with clear visual demonstrations.
    Focus on clarity and visual metaphors.
    Use 3-5 scenes of 5-6 seconds each.`,
  hybrid: `Mix of narrative and informational elements.
    Balance storytelling with key information.
    Use 4-5 scenes of 5-6 seconds each.`,
};

const SYSTEM_PROMPT = `You are an expert cinematographer and storyboard artist. Given a concept, create a complete video storyboard with multiple scenes.

For each scene, provide:
1. A detailed visual prompt (what's happening, composition, lighting, mood)
2. Suggested duration (3-8 seconds)
3. Camera direction (movement, framing, lens suggestion)

Also extract continuity anchors:
- Character details (if any characters appear)
- Environment/location consistency
- Camera language (preferred lens, movement style)
- Negative list (artifacts to avoid)

IMPORTANT PROMPT GUIDELINES:
- Be specific and visual - describe what the camera SEES
- Include lighting, atmosphere, and mood
- Mention camera movement and framing
- Keep each prompt focused on ONE clear action/moment
- Avoid abstract concepts - make it concrete and filmable
- Use cinematic language (wide shot, close-up, tracking, etc.)

Respond ONLY with valid JSON in this exact format:
{
  "title": "Story title",
  "scenes": [
    {
      "prompt": "Detailed visual description for video generation",
      "duration_target": 5,
      "camera_direction": "Camera movement and framing notes"
    }
  ],
  "anchors": {
    "character": {
      "description": "Physical description or empty string if no character",
      "wardrobe": "Clothing details or empty string",
      "identity_lock_tokens": ["distinctive", "features"]
    },
    "environment": {
      "location": "Setting description",
      "time_of_day": "golden_hour",
      "props": ["key", "props"]
    },
    "camera_language": {
      "lens": "50mm",
      "movement_style": "smooth",
      "framing_rules": "Framing guidance"
    },
    "negative_list": ["flicker", "jitter", "identity drift", "morph"]
  }
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const body = await req.json() as GenerateRequest;
    const { concept, story_type = "short_story", scene_count } = body;

    if (!concept?.trim()) {
      return new Response(
        JSON.stringify({ error: "concept required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const typeGuidance = STORY_TYPE_GUIDANCE[story_type] || STORY_TYPE_GUIDANCE.short_story;
    const sceneGuidance = scene_count ? `Create exactly ${scene_count} scenes.` : "";

    const userPrompt = `Create a storyboard for this concept:

"${concept}"

Story Type: ${story_type}
${typeGuidance}
${sceneGuidance}

Generate a complete, filmable storyboard with vivid, specific visual prompts for each scene.`;

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
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    let storyboard: GeneratedStoryboard;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }
      storyboard = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      throw new Error("Failed to parse storyboard response");
    }

    // Ensure negative_list always has base items
    const baseNegatives = ["flicker", "jitter", "identity drift", "morph"];
    if (storyboard.anchors) {
      storyboard.anchors.negative_list = [
        ...new Set([...(storyboard.anchors.negative_list || []), ...baseNegatives])
      ];
    }

    // Add IDs to scenes
    const scenesWithIds = storyboard.scenes.map((scene, i) => ({
      id: `scene_${Date.now()}_${i}`,
      ...scene,
      sequence_index: i,
    }));

    return new Response(
      JSON.stringify({
        title: storyboard.title,
        scenes: scenesWithIds,
        anchors: storyboard.anchors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("generate-storyboard error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
