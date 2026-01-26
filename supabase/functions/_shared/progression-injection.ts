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

export interface ProgressionContext {
  /** 1-sentence summary of what happened in the previous scene */
  prev_scene_summary: string;
  /** Main action verb phrase from previous scene */
  prev_action: string;
  /** Main action verb phrase for this scene */
  next_action: string;
  /** What type of change should be visible */
  change_type: string;
  /** Actions that MUST NOT recur */
  must_not_repeat: string[];
}

/**
 * Extract the main action from a prompt.
 * Uses simple heuristics to find the dominant verb phrase.
 */
export function extractActionFromPrompt(prompt: string): string {
  // Normalize
  const normalized = prompt.toLowerCase().trim();
  
  // Common action verbs to look for
  const actionPatterns = [
    /(?:is |are )?(walking|running|eating|drinking|looking|watching|sitting|standing|moving|dancing|fighting|crying|laughing|talking|speaking|working|playing|reading|writing|cooking|sleeping|waking)/i,
    /(?:he |she |they |it |man |woman |person |character )(\w+(?:s|ing|es))/i,
    /(picks? up|puts? down|takes?|grabs?|holds?|reaches?|opens?|closes?|turns?|moves?)/i,
  ];
  
  for (const pattern of actionPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      return match[1] || match[0];
    }
  }
  
  // Fallback: take first 30 chars as summary
  return normalized.slice(0, 30).replace(/[,.!?].*/, '').trim() || "previous beat";
}

/**
 * Generate a 1-sentence summary from a prompt
 */
export function summarizePrompt(prompt: string): string {
  // Take first sentence or first 100 chars
  const firstSentence = prompt.split(/[.!?]/)[0]?.trim();
  if (firstSentence && firstSentence.length < 100) {
    return firstSentence;
  }
  return prompt.slice(0, 100).replace(/[,.!?].*$/, '').trim() + "...";
}

/**
 * Build progression context from previous and current scene data
 */
export function buildProgressionContext(
  prevPrompt: string,
  nextPrompt: string,
  changeType: string = "action"
): ProgressionContext {
  const prevAction = extractActionFromPrompt(prevPrompt);
  const nextAction = extractActionFromPrompt(nextPrompt);
  
  return {
    prev_scene_summary: summarizePrompt(prevPrompt),
    prev_action: prevAction,
    next_action: nextAction,
    change_type: changeType,
    must_not_repeat: [prevAction],
  };
}

/**
 * Inject Sora-style progression directive (director's note)
 */
export function injectSoraProgression(prompt: string, ctx: ProgressionContext): string {
  return `${prompt}

DIRECTOR NOTE (story progression):
Continue from the prior shot, but introduce a clearly new beat.
- Previous action: "${ctx.prev_action}" (DO NOT repeat this action)
- New action: ${ctx.next_action}
- What must change: ${ctx.change_type}
Maintain character identity, wardrobe, and environment continuity.`;
}

/**
 * Inject Runway-style progression directive (compact, motion-first)
 */
export function injectRunwayProgression(prompt: string, ctx: ProgressionContext): string {
  return `${prompt}

Same character and setting. NEW action: ${ctx.next_action}. 
Do not repeat: ${ctx.prev_action}. Visible change: ${ctx.change_type}.`;
}

/**
 * Inject Luma-style progression directive (atmosphere-aware)
 */
export function injectLumaProgression(prompt: string, ctx: ProgressionContext): string {
  return `${prompt}

Continue seamlessly with a new beat. 
New action: ${ctx.next_action}
Previous action (${ctx.prev_action}) must not repeat.
Change visible: ${ctx.change_type}`;
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
