/**
 * Motion Amplification Module
 * 
 * Solves the "I2V static scene" problem where Sora treats starting frames
 * as "hold pose" constraints. This module injects explicit motion demands
 * at the TOP of prompts to overpower the anchoring effect.
 * 
 * Key insight: I2V gives visual continuity, but kills motion unless
 * you DEMAND 2-3 distinct motion beats at the very start of the prompt.
 */

import type { SceneRole } from "./scene-role-router.ts";

/** Provider-specific motion amplification strength */
export type MotionStrength = "maximum" | "strong" | "moderate";

/** Extracted action structure for explicit motion commands */
export interface ActionBreakdown {
  subjectAction: string;      // What the character does
  cameraAction: string;       // Camera movement
  environmentAction: string;  // Background/environmental motion
  primaryVerb: string;        // Main action verb for emphasis
}

/**
 * Common action verbs for extraction
 */
const ACTION_VERBS = [
  // Movement
  "walks", "runs", "jumps", "climbs", "falls", "steps", "moves", "dances",
  "turns", "spins", "rotates", "swings", "reaches", "grabs", "holds",
  // State changes
  "melts", "freezes", "transforms", "grows", "shrinks", "expands", "dissolves",
  "drips", "flows", "pours", "splashes", "scatters", "crumbles",
  // Character actions
  "looks", "watches", "gazes", "stares", "glances", "blinks", "smiles",
  "speaks", "talks", "laughs", "cries", "sighs", "breathes", "gasps",
  // Object interactions
  "picks", "drops", "throws", "catches", "pushes", "pulls", "lifts",
  "opens", "closes", "touches", "feels", "presses", "squeezes",
];

/**
 * Camera movement keywords
 */
const CAMERA_KEYWORDS = [
  "pan", "tilt", "dolly", "zoom", "track", "push", "pull", "crane",
  "whip", "rack focus", "follow", "orbit", "steadicam", "handheld",
];

/**
 * Environment motion keywords
 */
const ENVIRONMENT_KEYWORDS = [
  "wind", "rain", "snow", "clouds", "leaves", "dust", "smoke", "fire",
  "water", "waves", "ripples", "shadows", "light", "particles", "debris",
];

/**
 * Extract action verbs from a prompt
 */
export function extractActionVerbs(prompt: string): string[] {
  if (!prompt) return [];
  
  const normalized = prompt.toLowerCase();
  const found: string[] = [];
  
  for (const verb of ACTION_VERBS) {
    // Match verb or its -ing form
    const patterns = [
      new RegExp(`\\b${verb}\\b`, "i"),
      new RegExp(`\\b${verb.replace(/s$/, "")}ing\\b`, "i"),
    ];
    
    for (const pattern of patterns) {
      if (pattern.test(normalized) && !found.includes(verb)) {
        found.push(verb);
      }
    }
  }
  
  return found;
}

/**
 * Extract camera movement from a prompt
 */
export function extractCameraAction(prompt: string): string {
  if (!prompt) return "subtle camera movement";
  
  const normalized = prompt.toLowerCase();
  
  for (const keyword of CAMERA_KEYWORDS) {
    if (normalized.includes(keyword)) {
      // Find the surrounding context
      const regex = new RegExp(`([^.]*\\b${keyword}\\b[^.]*)`, "i");
      const match = prompt.match(regex);
      if (match) {
        return match[1].trim().slice(0, 60);
      }
    }
  }
  
  return "subtle camera movement";
}

/**
 * Extract environment motion from a prompt
 */
export function extractEnvironmentAction(prompt: string): string {
  if (!prompt) return "ambient environmental motion";
  
  const normalized = prompt.toLowerCase();
  
  for (const keyword of ENVIRONMENT_KEYWORDS) {
    if (normalized.includes(keyword)) {
      return `${keyword} creates visible movement`;
    }
  }
  
  return "ambient environmental motion";
}

/**
 * Break down a prompt into explicit action components
 */
export function extractActionBreakdown(prompt: string): ActionBreakdown {
  const verbs = extractActionVerbs(prompt);
  const primaryVerb = verbs[0] || "moves";
  
  // Try to extract the subject action (character + verb phrase)
  const subjectMatch = prompt.match(
    /(?:character|person|man|woman|figure|he|she|they|it)\s+([^,.]+(?:ing|s|es)[^,.]*)/i
  );
  const subjectAction = subjectMatch?.[1]?.trim() || 
    (primaryVerb + " with visible motion");
  
  return {
    subjectAction,
    cameraAction: extractCameraAction(prompt),
    environmentAction: extractEnvironmentAction(prompt),
    primaryVerb,
  };
}

/**
 * Determine motion strength based on provider
 */
export function getMotionStrength(provider: "sora" | "runway" | "luma"): MotionStrength {
  switch (provider) {
    case "sora":
      return "maximum"; // Sora over-anchors the most
    case "runway":
      return "strong";  // Runway is better but still needs emphasis
    case "luma":
      return "moderate"; // Luma handles physics naturally
    default:
      return "strong";
  }
}

