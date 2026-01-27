/**
 * Narrative Context Layer
 * 
 * Injects story-level meaning into video prompts to transform
 * isolated clips into connected narrative beats.
 * 
 * Key insight: Visual continuity (I2V) ≠ Narrative continuity.
 * This module provides the "cause → effect" glue that makes
 * scenes feel like a story, not a slideshow.
 * 
 * NEW: Spectacle Scene System - subject_required=false allows scenes
 * without the protagonist, enabling "Medieval War with Dragons" style
 * cross-cutting for maximum action freedom.
 */

import type { SceneRole } from "./scene-role-router.ts";

// ============================================================================
// Coverage Type System
// ============================================================================

/**
 * Coverage type determines camera framing and whether face is visible.
 * This is the final authority on I2V vs T2V.
 */
export type CoverageType = 
  | "face" | "body" | "back" | "wide" | "pov" | "obscured" | "none";

/**
 * Alternate subject types for spectacle scenes
 */
export type AlternateSubject = 
  | "environment" | "creature" | "object" | "abstract" | "threat";

/**
 * Coverage types that allow maximum motion freedom (T2V)
 */
const MOTION_FREE_COVERAGE: CoverageType[] = ["back", "wide", "pov", "obscured", "none"];

/**
 * Coverage types that require face preservation (I2V)
 */
const FACE_CRITICAL_COVERAGE: CoverageType[] = ["face"];

/**
 * Default coverage by scene role (fallback when not explicitly set)
 */
const DEFAULT_COVERAGE_BY_ROLE: Record<SceneRole, CoverageType> = {
  hook: "wide",
  problem: "obscured",
  story_a: "body",
  reset: "back",
  story_b: "body",
  cta: "face",
  atmosphere: "wide",
  establish: "wide",
};

/**
 * Verb patterns that suggest back/silhouette shots
 */
const BACK_SHOT_TRIGGERS = [
  "sprint away", "runs toward", "retreats", "escapes", "flees",
  "walks away", "moves away", "heads toward", "runs away"
];

/**
 * Verb patterns that suggest wide/establishing shots
 */
const WIDE_SHOT_TRIGGERS = [
  "across the", "through the landscape", "establishing",
  "environment", "vast", "panoramic", "overhead", "aerial"
];

/**
 * Verb patterns that suggest POV shots
 */
const POV_TRIGGERS = [
  "dives", "falls", "plunges", "tumbles", "first person",
  "subjective", "pov", "helmet cam", "visor view", "rushes toward"
];

/**
 * Patterns that suggest obscured face (environmental effects)
 */
const OBSCURED_TRIGGERS = [
  "storm", "dust", "rain", "fog", "darkness", "blur", "smoke",
  "sand", "debris", "particles", "mist", "shadow"
];

/**
 * Infer coverage type from prompt text
 * 3-tier fallback: provided → inferred from verbs → default by role
 */
export function inferCoverageFromPrompt(
  prompt: string | undefined | null,
  role: SceneRole,
  explicitCoverage?: CoverageType
): CoverageType {
  // Tier 1: Use explicit coverage if provided
  if (explicitCoverage) {
    return explicitCoverage;
  }
  
  // Tier 2: Infer from prompt text (with null safety)
  if (!prompt) {
    // No prompt available - fall back to role-based default
    return DEFAULT_COVERAGE_BY_ROLE[role] || "body";
  }
  
  const lower = prompt.toLowerCase();
  
  if (BACK_SHOT_TRIGGERS.some(t => lower.includes(t))) return "back";
  if (WIDE_SHOT_TRIGGERS.some(t => lower.includes(t))) return "wide";
  if (POV_TRIGGERS.some(t => lower.includes(t))) return "pov";
  if (OBSCURED_TRIGGERS.some(t => lower.includes(t))) return "obscured";
  
  // Check for explicit face mentions (close-up, face, expression)
  if (lower.includes("close-up") || lower.includes("closeup") || 
      lower.includes("face") || lower.includes("expression")) {
    return "face";
  }
  
  // Tier 3: Default by role
  return DEFAULT_COVERAGE_BY_ROLE[role] || "body";
}

