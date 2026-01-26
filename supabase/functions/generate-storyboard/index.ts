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

type SceneRole = "hook" | "problem" | "story_a" | "reset" | "story_b" | "cta" | "atmosphere" | "establish";
type ChangeType = "info" | "emotion" | "goal" | "stakes" | "location";

interface GeneratedScene {
  prompt: string;
  duration_target: number;
  camera_direction: string;
  role: SceneRole;
  // Director Brain fields (Phase 1)
  change_type: ChangeType;
  narration_line?: string;
  onscreen_text?: string;
  is_hero_shot?: boolean;
}

interface GeneratedStoryboard {
  title: string;
  // Director Brain fields (Phase 1)
  story_spine: string;
  motif_anchors: string[];
  palette_keywords: string[];
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

NARRATIVE STRUCTURE (required):
- story_spine: One sentence capturing desire → tension → turn → payoff
  Example: "Person discovers creepy targeting → realizes data is being copied → maps exposure → regains control"
- motif_anchors: 2-3 recurring visual metaphors that appear across scenes
  Example: ["floating data strings", "shadow duplicate", "dissolving map pins"]
- palette_keywords: 3-5 color terms for visual consistency
  Example: ["cool blues", "warm highlights", "soft film grain"]

SCENE ROLES - Assign each scene a narrative role:
- "hook": Opening attention-grabber (2-4 seconds) - pattern interrupt, curiosity spike
- "problem": Show the pain point (4-6 seconds) - atmospheric mood, physics
- "story_a": First narrative beat (6-8 seconds) - establish the situation, cinematic
- "reset": Quick attention reset (2-3 seconds) - micro-cut, whip pan, dopamine hit
- "story_b": Payoff/reveal (6-10 seconds) - the hero moment, transformation
- "cta": Call to action (4-6 seconds) - proof, result, next step
- "atmosphere": Texture transition (3-5 seconds) - optional physics glue
- "establish": Wide establishing shot (4-6 seconds) - environment, context

CHANGE TYPE (required per scene) - What changes from the previous beat?
Every cut MUST change something meaningful (no montage drift):
- "info": New information revealed (we learn something)
- "emotion": Feeling/tone shift (face, body language, mood changes)
- "goal": What character wants changes (motivation shift)
- "stakes": Why it matters increases (tension rises)
- "location": Physical move with meaning (we move somewhere)

Choose roles based on narrative position and purpose. A typical 6-scene story uses:
hook → problem → story_a → reset → story_b → cta

For each scene, provide:
1. A detailed visual prompt (what's happening, composition, lighting, mood)
2. Suggested duration (match the role's recommended range)
3. Camera direction (movement, framing, lens suggestion)
4. Role assignment from the list above
5. change_type: What changes at this beat
6. narration_line (optional): TTS voiceover line for this beat
7. onscreen_text (optional): Text overlay if needed

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
- For HOOK/RESET scenes: Start with camera motion (e.g., "Whip pan:", "Tracking shot:")
- For STORY scenes: Use full cinematic description
- Reference motif_anchors in scene prompts for visual continuity

Respond ONLY with valid JSON in this exact format:
{
  "title": "Story title",
  "story_spine": "Person discovers X → tries Y → realizes Z → resolves with W",
  "motif_anchors": ["visual metaphor 1", "visual metaphor 2"],
  "palette_keywords": ["color 1", "color 2", "texture"],
  "scenes": [
    {
      "prompt": "Detailed visual description for video generation",
      "duration_target": 5,
      "camera_direction": "Camera movement and framing notes",
      "role": "story_a",
      "change_type": "info",
      "narration_line": "Optional TTS line for this beat",
      "onscreen_text": "Optional text overlay"
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
    const { concept, story_type = "short_story", scene_count, tier = "volume" } = body as GenerateRequest & { tier?: string };

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

    // Ensure Director Brain fields have defaults
    const storySpine = storyboard.story_spine || "";
    const motifAnchors = storyboard.motif_anchors || [];
    const paletteKeywords = storyboard.palette_keywords || [];

    // Auto-select hero shot (story_b preferred, else story_a)
    const hasStoryB = storyboard.scenes.some(s => s.role === "story_b");
    const heroRole = hasStoryB ? "story_b" : "story_a";

    // Add IDs and sequence to scenes, mark hero shot
    const scenesWithIds = storyboard.scenes.map((scene, i) => ({
      id: `scene_${Date.now()}_${i}`,
      ...scene,
      sequence_index: i,
      // Default change_type to "info" if not provided
      change_type: scene.change_type || "info",
      // Mark hero shot (one per story in volume tier)
      is_hero_shot: tier === "hero" 
        ? ["story_a", "story_b", "establish"].includes(scene.role)
        : scene.role === heroRole,
    }));

    return new Response(
      JSON.stringify({
        title: storyboard.title,
        story_spine: storySpine,
        motif_anchors: motifAnchors,
        palette_keywords: paletteKeywords,
        scenes: scenesWithIds,
        anchors: storyboard.anchors,
        tier, // Persist tier in storyboard output
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
