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
  beat_type: "introduction" | "journey" | "trial" | "revelation" | "consequence" | "moral";
  narration: string;         // Third-person omniscient narration line
  
  // Visual description (symbolic, not realistic)
  visual_description: string;
  
  // No faces - silhouette only
  has_silhouette: boolean;
  silhouette_action?: string;  // What the silhouette does
  silhouette_pose?: string;    // Body shape category for variety check
  
  // Environment elements
  symbolic_elements: string[];  // "winding path", "looming shadow", "distant light"
  environment_motion?: string[];  // Environment elements with motion verbs
  
  // Visual transformation (start → end delta)
  start_state?: string;       // "silhouette stands tall, bag full"
  end_state?: string;         // "silhouette hunched, bag deflated, dust in air"
  
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
  
  // Symbol arc across entire story
  symbol_arc?: string[];     // ["Scene 0: Bag full", "Scene 1: Bag tears", ...]
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
// LIGHT DYNAMICS (per beat type)
// =============================================================================

export const LIGHT_DYNAMICS: Record<string, string> = {
  introduction: "light gradually intensifies from darkness, silhouette becomes more defined, warm glow spreads",
  journey: "moving light source casts shifting shadows, sun/moon travels visibly across scene",
  trial: "light flickers erratically, shadows grow and contract, contrast increases dramatically",
  revelation: "sudden light break-through, illumination spreads outward from source",
  consequence: "light fades steadily, silhouette dissolves into darkness at edges, warmth drains",
  moral: "soft golden light breaks through from above, peace settles, gentle radiance",
};

// =============================================================================
// ATMOSPHERE POOL (rotating per scene)
// =============================================================================

export const MYTH_ATMOSPHERE_POOL: string[] = [
  "golden dust motes drift slowly through frame, catching light",
  "ink wash effect bleeds and spreads at frame edges",
  "parchment texture subtly crinkles and shifts",
  "faint shadow puppets of other figures visible at screen edges",
  "candlelight flicker affects entire scene brightness",
  "smoke or mist curls slowly through the scene",
  "paper grain texture shifts as if breathing",
  "floating embers or sparks drift upward slowly",
  "watercolor bloom effect at edges of silhouettes",
  "subtle starfield or constellation patterns in dark areas",
];

// =============================================================================
// FOREGROUND ELEMENT POOL (parallax depth)
// =============================================================================

export const FOREGROUND_ELEMENT_POOL: string[] = [
  "scattered coins drift slowly past camera",
  "leaves or petals float across foreground",
  "wisps of smoke curl past lens",
  "parchment fragments tumble through frame",
  "dust particles catch light in foreground",
  "feathers or ashes drift downward",
  "small flames or embers pass close to camera",
  "droplets or tears catch light as they fall",
  "torn pages flutter across the foreground",
  "shadow tendrils reach toward camera",
];

// =============================================================================
// MOTION ANCHOR POOLS (by beat type - rotate to prevent repetition)
// =============================================================================