/**
 * Determine cut type from coverage (FINAL AUTHORITY)
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 * FACE-ONLY I2V RULE (Critical for action variety)
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * ONLY coverage=face gets I2V (Image-to-Video with previous frame anchor).
 * ALL OTHER COVERAGE TYPES get T2V (Text-to-Video) for maximum motion freedom.
 * 
 * Why: I2V doesn't just preserve the character - it preserves:
 * - Camera distance/angle
 * - Staging and blocking
 * - Lighting direction and contrast
 * - Background composition
 * 
 * This causes scenes to look identical ("video game cutscene" effect).
 * 
 * The fix: Use Character Bible in prompts for identity (prompt continuity),
 * not pixel chaining (I2V). Reserve I2V ONLY for face close-ups where
 * identity fidelity is critical.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
export function getCutTypeFromCoverage(
  coverageType: CoverageType,
  hasGoodReference: boolean,
  _characterContinuityMode: boolean // Kept for API compat but no longer affects decision
): { cutType: "hard" | "continuity"; reason: string } {
  // ════════════════════════════════════════════════════════════════════════════
  // FACE-ONLY I2V: Only face coverage preserves pixels
  // ════════════════════════════════════════════════════════════════════════════
  if (coverageType === "face") {
    return hasGoodReference 
      ? { cutType: "continuity", reason: `coverage=face → I2V (preserve identity)` }
      : { cutType: "hard", reason: `coverage=face but no reference → T2V` };
  }
  
  // ════════════════════════════════════════════════════════════════════════════
  // ALL OTHER COVERAGE: T2V for motion freedom
  // Identity maintained via Character Bible in prompt, not pixels
  // ════════════════════════════════════════════════════════════════════════════
  
  // body: Used to allow I2V with CCM, now ALWAYS T2V
  // This is the key fix for "scenes 4/5/6 identical" problem
  if (coverageType === "body") {
    return { cutType: "hard", reason: `coverage=body → T2V (Bible mode: identity via prompt, not pixels)` };
  }
  
  // back, wide, pov, obscured, none: Always T2V (motion-free coverage)
  if (MOTION_FREE_COVERAGE.includes(coverageType)) {
    return { cutType: "hard", reason: `coverage=${coverageType} → T2V (motion freedom)` };
  }
  
  // Default: T2V
  return { cutType: "hard", reason: `coverage=${coverageType} → T2V (default)` };
}

/**
 * Build coverage directive for prompt injection
 * Non-face scenes get a "motion freedom" directive
 */
export function buildCoverageDirective(coverageType: CoverageType): string {
  if (FACE_CRITICAL_COVERAGE.includes(coverageType)) {
    return ""; // No override needed for face shots
  }
  
  const directives: Record<CoverageType, string> = {
    face: "", // Not used
    back: "[COVERAGE: Back/silhouette shot. Face NOT visible. PRIORITIZE motion over identity.]\n",
    wide: "[COVERAGE: Wide environmental shot. Figure is small. PRIORITIZE composition and motion.]\n",
    pov: "[COVERAGE: POV/first-person. No face visible. FULL motion freedom - show the ACTION.]\n",
    obscured: "[COVERAGE: Face obscured by elements (dust/rain/blur). Motion is priority.]\n",
    body: "[COVERAGE: Full-body shot. Face secondary to motion. Body continuity only.]\n",
    none: "[COVERAGE: Pure spectacle. No character identity needed. MAXIMIZE motion, scale, awe.]\n",
  };
  
  return directives[coverageType] || "";
}

// ============================================================================
// SPECTACLE SCENE SYSTEM
// ============================================================================

/**
 * Build spectacle directive for scenes without protagonist
 * This frees the model from any character identity constraints
 * 
 * NEW: Includes IMPACT BEAT requirement for action-oriented spectacle
 */
