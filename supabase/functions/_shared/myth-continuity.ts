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
  
  // Get beat-specific config for motion variety
  const beatConfig = MYTH_BEAT_CONFIGS[scene.beat_type] || MYTH_BEAT_CONFIGS.journey;
  
  // 1. STYLE ANCHOR (always first - most important for model priming)
  parts.push("[STYLE: flat silhouette animation, shadow-puppet, parchment texture, 2D cutout, high contrast, storybook illustration]");
  
  // 2. PALETTE (muted, earth tones) - with defensive check
  const palette = storyboard.setting?.palette;
  if (palette && palette.length > 0) {
    parts.push(`[PALETTE: ${palette.join(", ")}]`);
  } else {
    parts.push("[PALETTE: amber, charcoal, parchment, gold]");
  }
  
  // 3. SETTING (symbolic realm) - with defensive check
  const setting = storyboard.setting;
  if (setting?.realm) {
    parts.push(`REALM: ${setting.realm}, ${setting.texture || "parchment"} texture`);
  } else {
    parts.push("REALM: timeless realm, parchment texture");
  }
  
  // 4. CAMERA (beat-specific movement)
  parts.push(`[CAMERA: ${beatConfig.camera}]`);
  
  // 5. SILHOUETTE WITH ACTION (if present) - with defensive check
  const character = storyboard.character;
  if (scene.has_silhouette && scene.silhouette_action) {
    const archetype = character?.archetype || "figure";
    parts.push(`SILHOUETTE: ${archetype} — ${scene.silhouette_action}`);
    if (character?.symbol) {
      parts.push(`SYMBOL: ${character.symbol}`);
    }
  }
  
  // 6. VISUAL DESCRIPTION (symbolic, not literal)
  parts.push(`SCENE: ${scene.visual_description}`);
  
  // 7. SYMBOLIC ELEMENTS
  if (scene.symbolic_elements && scene.symbolic_elements.length > 0) {
    parts.push(`ELEMENTS: ${scene.symbolic_elements.join(", ")}`);
  }
  
  // 8. MOTION (beat-specific - this is the key fix for "boring" videos)
  parts.push(beatConfig.motion_anchor);
  
  // 9. TRANSFORMATION (what visibly changes during this scene)
  const transformHint = getTransformationHint(scene.beat_type);
  if (transformHint) {
    parts.push(`[TRANSFORMATION: ${transformHint}]`);
  }
  
  // 10. NEGATIVE (what to avoid)
  parts.push("[AVOID: photorealistic, detailed face, eyes, 3D, modern elements, static poses]");
  
  return parts.join("\n");
}

/**
 * Get a transformation hint based on beat type to ensure visible change
 */
function getTransformationHint(beatType: string): string {
  const hints: Record<string, string> = {
    introduction: "scene starts dark/empty, figure/elements gradually revealed",
    journey: "figure moves from point A to B, environment scrolls or shifts",
    trial: "start hopeful, end defeated — posture and environment both change",
    revelation: "darkness to light, confusion to clarity, closed to open gesture",
    consequence: "full to empty, present to absent, together to scattered",
    moral: "tension to peace, chaos to stillness, small figure against vast backdrop",
  };
  return hints[beatType] || "visible change from start to end of scene";
}

// =============================================================================
// STORYBOARD GENERATION PROMPT
// =============================================================================

