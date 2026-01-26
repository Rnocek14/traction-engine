/**
 * Cut Cadence Zone System
 * 
 * Defines attention-science-based duration zones for short-form video.
 * Each zone has optimal cut speeds that match viewer psychology.
 */

import type { SceneRole } from "@/types/scene-roles";

// ============================================================================
// Types
// ============================================================================

export type CutZone = "hook" | "setup" | "escalation" | "payoff" | "button";

export interface ZoneConfig {
  zone: CutZone;
  /** Duration range [min, max] in seconds */
  durationRange: [number, number];
  /** Descriptive cut speed */
  cutSpeed: "very_fast" | "fast" | "medium" | "slow" | "hold";
  /** Human-readable description */
  description: string;
}

export interface DurationSuggestion {
  zone: CutZone;
  recommended: number;
  min: number;
  max: number;
  reason: string;
}

// ============================================================================
// Zone Configurations
// ============================================================================

/**
 * Zone definitions based on attention science:
 * 
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  Zone        │ Duration Range │ Cut Speed  │ Typical Roles     │
 * ├─────────────────────────────────────────────────────────────────┤
 * │  hook        │ 0.4s - 0.9s    │ Very Fast  │ hook              │
 * │  setup       │ 1.2s - 2.0s    │ Medium     │ problem, story_a  │
 * │  escalation  │ 1.0s - 1.8s    │ Fast       │ reset, story_b    │
 * │  payoff      │ 1.8s - 3.5s    │ Slow       │ cta, atmosphere   │
 * │  button      │ 1.0s - 2.0s    │ Clean Hold │ cta (final)       │
 * └─────────────────────────────────────────────────────────────────┘
 */
export const ZONE_CONFIGS: Record<CutZone, ZoneConfig> = {
  hook: {
    zone: "hook",
    durationRange: [0.4, 0.9],
    cutSpeed: "very_fast",
    description: "Stop scroll, create question - rapid pattern interrupt",
  },
  setup: {
    zone: "setup",
    durationRange: [1.2, 2.0],
    cutSpeed: "medium",
    description: "Establish what is happening - give context",
  },
  escalation: {
    zone: "escalation",
    durationRange: [1.0, 1.8],
    cutSpeed: "fast",
    description: "Build tension, keep energy rising",
  },
  payoff: {
    zone: "payoff",
    durationRange: [1.8, 3.5],
    cutSpeed: "slow",
    description: "Let the resolution land - emotional weight",
  },
  button: {
    zone: "button",
    durationRange: [1.0, 2.0],
    cutSpeed: "hold",
    description: "Clean final frame for CTA overlay",
  },
};

// ============================================================================
// Role-to-Zone Mapping
// ============================================================================

/**
 * Map scene roles to their optimal cut zones
 */
export const ROLE_TO_ZONE: Record<SceneRole, CutZone> = {
  hook: "hook",
  problem: "setup",
  story_a: "setup",
  reset: "escalation",
  story_b: "escalation",
  cta: "payoff",
  atmosphere: "payoff",
  establish: "setup",
};

// ============================================================================
// Duration Logic
// ============================================================================

/**
 * Get zone for a scene role
 */
export function getZoneForRole(role: SceneRole): CutZone {
  return ROLE_TO_ZONE[role] || "setup";
}

/**
 * Get zone config for a scene role
 */
export function getZoneConfig(role: SceneRole): ZoneConfig {
  const zone = getZoneForRole(role);
  return ZONE_CONFIGS[zone];
}

/**
 * Suggest duration based on zone and narrative position
 * 
 * @param role Scene role
 * @param sceneIndex Position in story (0-indexed)
 * @param totalScenes Total number of scenes
 * @param isFinalScene Whether this is the last scene (for "button" zone)
 */
