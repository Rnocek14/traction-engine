/**
 * Force & Escalation Injection System
 * 
 * Transforms abstract story_forces metadata into concrete prompt directives
 * that video models can execute visually.
 * 
 * Key insight: "force_type: predator" means nothing to Sora.
 * "a predator closes distance, cornering the protagonist" → executable visual.
 */

// =============================================================================
// TYPES
// =============================================================================

export type ForceType = "weather" | "predator" | "time" | "pursuit" | "hazard" | "social" | "resource";
export type EscalationLevel = 0 | 1 | 2 | 3;
export type SanitizationLevel = "off" | "soft" | "strict";

export interface ForceScene {
  force_present?: boolean;
  force_type?: ForceType;
  escalation_delta?: EscalationLevel;
  setpiece_delta?: string;
}

export interface StorySettings {
  brutality_mode?: boolean;
  sanitization_level?: SanitizationLevel;
}

// =============================================================================
// FORCE MANIFESTATION (force_type → concrete visual language)
// =============================================================================

/**
 * Map force_type to provider-executable visual directives
 * 
 * CRITICAL: These are not abstract labels. They are ACTION DESCRIPTIONS
 * that video models can render.
 */
const FORCE_MANIFESTATIONS: Record<ForceType, string[]> = {
  weather: [
    "wind shear BUFFETS the subject, forcing a brace",
    "rain HAMMERS down, visibility dropping",
    "lightning CRACKS nearby, illuminating the chaos",
    "storm surge RISES, water rushing in",
    "dust wall CLOSES IN, engulfing the area",
  ],
  predator: [
    "a predator CLOSES DISTANCE, cornering its target",
    "threat EMERGES from shadow, closing in",
    "hunting presence LOOMS, ready to strike",
    "eyes in darkness TRACK movement, circling",
    "predator LUNGES, forcing evasion",
  ],
  time: [
    "deadline pressure VISIBLE in environment (timer, countdown, closing door)",
    "window of opportunity SHRINKING visibly",
    "last chance urgency in every movement",
    "time running out — environment reflects desperation",
    "final seconds — now or never intensity",
  ],
  pursuit: [
    "pursuit CLOSES IN from behind",
    "escape route NARROWS, options dwindling",
    "chaser GAINS GROUND relentlessly",
    "hunted desperation in every stride",
    "no place to hide — must keep moving",
  ],
  hazard: [
    "ground COLLAPSES beneath, forcing a leap",
    "fire SPREADS, cutting off paths",
    "structure FAILS, debris cascading",
    "trap TRIGGERS, forcing reaction",
    "environment TURNS HOSTILE, crumbling apart",
  ],
  social: [
    "crowd PRESSES IN, suffocating space",
    "judgment and rejection VISIBLE in faces",
    "isolation in the midst of hostility",
    "rivals CIRCLE, threatening dominance",
    "social pressure MOUNTS, cracking composure",
  ],
  resource: [
    "supplies DEPLETING visibly (gauge, meter, container emptying)",
    "exhaustion SHOWING in movement (slower, heavier)",
    "last reserves BURNING, nothing left after this",
    "desperation of scarcity driving action",
    "running on empty — the cost is visible",
  ],
};

/**
 * Get a concrete force manifestation directive for prompt injection
 */
export function getForceManifestationDirective(forceType: ForceType, sceneIndex: number): string {
  const options = FORCE_MANIFESTATIONS[forceType];
  // Rotate through options based on scene index to avoid repetition
  const directive = options[sceneIndex % options.length];
  return `[FORCE: ${forceType.toUpperCase()}] ${directive}`;
}

// =============================================================================
// ESCALATION INJECTION (escalation_delta → verbs, stakes, consequences)
// =============================================================================

/**
 * Escalation band definitions
 * Each band modifies: motion grammar, stakes language, consequence requirements
 */
interface EscalationBand {
  label: string;
  motionGrammar: string;
  stakesLanguage: string;
  consequenceRequired: boolean;
  intensityModifiers: string[];
}

const ESCALATION_BANDS: Record<EscalationLevel, EscalationBand> = {
  0: {
    label: "NEUTRAL",
    motionGrammar: "measured, steady, controlled motion",
    stakesLanguage: "routine, no immediate threat",
    consequenceRequired: false,
    intensityModifiers: ["calm", "deliberate", "unhurried"],
  },
  1: {
    label: "TENSION",
    motionGrammar: "alert, watchful, quickening pace",
    stakesLanguage: "something is wrong, awareness rising",
    consequenceRequired: false,
    intensityModifiers: ["wary", "cautious", "sensing danger"],
  },
  2: {
    label: "URGENCY",
    motionGrammar: "rapid, desperate, survival-driven motion",
    stakesLanguage: "real danger, significant cost of failure",
    consequenceRequired: true,
    intensityModifiers: ["urgent", "racing", "driven", "near-miss"],
  },
  3: {
    label: "CRISIS",
    motionGrammar: "explosive, all-out, nothing held back",
    stakesLanguage: "irreversible change, something BREAKS/COLLAPSES/SHATTERS",
    consequenceRequired: true,
    intensityModifiers: ["desperate", "final", "breaking point", "impact moment"],
  },
};

/**
 * Build escalation injection block for prompt
 */