export function buildMythStoryboardPrompt(
  premise: string,
  sceneCount: number = 3
): string {
  return `You are creating a ${sceneCount}-scene mythic fable. Transform the premise into a VISUALLY DYNAMIC shadow-puppet story.

═══════════════════════════════════════════════════════════════════════════════
THE USER'S PREMISE (THIS IS THE STORY - DO NOT IGNORE)
═══════════════════════════════════════════════════════════════════════════════

"${premise}"

═══════════════════════════════════════════════════════════════════════════════

CRITICAL - EXTRACT FROM PREMISE:
1. WHO is the main character? (from the premise, NOT generic "wanderer")
2. WHAT do they want or fear?
3. WHAT happens to them?
4. WHAT is the lesson?

═══════════════════════════════════════════════════════════════════════════════
⚠️ ANTI-BORING RULES (MOST IMPORTANT)
═══════════════════════════════════════════════════════════════════════════════

Each scene MUST have VISIBLE PHYSICAL ACTION that creates CHANGE:

❌ BORING: "The figure stands contemplating the coins"
✅ DYNAMIC: "The figure lunges forward, grasping — coins slip through fingers, scatter across the floor"

❌ BORING: "The marketplace grows dim around the figure"  
✅ DYNAMIC: "Coins rain from above, the figure catches them frantically, then watches helplessly as they transform to dust mid-air"

❌ BORING: "The figure sits with the empty ledger"
✅ DYNAMIC: "The figure hurls the ledger — pages explode outward like startled birds, flutter, fall silent"

EVERY silhouette_action MUST:
- Use PHYSICAL VERBS: lunges, grasps, hurls, catches, drops, crumbles, scatters, reaches, falls, rises, turns, runs, climbs
- Show TRANSFORMATION: "A becomes B" — coins to dust, full to empty, standing to fallen, darkness to light
- Create VISUAL CHANGE: the end-frame must look DIFFERENT from the start-frame

EVERY visual_description MUST include:
- Something MOVING (figure, objects, environment elements)
- A CHANGE happening (light shifting, objects transforming, space expanding/contracting)
- CONTRAST (high to low, hope to despair, full to empty)

═══════════════════════════════════════════════════════════════════════════════

VISUAL STYLE (shadow-puppet / silhouette):
- 2D flat animation, parchment texture, high contrast
- NO realistic faces - silhouettes only
- Symbolic elements with PHYSICAL PRESENCE (they can move, fall, shatter)
- Muted palette: amber, charcoal, gold, deep blue, parchment

SCENE STRUCTURE (${sceneCount} scenes):
Beat types: introduction, journey, trial, consequence, moral
- Introduction: figure ENTERS/EMERGES, desire made visible
- Journey: figure MOVES toward goal, reaches, climbs, pursues
- Trial: STRUGGLE visible — grasping, losing, failing
- Consequence: AFTERMATH — things fall, scatter, vanish, empty
- Moral: TRANSFORMATION complete — final posture shift, acceptance

OUTPUT FORMAT (JSON):
{
  "title": "evocative title derived from the premise",
  "premise": "${premise}",
  "moral": "the lesson this specific story teaches",
  "character": {
    "archetype": "specific character FROM THE PREMISE (king/child/merchant/financier/etc)",
    "silhouette": "visual description of their distinctive silhouette",
    "symbol": "object that will MOVE/TRANSFORM during the story"
  },
  "setting": {
    "realm": "where this story takes place (derived from premise)",
    "palette": ["amber", "charcoal", "parchment", "gold"],
    "texture": "parchment"
  },
  "scenes": [
    {
      "index": 0,
      "beat_type": "introduction|journey|trial|consequence|moral",
      "narration": "third-person omniscient line for this moment",
      "visual_description": "WHAT HAPPENS VISUALLY — must include movement and transformation",
      "has_silhouette": true,
      "silhouette_action": "PHYSICAL VERB + what changes (e.g., 'lunges forward, grasps at falling coins')",
      "symbolic_elements": ["element1 that MOVES", "element2 that TRANSFORMS"],
      "duration_seconds": 6-8
    }
  ]
}

Remember: The premise "${premise}" IS the story. Make it MOVE.`;
}

// =============================================================================
// BEAT TYPE CONFIGS
// =============================================================================

export const MYTH_BEAT_CONFIGS = {
  introduction: {
    typical_duration: 7,
    camera: "slow push in from wide to medium",
    motion: "figure emerges from shadow, first movement reveals form",
    action_verbs: ["emerges", "rises", "steps forward", "awakens"],
    motion_anchor: "[MOTION: figure enters frame, emerging from darkness, deliberate first step]",
  },
  journey: {
    typical_duration: 6,
    camera: "slow tracking shot following movement",
    motion: "traveling, reaching, grasping",
    action_verbs: ["reaches", "climbs", "crosses", "pursues", "chases"],
    motion_anchor: "[MOTION: continuous forward movement, silhouette traveling through space, visible progress]",
  },
  trial: {
    typical_duration: 8,
    camera: "handheld tension, slight push",
    motion: "struggle, grasping, failing, falling",
    action_verbs: ["grasps", "fails", "falls", "loses", "breaks", "shatters"],
    motion_anchor: "[MOTION: dynamic struggle, physical effort visible, body language shifts from hope to despair]",
  },
  revelation: {
    typical_duration: 7,
    camera: "slow crane up revealing scope",
    motion: "sudden stillness, then understanding gesture",
    action_verbs: ["realizes", "discovers", "sees", "understands"],
    motion_anchor: "[MOTION: stillness breaking into gesture of understanding, head lifts, posture transforms]",
  },
  consequence: {
    typical_duration: 6,
    camera: "slow push in on aftermath",
    motion: "aftermath, weight of loss visible",
    action_verbs: ["crumbles", "fades", "vanishes", "empties"],
    motion_anchor: "[MOTION: visible transformation of environment, things falling/fading/vanishing around figure]",
  },
  moral: {
    typical_duration: 8,
    camera: "slow pull back to wide, revealing journey's end",
    motion: "final posture shift, acceptance or resolve",
    action_verbs: ["accepts", "releases", "stands renewed", "walks away"],
    motion_anchor: "[MOTION: final gesture of completion, figure's silhouette transforms - smaller yet resolute, or turns to leave]",
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