export function buildSpectacleDirective(alternateSubject?: AlternateSubject): string {
  if (!alternateSubject) {
    return `[SPECTACLE SHOT: No protagonist needed. Focus on environment/spectacle. MAXIMIZE motion, scale, visual impact.]
[IMPACT BEAT REQUIRED: Something must COLLIDE/EXPLODE/SHATTER/SURGE by clip end. END FRAME MUST BE VISIBLY DIFFERENT from start.]

`;
  }
  
  const subjectHints: Record<AlternateSubject, string> = {
    environment: "Focus on landscape, weather, atmosphere, scale. No character needed. Show the WORLD CHANGING.",
    creature: "Focus on creature/monster/threat. Maximize menace, power, and motion. Show the BEAST ATTACKING or MOVING AGGRESSIVELY.",
    object: "Focus on artifact/portal/vehicle. Detail, mystery, and significance. Show it ACTIVATING, GLOWING, TRANSFORMING.",
    abstract: "Pure visual spectacle. Cosmic, surreal, overwhelming. Show MASSIVE CHANGE - expansion, collapse, transformation.",
    threat: "Show the DANGER. Explosion, destruction, approaching doom. Make it visceral and immediate. DESTRUCTION REQUIRED.",
  };
  
  return `[SPECTACLE SHOT: ${subjectHints[alternateSubject]}]
[IMPACT BEAT REQUIRED: Something must COLLIDE/EXPLODE/SHATTER/SURGE by clip end. END FRAME MUST BE VISIBLY DIFFERENT from start.]

`;
}

/**
 * Check if a scene is a spectacle scene (subject not required)
 */
export function isSpectacleScene(scene: { subject_required?: boolean; alternate_subject?: AlternateSubject }): boolean {
  return scene.subject_required === false || !!scene.alternate_subject;
}

/**
 * Get spectacle handling for prompt assembly
 * Returns directives and flags for spectacle scene processing
 */
export function getSpectacleHandling(scene: {
  subject_required?: boolean;
  alternate_subject?: AlternateSubject;
  coverage_type?: CoverageType;
}): {
  isSpectacle: boolean;
  forceT2V: boolean;
  directive: string;
  stripIdentity: boolean;
} {
  const spectacle = isSpectacleScene(scene);
  
  if (!spectacle) {
    return {
      isSpectacle: false,
      forceT2V: false,
      directive: "",
      stripIdentity: false,
    };
  }
  
  // Spectacle scenes: always T2V, strip identity tokens
  return {
    isSpectacle: true,
    forceT2V: true,
    directive: buildSpectacleDirective(scene.alternate_subject),
    stripIdentity: true, // Signal to strip character bible from prompt
  };
}

// ============================================================================
// Narrative Scene Types
// ============================================================================

/**
 * Scene data required for narrative context injection
 */
export interface NarrativeScene {
  id: string;
  prompt: string;
  role: SceneRole;
  change_type: string;
  narration_line?: string;
  action_summary?: string;
  // NEW: Transformation fields for A→B descriptions
  state_from?: string;
  state_to?: string;
  end_state?: string;
  // NEW: Coverage type for action vs identity
  coverage_type?: CoverageType;
  // NEW: Spectacle scene fields (subject freedom)
  subject_required?: boolean;
  alternate_subject?: AlternateSubject;
}

/**
 * Story-level context for narrative injection
 */
export interface NarrativeStoryContext {
  storySpine: string;
  totalScenes: number;
  allScenes: NarrativeScene[];
  motifAnchors?: string[];
}

/**
 * Build compact narrative context block for prompt injection
 * 
 * Uses machine-readable format (fewer tokens, better compliance)
 * than ASCII boxes which burn tokens.
 * 
 * For I2V: This goes AFTER motion amplification (motion first breaks hold)
 * For T2V: This goes at the TOP (establishes intent)
 * 
 * SPECTACLE SCENES: Use neutral language (events, not protagonist actions)
 * to avoid "dragging" the protagonist into non-character scenes.
 */
