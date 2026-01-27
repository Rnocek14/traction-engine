/**
 * Film Continuity Mode
 * 
 * Zero legacy guardrails. Clean implementation based on OpenAI's own guidance:
 * - Face-only I2V (everything else T2V)
 * - Variety contract (no duplicate shot signatures)
 * - Minimal prompts (one camera move + one action)
 * - Character bible via text anchors only
 * - 2-3 rotating realism hints per scene
 */

// =============================================================================
// TYPES
// =============================================================================

export interface CharacterBible {
  name?: string;
  wardrobe: string;
  physique?: string;
  distinguishing_features?: string[];
  palette?: string[];
}

export interface LocationLogic {
  setting: string;
  time_of_day: string;
  weather?: string;
  light_quality: string;
  color_palette: string[];
}

export interface ShotSignature {
  framing: "extreme_wide" | "wide" | "medium" | "medium_close" | "close" | "extreme_close";
  angle: "eye_level" | "low" | "high" | "dutch" | "birds_eye" | "worms_eye";
  motion: "static" | "push_in" | "pull_back" | "pan" | "track" | "crane" | "handheld" | "whip";
  lens: "24mm" | "35mm" | "50mm" | "85mm" | "135mm";
}

export interface FilmScene {
  id: string;
  index: number;
  
  // Core action (one clear thing)
  subject_action: string;      // Single verb phrase: "SPRINTS through smoke"
  camera_move: string;         // Single camera instruction: "tracking behind"
  
  // Coverage determines I2V vs T2V
  coverage: "face" | "body" | "back" | "wide" | "pov" | "obscured" | "none";
  subject_required: boolean;   // false = spectacle shot
  
  // Shot signature for variety enforcement
  shot_signature: ShotSignature;
  
  // Timing
  duration_seconds: number;
  timing_beats?: string;       // "1-2: anticipation, 3-4: action, 5: settle"
  
  // Visual delta (what changes from previous)
  setpiece_delta: string;      // "fire spreads to second tower"
  
  // Optional
  alternate_subject?: string;  // For spectacle: "dragon", "collapsing wall"
  realism_hints?: string[];    // Max 2-3 rotating hints
}

export interface FilmStoryboard {
  title: string;
  story_spine: string;         // One sentence premise
  
  character_bible: CharacterBible;
  location_logic: LocationLogic;
  
  scenes: FilmScene[];
}

// =============================================================================
// SHOT SIGNATURE VARIETY CONTRACT
// =============================================================================

const FRAMING_OPTIONS: ShotSignature["framing"][] = ["extreme_wide", "wide", "medium", "medium_close", "close", "extreme_close"];
const ANGLE_OPTIONS: ShotSignature["angle"][] = ["eye_level", "low", "high", "dutch", "birds_eye", "worms_eye"];
const MOTION_OPTIONS: ShotSignature["motion"][] = ["static", "push_in", "pull_back", "pan", "track", "crane", "handheld", "whip"];
const LENS_OPTIONS: ShotSignature["lens"][] = ["24mm", "35mm", "50mm", "85mm", "135mm"];

/**
 * Check if two shot signatures collide (too similar)
 */
export function signaturesCollide(a: ShotSignature, b: ShotSignature): boolean {
  let matches = 0;
  if (a.framing === b.framing) matches++;
  if (a.angle === b.angle) matches++;
  if (a.motion === b.motion) matches++;
  if (a.lens === b.lens) matches++;
  
  // Collision if 3+ of 4 elements match
  return matches >= 3;
}

/**
 * Generate a non-colliding shot signature
 */
export function generateNonCollidingSignature(
  previous: ShotSignature | null,
  sceneType: "action" | "spectacle" | "emotional" | "establishing"
): ShotSignature {
  // Scene-appropriate defaults
  const defaults: Record<string, Partial<ShotSignature>> = {
    action: { motion: "track", angle: "low", framing: "medium" },
    spectacle: { motion: "crane", angle: "high", framing: "wide", lens: "24mm" },
    emotional: { motion: "push_in", framing: "close", lens: "85mm" },
    establishing: { motion: "static", framing: "extreme_wide", lens: "24mm" },
  };
  
  const base = defaults[sceneType] || defaults.action;
  
  const signature: ShotSignature = {
    framing: base.framing || "medium",
    angle: base.angle || "eye_level",
    motion: base.motion || "track",
    lens: base.lens || "50mm",
  };
  
  // If no previous, return as-is
  if (!previous) return signature;
  
  // Force at least 2 differences from previous
  let attempts = 0;
  while (signaturesCollide(signature, previous) && attempts < 10) {
    // Randomly change one element that matches
    if (signature.framing === previous.framing) {
      signature.framing = FRAMING_OPTIONS[Math.floor(Math.random() * FRAMING_OPTIONS.length)];
    }
    if (signature.motion === previous.motion) {
      signature.motion = MOTION_OPTIONS[Math.floor(Math.random() * MOTION_OPTIONS.length)];
    }
    if (signature.angle === previous.angle) {
      signature.angle = ANGLE_OPTIONS[Math.floor(Math.random() * ANGLE_OPTIONS.length)];
    }
    attempts++;
  }
  
  return signature;
}