export const MOTION_ANCHOR_POOLS: Record<string, string[]> = {
  introduction: [
    "[MOTION: figure emerges from shadow, first movement reveals form, deliberate first step forward]",
    "[MOTION: silhouette materializes from darkness, hand reaches toward light, body follows slowly]",
    "[MOTION: figure rises from crouch, stands tall, head lifts to survey the realm]",
    "[MOTION: shadow solidifies into form, arms extend outward, presence established]",
    "[MOTION: figure steps through threshold, pauses, then commits to entering the space]",
  ],
  journey: [
    "[MOTION: continuous forward movement, silhouette traveling through space, visible progress step by step]",
    "[MOTION: figure climbs steadily, reaching for each handhold, ascending with purpose]",
    "[MOTION: walking against wind, cloth and elements streaming backward, determination visible]",
    "[MOTION: running, then slowing, then running again — urgency pulses through movement]",
    "[MOTION: silhouette crosses frame, pauses at obstacle, finds way around, continues]",
  ],
  trial: [
    "[MOTION: frantic grasping, fingers close on nothing, repeat with increasing desperation]",
    "[MOTION: catches one object successfully, then loses grip on five more, overwhelmed]",
    "[MOTION: lunges left, misses; lunges right, misses; collapses in center, defeated]",
    "[MOTION: arms windmill wildly, body twists, finally falls backward in failure]",
    "[MOTION: figure fights against invisible force, pushed back step by step, losing ground]",
  ],
  revelation: [
    "[MOTION: stillness breaks — head snaps up, posture transforms from hunched to alert]",
    "[MOTION: slow turn, seeing something for first time, body language shifts from confusion to clarity]",
    "[MOTION: hands drop to sides, shoulders relax, understanding dawns visibly in posture]",
    "[MOTION: figure reaches out, touches truth, pulls back hand in shock, then acceptance]",
    "[MOTION: frozen moment, then sudden movement — reaching toward new understanding]",
  ],
  consequence: [
    "[MOTION: objects fall in slow cascade around figure, each loss visible, weight accumulating]",
    "[MOTION: figure crumbles inward, shrinking, as environment empties around them]",
    "[MOTION: things dissolve to dust, scatter on wind, figure watches helplessly]",
    "[MOTION: silhouette fades at edges, becoming translucent, losing substance]",
    "[MOTION: figure turns away, walks slowly into emptiness, leaving scattered remnants]",
  ],
  moral: [
    "[MOTION: final gesture of acceptance — hands open, release, peace in posture]",
    "[MOTION: figure turns to face camera, small but resolute, then slowly walks away]",
    "[MOTION: silhouette shrinks against vast backdrop, yet stands straighter, stronger]",
    "[MOTION: slow exhale visible in posture, tension drains, stillness with purpose]",
    "[MOTION: figure bows head, then lifts it with new resolve, transformed]",
  ],
};

// =============================================================================
// TEMPO/PACING DIRECTIVES (per beat type)
// =============================================================================

export const BEAT_PACING: Record<string, string> = {
  introduction: "[TEMPO: Measured and slow. Each action has weight. Hold on key moments. Deliberate revelation.]",
  journey: "[TEMPO: Steady forward momentum. Progress visible frame-to-frame. Rhythmic, purposeful.]",
  trial: "[TEMPO: Accelerating panic. Actions crowd together. Desperation builds. Frantic energy.]",
  revelation: "[TEMPO: Sudden stillness. Sharp contrast. Frozen moment breaks into movement.]",
  consequence: "[TEMPO: Heavy stillness. Long pauses. Weight of loss visible. Slow fade.]",
  moral: "[TEMPO: Slow exhale. Final gesture drawn out. Peace settles. Resolution.]",
};

// =============================================================================
// SILHOUETTE POSE CATEGORIES (for variety)
// =============================================================================

export const SILHOUETTE_POSES = [
  "triumphant",   // arms raised, head up, expanded
  "reaching",     // one arm extended, body leaning
  "collapsed",    // hunched, head down, contracted
  "walking",      // mid-stride, dynamic profile
  "kneeling",     // low to ground, supplicant pose
  "standing",     // neutral, upright
  "running",      // dynamic forward motion
  "falling",      // mid-descent, limbs scattered
  "sitting",      // grounded, contemplative
  "turning",      // mid-rotation, transitional
];

// =============================================================================
// MYTH PROMPT BUILDER (Enhanced with all Phase 1-3 improvements)
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
 * 
 * Enhanced with:
 * - Light dynamics per beat
 * - Atmosphere layer (rotating)
 * - Motion anchor pools (rotating)
 * - Tempo directives
 * - Parallax depth layers
 * - Start/end visual delta
 */
