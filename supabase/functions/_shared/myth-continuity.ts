/**
 * Myth Mode - Storybook Narrative Engine
 * 
 * Inspired by "The Tale of the Three Brothers" from Harry Potter:
 * - Silhouette/shadow-puppet style visuals
 * - Parchment/paper texture aesthetic  
 * - Symbolic abstraction (no realistic faces)
 * - Third-person omniscient narrator
 * - Moral/fable ending structure
 * - 3-5 scenes with slow pacing
 */

// =============================================================================
// TYPES
// =============================================================================

export interface MythCharacter {
  archetype: string;         // "the wanderer", "the seeker", "the fool"
  silhouette: string;        // visual description for shadow rendering
  symbol?: string;           // associated visual symbol
}

export interface MythSetting {
  realm: string;             // "ancient forest", "realm of shadows"
  palette: string[];         // muted earth tones, parchment colors
  texture: string;           // "parchment", "woodcut", "ink wash"
}

export interface MythScene {
  id: string;
  index: number;
  
  // Narrative beat
  beat_type: "introduction" | "journey" | "trial" | "revelation" | "moral";
  narration: string;         // Third-person omniscient narration line
  
  // Visual description (symbolic, not realistic)
  visual_description: string;
  
  // No faces - silhouette only
  has_silhouette: boolean;
  silhouette_action?: string;  // What the silhouette does
  
  // Environment elements
  symbolic_elements: string[];  // "winding path", "looming shadow", "distant light"
  
  // Duration
  duration_seconds: number;
}

export interface MythStoryboard {
  title: string;
  premise: string;           // One-sentence fable premise
  moral: string;             // The lesson/insight at the end
  
  character: MythCharacter;
  setting: MythSetting;
  
  scenes: MythScene[];
}

// =============================================================================
// VISUAL STYLE ANCHORS (for Myth Mode prompts)
// =============================================================================

export const MYTH_STYLE_ANCHORS = [
  "flat silhouette illustration",
  "shadow-puppet animation style",
  "parchment paper texture",
  "2D cutout animation",
  "high contrast black and gold",
  "no facial details",
  "minimal background elements",
  "woodcut print aesthetic",
  "storybook illustration",
  "symbolic visual metaphor",
];

export const MYTH_NEGATIVE_ANCHORS = [
  "photorealistic",
  "detailed faces",
  "eyes",
  "mouth detail",
  "3D rendering",
  "modern clothing",
  "contemporary setting",
  "bright saturated colors",
  "complex backgrounds",
  "realistic lighting",
];

// =============================================================================
// MYTH PROMPT BUILDER
// =============================================================================

/**
 * Build a Myth Mode prompt with symbolic/silhouette constraints
 * 
 * Key differences from Film Mode:
 * - Always 2D/flat aesthetic
 * - Silhouettes instead of faces
 * - Symbolic environment elements
 * - Paper/parchment texture
 * - Slow, deliberate motion
 */
export function buildMythPrompt(
  scene: MythScene,
  storyboard: Partial<MythStoryboard>
): string {
  const parts: string[] = [];
  
  // 1. STYLE ANCHOR (always first - most important for model priming)
  parts.push("[STYLE: flat silhouette animation, shadow-puppet, parchment texture, 2D cutout, high contrast, storybook illustration]");
  
  // 2. PALETTE (muted, earth tones) - with defensive check
  const palette = storyboard.setting?.palette;
  if (palette && palette.length > 0) {
    parts.push(`[PALETTE: ${palette.join(", ")}]`);
  } else {
    // Default palette if not specified
    parts.push("[PALETTE: amber, charcoal, parchment, gold]");
  }
  
  // 3. SETTING (symbolic realm) - with defensive check
  const setting = storyboard.setting;
  if (setting?.realm) {
    parts.push(`REALM: ${setting.realm}, ${setting.texture || "parchment"} texture`);
  } else {
    parts.push("REALM: timeless realm, parchment texture");
  }
  
  // 4. SILHOUETTE (if present) - with defensive check
  const character = storyboard.character;
  if (scene.has_silhouette && scene.silhouette_action) {
    const archetype = character?.archetype || "wanderer";
    parts.push(`SILHOUETTE: ${archetype} — ${scene.silhouette_action}`);
    if (character?.symbol) {
      parts.push(`SYMBOL: ${character.symbol}`);
    }
  }
  
  // 5. VISUAL DESCRIPTION (symbolic, not literal)
  parts.push(`SCENE: ${scene.visual_description}`);
  
  // 6. SYMBOLIC ELEMENTS
  if (scene.symbolic_elements && scene.symbolic_elements.length > 0) {
    parts.push(`ELEMENTS: ${scene.symbolic_elements.join(", ")}`);
  }
  
  // 7. MOTION (slow, deliberate)
  parts.push("[MOTION: slow, deliberate, symbolic gesture, minimal movement]");
  
  // 8. NEGATIVE (what to avoid)
  parts.push("[AVOID: photorealistic, detailed face, eyes, 3D, modern elements]");
  
  return parts.join("\n");
}