// =============================================================================
// REALISM HINTS (rotated, max 2-3 per scene)
// =============================================================================

const REALISM_POOL = [
  // Camera imperfections
  "subtle handheld micro-jitter",
  "operator breathing sway",
  "minor focus drift on motion",
  
  // Exposure/light
  "natural exposure shift as fire enters frame",
  "practical firelight flicker on faces",
  "moon rim light catching dust",
  "atmospheric haze catching backlight",
  
  // Motion artifacts
  "motion blur on whip movements",
  "shutter roll on fast action",
  
  // Environmental
  "dust particles catching light",
  "smoke drifting through frame",
  "embers floating past lens",
  "debris interaction with air",
  
  // Film texture
  "filmic contrast falloff",
  "natural color separation",
];

/**
 * Pick 2-3 non-repeating realism hints
 */
export function pickRealismHints(previouslyUsed: string[]): string[] {
  const available = REALISM_POOL.filter(h => !previouslyUsed.includes(h));
  const count = 2 + Math.floor(Math.random() * 2); // 2 or 3
  
  const picked: string[] = [];
  for (let i = 0; i < count && available.length > 0; i++) {
    const idx = Math.floor(Math.random() * available.length);
    picked.push(available.splice(idx, 1)[0]);
  }
  
  return picked;
}

// =============================================================================
// CUT TYPE LOGIC (Face-only I2V)
// =============================================================================

export type CutType = "t2v" | "i2v";

/**
 * Determine cut type based on coverage
 * RULE: Only face gets I2V. Everything else is T2V.
 */
export function getCutType(scene: FilmScene): CutType {
  // Spectacle = always T2V
  if (!scene.subject_required) return "t2v";
  
  // Face = I2V (identity matters)
  if (scene.coverage === "face") return "i2v";
  
  // Everything else = T2V (action freedom)
  return "t2v";
}

// =============================================================================
// MINIMAL PROMPT BUILDER
// =============================================================================

/**
 * Build a minimal, focused prompt following OpenAI's guidance:
 * - One clear camera move
 * - One clear subject action
 * - Timing in beats
 * - Character bible as text anchors
 * - Light/palette consistency
 * - 2-3 realism hints
 * 
 * NO: motion amplification, progression injection, capture contracts,
 *     role-based cinematography blocks, director briefs, negative lists
 */
export function buildFilmPrompt(
  scene: FilmScene,
  storyboard: FilmStoryboard,
  isFirstScene: boolean
): string {
  const { character_bible, location_logic } = storyboard;
  const { shot_signature } = scene;
  
  const parts: string[] = [];
  
  // 1. Character anchor (text only, not pixel)
  if (scene.subject_required && character_bible) {
    parts.push(`CHARACTER: ${character_bible.wardrobe}${character_bible.physique ? `, ${character_bible.physique}` : ""}`);
  }
  
  // 2. Location/light logic (consistency across cuts)
  parts.push(`SETTING: ${location_logic.setting}, ${location_logic.time_of_day}`);
  parts.push(`LIGHT: ${location_logic.light_quality}`);
  if (location_logic.color_palette.length > 0) {
    parts.push(`PALETTE: ${location_logic.color_palette.join(", ")}`);
  }
  
  // 3. Shot description (framing + lens + angle)
  const shotDesc = `${shot_signature.framing.replace("_", " ")} shot, ${shot_signature.lens} lens, ${shot_signature.angle.replace("_", " ")} angle`;
  parts.push(`SHOT: ${shotDesc}`);
  
  // 4. Camera move (one clear instruction)
  parts.push(`CAMERA: ${scene.camera_move}`);
  
  // 5. Subject action (one clear action)
  if (scene.subject_required) {
    parts.push(`ACTION: ${scene.subject_action}`);
  } else {
    parts.push(`EVENT: ${scene.alternate_subject || ""} — ${scene.subject_action}`);
  }
  
  // 6. Timing beats (if provided)
  if (scene.timing_beats) {
    parts.push(`TIMING: ${scene.timing_beats}`);
  }
  
  // 7. Setpiece delta (what changes)
  if (scene.setpiece_delta) {
    parts.push(`CHANGE: ${scene.setpiece_delta}`);
  }
  
  // 8. Realism hints (2-3 max)
  if (scene.realism_hints && scene.realism_hints.length > 0) {
    parts.push(`REALISM: ${scene.realism_hints.join("; ")}`);
  }
  
  return parts.join("\n");
}

