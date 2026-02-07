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

export type MythForceType =
  | "predator"
  | "army"
  | "monster"
  | "magic"
  | "weather"
  | "environment"
  | "pursuit"
  | "collapse"
  | "unknown";

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
  beat_type: "introduction" | "journey" | "trial" | "revelation" | "consequence" | "moral" | "battle" | "chase" | "clash" | "ascension";
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

  // === ESCALATION/FORCE FIELDS (brought from Film Mode) ===
  force_present?: boolean;
  force_type?: MythForceType;
  escalation_delta?: 0 | 1 | 2 | 3;
  setpiece_delta?: 0 | 1 | 2 | 3;
  irreversible_action?: boolean;  // "something breaks forever"
  threat_vector?: string;         // "wind tears gear", "predator closes distance"
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
  // NEW ACTION BEATS
  battle: "[TEMPO: Rapid cuts. Impact moments. Dynamic camera. Bodies in motion. Visceral energy. Fluid combat.]",
  chase: "[TEMPO: Continuous forward thrust. Environment streaming past. Urgency visible. No pauses. Speed.]",
  clash: "[TEMPO: Two forces meeting. Impact. Explosion. Collision energy. Shockwave ripples outward.]",
  ascension: "[TEMPO: Rising action. Building power. Transformation crescendo. Energy amplifying.]",
};

// =============================================================================
// MOTION ANCHOR POOLS - ACTION BEATS
// =============================================================================