export function buildEscalationDirective(escalation: EscalationLevel): string {
  const band = ESCALATION_BANDS[escalation];
  
  let directive = `[ESCALATION ${escalation}: ${band.label}]\n`;
  directive += `MOTION: ${band.motionGrammar}\n`;
  directive += `STAKES: ${band.stakesLanguage}\n`;
  
  if (band.consequenceRequired) {
    directive += `⚠️ CONSEQUENCE REQUIRED: Something must VISIBLY CHANGE by clip end.\n`;
  }
  
  directive += `INTENSITY: ${band.intensityModifiers.join(", ")}\n`;
  
  return directive;
}

// =============================================================================
// COMBINED FORCE + ESCALATION BLOCK
// =============================================================================

/**
 * Build the complete force/escalation injection block
 * 
 * This is the KEY FIX: we take abstract metadata and transform it
 * into concrete visual directives that video models can execute.
 */
export function buildForceEscalationBlock(
  scene: ForceScene,
  sceneIndex: number,
  _brutalityMode: boolean = false
): string {
  const parts: string[] = [];
  
  // Always include escalation (even if 0)
  const escalation = (scene.escalation_delta ?? 0) as EscalationLevel;
  parts.push(buildEscalationDirective(escalation));
  
  // Add force manifestation if present
  if (scene.force_present && scene.force_type) {
    parts.push(getForceManifestationDirective(scene.force_type, sceneIndex));
  }
  
  // Add setpiece delta as visual change requirement
  if (scene.setpiece_delta) {
    parts.push(`[SETPIECE CHANGE: ${scene.setpiece_delta} — this must be VISIBLE in the clip]`);
  }
  
  // If escalation >= 2, add impact beat requirement
  if (escalation >= 2) {
    parts.push(`[IMPACT BEAT: END FRAME must be VISIBLY DIFFERENT from START FRAME]`);
  }
  
  return parts.join("\n") + "\n\n";
}

// =============================================================================
// PROVIDER-AWARE SANITIZATION
// =============================================================================

/**
 * Get recommended sanitization level for a provider
 */
export function getProviderSanitizationLevel(
  provider: "sora" | "runway" | "luma",
  storySanitization?: SanitizationLevel
): SanitizationLevel {
  // Story-level override takes priority
  if (storySanitization && storySanitization !== "soft") {
    return storySanitization;
  }
  
  // Provider-specific defaults
  switch (provider) {
    case "runway":
      return "strict"; // Runway is most sensitive
    case "luma":
      return "soft";
    case "sora":
      return "soft";
    default:
      return "soft";
  }
}

/**
 * Check if a scene should skip sanitization
 * (brutality_mode + provider that tolerates it)
 */
export function shouldSkipSanitization(
  brutalityMode: boolean,
  provider: "sora" | "runway" | "luma"
): boolean {
  if (!brutalityMode) return false;
  
  // Only Sora can handle brutality mode (Runway will reject)
  return provider === "sora" || provider === "luma";
}

// =============================================================================
// CONSEQUENCE TETHER (scene_change + next_constraint)
// =============================================================================

/**
 * Build consequence tether for narrative continuity
 * 
 * This ensures each scene has:
 * 1. What changed (observable delta)
 * 2. What constraint exists for next scene
 */
export function buildConsequenceTether(
  currentScene: ForceScene,
  _nextScene?: ForceScene
): { sceneChange: string; nextConstraint: string } | null {
  if (!currentScene.setpiece_delta && !currentScene.escalation_delta) {
    return null;
  }
  
  const sceneChange = currentScene.setpiece_delta || 
    (currentScene.escalation_delta && currentScene.escalation_delta >= 2
      ? "situation has ESCALATED — visible tension/damage"
      : "situation progressed");
  
  const nextConstraint = currentScene.force_present
    ? `MUST REACT to ${currentScene.force_type || "previous threat"}`
    : "Continue from new state";
  
  return { sceneChange, nextConstraint };
}

// =============================================================================
// VALIDATION & LOGGING
// =============================================================================

/**
 * Validate force/escalation fields are properly set
 */
export function validateForceFields(scene: ForceScene): {
  isValid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  
  // force_present without force_type
  if (scene.force_present && !scene.force_type) {
    warnings.push("force_present=true but no force_type specified");
  }
  
  // force_type without force_present
  if (scene.force_type && scene.force_present !== true) {
    warnings.push(`force_type="${scene.force_type}" but force_present not true`);
  }
  
  // High escalation without setpiece_delta
  if ((scene.escalation_delta ?? 0) >= 2 && !scene.setpiece_delta) {
    warnings.push(`escalation_delta=${scene.escalation_delta} but no setpiece_delta (what changes?)`);
  }
  
  return {
    isValid: warnings.length === 0,
    warnings,
  };
}

/**
 * Log force/escalation injection for debugging
 */
export function logForceEscalationInjection(
  sceneIndex: number,
  scene: ForceScene,
  jobId?: string
): void {
  const prefix = jobId ? `[force-esc job=${jobId}]` : "[force-esc]";
  
  console.log(`${prefix} Scene ${sceneIndex + 1}: ` +
    `esc=${scene.escalation_delta ?? 0}, ` +
    `force=${scene.force_present ? scene.force_type : "none"}, ` +
    `delta="${scene.setpiece_delta || "-"}"`);
  
  const validation = validateForceFields(scene);
  if (!validation.isValid) {
    validation.warnings.forEach(w => console.warn(`${prefix} ⚠️ ${w}`));
  }
}