export function buildNarrativeContextBlock(
  storyContext: NarrativeStoryContext,
  currentSceneIndex: number,
  prevScene: NarrativeScene | null,
): string {
  const currentScene = storyContext.allScenes[currentSceneIndex];
  if (!currentScene) return "";
  
  const sceneNum = currentSceneIndex + 1;
  const total = storyContext.totalScenes;
  
  // Check if this is a spectacle scene
  const isSpectacle = currentScene.subject_required === false || !!currentScene.alternate_subject;
  
  // === SPECTACLE SCENES: Neutral language, no protagonist references ===
  if (isSpectacle) {
    return buildSpectacleNarrativeContext(currentScene, prevScene, sceneNum, total, storyContext);
  }
  
  // === HERO SCENES: Standard narrative context with protagonist ===
  
  // Build prev_end from: end_state > state_to > action_summary > prompt extraction
  const prevEnd = prevScene 
    ? (prevScene.end_state || prevScene.state_to || prevScene.action_summary || extractLastAction(prevScene.prompt))
    : null;
  
  // Build current intent from: narration_line > action_summary > role label
  const nowIntent = currentScene.narration_line 
    || currentScene.action_summary 
    || `${currentScene.role} beat`;
  
  // Build show_change from state_from/state_to if available
  const showChange = buildShowChange(currentScene);
  
  // Build end_state hint (what should be true at end of this clip)
  const endState = currentScene.end_state || buildEndStateFromTransformation(currentScene);
  
  // Compact format (no ASCII art - saves tokens, better model compliance)
  let block = `[STORY_CTX s=${sceneNum}/${total} role=${currentScene.role} change=${currentScene.change_type}]\n`;
  
  // Only include ARC if we have a meaningful spine
  if (storyContext.storySpine && storyContext.storySpine.length > 10) {
    // Truncate spine to ~100 chars for token efficiency
    const truncatedSpine = storyContext.storySpine.length > 120 
      ? storyContext.storySpine.slice(0, 117) + "..."
      : storyContext.storySpine;
    block += `ARC: ${truncatedSpine}\n`;
  }
  
  // Previous beat end state (critical for cause→effect)
  if (prevEnd) {
    block += `PREV_END: ${prevEnd}\n`;
  }
  
  // Current intent
  block += `NOW_INTENT: "${nowIntent}"\n`;
  
  // Show change rules (visual deltas)
  if (showChange) {
    block += `SHOW_CHANGE: ${showChange}\n`;
  }
  
  // End state expectation
  if (endState) {
    block += `END_STATE: ${endState}\n`;
  }
  
  block += "\n";
  
  return block;
}

/**
 * Build narrative context for SPECTACLE scenes
 * Uses event-based language, not protagonist-based
 * 
 * Key difference: "PREV_EVENT" and "THIS_EVENT" instead of 
 * protagonist-referencing "PREV_END" and "NOW_INTENT"
 */
function buildSpectacleNarrativeContext(
  currentScene: NarrativeScene,
  prevScene: NarrativeScene | null,
  sceneNum: number,
  total: number,
  storyContext: NarrativeStoryContext
): string {
  const subjectLabel = currentScene.alternate_subject || "spectacle";
  
  // Build PREV_EVENT from previous scene's observable outcome (neutral terms)
  let prevEvent: string | null = null;
  if (prevScene) {
    // Use end_state but strip protagonist references
    const rawEnd = prevScene.end_state || prevScene.state_to || prevScene.action_summary || "";
    prevEvent = stripProtagonistReferences(rawEnd);
  }
  
  // Build THIS_EVENT from action_summary in neutral terms
  const rawIntent = currentScene.action_summary || currentScene.narration_line || `${subjectLabel} action`;
  const thisEvent = stripProtagonistReferences(rawIntent);
  
  // Build end_state in event terms
  const endEvent = stripProtagonistReferences(currentScene.end_state || "");
  
  let block = `[SPECTACLE_CTX s=${sceneNum}/${total} focus=${subjectLabel}]\n`;
  block += `NO_CHARACTER_IDENTITY_NEEDED\n`;
  
  // Previous event (what just happened)
  if (prevEvent) {
    block += `PREV_EVENT: ${prevEvent}\n`;
  }
  
  // This event (what happens now)
  block += `THIS_EVENT: "${thisEvent}"\n`;
  
  // End event (what should be true after)
  if (endEvent) {
    block += `END_EVENT: ${endEvent}\n`;
  }
  
  block += "\n";
  
  return block;
}