export function buildMythPrompt(
  scene: MythScene,
  storyboard: Partial<MythStoryboard>
): string {
  const parts: string[] = [];
  
  // Get beat-specific config for motion variety
  const beatConfig = MYTH_BEAT_CONFIGS[scene.beat_type] || MYTH_BEAT_CONFIGS.journey;
  const sceneIndex = scene.index || 0;
  
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
  
  // 4. PARALLAX DEPTH LAYERS (Phase 3)
  const foregroundElement = FOREGROUND_ELEMENT_POOL[sceneIndex % FOREGROUND_ELEMENT_POOL.length];
  parts.push(`[LAYERS:
  FOREGROUND: ${foregroundElement}
  MIDGROUND: silhouette figure performing action
  BACKGROUND: ${setting?.realm || "environment"} with slow independent motion (clouds drift, elements shift)]`);
  
  // 5. LIGHT DYNAMICS (Phase 1)
  const lightDynamic = LIGHT_DYNAMICS[scene.beat_type] || LIGHT_DYNAMICS.journey;
  parts.push(`[LIGHT: ${lightDynamic}]`);
  
  // 6. CAMERA (beat-specific movement)
  parts.push(`[CAMERA: ${beatConfig.camera}]`);
  
  // 7. TEMPO/PACING (Phase 1)
  const tempo = BEAT_PACING[scene.beat_type] || BEAT_PACING.journey;
  parts.push(tempo);
  
  // 8. SILHOUETTE WITH ACTION (if present) - with defensive check
  const character = storyboard.character;
  if (scene.has_silhouette && scene.silhouette_action) {
    const archetype = character?.archetype || "figure";
    parts.push(`SILHOUETTE: ${archetype} — ${scene.silhouette_action}`);
    if (character?.symbol) {
      parts.push(`SYMBOL: ${character.symbol}`);
    }
  }
  
  // 9. VISUAL DESCRIPTION (symbolic, not literal)
  parts.push(`SCENE: ${scene.visual_description}`);
  
  // 10. START/END DELTA (Phase 2)
  if (scene.start_state && scene.end_state) {
    parts.push(`[DELTA: Start with "${scene.start_state}" → End with "${scene.end_state}"]`);
  } else {
    // Fallback to generic transformation hint
    const transformHint = getTransformationHint(scene.beat_type);
    parts.push(`[TRANSFORMATION: ${transformHint}]`);
  }
  
  // 11. ENVIRONMENT MOTION (Phase 2)
  if (scene.environment_motion && scene.environment_motion.length > 0) {
    parts.push(`[ENVIRONMENT: ${scene.environment_motion.join("; ")}]`);
  } else if (scene.symbolic_elements && scene.symbolic_elements.length > 0) {
    // Fallback to static elements
    parts.push(`ELEMENTS: ${scene.symbolic_elements.join(", ")}`);
  }
  
  // 12. SYMBOL ARC STATE (Phase 2) - if we have a symbol arc
  if (storyboard.symbol_arc && storyboard.symbol_arc[sceneIndex]) {
    parts.push(`[SYMBOL STATE: ${storyboard.symbol_arc[sceneIndex]}]`);
  }
  
  // 13. MOTION (beat-specific from rotating pool - Phase 1)
  const motionPool = MOTION_ANCHOR_POOLS[scene.beat_type] || MOTION_ANCHOR_POOLS.journey;
  const motionAnchor = motionPool[sceneIndex % motionPool.length];
  parts.push(motionAnchor);
  
  // 14. ATMOSPHERE (rotating - Phase 1)
  const atmosphereIndex = (sceneIndex * 3 + scene.beat_type.length) % MYTH_ATMOSPHERE_POOL.length;
  const atmosphere = MYTH_ATMOSPHERE_POOL[atmosphereIndex];
  parts.push(`[ATMOSPHERE: ${atmosphere}]`);
  
  // 15. NEGATIVE (what to avoid)
  parts.push("[AVOID: photorealistic, detailed face, eyes, 3D, modern elements, static poses, frozen figures]");
  
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
// STORYBOARD GENERATION PROMPT (Enhanced Phase 2)
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
⚠️ START/END STATES (REQUIRED FOR EACH SCENE)
═══════════════════════════════════════════════════════════════════════════════

EVERY scene MUST specify what it looks like at START and at END:

start_state: "figure stands tall, bag bulging with coins, golden light"
end_state: "figure hunched, bag deflated, dust where coins were, dim light"

This ensures the AI knows exactly what TRANSFORMATION to render.

═══════════════════════════════════════════════════════════════════════════════
⚠️ ENVIRONMENT MOTION (BACKGROUNDS MUST MOVE)
═══════════════════════════════════════════════════════════════════════════════

environment_motion must include VERBS for environment elements:

❌ STATIC: ["distant horizon", "market stalls"]
✅ MOVING: ["market stalls FADE into obscurity as focus narrows", "shadows CREEP inward from edges"]

═══════════════════════════════════════════════════════════════════════════════
⚠️ SILHOUETTE POSE VARIETY
═══════════════════════════════════════════════════════════════════════════════

Adjacent scenes MUST have different silhouette_pose values:

Available poses: triumphant, reaching, collapsed, walking, kneeling, standing, running, falling, sitting, turning

Scene 0: "reaching" → Scene 1: "walking" → Scene 2: "collapsed" ✅
Scene 0: "standing" → Scene 1: "standing" → Scene 2: "standing" ❌

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
  "symbol_arc": [
    "Scene 0: symbol in initial state (e.g., 'Bag full, coins glinting')",
    "Scene 1: symbol changing (e.g., 'Bag overflowing, weight visible')",
    "Scene 2: symbol transformed (e.g., 'Bag torn, coins scattered')",
    "...one entry per scene showing symbol evolution"
  ],
  "scenes": [
    {
      "index": 0,
      "beat_type": "introduction|journey|trial|consequence|moral",
      "narration": "third-person omniscient line for this moment",
      "visual_description": "WHAT HAPPENS VISUALLY — must include movement and transformation",
      "has_silhouette": true,
      "silhouette_action": "PHYSICAL VERB + what changes (e.g., 'lunges forward, grasps at falling coins')",
      "silhouette_pose": "one of: triumphant, reaching, collapsed, walking, kneeling, standing, running, falling, sitting, turning",
      "symbolic_elements": ["element1", "element2"],
      "environment_motion": ["element VERB as context (e.g., 'shadows CREEP inward')"],
      "start_state": "what the scene looks like at the beginning",
      "end_state": "what the scene looks like at the end",
      "duration_seconds": 6-8
    }
  ]
}

