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
  // Inject variety - pick random archetype and opening style
  const archetypes = [
    "a young shepherd", "an old king", "a clever merchant", "a grieving mother",
    "a blind oracle", "a humble potter", "a proud knight", "a curious child",
    "a banished prince", "a weary soldier", "a starving artist", "a silent monk",
    "a defiant queen", "a forgotten god", "a dying tree", "a river that remembered",
  ];
  const openings = [
    "In the days when shadows still spoke",
    "Before the moon forgot its name",
    "Long ago, in a land swallowed by silence",
    "When the world was young and hungry",
    "In the twilight of an age now forgotten",
    "There lived, in the hollows of the earth",
    "Once, beneath stars that have since burned out",
    "In a time when choices left scars",
  ];
  const titlePatterns = [
    "The [Character]'s Bargain",
    "What the [Object] Remembered", 
    "The Last [Object] of [Place]",
    "[Character] and the [Challenge]",
    "The [Object] That Could Not [Verb]",
    "How [Character] Found [Abstract]",
    "The Price of [Abstract]",
    "When [Character] Met [Entity]",
  ];
  
  const suggestedArchetype = archetypes[Math.floor(Math.random() * archetypes.length)];
  const suggestedOpening = openings[Math.floor(Math.random() * openings.length)];
  const suggestedTitlePattern = titlePatterns[Math.floor(Math.random() * titlePatterns.length)];

  return `Generate a ${sceneCount}-scene mythic fable storyboard in the style of ancient oral traditions.

PREMISE: ${premise}

VARIETY REQUIREMENT (CRITICAL):
- Do NOT start with "There once was a traveler who sought..."
- Do NOT use "wanderer" as the archetype unless the premise explicitly calls for it
- Suggested archetype (use or invent your own): "${suggestedArchetype}"
- Suggested opening phrase: "${suggestedOpening}..."
- Suggested title pattern: "${suggestedTitlePattern}"
- Make this story feel UNIQUE - different character, different moral, different journey

STYLE RULES:
1. This is a FABLE told through symbolic silhouette animation
2. NO realistic faces - only silhouettes and shadows
3. Third-person omniscient narration (like a legend being told)
4. Each scene is a "beat" in a moral journey
5. End with a clear moral/insight (not a call-to-action)
6. Slow pacing - 6-8 seconds per scene
7. Visual style: shadow-puppet, parchment texture, 2D cutout, high contrast

BEAT TYPES:
- "introduction": Establish the character and their desire
- "journey": The path taken, choices made
- "trial": Obstacle or temptation faced
- "revelation": Truth discovered or lesson learned
- "moral": The wisdom distilled (final scene only)

NARRATIVE CONSTRAINTS:
- No modern slang or "you should..." advice
- Use timeless language but VARY your openings
- End with implied wisdom, not explicit instruction

VISUAL CONSTRAINTS:
- Silhouettes only (no facial features)
- Symbolic elements (not literal)
- Muted palette (amber, shadow, parchment, gold, charcoal)
- Paper/parchment texture, minimal backgrounds
- Slow, deliberate motion

OUTPUT JSON:
{
  "title": "unique evocative title",
  "premise": "one sentence fable premise",
  "moral": "the wisdom this story teaches",
  "character": {
    "archetype": "specific character (NOT 'the wanderer' unless premise requires it)",
    "silhouette": "distinct visual description",
    "symbol": "unique associated symbol"
  },
  "setting": {
    "realm": "specific evocative place",
    "palette": ["color1", "color2", "color3", "color4"],
    "texture": "parchment / woodcut / ink wash"
  },
  "scenes": [
    {
      "index": 0,
      "beat_type": "introduction",
      "narration": "opening narration (DO NOT start with 'There once was a traveler')",
      "visual_description": "symbolic visual scene",
      "has_silhouette": true,
      "silhouette_action": "what the character does",
      "symbolic_elements": ["element1", "element2"],
      "duration_seconds": 7
    }
  ]
}`;
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
