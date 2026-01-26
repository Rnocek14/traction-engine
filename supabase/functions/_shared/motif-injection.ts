/**
 * Motif Injection Module
 * 
 * Injects visual motifs subtly into prompts at compile time.
 * Rules:
 * - 3-5 scenes max get motifs
 * - Provider-aware phrasing (Sora = director's note, Luma = atmosphere, Runway = minimal)
 * - Only narrative scenes (no hooks, no CTAs)
 * - Hero shots + stakes/emotion changes prioritized
 * 
 * This lives entirely in prompt compilation — zero storyboard changes.
 */

import type { SceneRole } from "./scene-role-router.ts";

export interface MotifScene {
  id: string;
  role: SceneRole;
  is_hero_shot?: boolean;
  change_type?: string;
}

/**
 * Roles eligible for motif injection (narrative weight, not pattern interrupts)
 */
const MOTIF_ELIGIBLE_ROLES: SceneRole[] = [
  "story_a",
  "story_b", 
  "problem",
  "atmosphere",
  "establish",
];

/**
 * Select which scenes should receive motif injection.
 * Prioritizes hero shots and emotional/stakes beats.
 * Returns a Set of scene IDs for O(1) lookup.
 */
export function selectMotifScenes(scenes: MotifScene[]): Set<string> {
  // Filter to eligible roles
  const eligible = scenes.filter(s => 
    MOTIF_ELIGIBLE_ROLES.includes(s.role)
  );
  
  if (eligible.length === 0) return new Set();
  
  // Hard cap: 3-5 scenes max
  const maxMotifs = Math.min(5, Math.max(3, eligible.length));
  
  // Score each scene: hero + stakes/emotion changes get priority
  const scored = eligible.map(s => ({
    scene: s,
    score: 
      (s.is_hero_shot ? 3 : 0) +
      (s.change_type === "stakes" ? 2 : 0) +
      (s.change_type === "emotion" ? 1 : 0) +
      (s.change_type === "goal" ? 1 : 0),
  }));
  
  // Sort by score descending, take top N
  const selected = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxMotifs)
    .map(x => x.scene.id);
  
  return new Set(selected);
}

/**
 * Pick which motif to use for a given scene index.
 * Rotates through available motifs to avoid repetition.
 */
export function pickMotif(motifs: string[], index: number): string | null {
  if (!motifs.length) return null;
  return motifs[index % motifs.length];
}

/**
 * Inject motif into Sora prompt (cinematic, director's note style)
 */
export function injectSoraMotif(prompt: string, motif: string): string {
  return `${prompt}

DIRECTOR NOTE:
Recurring visual motif: ${motif}.
Appear subtly in background elements, reflections, shadows, or environmental details.
Do not draw focus away from the main subject.`;
}

/**
 * Inject motif into Luma prompt (atmosphere-first)
 */
export function injectLumaMotif(prompt: string, motif: string): string {
  return `${prompt}

Atmosphere includes a faint recurring motif of ${motif}, blended naturally into lighting, particles, or environment.`;
}

/**
 * Inject motif into Runway prompt (minimal, abstract only)
 * Returns unchanged prompt if no motif provided.
 */
export function injectRunwayMotif(prompt: string, motif: string | null): string {
  if (!motif) return prompt;
  return `${prompt}, subtle visual hint of ${motif}, minimal and abstract`;
}

/**
 * Provider-aware motif injection.
 * Returns the prompt with motif injected in provider-specific style.
 */
export function injectMotifForProvider(
  prompt: string,
  motif: string,
  provider: "sora" | "runway" | "luma",
  role: SceneRole
): string {
  // Safety: don't inject on hooks or CTAs even if somehow selected
  if (role === "hook" || role === "cta") {
    return prompt;
  }
  
  switch (provider) {
    case "sora":
      return injectSoraMotif(prompt, motif);
    case "luma":
      return injectLumaMotif(prompt, motif);
    case "runway":
      // Runway resets get optional abstract motif; hooks get none
      if (role === "reset") {
        return injectRunwayMotif(prompt, motif);
      }
      // Other Runway scenes (story_a, story_b, etc.) - minimal injection
      return injectRunwayMotif(prompt, motif);
    default:
      return prompt;
  }
}

/**
 * Main entry point for motif injection pipeline.
 * Call this from the prompt compiler to get a motif-enhanced prompt.
 * 
 * @param basePrompt - The compiled provider prompt (before motif)
 * @param scene - Scene metadata for selection logic
 * @param sceneIndex - Index in the storyboard (for motif rotation)
 * @param motifs - Array of motif strings from storyboard
 * @param motifScenes - Pre-computed Set of scene IDs that should get motifs
 * @param provider - Target video provider
 * @returns The prompt, potentially enhanced with motif
 */
export function applyMotifInjection(
  basePrompt: string,
  scene: MotifScene,
  sceneIndex: number,
  motifs: string[],
  motifScenes: Set<string>,
  provider: "sora" | "runway" | "luma"
): string {
  // Safety valve: no motifs if array is empty
  if (!motifs.length) return basePrompt;
  
  // Only inject if this scene was selected
  if (!motifScenes.has(scene.id)) return basePrompt;
  
  // Pick which motif (rotates through array)
  const motif = pickMotif(motifs, sceneIndex);
  if (!motif) return basePrompt;
  
  // Inject in provider-specific style
  return injectMotifForProvider(basePrompt, motif, provider, scene.role);
}