Remember: The premise "${premise}" IS the story. Make it MOVE.`;
}

// =============================================================================
// BEAT TYPE CONFIGS (base configs, enhanced by pools above)
// =============================================================================

export const MYTH_BEAT_CONFIGS: Record<string, {
  typical_duration: number;
  camera: string;
  motion: string;
  action_verbs: string[];
  motion_anchor: string;
}> = {
  introduction: {
    typical_duration: 7,
    camera: "slow push in from wide to medium, light gradually intensifying",
    motion: "figure emerges from shadow, first movement reveals form",
    action_verbs: ["emerges", "rises", "steps forward", "awakens"],
    motion_anchor: "[MOTION: figure enters frame, emerging from darkness, deliberate first step]",
  },
  journey: {
    typical_duration: 6,
    camera: "slow tracking shot following movement, moving light source",
    motion: "traveling, reaching, grasping",
    action_verbs: ["reaches", "climbs", "crosses", "pursues", "chases"],
    motion_anchor: "[MOTION: continuous forward movement, silhouette traveling through space, visible progress]",
  },
  trial: {
    typical_duration: 8,
    camera: "handheld tension, slight push, flickering light",
    motion: "struggle, grasping, failing, falling",
    action_verbs: ["grasps", "fails", "falls", "loses", "breaks", "shatters"],
    motion_anchor: "[MOTION: dynamic struggle, physical effort visible, body language shifts from hope to despair]",
  },
  revelation: {
    typical_duration: 7,
    camera: "slow crane up revealing scope, sudden light break",
    motion: "sudden stillness, then understanding gesture",
    action_verbs: ["realizes", "discovers", "sees", "understands"],
    motion_anchor: "[MOTION: stillness breaking into gesture of understanding, head lifts, posture transforms]",
  },
  consequence: {
    typical_duration: 6,
    camera: "slow push in on aftermath, light fading",
    motion: "aftermath, weight of loss visible",
    action_verbs: ["crumbles", "fades", "vanishes", "empties"],
    motion_anchor: "[MOTION: visible transformation of environment, things falling/fading/vanishing around figure]",
  },
  moral: {
    typical_duration: 8,
    camera: "slow pull back to wide, soft golden light breaking through",
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

// =============================================================================
// HELPER: Validate silhouette pose variety
// =============================================================================

export function validatePoseVariety(scenes: MythScene[]): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  
  for (let i = 1; i < scenes.length; i++) {
    const prevPose = scenes[i - 1].silhouette_pose;
    const currentPose = scenes[i].silhouette_pose;
    
    if (prevPose && currentPose && prevPose === currentPose) {
      issues.push(`Scenes ${i - 1} and ${i} have the same pose: "${currentPose}"`);
    }
  }
  
  return { valid: issues.length === 0, issues };
}

// =============================================================================
// HELPER: Generate fallback start/end states
// =============================================================================

export function generateFallbackStates(scene: MythScene, storyboard: Partial<MythStoryboard>): { start_state: string; end_state: string } {
  const character = storyboard.character?.archetype || "figure";
  const symbol = storyboard.character?.symbol || "object";
  
  const fallbacksByBeat: Record<string, { start: string; end: string }> = {
    introduction: {
      start: `darkness, ${character} silhouette emerging from shadow`,
      end: `${character} fully visible, ${symbol} catching light, determined stance`,
    },
    journey: {
      start: `${character} at journey's beginning, ${symbol} held close, path ahead`,
      end: `${character} mid-journey, environment scrolled, ${symbol} still secure`,
    },
    trial: {
      start: `${character} hopeful, reaching for ${symbol}, light still present`,
      end: `${character} defeated, ${symbol} slipping away, shadows encroaching`,
    },
    revelation: {
      start: `${character} confused, ${symbol} unclear, darkness dominates`,
      end: `${character} understanding, ${symbol} illuminated, light breaking through`,
    },
    consequence: {
      start: `${character} surrounded by ${symbol}, fullness visible`,
      end: `${character} alone, ${symbol} scattered/gone, emptiness`,
    },
    moral: {
      start: `${character} at lowest point, ${symbol} transformed`,
      end: `${character} at peace, small against vast backdrop, ${symbol} released`,
    },
  };
  
  const states = fallbacksByBeat[scene.beat_type] || fallbacksByBeat.journey;
  return { start_state: states.start, end_state: states.end };
}