export function suggestDurationForZone(
  role: SceneRole,
  sceneIndex: number,
  totalScenes: number,
  isFinalScene: boolean = false
): DurationSuggestion {
  // Final CTA uses "button" zone for clean hold
  const effectiveZone = (isFinalScene && role === "cta") ? "button" : getZoneForRole(role);
  const config = ZONE_CONFIGS[effectiveZone];
  
  const [min, max] = config.durationRange;
  
  // Calculate recommended duration based on position
  // Early scenes lean shorter, later scenes can breathe
  const positionRatio = sceneIndex / Math.max(totalScenes - 1, 1);
  
  let recommended: number;
  let reason: string;
  
  if (effectiveZone === "hook") {
    // Hooks are always fast - no position adjustment
    recommended = min + (max - min) * 0.3;
    reason = "Pattern interrupt - keep it punchy";
  } else if (effectiveZone === "button") {
    // Button zone needs clean hold
    recommended = min + (max - min) * 0.5;
    reason = "Clean hold for CTA overlay";
  } else if (positionRatio < 0.3) {
    // Early scenes - lean toward shorter
    recommended = min + (max - min) * 0.3;
    reason = "Early in story - keep momentum";
  } else if (positionRatio > 0.7) {
    // Late scenes - can be longer for payoff
    recommended = min + (max - min) * 0.7;
    reason = "Late in story - let it land";
  } else {
    // Middle scenes - use midpoint
    recommended = min + (max - min) * 0.5;
    reason = "Building toward payoff";
  }
  
  return {
    zone: effectiveZone,
    recommended: Math.round(recommended * 10) / 10,
    min,
    max,
    reason,
  };
}

/**
 * Get duration guidance string for UI display
 */
export function getDurationGuidance(role: SceneRole, isFinal: boolean = false): string {
  const zone = (isFinal && role === "cta") ? "button" : getZoneForRole(role);
  const config = ZONE_CONFIGS[zone];
  return `${config.durationRange[0]}s – ${config.durationRange[1]}s (${config.cutSpeed.replace("_", " ")})`;
}

/**
 * Check if a duration is within zone guidelines
 */
export function isDurationInZone(
  role: SceneRole,
  duration: number,
  isFinal: boolean = false
): { inZone: boolean; guidance: string } {
  const zone = (isFinal && role === "cta") ? "button" : getZoneForRole(role);
  const config = ZONE_CONFIGS[zone];
  const [min, max] = config.durationRange;
  
  if (duration < min) {
    return {
      inZone: false,
      guidance: `Too short for ${zone} zone (min ${min}s)`,
    };
  }
  
  if (duration > max) {
    return {
      inZone: false,
      guidance: `Too long for ${zone} zone (max ${max}s)`,
    };
  }
  
  return {
    inZone: true,
    guidance: `Optimal for ${zone} zone`,
  };
}

// ============================================================================
// Cut Cadence Analysis
// ============================================================================

/**
 * Recommended cut cadence by story segment (for reference)
 * 
 * 0.0–2.0s (Hook zone): cut every 0.4–0.9s
 *   → goal: stop scroll + establish curiosity
 * 
 * 2.0–10s (Setup + Inciting problem): cut every 1.2–2.0s
 *   → goal: "what is happening" becomes clear
 * 
 * 10–22s (Escalation + twist): cut every 1.0–1.8s
 *   → goal: keep tension rising
 * 
 * 22–30s (Payoff): allow 1.8–3.5s shots
 *   → goal: let the resolution land
 * 
 * Last 1–2s (CTA button): 1 clean shot + clear text
 */

export interface CadenceSegment {
  startTime: number;
  endTime: number;
  zone: CutZone;
  cutRange: [number, number];
  goal: string;
}

/**
 * Get cadence segments for a target video duration
 */
export function getCadenceSegments(targetDuration: number): CadenceSegment[] {
  // Normalize to percentages for different durations
  const segments: CadenceSegment[] = [
    {
      startTime: 0,
      endTime: Math.min(2, targetDuration * 0.06),
      zone: "hook",
      cutRange: [0.4, 0.9],
      goal: "Stop scroll + establish curiosity",
    },
    {
      startTime: Math.min(2, targetDuration * 0.06),
      endTime: Math.min(10, targetDuration * 0.3),
      zone: "setup",
      cutRange: [1.2, 2.0],
      goal: "What is happening becomes clear",
    },
    {
      startTime: Math.min(10, targetDuration * 0.3),
      endTime: Math.min(22, targetDuration * 0.7),
      zone: "escalation",
      cutRange: [1.0, 1.8],
      goal: "Keep tension rising",
    },
    {
      startTime: Math.min(22, targetDuration * 0.7),
      endTime: targetDuration - 2,
      zone: "payoff",
      cutRange: [1.8, 3.5],
      goal: "Let the resolution land",
    },
    {
      startTime: targetDuration - 2,
      endTime: targetDuration,
      zone: "button",
      cutRange: [1.0, 2.0],
      goal: "Clean CTA + clear text",
    },
  ];
  
  return segments.filter(s => s.endTime > s.startTime);
}