/**
 * Strip protagonist references from text to make it event-focused
 * Replaces "the astronaut", "the knight", etc. with neutral terms
 */
function stripProtagonistReferences(text: string): string {
  if (!text) return "";
  
  // Common protagonist patterns to strip/replace
  const patterns: Array<[RegExp, string]> = [
    // "The [role] does X" → "X happens"
    [/\bthe\s+(astronaut|knight|hero|protagonist|character|figure|person|warrior|soldier|explorer|adventurer)\b/gi, ""],
    [/\b(astronaut|knight|hero|protagonist|character|figure|warrior|soldier|explorer|adventurer)\s+(is|are|was|were|has|have|had)\b/gi, ""],
    [/\b(astronaut|knight|hero|protagonist|character|figure|warrior|soldier|explorer|adventurer)'s\b/gi, ""],
    // "watches as" → just the event
    [/\bwatches as\b/gi, ""],
    [/\bsees\b/gi, ""],
    [/\breacts to\b/gi, ""],
    // Clean up resulting double spaces
    [/\s+/g, " "],
  ];
  
  let result = text;
  for (const [pattern, replacement] of patterns) {
    result = result.replace(pattern, replacement);
  }
  
  return result.trim();
}

/**
 * Extract last meaningful action from a prompt (fallback)
 */
function extractLastAction(prompt: string): string {
  if (!prompt) return "";
  
  // Try to find verb phrases
  const sentences = prompt.split(/[.!?]/);
  const lastMeaningful = sentences
    .map(s => s.trim())
    .filter(s => s.length > 10)
    .pop();
  
  return lastMeaningful 
    ? lastMeaningful.slice(0, 60) + (lastMeaningful.length > 60 ? "..." : "")
    : "";
}

/**
 * Build SHOW_CHANGE from state_from/state_to transformation
 */
function buildShowChange(scene: NarrativeScene): string | null {
  if (scene.state_from && scene.state_to) {
    return `${scene.state_from}→${scene.state_to}`;
  }
  
  // Fallback: generate from change_type
  const changeTypeHints: Record<string, string> = {
    emotion: "facial expression, body language shift",
    goal: "action direction changes, new target",
    stakes: "tension in posture, environment intensity",
    location: "background transition, movement through space",
    info: "reveal/discovery reaction, eye movement",
  };
  
  return changeTypeHints[scene.change_type] || null;
}

/**
 * Infer end_state from transformation or role
 */
function buildEndStateFromTransformation(scene: NarrativeScene): string | null {
  // If we have state_to, that's the end state
  if (scene.state_to) {
    return scene.state_to;
  }
  
  // Role-based end state hints
  const roleEndStates: Partial<Record<SceneRole, string>> = {
    hook: "attention captured, question posed",
    problem: "tension established, problem visible",
    story_a: "situation understood, stakes clear",
    reset: "palate cleansed, energy shifted",
    story_b: "transformation complete, resolution visible",
    cta: "call to action delivered, next step clear",
  };
  
  return roleEndStates[scene.role] || null;
}

// ========================================
// NARRATIVE CUT BUDGET
// ========================================

/**
 * Transition pairs that should force T2V (hard cut)
 * for narrative contrast
 */
const FORCE_T2V_TRANSITIONS: Array<{ from: SceneRole; to: SceneRole; priority: number }> = [
  { from: "hook", to: "problem", priority: 10 },    // Always: establish conflict
  { from: "story_a", to: "reset", priority: 5 },    // Often: break before palate cleanser
  { from: "reset", to: "story_b", priority: 4 },    // Often: fresh energy for payoff
  { from: "problem", to: "story_a", priority: 2 },  // Sometimes: shift to action
];

/**
 * Determine if a scene transition should force T2V based on narrative structure
 * 
 * Uses a "hard cut budget" to limit identity drift:
 * - Max 2 hard cuts per 6-scene story (beyond the first scene)
 * - hook→problem is always allowed (most important)
 * - Others compete for remaining budget
 */
export function shouldForceNarrativeT2V(
  sceneIndex: number,
  prevRole: SceneRole | null,
  currentRole: SceneRole,
  totalScenes: number,
  hardCutsUsed: number,
): { forceT2V: boolean; reason: string } {
  // First scene is always T2V (no reference)
  if (sceneIndex === 0) {
    return { forceT2V: true, reason: "first scene" };
  }
  
  if (!prevRole) {
    return { forceT2V: false, reason: "no previous role" };
  }
  
  // Hard cut budget: scale with story length
  // 6 scenes → 2 cuts, 8 scenes → 2-3 cuts
  const maxHardCuts = Math.floor(totalScenes / 3);
  
  // Find matching transition rule
  const matchingRule = FORCE_T2V_TRANSITIONS.find(
    t => t.from === prevRole && t.to === currentRole
  );
  
  if (!matchingRule) {
    return { forceT2V: false, reason: "no matching narrative rule" };
  }
  
  // hook→problem always gets priority (never consumes budget if first)
  if (matchingRule.from === "hook" && matchingRule.to === "problem") {
    return { forceT2V: true, reason: "hook→problem narrative break" };
  }
  
  // Check budget
  if (hardCutsUsed >= maxHardCuts) {
    return { 
      forceT2V: false, 
      reason: `budget exhausted (${hardCutsUsed}/${maxHardCuts})` 
    };
  }
  
  // Apply the rule
  return { 
    forceT2V: true, 
    reason: `${prevRole}→${currentRole} narrative break (${hardCutsUsed + 1}/${maxHardCuts})` 
  };
}

/**
 * Count hard cuts already used in a story based on cut_type assignments
 */
export function countHardCutsUsed(
  scenes: Array<{ cut_type?: "hard" | "continuity"; role?: SceneRole }>,
  upToIndex: number
): number {
  let count = 0;
  for (let i = 1; i < upToIndex && i < scenes.length; i++) {
    // First scene doesn't count toward budget (it's always hard)
    if (scenes[i].cut_type === "hard") {
      count++;
    }
  }
  return count;
}

// ========================================
// STORY GLUE SCORE (QUALITY HEURISTIC)
// ========================================

/**
 * Reaction verbs that indicate narrative connection
 */
const REACTION_VERBS = [
  "responds", "recoils", "notices", "decides", "accepts", "realizes",
  "reacts", "sees", "hears", "feels", "understands", "discovers",
  "turns", "looks", "watches", "observes", "hesitates", "approaches",
];

/**
 * Delta phrases that indicate transformation
 */
const DELTA_PHRASES = [
  "from", "to", "shifts", "changes", "transforms", "becomes",
  "transitions", "moves", "evolves", "grows", "softens", "hardens",
  "opens", "closes", "relaxes", "tenses",
];

/**
 * Calculate "story glue" score for a scene
 * 
 * Returns 0-3 based on:
 * - Has reaction verb? (+1)
 * - Has delta phrase? (+1) 
 * - Has end_state? (+1)
 * 
 * Score of 2+ indicates good narrative connection.
 */
export function calculateGlueScore(scene: NarrativeScene): number {
  let score = 0;
  
  const textToCheck = [
    scene.action_summary || "",
    scene.narration_line || "",
    scene.prompt || "",
  ].join(" ").toLowerCase();
  
  // Check for reaction verbs
  if (REACTION_VERBS.some(v => textToCheck.includes(v))) {
    score++;
  }
  
  // Check for delta phrases
  if (DELTA_PHRASES.some(p => textToCheck.includes(p))) {
    score++;
  }
  
  // Check for end_state
  if (scene.end_state || scene.state_to) {
    score++;
  }
  
  return score;
}

/**
 * Check if a storyboard has sufficient narrative glue
 * 
 * Returns true if average glue score >= 2
 */
export function hasGoodNarrativeGlue(scenes: NarrativeScene[]): boolean {
  if (scenes.length === 0) return false;
  
  const totalScore = scenes.reduce((sum, scene) => sum + calculateGlueScore(scene), 0);
  const avgScore = totalScore / scenes.length;
  
  return avgScore >= 1.5; // Slightly lower threshold to allow some weaker scenes
}
