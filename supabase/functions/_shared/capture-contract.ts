/**
 * Capture Contract - Film Realism Prior Activation
 * 
 * Shifts the video model's prior from "render this scene" to "this was captured on-location."
 * Uses minimal, positive-framing language to avoid prompt bloat and negative-language triggers.
 * 
 * Scene difficulty scaling ensures interior hero shots get stronger realism anchors
 * while wide/exterior scenes with natural chaos masking get minimal intervention.
 */

import { type SceneRole } from "./scene-role-router.ts";

// Coverage type for compatibility
export type CoverageType = "face" | "body" | "back" | "wide" | "pov" | "obscured" | "none";

/**
 * Scene difficulty levels - determines how much realism intervention is needed
 * 
 * LOW: Wide exterior shots - chaos masks imperfections naturally
 * MEDIUM: Medium exterior or body coverage - some masking
 * HIGH: Interior scenes - everything exposed, needs texture/light anchors
 * CRITICAL: Interior hero/face shots - maximum intervention needed
 */
export type SceneDifficulty = "low" | "medium" | "high" | "critical";

/**
 * Interior detection keywords for auto-classification
 */
const INTERIOR_KEYWORDS = [
  "armory", "hall", "room", "chamber", "throne", "castle interior",
  "inside", "indoors", "corridor", "dungeon", "cellar", "tower",
  "tavern", "forge", "smithy", "workshop", "temple", "sanctuary",
  "library", "vault", "prison", "cell", "quarters", "bedroom",
  "kitchen", "pantry", "storage", "crypt", "catacomb", "cave interior",
];

const EXTERIOR_KEYWORDS = [
  "sky", "horizon", "field", "battlefield", "mountain", "ocean",
  "forest", "desert", "outside", "outdoors", "landscape", "valley",
  "cliff", "shore", "beach", "river", "lake", "plains", "meadow",
  "village square", "courtyard", "rooftop", "wall walk", "rampart",
  "portal", "rift", "vortex", // Often exterior cosmic events
];

/**
 * Material keywords that bump difficulty in interior scenes
 * Metal + indoor lighting is where "game sheen" shows up hardest
 */
const HARD_MATERIAL_KEYWORDS = [
  "armor", "metal", "helmet", "sword", "blade", "shield", "steel",
  "iron", "bronze", "copper", "gold", "silver", "plate", "chainmail",
  "gauntlet", "greave", "breastplate", "pauldron",
];

/**
 * Infer whether a scene is interior based on prompt keywords
 * Uses keyword scoring to determine interior vs exterior bias
 */
export function inferInteriorFromPrompt(prompt: string): boolean {
  const p = prompt.toLowerCase();
  const interiorScore = INTERIOR_KEYWORDS.filter(k => p.includes(k)).length;
  const exteriorScore = EXTERIOR_KEYWORDS.filter(k => p.includes(k)).length;
  
  // Default to exterior if ambiguous (less intervention needed)
  return interiorScore > exteriorScore;
}

/**
 * Check if prompt contains hard materials (metal/armor) that need extra realism
 */
export function hasHardMaterials(prompt: string): boolean {
  const p = prompt.toLowerCase();
  return HARD_MATERIAL_KEYWORDS.some(k => p.includes(k));
}

/**
 * Score scene difficulty based on coverage type, interior status, and materials
 * 
 * @param coverageType - How much of subject is visible (face is hardest)
 * @param isInterior - Whether scene is indoors (less chaos masking)
 * @param hasMetalArmor - Whether scene has reflective materials (hardest for realism)
 * @returns Difficulty level determining capture contract strength
 */
export function scoreSceneDifficulty(
  coverageType: CoverageType,
  isInterior: boolean,
  hasMetalArmor: boolean
): SceneDifficulty {
  // Wide/spectacle = low difficulty (chaos masks fidelity issues)
  if (coverageType === "wide" || coverageType === "none") {
    return "low";
  }
  
  // POV/back shots = low difficulty (no face identity to mess up)
  if (coverageType === "pov" || coverageType === "back") {
    return isInterior ? "medium" : "low";
  }
  
  // Exterior body/obscured = medium (some masking from environment)
  if (!isInterior && (coverageType === "body" || coverageType === "obscured")) {
    return "medium";
  }
  
  // Interior + metal/armor bumps to critical (worst case for game sheen)
  if (isInterior && hasMetalArmor && (coverageType === "face" || coverageType === "body")) {
    return "critical";
  }
  
  // Interior + face = critical (everything exposed)
  if (isInterior && coverageType === "face") {
    return "critical";
  }
  
  // Interior + body = high
  if (isInterior) {
    return "high";
  }
  
  // Exterior face = medium (natural light helps)
  if (coverageType === "face") {
    return "medium";
  }
  
  return "low";
}

/**
 * Auto-score scene difficulty from prompt + coverage
 * Convenience function that combines interior/material detection with scoring
 */
export function autoScoreDifficulty(
  prompt: string,
  coverageType: CoverageType
): { difficulty: SceneDifficulty; isInterior: boolean; hasMetalArmor: boolean } {
  const isInterior = inferInteriorFromPrompt(prompt);
  const hasMetalArmor = hasHardMaterials(prompt);
  const difficulty = scoreSceneDifficulty(coverageType, isInterior, hasMetalArmor);
  
  return { difficulty, isInterior, hasMetalArmor };
}

/**
 * Build the capture contract block based on scene difficulty
 * 
 * Uses positive framing only (no "not rendered", no "avoid", no negatives)
 * Follows the principle: shift prior from "render" to "captured"
 * 
 * @param difficulty - Scene difficulty level
 * @returns Capture contract string to prepend to prompt
 */
export function buildCaptureContract(difficulty: SceneDifficulty): string {
  // Base contract: applies to ALL scenes (establishes live-action prior)
  const base = "[CAPTURE: on-location shoot, practical lighting, shot on film]";
  
  if (difficulty === "low") {
    // Minimal intervention - chaos masks imperfections naturally
    return base + "\n\n";
  }
  
  if (difficulty === "medium") {
    // Add texture anchor for slightly controlled scenes
    return base + "\n" +
      "[TEXTURE: real materials, physical surfaces, natural imperfections]\n\n";
  }
  
  if (difficulty === "high") {
    // Full interior treatment: texture + lighting + optics
    return base + "\n" +
      "[TEXTURE: real materials, weathered surfaces, grime in creases]\n" +
      "[LIGHT: uneven exposure, practical sources only, shadows can crush]\n" +
      "[OPTICS: slight handheld micro-jitter, lens breathing, imperfect focus pulls]\n\n";
  }
  
  // CRITICAL: maximum intervention for interior hero close-ups
  // This is Scene 2 armory territory - needs everything
  return base + "\n" +
    "[TEXTURE: tactile materials, skin pores, cloth weave, metal scratches]\n" +
    "[LIGHT: exposure loss accepted, highlights can blow, shadows can crush]\n" +
    "[OPTICS: slight handheld micro-jitter, lens breathing, imperfect focus pulls]\n" +
    "[PRIORITY: physical realism over visual clarity]\n\n";
}

/**
 * Get a human-readable description of what the capture contract will do
 * Useful for logging and debugging
 */
export function describeCaptureContract(difficulty: SceneDifficulty): string {
  switch (difficulty) {
    case "low":
      return "minimal (base capture contract only)";
    case "medium":
      return "light (+ texture anchors)";
    case "high":
      return "full (+ texture + lighting + optics)";
    case "critical":
      return "maximum (+ priority: realism over clarity)";
  }
}