// =============================================================================
// ANCHOR LIBRARY (face/body/environment references)
// =============================================================================

export interface AnchorLibrary {
  face_anchor_url?: string;      // Best close-up frame
  body_anchor_url?: string;      // Full body, neutral pose
  environment_anchor_url?: string; // Establishing frame
}

/**
 * Get the appropriate anchor for I2V based on coverage
 */
export function getAnchorForScene(
  scene: FilmScene,
  library: AnchorLibrary
): string | null {
  // Only face coverage gets I2V
  if (scene.coverage !== "face") return null;
  
  // Prefer face anchor, fall back to body
  return library.face_anchor_url || library.body_anchor_url || null;
}

/**
 * Update anchor library from a completed scene
 */
export function updateAnchorLibrary(
  library: AnchorLibrary,
  scene: FilmScene,
  thumbnailUrl: string
): AnchorLibrary {
  const updated = { ...library };
  
  // Update appropriate anchor based on what this scene captured
  if (scene.coverage === "face") {
    updated.face_anchor_url = thumbnailUrl;
  } else if (scene.coverage === "body" && !updated.body_anchor_url) {
    updated.body_anchor_url = thumbnailUrl;
  } else if (scene.coverage === "wide" && !updated.environment_anchor_url) {
    updated.environment_anchor_url = thumbnailUrl;
  }
  
  return updated;
}

// =============================================================================
// STORYBOARD GENERATION PROMPT
// =============================================================================

export function buildStoryboardGenerationPrompt(
  premise: string,
  characterDescription: string,
  sceneCount: number = 6
): string {
  return `Generate a ${sceneCount}-scene cinematic storyboard for a short film.

PREMISE: ${premise}

CHARACTER: ${characterDescription}

RULES (STRICT):
1. Each scene has ONE clear camera move and ONE clear subject action
2. No two consecutive scenes may share the same:
   - Framing (wide/medium/close)
   - Camera motion (track/pan/crane/static)
   - Primary action verb
3. Coverage variety required:
   - At least 1 face shot (for identity payoff)
   - At least 2 non-face shots (back/wide/pov for action freedom)
   - At least 1 spectacle shot (subject_required=false)
4. Each scene must have a visible "setpiece_delta" (something changes)
5. Timing: describe action in beats (1-2: anticipation, 3-4: action, 5: settle)

SCENE TYPES:
- "face" coverage: emotional beats, reveals, reactions (gets I2V)
- "body/back/wide" coverage: action, movement, chase (gets T2V)
- "spectacle" (subject_required=false): environment, threat, explosion

OUTPUT JSON:
{
  "title": "...",
  "story_spine": "one sentence premise",
  "character_bible": {
    "wardrobe": "specific clothing",
    "physique": "build/posture",
    "distinguishing_features": ["scar", "cape color", etc]
  },
  "location_logic": {
    "setting": "where",
    "time_of_day": "golden hour / night / dawn",
    "light_quality": "harsh firelight / soft moonlight / etc",
    "color_palette": ["amber", "shadow", "steel"]
  },
  "scenes": [
    {
      "index": 0,
      "subject_action": "SPRINTS through smoke (single verb phrase)",
      "camera_move": "tracking behind, low angle",
      "coverage": "back",
      "subject_required": true,
      "shot_signature": {
        "framing": "medium",
        "angle": "low",
        "motion": "track",
        "lens": "35mm"
      },
      "duration_seconds": 4,
      "timing_beats": "1: launches forward, 2-3: full sprint, 4: debris near-miss",
      "setpiece_delta": "tower collapses behind"
    }
  ]
}`;
}