// =============================================================================
// STORYBOARD GENERATION PROMPT
// =============================================================================

export function buildMythStoryboardPrompt(
  premise: string,
  sceneCount: number = 3
): string {
  return `You are creating a ${sceneCount}-scene mythic fable. Your ONLY job is to transform the user's premise into a symbolic, shadow-puppet story.

═══════════════════════════════════════════════════════════════════════════════
THE USER'S PREMISE (THIS IS THE STORY - DO NOT IGNORE)
═══════════════════════════════════════════════════════════════════════════════

"${premise}"

═══════════════════════════════════════════════════════════════════════════════

CRITICAL: The story MUST be about the premise above. Extract:
1. WHO is the main character? (from the premise, NOT a generic "wanderer")
2. WHAT do they want or fear? (from the premise)
3. WHAT happens to them? (from the premise)
4. WHAT is the lesson? (derive from the premise's theme)

If the premise says "a king who loses his crown" → the character is A KING, not a wanderer.
If the premise says "a child learning to fly" → the character is A CHILD, not a traveler.
If the premise says "greed destroys a merchant" → the character is A MERCHANT.

DO NOT DEFAULT TO GENERIC ARCHETYPES. USE WHAT THE PREMISE GIVES YOU.

VISUAL STYLE (shadow-puppet / silhouette):
- 2D flat animation, parchment texture, high contrast
- NO realistic faces - silhouettes only
- Symbolic elements (paths, shadows, light, objects)
- Muted palette: amber, charcoal, gold, deep blue, parchment

NARRATIVE STYLE:
- Third-person omniscient ("There once was...", "And so the king...", "In those days...")
- Timeless language, no modern slang
- Each scene is a narrative beat leading to a moral

SCENE STRUCTURE (${sceneCount} scenes):
- Scene 1: Introduction - establish WHO and WHAT THEY WANT
- Middle scenes: Journey/Trial - obstacles, choices, consequences  
- Final scene: Moral - the wisdom revealed

OUTPUT FORMAT (JSON):
{
  "title": "evocative title derived from the premise",
  "premise": "${premise}",
  "moral": "the lesson this specific story teaches",
  "character": {
    "archetype": "specific character FROM THE PREMISE (king/child/merchant/etc)",
    "silhouette": "visual description of their silhouette",
    "symbol": "object associated with their journey"
  },
  "setting": {
    "realm": "where this story takes place (derived from premise)",
    "palette": ["amber", "charcoal", "parchment", "gold"],
    "texture": "parchment"
  },
  "scenes": [
    {
      "index": 0,
      "beat_type": "introduction",
      "narration": "opening line that introduces THIS character and THIS story",
      "visual_description": "what we see (silhouette + symbolic environment)",
      "has_silhouette": true,
      "silhouette_action": "what the character physically does",
      "symbolic_elements": ["relevant symbols from the premise"],
      "duration_seconds": 7
    }
  ]
}

Remember: The premise "${premise}" IS the story. Don't invent a different story.`;
}

// =============================================================================
// BEAT TYPE CONFIGS
// =============================================================================

export const MYTH_BEAT_CONFIGS = {
  introduction: {
    typical_duration: 7,
    camera: "slow push in",
    motion: "minimal, establishing",
  },
  journey: {
    typical_duration: 6,
    camera: "slow track",
    motion: "walking, traveling",
  },
  trial: {
    typical_duration: 8,
    camera: "static with tension",
    motion: "confrontation, hesitation",
  },
  revelation: {
    typical_duration: 7,
    camera: "slow crane up",
    motion: "realization gesture",
  },
  moral: {
    typical_duration: 8,
    camera: "slow pull back",
    motion: "settling, completion",
  },
};

// =============================================================================
// NARRATOR VOICE CONFIG
// =============================================================================

export const MYTH_NARRATOR_CONFIG = {
  voice_preset: "mythic_narrator",
  voice_style: "calm, measured, almost biblical",
  pacing: "slow with deliberate pauses",
  tone: "timeless, authoritative, wise",
  avoid: ["urgency", "hype", "modern slang", "direct instruction"],
};