/**
 * Build the Sora-specific motion amplification block (STRONGEST)
 * 
 * This goes at the VERY TOP of the prompt before anything else.
 */
export function buildSoraMotionAmplification(
  breakdown: ActionBreakdown,
  prevAction?: string
): string {
  const previousComplete = prevAction 
    ? `\nPREVIOUS ACTION COMPLETE: "${prevAction}" is FINISHED and must not continue.`
    : "";
  
  return `═══════════════════════════════════════════════════════════════
CRITICAL MOTION REQUIREMENT (I2V - NOT A HOLD)
═══════════════════════════════════════════════════════════════

⚠️ THIS IS NOT A STILL IMAGE. PRODUCE 2-3 DISTINCT MOTION BEATS.

MOTION BEATS REQUIRED:
• Beat 1: Initial movement (setup)
• Beat 2: Primary action (${breakdown.primaryVerb})
• Beat 3: Follow-through or reaction

SUBJECT MOTION IS MANDATORY:
• Subject must physically ${breakdown.subjectAction}
• Motion must be visible in silhouette (head turn, step, arm swing)
• Particles/drips alone do NOT satisfy this requirement

POSE DRIFT REQUIREMENT:
• End frame composition must differ 15-30% from start frame
• Subject pose/position must visibly change by shot end
• Static hold is a FAILURE
${previousComplete}

CAMERA MOTION: ${breakdown.cameraAction}
ENVIRONMENT: ${breakdown.environmentAction}

If motion seems subtle in the prompt, EXAGGERATE it until it reads clearly.
Camera motion does NOT count unless subject also changes pose.

═══════════════════════════════════════════════════════════════

`;
}

/**
 * Build Runway-specific motion amplification (STRONG)
 */
export function buildRunwayMotionAmplification(
  breakdown: ActionBreakdown,
  prevAction?: string
): string {
  const previousNote = prevAction 
    ? ` Previous action "${prevAction}" is complete.`
    : "";
  
  return `[MOTION DIRECTIVE]
2-3 visible motion beats required. Subject ${breakdown.primaryVerb} with clear movement.
Pose must change by end of shot.${previousNote}
Primary motion: ${breakdown.subjectAction}
Camera: ${breakdown.cameraAction}

---

`;
}

/**
 * Build Luma-specific motion amplification (MODERATE)
 */
export function buildLumaMotionAmplification(
  breakdown: ActionBreakdown,
  prevAction?: string
): string {
  const previousNote = prevAction ? ` Continue from completed "${prevAction}".` : "";
  
  return `[Motion] Multiple beats: ${breakdown.subjectAction}. Pose evolves through shot.${previousNote}

`;
}

/**
 * Apply motion amplification to a prompt for I2V scenes
 * 
 * This is the main entry point. It:
 * 1. Extracts actions from the prompt
 * 2. Builds a provider-specific motion block
 * 3. Prepends it to the TOP of the prompt
 * 
 * @param prompt - The base prompt (may already have cinematography)
 * @param provider - Target video provider
 * @param prevAction - Previous scene's action (for "completed" constraint)
 * @param isI2V - Whether this is an I2V scene (T2V doesn't need this)
 * @param role - Scene role (some roles skip amplification)
 */
export function applyMotionAmplification(
  prompt: string,
  provider: "sora" | "runway" | "luma",
  prevAction: string | null,
  isI2V: boolean,
  role: SceneRole
): string {
  // T2V doesn't need motion amplification (no starting frame anchor)
  if (!isI2V) {
    return prompt;
  }
  
  // Hooks and CTAs are short attention-grabbers, less motion emphasis needed
  // (but we still include it for I2V - just less aggressive)
  const isShortForm = role === "hook" || role === "cta";
  
  // Extract action breakdown from the prompt
  const breakdown = extractActionBreakdown(prompt);
  
  // Build provider-specific motion block
  let motionBlock: string;
  
  switch (provider) {
    case "sora":
      if (isShortForm) {
        // Lighter version for hooks
        motionBlock = `[MOTION: Subject must ${breakdown.primaryVerb} with visible movement. Not a still.]\n\n`;
      } else {
        motionBlock = buildSoraMotionAmplification(breakdown, prevAction || undefined);
      }
      break;
      
    case "runway":
      motionBlock = buildRunwayMotionAmplification(breakdown, prevAction || undefined);
      break;
      
    case "luma":
      motionBlock = buildLumaMotionAmplification(breakdown, prevAction || undefined);
      break;
      
    default:
      motionBlock = "";
  }
  
  // Motion block goes at the VERY TOP
  return motionBlock + prompt;
}

/**
 * Extract the primary action verb phrase for logging/debugging
 */
export function summarizeMotionIntent(prompt: string): string {
  const breakdown = extractActionBreakdown(prompt);
  return `${breakdown.primaryVerb}: ${breakdown.subjectAction}`.slice(0, 60);
}
