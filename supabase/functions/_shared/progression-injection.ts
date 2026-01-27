/**
 * Progression Injection Module
 * 
 * Injects "delta directives" into prompts for I2V scenes to prevent
 * repeated actions. While motif-injection handles visual continuity,
 * this module enforces narrative progression.
 * 
 * Key insight: I2V gives continuity. Progression must be explicitly commanded.
 */

import type { SceneRole } from "./scene-role-router.ts";

/** Valid change types from Director Brain */
export type ChangeType = "info" | "emotion" | "goal" | "stakes" | "location";

export interface ProgressionContext {
  /** 1-sentence summary of what happened in the previous scene */
  prev_scene_summary: string;
  /** Main action verb phrase from previous scene */
  prev_action: string;
  /** Main action verb phrase for this scene */
  next_action: string;
  /** What type of change should be visible */
  change_type: ChangeType;
  /** Actions that MUST NOT recur */
  must_not_repeat: string[];
}

/**
 * Normalize change_type to valid ChangeType enum.
 * Maps legacy/invalid values to appropriate defaults.
 */
export function normalizeChangeType(raw: string): ChangeType {
  const normalized = raw?.toLowerCase().trim() || "info";
  
  // Direct matches
  if (["info", "emotion", "goal", "stakes", "location"].includes(normalized)) {
    return normalized as ChangeType;
  }
  
  // Common aliases
  const aliases: Record<string, ChangeType> = {
    "action": "goal",      // "action" maps to goal (what character does)
    "setting": "location", // "setting" maps to location
    "place": "location",
    "feeling": "emotion",
    "mood": "emotion",
    "tension": "stakes",
    "risk": "stakes",
    "reveal": "info",
    "information": "info",
  };
  
  return aliases[normalized] || "info";
}

/**
 * Extract the main action from a prompt.
 * Uses simple heuristics to find the dominant verb phrase.
 */
export function extractActionFromPrompt(prompt: string): string {
  if (!prompt) return "previous beat";
  
  const normalized = prompt.toLowerCase().trim();
  
  // Priority 1: Look for explicit action phrases
  const explicitPatterns = [
    /(?:character |person |man |woman |he |she |they )([\w\s]+?(?:ing|es|s))\b/i,
    /\b(walks?|runs?|eats?|drinks?|looks?|watches?|sits?|stands?|moves?|dances?|fights?|cries?|laughs?|talks?|speaks?|works?|plays?|reads?|writes?|cooks?|sleeps?|wakes?|picks? up|puts? down|takes?|grabs?|holds?|reaches?|opens?|closes?|turns?|discovers?|realizes?|reacts?|notices?|spits?|falls?|jumps?|climbs?|swims?|flies?)\b/i,
  ];
  
  for (const pattern of explicitPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      return match[1]?.trim() || match[0]?.trim();
    }
  }
  
  // Priority 2: Take first meaningful clause (up to 40 chars, before comma/period)
  const firstClause = normalized
    .split(/[,.:;!?]/)[0]
    ?.trim()
    .slice(0, 40);
  
  if (firstClause && firstClause.length > 5) {
    return firstClause;
  }
  
  return "previous beat";
}

/**
 * Generate a 1-sentence summary from a prompt
 */
export function summarizePrompt(prompt: string): string {
  if (!prompt) return "Previous scene";
  
  const firstSentence = prompt.split(/[.!?]/)[0]?.trim();
  if (firstSentence && firstSentence.length < 100) {
    return firstSentence;
  }
  return prompt.slice(0, 100).replace(/[,.!?].*$/, '').trim() + "...";
}

/**
 * Build progression context from previous and current scene data.
 * 
 * IMPORTANT: Pass the RAW scene prompts (not compiled provider prompts)
 * for better action extraction.
 */