// Add action beat motion pools
export const ACTION_MOTION_POOLS: Record<string, string[]> = {
  battle: [
    "[MOTION: figures clash, impact sparks, bodies pivot and strike, momentum carries through]",
    "[MOTION: weapon arcs through air, target recoils, attacker follows through, dust rises]",
    "[MOTION: magic erupts from hands, target staggers, energy ripples outward, ground shakes]",
    "[MOTION: dodge roll, counter-strike, parry and riposte, constant fluid motion]",
    "[MOTION: leap attack, downward strike, landing impact, dust explosion on impact]",
  ],
  chase: [
    "[MOTION: continuous forward sprint, environment blurs past, obstacles cleared in stride]",
    "[MOTION: pursuers gain, prey dodges, narrow escapes, momentum never stops]",
    "[MOTION: rooftop leap, grab ledge, swing forward, land running]",
    "[MOTION: weaving through obstacles, near misses, desperate speed]",
    "[MOTION: sliding under barrier, rolling up, continuing at full speed]",
  ],
  clash: [
    "[MOTION: two forces collide, shockwave expands, both pushed back, recover stance]",
    "[MOTION: energies meet mid-air, explosion of light, debris scatters outward]",
    "[MOTION: charging at each other, impact at center, ground cracks beneath]",
    "[MOTION: locked in struggle, straining against each other, neither yielding]",
    "[MOTION: deflection and counter, back and forth, escalating intensity]",
  ],
  ascension: [
    "[MOTION: rising from ground, energy gathering, form expanding with power]",
    "[MOTION: transformation beginning, old form shattering, new form emerging]",
    "[MOTION: power surge, aura expanding, figure lifting off ground]",
    "[MOTION: ascending spiral, energy trail behind, reaching apex]",
    "[MOTION: breaking through barrier, emerging transformed, radiating power]",
  ],
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

EVERY silhouette_action MUST describe a PHYSICAL TRAJECTORY with 2-3 beats:
- Use TRAJECTORY VERBS (multi-beat): "lunges forward and slams into", "staggers backward then crashes to knees", "hurls object — it arcs through air — shatters against wall"
- NEVER use TERMINAL POSE VERBS: steps, walks, stands, kneels, rises, sits, gazes, holds (these produce static results)
- Show CONTINUOUS PHYSICAL PROCESS: "grasps at coins — they slip through fingers — scatter across stone floor"
- The action must have ANTICIPATION → PEAK → FOLLOW-THROUGH (three distinct moments of motion)

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
      "silhouette_action": "TRAJECTORY VERB (e.g., 'lunges forward, grasps at coins — they slip through fingers, scatter across stone')",
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
  // NEW ACTION BEAT CONFIGS
  battle: {
    typical_duration: 6,
    camera: "dynamic tracking, rapid cuts between combatants, impact close-ups",
    motion: "combat, striking, dodging, clashing",
    action_verbs: ["strikes", "dodges", "parries", "slashes", "blocks", "attacks", "counters"],
    motion_anchor: "[MOTION: fluid combat, bodies in constant motion, impacts visible, momentum flowing]",
  },
  chase: {
    typical_duration: 6,
    camera: "tracking shot following runner, environment streaming past",
    motion: "running, leaping, dodging, escaping",
    action_verbs: ["runs", "leaps", "dodges", "vaults", "sprints", "escapes", "pursues"],
    motion_anchor: "[MOTION: continuous forward motion, obstacles cleared, never stopping]",
  },
  clash: {
    typical_duration: 7,
    camera: "wide to capture both forces, push in on impact moment",
    motion: "collision, impact, shockwave, recoil",
    action_verbs: ["collides", "clashes", "impacts", "meets", "shatters", "explodes"],
    motion_anchor: "[MOTION: two forces meeting, impact energy radiating outward, aftermath settling]",
  },
  ascension: {
    typical_duration: 8,
    camera: "crane up following rising figure, widening to show transformation",
    motion: "rising, transforming, expanding, radiating",
    action_verbs: ["rises", "transforms", "ascends", "radiates", "expands", "transcends"],
    motion_anchor: "[MOTION: upward motion, form changing, power building and releasing]",
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
// SIMPLIFIED PROMPT BUILDER - "Essence First" Format (V1)
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
  const archetype = character?.archetype || "solitary figure";
  const symbol = character?.symbol || "";
  const symbolPhrase = symbol ? ` with ${symbol}` : "";
  
  const action = scene.silhouette_action || scene.visual_description || "moves through the scene";
  
  let transformPhrase = "";
  if (scene.start_state && scene.end_state) {
    const startClean = truncateClean(scene.start_state, 50);
    const endClean = truncateClean(scene.end_state, 50);
    transformPhrase = `. From ${startClean} to ${endClean}`;
  }
  
  const actionLine = `A ${archetype} silhouette${symbolPhrase} ${action}${transformPhrase}.`;
  
  // 2. SETTING CONTEXT
  const realm = setting?.realm || "timeless realm";
  const settingLine = `${realm} stretches behind in paper layers.`;
  
  // 3. STYLE ANCHOR
  const styleLine = "STYLE: Shadow-puppet silhouette, parchment paper texture, warm pulsing light, high contrast black and gold.";
  
  // 4. ONE MOTION HINT
  const motionHint = SIMPLE_MOTION_HINTS[scene.beat_type] || SIMPLE_MOTION_HINTS.journey;
  
  // 5. MINIMAL NEGATIVES
  const avoidLine = "No faces, no 3D, no modern elements.";
  
  return `${actionLine} ${settingLine}

${styleLine}

${motionHint}

${avoidLine}`;
}

// =============================================================================
// V2 PROMPT BUILDER - Lotte Reiniger Technique-Based Style
// =============================================================================

/**
 * Reiniger technique anchor - describes HOW it was made, not how it looks.
 * Triggers model's knowledge of this specific animation technique.
 */
const REINIGER_TECHNIQUE_ANCHOR =
  "STYLE: Lotte Reiniger-inspired articulated shadow-puppet cutout animation. " +
  "Layered paper silhouettes, backlit from below, high-contrast. " +
  "Fluid articulated motion with continuous movement.";

/**
 * Light behavior per beat - breathing, pulsing, dynamic (not static descriptions)
 */
export const LIGHT_BEHAVIOR_V2: Record<string, string> = {
  introduction: "Light breathes from darkness, intensity slowly rises.",
  journey: "Shadows shift as unseen light source travels across scene.",
  trial: "Light flickers erratically, contrast sharpens and softens.",
  revelation: "Sudden light bloom, illumination spreads outward.",
  consequence: "Light drains slowly away, figure dissolves at edges.",
  moral: "Soft golden glow settles, peace in final stillness.",
  battle: "Strobe-like flashes on impact, shadows clash violently.",
  chase: "Light streaks past, environment blurs with speed.",
  clash: "Explosion of light at collision point, shockwave shadows.",
  ascension: "Light intensifies from within, radiating outward.",
};

/**
 * Action-intensity light overrides (Blocker 6 fix).
 * When intensity_profile is "action" or "epic", use these instead of default LIGHT_BEHAVIOR_V2.
 * Dynamic, impact-driven lighting replaces contemplative breathing/fading.
 */
export const ACTION_LIGHT_BEHAVIOR: Record<string, string> = {
  introduction: "Sudden illumination — sharp shadows snap into existence, hard edge light carves the figure from darkness.",
  journey: "Light pulses with movement, shadows stretch and snap with each stride, environment strobes with urgency.",
  trial: "Rapid light oscillation on each impact, sparks illuminate faces of struggle, darkness punches between flashes.",
  revelation: "Explosive light burst, radial shadows thrown outward, afterglow pulses.",
  consequence: "Shattered light fragments scatter, intermittent darkness, residual glow fades in stutters.",
  moral: "Final steady beam cuts through settling dust, last light holds firm.",
  battle: "Strobe flashes on every impact, shockwave shadows expand from collision points, afterimages linger.",
  chase: "Streak lighting — light source moves with pursuer, environment flashes past in staccato bursts.",
  clash: "Twin light sources collide, explosion radiance, debris shadows scatter radially.",
  ascension: "Light erupts from within figure, radiating outward in waves, environment washed in expanding glow.",
};

/**
 * Helper: Smart truncation that avoids mid-word cuts
 */
function truncateClean(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
}

/**
 * Helper: Add articulation hints to action descriptions.
 * Makes limb movement explicit when verbs imply it.
 */
function addArticulationHints(action: string): string {
  // Add body-part-specific motion hints if not present
  if (action.includes("reaches") && !action.includes("arm") && !action.includes("hand")) {
    return action.replace("reaches", "reaches with jointed arm");
  }
  if (action.includes("walks") && !action.includes("leg")) {
    return action.replace("walks", "walks with articulated legs stepping");
  }
  if (action.includes("turns") && !action.includes("head") && !action.includes("body")) {
    return action.replace("turns", "turns at the waist, head following");
  }
  if (action.includes("grasps") && !action.includes("finger") && !action.includes("hand")) {
    return action.replace("grasps", "grasps with jointed fingers");
  }
  if (action.includes("lifts") && !action.includes("arm")) {
    return action.replace("lifts", "lifts with hinged arm");
  }
  if (action.includes("falls") && !action.includes("limb")) {
    return action.replace("falls", "falls with limbs folding");
  }
  if (action.includes("rises") && !action.includes("leg") && !action.includes("knee")) {
    return action.replace("rises", "rises, knees bending, then straightening");
  }
  return action;
}

/**
 * Build a V2 Myth Mode prompt using Lotte Reiniger technique-based anchors.
 * 
 * Key insight: Describe the ANIMATION TECHNIQUE, not the aesthetic.
 * This triggers the model's knowledge of historical silhouette animation.
 * 
 * From Lotte Reiniger's own description (1936):
 * - "Silhouette marionettes cut out of black cardboard"
 * - "Every limb being cut separately and joined with wire hinges"
 * - "Laid out on a glass table, strong light from underneath"
 * - "Backgrounds cut from layers of transparent paper"
 * 
 * V2 structure (~450 chars):
 * 1. Action with explicit articulation (200 chars max)
 * 2. Setting with layer language
 * 3. Technique anchor (Reiniger-specific)
 * 4. Light behavior (breathing, per beat)
 * 5. Minimal negatives (technique-focused)
 */
export function buildMythPromptV2(
  scene: MythScene,
  storyboard: Partial<MythStoryboard>
): string {
  const character = storyboard.character;
  const setting = storyboard.setting;
  
  // 1. ACTION with articulation hints (highest priority - first 200 chars)
  const archetype = character?.archetype || "solitary figure";
  const rawAction = scene.silhouette_action || scene.visual_description || "moves through the scene";
  
  // Add explicit articulation to action verbs
  const articulatedAction = addArticulationHints(rawAction);
  
  // Build transformation phrase if available
  let transformPhrase = "";
  if (scene.start_state && scene.end_state) {
    const startClean = truncateClean(scene.start_state, 45);
    const endClean = truncateClean(scene.end_state, 45);
    transformPhrase = `. From ${startClean} to ${endClean}`;
  }
  
  // Combine into action line with explicit joint articulation
  const actionLine = `A ${archetype} with jointed articulated limbs ${articulatedAction}${transformPhrase}.`;
  
  // 2. SETTING with layer language (parallax depth)
  const realm = setting?.realm || "timeless realm";
  const settingLine = `${realm} rendered in separate paper layers behind.`;
  
  // 3. TECHNIQUE ANCHOR (Reiniger-specific - describes HOW, not WHAT)
  const techniqueLine = REINIGER_TECHNIQUE_ANCHOR;
  
  // 4. LIGHT BEHAVIOR (breathing, per beat - dynamic, not static)
  const lightLine = LIGHT_BEHAVIOR_V2[scene.beat_type] || LIGHT_BEHAVIOR_V2.journey;
  
  // 5. MINIMAL NEGATIVES (technique-focused - what breaks the style)
  const avoidLine = "No realistic faces.";
  
  // Combine with clean structure
  return `${actionLine} ${settingLine}

${techniqueLine}

${lightLine}

${avoidLine}`;
}

// =============================================================================
// V3 ACTION-FIRST PROMPT BUILDER
// =============================================================================

/**
 * Combat verb contract - injected when action mode is active.
 */
export const ACTION_VERB_CONTRACT = `
When beat_type is trial/consequence/battle/chase/clash/ascension:
- Use HARD ACTION VERBS (crash, slam, tear, rupture, lunge, collide, shatter, explode, fracture, claw, sprint, dive).
- Avoid SOFT VERBS (trudge, wander, stroll, gently, slowly, peacefully, calmly).
- Action must be PHYSICAL and VISIBLE: impacts, debris, velocity, struggle.
`;

/**
 * Action keywords that signal premise wants dynamic pacing.
 */
export const ACTION_KEYWORDS = [
  "battle", "war", "kill", "hunt", "chase", "escape", "siege", "ambush",
  "dragon", "monster", "army", "blood", "fight", "clash", "pursue",
  "storm", "collapse", "fire", "rage", "doom", "curse", "attack",
  "destroy", "conquer", "defeat", "slay", "strike", "charge"
];

/**
 * Check if premise implies action-heavy content.
 */
export function premiseWantsAction(premise: string): boolean {
  const p = (premise || "").toLowerCase();
  return ACTION_KEYWORDS.some(k => p.includes(k));
}

/**
 * Build scene-specific 3-beat motion sequence for myth scenes (Blocker 3 fix).
 * 
 * Instead of generic templates, composes beats from the scene's actual data:
 * - Beat 1 (anticipation): Derived from start_state
 * - Beat 2 (peak action): Derived from silhouette_action with trajectory verbs
 * - Beat 3 (follow-through): Derived from end_state
 * 
 * Falls back to escalation-based templates only when scene data is missing.
 */
function buildMythMotionBeats(scene: MythScene): string {
  const esc = scene.escalation_delta ?? 0;
  const archetype = "figure"; // Keep generic in motion beats (action line has the archetype)
  
  // SCENE-SPECIFIC BEATS: Use actual scene data when available
  const hasSceneData = scene.start_state && scene.end_state && scene.silhouette_action;
  
  if (hasSceneData) {
    const startClean = truncateClean(scene.start_state!, 60);
    const endClean = truncateClean(scene.end_state!, 60);
    const actionClean = truncateClean(scene.silhouette_action!, 80);
    
    return `Beat 1 (anticipation): ${startClean} — ${archetype} coils, weight shifts, muscles tense. Beat 2 (peak): ${actionClean} — full force, maximum displacement, impact visible. Beat 3 (settle): ${endClean} — momentum carries through, new position held.`;
  }
  
  // FALLBACK: Escalation-based templates when scene data is sparse
  
  // High-escalation beats: explosive physics
  if (esc >= 2 || ["battle", "clash", "ascension"].includes(scene.beat_type)) {
    const templates: Record<string, string> = {
      battle: "Beat 1: Weight shifts, weapon raised. Beat 2: Full swing connects, target staggers backward, debris erupts. Beat 3: Follow-through carries attacker forward, dust settles around impact crater.",
      chase: "Beat 1: Feet dig in, body launches forward. Beat 2: Full sprint, obstacles hurdled, ground kicks up behind. Beat 3: Sharp direction change, skid marks, momentum redirected.",
      clash: "Beat 1: Two forces charge toward center. Beat 2: Collision — shockwave radiates outward, both figures buckle. Beat 3: Aftermath — one stands, one staggers, debris rains down.",
      ascension: "Beat 1: Energy gathers at center, figure trembles. Beat 2: Eruption upward — form breaks apart and reconstitutes larger. Beat 3: New form radiates outward, environment recoils.",
      trial: "Beat 1: Desperate lunge forward, fingers outstretched. Beat 2: Grasp fails — object shatters/scatters, body overextends. Beat 3: Collapse to knees, fragments settle around.",
      consequence: "Beat 1: Standing among wreckage, hands open. Beat 2: Objects disintegrate in hands, dust streams through fingers. Beat 3: Weight buckles body downward, shadow shrinks.",
    };
    return templates[scene.beat_type] || templates.battle;
  }
  
  // Medium-escalation: purposeful physics
  if (esc >= 1 || ["journey", "chase"].includes(scene.beat_type)) {
    const templates: Record<string, string> = {
      journey: "Beat 1: Weight forward, stride begins. Beat 2: Full motion through space, environment scrolls past. Beat 3: Arrives at new position, posture adjusts to new context.",
      trial: "Beat 1: Reaching motion begins, body extends. Beat 2: Contact — thing slips or resists, body strains. Beat 3: Result — either grasps or loses, posture shows outcome.",
      chase: "Beat 1: Glance behind, fear registers. Beat 2: Sprint accelerates, limbs pump. Beat 3: Obstacle cleared mid-stride, pursuer visible behind.",
    };
    return templates[scene.beat_type] || "Beat 1: Preparation — body shifts weight. Beat 2: Primary action — visible displacement. Beat 3: Reaction — new position, consequence visible.";
  }
  
  // Low-escalation: still physical but measured
  const templates: Record<string, string> = {
    introduction: "Beat 1: Shadow solidifies from darkness, outline sharpens. Beat 2: First limb moves — arm extends or head lifts. Beat 3: Full figure revealed in new stance, presence established.",
    moral: "Beat 1: Tension held in posture, hands clenched. Beat 2: Release — hands open, shoulders drop, breath visible. Beat 3: Figure smaller against expanding backdrop, at peace.",
    revelation: "Beat 1: Frozen mid-gesture, processing. Beat 2: Head snaps up, posture transforms from hunched to alert. Beat 3: Reaches toward truth with new understanding.",
  };
  return templates[scene.beat_type] || "Beat 1: Initial position, weight shifts. Beat 2: Primary movement, body displaces through space. Beat 3: Arrival at new state, posture changed.";
}

/**
 * Convert pose verbs to trajectory verbs for more dynamic output.
 */
function upgradeToTrajectoryVerbs(action: string): string {
  const VERB_UPGRADES: Record<string, string> = {
    "steps": "strides",
    "walks": "pushes forward",
    "stands": "braces",
    "rises": "surges upward",
    "kneels": "buckles to knees",
    "sits": "drops low",
    "looks": "snaps focus toward",
    "gazes": "locks eyes on",
    "holds": "grips tight, knuckles white",
    "watches": "tracks with full body rotation",
    "turns": "pivots hard",
    "reaches": "lunges for",
    "touches": "slams hand against",
    "runs": "tears forward at full sprint",
    "walks forward": "drives forward with momentum",
    "steps forward": "launches into stride",
    "stands tall": "straightens explosively",
    "stands alone": "braces against emptiness",
  };
  
  let result = action;
  for (const [pose, trajectory] of Object.entries(VERB_UPGRADES)) {
    // Replace whole-word matches (case insensitive)
    const regex = new RegExp(`\\b${pose}\\b`, 'gi');
    result = result.replace(regex, trajectory);
  }
  return result;
}

/**
 * Build a V3 Myth Mode prompt - ACTION PHYSICS FIRST, style secondary.
 * 
 * V3.1 Changes (motion overhaul):
 * - Trajectory verbs replace pose verbs
 * - 3-beat motion sequences (anticipation → action → follow-through)
 * - Environment motion injected (was ignored before)
 * - Prompt ratio flipped: ~60% action, ~20% style, ~20% context
 * - Transformation as continuous journey, not "from X to Y" keyframes
 * 
 * NO:
 * - "frame-by-frame"
 * - "handcrafted motion"  
 * - "stop-motion"
 * - any line that implies low FPS / choppy movement
 */
/**
 * Subject audit: Ensure the character archetype is the grammatical subject
 * of the action line's primary clause. (Blocker 1 fix)
 * 
 * Problem: "A warrior sword gleams, guides, pulls" → sword is the subject
 * Fix: "The warrior grips the sword as it gleams" → warrior is the subject
 */
function auditSubject(actionLine: string, archetype: string): string {
  // Common object-as-subject patterns where the character's prop does the verbing
  const OBJECT_SUBJECT_PATTERNS = [
    // "warrior sword gleams" → sword is doing the action
    /\b(sword|blade|staff|shield|hammer|axe|spear|dagger|bow|arrow|weapon)\s+(gleams?|shines?|glows?|pulses?|hums?|vibrates?|shatters?|breaks?|fragments?|cracks?|splits?|bursts?)\b/gi,
    // "warrior fragments scatter" → fragments are doing the action
    /\b(fragments?|shards?|pieces?|debris|dust|sparks?|embers?|flames?|light|shadow|darkness)\s+(scatter|spread|fly|drift|swirl|coalesce|gather|explode|burst|rain|fall|rise|glow|pulse)\b/gi,
  ];
  
  let result = actionLine;
  
  for (const pattern of OBJECT_SUBJECT_PATTERNS) {
    result = result.replace(pattern, (match, object, verb) => {
      // Rewrite so the character acts WITH/ON the object
      return `${archetype}'s ${object} ${verb} as the ${archetype}`;
    });
  }
  
  // Ensure the first clause starts with the archetype
  // If after object audit, first word isn't "A/The [archetype]", restructure
  const firstClause = result.split(/[,.]/, 1)[0].toLowerCase();
  const archetypeLower = archetype.toLowerCase();
  if (!firstClause.includes(archetypeLower)) {
    // Prepend the archetype as subject
    result = `The ${archetype} — ${result}`;
  }
  
  return result;
}

/**
 * Build an inline transformation phrase (Blocker 5 fix).
 * Instead of "Scene begins: X. Through the action, it becomes: Y" (two keyframes → morph),
 * embed the transformation INTO the action as a continuous physical process.
 */
function buildInlineTransformation(startState: string, endState: string): string {
  const startClean = truncateClean(startState, 50);
  const endClean = truncateClean(endState, 50);
  // Describe as continuous journey, not two keyframes
  return ` — starting from ${startClean}, through the action shifting into ${endClean}`;
}

export function buildMythPromptV3(
  scene: MythScene,
  storyboard: Partial<MythStoryboard>,
  settings?: { intensity_profile?: "contemplative" | "action" | "epic" }
): string {
  const character = storyboard.character;
  const setting = storyboard.setting;
  const isAction = settings?.intensity_profile === "action" || settings?.intensity_profile === "epic";
  
  // =========================================================================
  // BLOCK 1: ACTION PHYSICS (~60% of prompt) — HIGHEST PRIORITY
  // =========================================================================
  
  const archetype = character?.archetype || "solitary figure";
  const rawAction = scene.silhouette_action || scene.visual_description || "moves through the scene";
  
  // Upgrade pose verbs to trajectory verbs
  const dynamicAction = upgradeToTrajectoryVerbs(rawAction);
  
  // SUBJECT AUDIT (Blocker 1): Ensure archetype is the grammatical subject
  const auditedAction = auditSubject(dynamicAction, archetype);
  
  // INLINE TRANSFORMATION (Blocker 5): Embed change into action, not as "begins/becomes"
  let transformPhrase = "";
  if (scene.start_state && scene.end_state) {
    transformPhrase = buildInlineTransformation(scene.start_state, scene.end_state);
  }
  
  const actionLine = `The ${archetype} ${auditedAction}${transformPhrase}.`;
  
  // FORCE + ESCALATION (compact header)
  const escalationParts: string[] = [];
  if (scene.force_present) escalationParts.push(`FORCE: ${scene.force_type || "unknown"}`);
  if (scene.escalation_delta && scene.escalation_delta > 0) escalationParts.push(`ESC=${scene.escalation_delta}`);
  if (scene.setpiece_delta && scene.setpiece_delta > 0) escalationParts.push(`SETPIECE=${scene.setpiece_delta}`);
  if (scene.threat_vector) escalationParts.push(`THREAT: ${scene.threat_vector}`);
  const escalationHeader = escalationParts.length > 0 ? escalationParts.join(" | ") : "";
  
  // 3-BEAT MOTION SEQUENCE (now scene-specific via Blocker 3 fix)
  const motionBeats = buildMythMotionBeats(scene);
  
  // ENVIRONMENT MOTION
  let envMotionLine = "";
  if (scene.environment_motion && scene.environment_motion.length > 0) {
    envMotionLine = `ENVIRONMENT ACTION: ${scene.environment_motion.join(". ")}.`;
  }
  
  // =========================================================================
  // BLOCK 2: CONTEXT (~20% of prompt)
  // =========================================================================
  
  const realm = setting?.realm || "timeless realm";
  const settingLine = `Setting: ${realm}, layered paper depths.`;
  
  // =========================================================================
  // BLOCK 3: STYLE (~20% of prompt) — SHORT, non-conflicting
  // =========================================================================
  
  // Compact style — one line, not multiple blocks
  const styleLine = "STYLE: Shadow silhouettes, high contrast, fluid articulated motion.";
  
  // LIGHT BEHAVIOR (Blocker 6 fix): Use action-intensity lighting when appropriate
  const lightLine = isAction
    ? (ACTION_LIGHT_BEHAVIOR[scene.beat_type] || ACTION_LIGHT_BEHAVIOR.battle)
    : (LIGHT_BEHAVIOR_V2[scene.beat_type] || LIGHT_BEHAVIOR_V2.journey);
  
  // Minimal negatives
  const avoidLine = "No realistic faces.";
  
  // =========================================================================
  // ASSEMBLE: Action-heavy ordering
  // =========================================================================
  
  const parts: string[] = [];
  
  // Action physics FIRST (this is what matters most)
  parts.push(actionLine);
  if (escalationHeader) parts.push(escalationHeader);
  parts.push(`MOTION SEQUENCE:\n${motionBeats}`);
  if (envMotionLine) parts.push(envMotionLine);
  
  // Context SECOND
  parts.push(settingLine);
  
  // Style LAST (minimal)
  parts.push(styleLine);
  parts.push(lightLine);
  parts.push(avoidLine);
  
  return parts.join("\n\n");
}
