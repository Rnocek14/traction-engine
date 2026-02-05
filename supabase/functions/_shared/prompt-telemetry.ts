 /**
  * Prompt Telemetry System
  * 
  * Logs final prompt composition for debugging and regression prevention.
  * This is the "prompt receipt" that shows exactly what was sent to providers.
  */
 
 // Inline types to avoid circular dependencies
 export type VideoProvider = "sora" | "runway" | "luma";
 export type StoryMode = "default" | "myth" | "film" | "spectacle" | "brutality";
 export type SanitizationLevel = "off" | "soft" | "strict";

/**
 * Telemetry data for a single prompt
 */
export interface PromptTelemetry {
  // Identity
  jobId?: string;
  sceneId?: string;
  storyJobId?: string;
  
  // Provider/Mode context
  provider: VideoProvider;
  mode: StoryMode;
  constraintProfile: string;
  
  // Character counts
  creativeTextChars: number;
  tier0Chars: number;
  tier1Chars: number;
  tier2Chars: number;
  constraintsChars: number;
  finalPromptChars: number;
  
  // Constraint percentage
  constraintPercent: number;
  
  // Budget info
  budgetMax: number;
  overBudget: boolean;
  tier2Dropped: boolean;
  tier1Dropped: boolean;
  
  // Sanitization
  sanitizationApplied: SanitizationLevel;
  sanitizationReplacements: number;
  
  // Truncation
  truncated: boolean;
  truncatedAt?: "provider" | "budget" | "none";
  
  // Prompt preview (for debugging)
  finalPromptHead400: string;
  finalPromptTail400: string;
  
  // Timestamp
  timestamp: string;
}

/**
 * Build telemetry record from prompt assembly
 */
export function buildTelemetry(params: {
  jobId?: string;
  sceneId?: string;
  storyJobId?: string;
  provider: VideoProvider;
  mode: StoryMode;
  constraintProfile: string;
  creativeText: string;
  tier0Block: string;
  tier1Block: string;
  tier2Block: string;
  finalPrompt: string;
  budgetMax: number;
  tier2Dropped: boolean;
  tier1Dropped: boolean;
  sanitizationLevel: SanitizationLevel;
  sanitizationReplacements: number;
  truncated: boolean;
  truncatedAt?: "provider" | "budget" | "none";
}): PromptTelemetry {
  const constraintsChars = params.tier0Block.length + params.tier1Block.length + params.tier2Block.length;
  const finalChars = params.finalPrompt.length;
  const constraintPercent = finalChars > 0 ? Math.round((constraintsChars / finalChars) * 100) : 0;
  
  return {
    jobId: params.jobId,
    sceneId: params.sceneId,
    storyJobId: params.storyJobId,
    provider: params.provider,
    mode: params.mode,
    constraintProfile: params.constraintProfile,
    creativeTextChars: params.creativeText.length,
    tier0Chars: params.tier0Block.length,
    tier1Chars: params.tier1Block.length,
    tier2Chars: params.tier2Block.length,
    constraintsChars,
    finalPromptChars: finalChars,
    constraintPercent,
    budgetMax: params.budgetMax,
    overBudget: finalChars > params.budgetMax,
    tier2Dropped: params.tier2Dropped,
    tier1Dropped: params.tier1Dropped,
    sanitizationApplied: params.sanitizationLevel,
    sanitizationReplacements: params.sanitizationReplacements,
    truncated: params.truncated,
    truncatedAt: params.truncatedAt,
    finalPromptHead400: params.finalPrompt.slice(0, 400),
    finalPromptTail400: params.finalPrompt.slice(-400),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Log telemetry to console with structured format
 */
export function logTelemetry(telemetry: PromptTelemetry): void {
  console.log(`[prompt-telemetry] job=${telemetry.jobId || "?"} provider=${telemetry.provider} mode=${telemetry.mode}`);
  console.log(`[prompt-telemetry] chars: creative=${telemetry.creativeTextChars} constraints=${telemetry.constraintsChars} (${telemetry.constraintPercent}%) total=${telemetry.finalPromptChars}`);
  console.log(`[prompt-telemetry] tiers: t0=${telemetry.tier0Chars} t1=${telemetry.tier1Chars} t2=${telemetry.tier2Chars}`);
  console.log(`[prompt-telemetry] budget=${telemetry.budgetMax} overBudget=${telemetry.overBudget} t2Dropped=${telemetry.tier2Dropped} t1Dropped=${telemetry.tier1Dropped}`);
  console.log(`[prompt-telemetry] sanitization=${telemetry.sanitizationApplied} replacements=${telemetry.sanitizationReplacements} truncated=${telemetry.truncated}`);
  console.log(`[prompt-telemetry] HEAD: "${telemetry.finalPromptHead400.slice(0, 100)}..."`);
}

/**
 * Create a compact log line for high-volume logging
 */
export function compactTelemetryLog(telemetry: PromptTelemetry): string {
  return `[prompt] ${telemetry.provider}/${telemetry.mode} ` +
    `${telemetry.creativeTextChars}c/${telemetry.constraintsChars}c (${telemetry.constraintPercent}%const) ` +
    `total=${telemetry.finalPromptChars}c ` +
    `san=${telemetry.sanitizationApplied} ` +
    `drops=${telemetry.tier2Dropped ? "t2" : ""}${telemetry.tier1Dropped ? "t1" : ""}`;
}

/**
 * Check if telemetry indicates a "prompt health" issue
 */
export function assessPromptHealth(telemetry: PromptTelemetry): {
  healthy: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];
  
  // Constraint percentage too high (>70% is bad)
  if (telemetry.constraintPercent > 70) {
    errors.push(`Constraint bloat: ${telemetry.constraintPercent}% of prompt is constraints (>70%)`);
  } else if (telemetry.constraintPercent > 50) {
    warnings.push(`High constraint ratio: ${telemetry.constraintPercent}% (prefer <50%)`);
  }
  
  // Creative text too short
  if (telemetry.creativeTextChars < 50) {
    warnings.push(`Creative text very short: ${telemetry.creativeTextChars} chars`);
  }
  
  // Over budget
  if (telemetry.overBudget) {
    warnings.push(`Over budget: ${telemetry.finalPromptChars}/${telemetry.budgetMax} chars`);
  }
  
  // Tier dropping
  if (telemetry.tier1Dropped) {
    errors.push("Tier 1 was dropped (identity/continuity lost)");
  }
  
  // Truncation
  if (telemetry.truncated) {
    warnings.push(`Prompt was truncated at ${telemetry.truncatedAt}`);
  }
  
  return {
    healthy: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Summarize telemetry for storage in video_jobs.settings
 */
export function telemetryToSettings(telemetry: PromptTelemetry): Record<string, unknown> {
  return {
    prompt_telemetry: {
      creative_chars: telemetry.creativeTextChars,
      constraint_chars: telemetry.constraintsChars,
      constraint_percent: telemetry.constraintPercent,
      final_chars: telemetry.finalPromptChars,
      sanitization: telemetry.sanitizationApplied,
      sanitization_replacements: telemetry.sanitizationReplacements,
      tier2_dropped: telemetry.tier2Dropped,
      tier1_dropped: telemetry.tier1Dropped,
      truncated: telemetry.truncated,
      budget_max: telemetry.budgetMax,
      profile: telemetry.constraintProfile,
    },
  };
}