export function buildProgressionContext(
  prevPrompt: string,
  nextPrompt: string,
  changeType: string = "info"
): ProgressionContext {
  const prevAction = extractActionFromPrompt(prevPrompt);
  const nextAction = extractActionFromPrompt(nextPrompt);
  const normalizedChangeType = normalizeChangeType(changeType);
  
  return {
    prev_scene_summary: summarizePrompt(prevPrompt),
    prev_action: prevAction,
    next_action: nextAction,
    change_type: normalizedChangeType,
    must_not_repeat: [prevAction],
  };
}

/**
 * Inject Sora-style progression directive (MOTION AT TOP)
 * 
 * CRITICAL: Motion directives go at the TOP of the prompt, not the bottom.
 * Sora processes sequentially - if cinematography specs come first, it
 * "sets the scene" as static before reaching action commands.
 * 
 * This version makes the "previous beat finished" constraint explicit.
 */
export function injectSoraProgression(prompt: string, ctx: ProgressionContext): string {
  // Motion directive at TOP - this is the key change
  return `═══ NARRATIVE PROGRESSION (CRITICAL) ═══

PREVIOUS ACTION FINISHED: "${ctx.prev_action}" is COMPLETE and must not continue.
Start this shot in the END STATE of the previous scene.

NEW ACTION REQUIRED: ${ctx.next_action}
This is the new beat - execute it with visible motion.

WHAT CHANGES: ${ctx.change_type}
Show this change clearly through character action or environment.

IDENTITY: Maintain character appearance, wardrobe, environment.
Camera motion alone does NOT satisfy the action requirement.

═══════════════════════════════════════

${prompt}`;
}

/**
 * Inject Runway-style progression directive (compact, motion-first)
 */
export function injectRunwayProgression(prompt: string, ctx: ProgressionContext): string {
  // Runway gets a compact but forceful version
  return `[BEAT TRANSITION]
Previous: "${ctx.prev_action}" ← DONE
New action: ${ctx.next_action}
Change: ${ctx.change_type}
Subject must move. Camera motion ≠ action.

${prompt}`;
}

/**
 * Inject Luma-style progression directive (atmosphere-aware)
 */
export function injectLumaProgression(prompt: string, ctx: ProgressionContext): string {
  // Luma respects physics naturally, lighter touch needed
  return `[Continue] Previous "${ctx.prev_action}" complete. New: ${ctx.next_action}. Change: ${ctx.change_type}.

${prompt}`;
}

/**
 * Provider-aware progression injection.
 * Only injects for I2V scenes (sceneIndex > 0).
 */
export function injectProgressionDirective(
  prompt: string,
  ctx: ProgressionContext,
  provider: "sora" | "runway" | "luma",
  role: SceneRole
): string {
  // Hooks don't need progression (they're attention-grabbers)
  // CTAs don't need progression (they're action directives)
  if (role === "hook" || role === "cta") {
    return prompt;
  }
  
  switch (provider) {
    case "sora":
      return injectSoraProgression(prompt, ctx);
    case "runway":
      return injectRunwayProgression(prompt, ctx);
    case "luma":
      return injectLumaProgression(prompt, ctx);
    default:
      return prompt;
  }
}

/**
 * Main entry point for progression injection in the chain continuation.
 * 
 * @param basePrompt - The compiled provider prompt
 * @param prevPrompt - The previous scene's prompt (for action extraction)
 * @param sceneIndex - Current scene index (0 = skip injection)
 * @param changeType - What should change (from storyboard)
 * @param provider - Target video provider
 * @param role - Scene role for skip logic
 * @returns The prompt, enhanced with progression directive if applicable
 */
export function applyProgressionInjection(
  basePrompt: string,
  prevPrompt: string | null,
  sceneIndex: number,
  changeType: string,
  provider: "sora" | "runway" | "luma",
  role: SceneRole
): string {
  // Skip for first scene (no previous context)
  if (sceneIndex === 0 || !prevPrompt) {
    return basePrompt;
  }
  
  // Build progression context
  const ctx = buildProgressionContext(prevPrompt, basePrompt, changeType);
  
  // Inject provider-specific directive
  return injectProgressionDirective(basePrompt, ctx, provider, role);
}