// =============================================================================
// SIMPLIFIED PROMPT BUILDER - "Essence First" Format
// =============================================================================

/**
 * Simple motion hints by beat type (one phrase, not a bracketed block)
 */
const SIMPLE_MOTION_HINTS: Record<string, string> = {
  introduction: "Figure emerges slowly from darkness, first movement deliberate.",
  journey: "Continuous forward movement, visible progress step by step.",
  trial: "Frantic reaching, grasping at things slipping away.",
  revelation: "Stillness breaks — sudden understanding visible in posture.",
  consequence: "Things fall and scatter, weight of loss visible.",
  moral: "Final gesture of release, peace settles into stillness.",
};

/**
 * Build a simplified Myth Mode prompt following "Essence First" principles.
 * 
 * Research shows:
 * - First 500 chars carry 80% of the weight with AI video models
 * - After ~1000 chars, models experience "semantic drift"
 * - 16 directive blocks = nothing stands out
 * 
 * This version uses ~400 chars instead of ~1400 chars:
 * 1. One vivid action sentence (first 200 chars - highest priority)
 * 2. Core style anchor (shadow-puppet, pulsing light)
 * 3. One motion hint
 * 4. Minimal negatives
 */
export function buildMythPromptSimplified(
  scene: MythScene,
  storyboard: Partial<MythStoryboard>
): string {
  const character = storyboard.character;
  const setting = storyboard.setting;
  
  // 1. THE ACTION (first 200 chars - highest priority)
  // Combine character, action, and transformation into ONE vivid sentence
  const archetype = character?.archetype || "solitary figure";
  const symbol = character?.symbol || "";
  const symbolPhrase = symbol ? ` with ${symbol}` : "";
  
  // Build action from scene data
  const action = scene.silhouette_action || scene.visual_description || "moves through the scene";
  
  // Build transformation phrase if we have start/end states
  let transformPhrase = "";
  if (scene.start_state && scene.end_state) {
    // Extract key visual from states (abbreviated for prompt efficiency)
    transformPhrase = `. From ${scene.start_state.slice(0, 40)} to ${scene.end_state.slice(0, 40)}`;
  }
  
  // Combine into one vivid opening
  const actionLine = `A ${archetype} silhouette${symbolPhrase} ${action}${transformPhrase}.`;
  
  // 2. SETTING CONTEXT (brief, ~50 chars)
  const realm = setting?.realm || "timeless realm";
  const settingLine = `${realm} stretches behind in paper layers.`;
  
  // 3. STYLE ANCHOR (core aesthetic - ~100 chars)
  const styleLine = "STYLE: Shadow-puppet silhouette, parchment paper texture, warm pulsing light, high contrast black and gold.";
  
  // 4. ONE MOTION HINT (optional, ~60 chars)
  const motionHint = SIMPLE_MOTION_HINTS[scene.beat_type] || SIMPLE_MOTION_HINTS.journey;
  
  // 5. MINIMAL NEGATIVES (end of prompt, ~40 chars)
  const avoidLine = "No faces, no 3D, no modern elements.";
  
  // Combine all parts with clean line breaks
  return `${actionLine} ${settingLine}

${styleLine}

${motionHint}

${avoidLine}`;
}
