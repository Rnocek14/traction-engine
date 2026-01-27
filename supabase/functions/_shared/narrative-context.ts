/**
 * Narrative Context Layer
 * 
 * Injects story-level meaning into video prompts to transform
 * isolated clips into connected narrative beats.
 * 
 * Key insight: Visual continuity (I2V) ≠ Narrative continuity.
 * This module provides the "cause → effect" glue that makes
 * scenes feel like a story, not a slideshow.
 */

import type { SceneRole } from "./scene-role-router.ts";

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
