/**
 * Moderation Safety Layer (v2)
 * 
 * Tiered sanitization with provider-aware levels:
 * - "strict": Runway-safe (aggressive word swaps)
 * - "soft": Sora/Luma-safe (cinematic implications)
 * - "off": No sanitization (internal testing only)
 * 
 * Key insight: Action-oriented prompts with medieval/fantasy combat
 * often trigger moderation due to weapon and violence language.
 * This layer rewrites terms to be "cinematically equivalent" but safer.
 */

export type SanitizationLevel = "off" | "soft" | "strict";
export type VideoProvider = "sora" | "runway" | "luma";

// =============================================================================
// STRICT REPLACEMENTS (Runway-safe)
// =============================================================================

// Weapon terms → safer equivalents (preserve action, reduce violence signaling)
const STRICT_REPLACEMENTS: Array<[RegExp, string]> = [
  // Swords → shields/banners
  [/\b(draw|draws|drawing)\s+(his|her|their|the)?\s*sword(s)?\b/gi, "RAISE $2 shield$3"],
  [/\bsword(s)?\b/gi, "shield$1"],
  [/\bblade(s)?\b/gi, "banner$1"],
  [/\bweapon(s)?\b/gi, "banner$1"],
  
  // Aggressive actions → defensive/dramatic equivalents
  [/\b(battle|war)\s*cry\b/gi, "rallying call"],
  [/\bshouting\s+a\s+battle\s+cry\b/gi, "raising a rallying call"],
  [/\bcharge(s)?\s+(into|at|toward)\s+battle\b/gi, "rush$1 $2 action"],
  [/\bcharging\s+(into|at|toward)\s+battle\b/gi, "rushing $1 action"],
  
  // Combat verbs → movement verbs
  [/\bstrike(s)?\s+(at|down)\b/gi, "move$1 against"],
  [/\bstriking\s+(at|down)\b/gi, "moving against"],
  [/\battack(s|ing)?\b/gi, "approach$1"],
  [/\bslay(s|ing)?\b/gi, "confront$1"],
  [/\bkill(s|ing)?\b/gi, "overcome$1"],
  [/\bstab(s|bing)?\b/gi, "push$1"],
  [/\bslash(es|ing)?\b/gi, "swing$1"],
  
  // Violence outcomes → dramatic outcomes
  [/\b(blood|bloody|bleeding)\b/gi, "dust"],
  [/\bwound(s|ed|ing)?\b/gi, "mark$1"],
  [/\bdead\s+bodies?\b/gi, "fallen figures"],
  [/\bcorpse(s)?\b/gi, "fallen figure$1"],
  [/\bdeath\b/gi, "fall"],
  [/\bdie(s)?\b/gi, "fall$1"],
  [/\bdying\b/gi, "falling"],
  
  // Projectile weapons → ceremonial items
  [/\barrow(s)?\b/gi, "banner$1"],
  [/\bspear(s)?\b/gi, "staff$1"],
  [/\blance(s)?\b/gi, "banner$1"],
  [/\baxe(s)?\b/gi, "staff$1"],
  [/\bmace(s)?\b/gi, "staff$1"],
  [/\bbow(s)?\s+and\s+arrow(s)?\b/gi, "raised banner$1"],
  
  // Explicit violence → dramatic tension
  [/\bfight(s|ing)?\s+to\s+the\s+death\b/gi, "clash$1 dramatically"],
  [/\bmortal\s+combat\b/gi, "dramatic confrontation"],
  [/\blethal\b/gi, "intense"],
  [/\bdeadly\b/gi, "powerful"],
];

// Extreme violence patterns (always removed in strict mode)
const EXTREME_VIOLENCE_PATTERNS: Array<[RegExp, string]> = [
  [/\bdecapitat(e|es|ed|ing)\b/gi, "defeat"],
  [/\bdismember(s|ed|ing)?\b/gi, "scatter"],
  [/\bgor(e|y)\b/gi, "intense"],
  [/\bexecut(e|es|ed|ing)\s+(the\s+)?(enemy|foe|opponent|target)(s)?\b/gi, "confront $3$4"],
  [/\bexecution\s+style\b/gi, "dramatic"],
  [/\bmassacre(s|d)?\b/gi, "overwhelm"],
  [/\bslaughter(s|ed|ing)?\b/gi, "defeat"],
  [/\btortur(e|es|ed|ing)\b/gi, "confront"],
  [/\bmutilat(e|es|ed|ing)\b/gi, "damage"],
];

// =============================================================================
// SOFT REPLACEMENTS (Sora/Luma-safe - cinematic implications)
// =============================================================================

const SOFT_REPLACEMENTS: Array<[RegExp, string]> = [
  // Keep weapons but remove explicit violence
  [/\bkill(s|ing)?\s+(the\s+)?(enemy|foe|opponent)(s)?\b/gi, "overcome $3$4"],
  [/\bstab(s|bing)?\s+(through|into)\b/gi, "thrust$1 toward"],
  [/\bslash(es|ing)?\s+(across|through)\b/gi, "swing$1 across"],
  
  // Violence outcomes → cinematic implications
  [/\bblood\s+(spray|spatter|splatter)(s|ed|ing)?\b/gi, "impact visible"],
  [/\bbleeding\s+(out|heavily)\b/gi, "gravely wounded"],
  [/\bdead\s+bodies?\s+(everywhere|litter|cover)\b/gi, "aftermath of battle"],
  
  // Explicit violence → intense drama
  [/\bfight(s|ing)?\s+to\s+the\s+death\b/gi, "fight$1 desperately"],
  [/\bmortal\s+combat\b/gi, "fierce combat"],
];

// =============================================================================
// SANITIZATION FUNCTIONS
// =============================================================================

/**
 * Apply strict sanitization (Runway-safe)
 */
export function sanitizeStrict(prompt: string): { 
  sanitized: string; 
  wasModified: boolean;
  replacements: string[];
} {
  let result = prompt;
  const replacements: string[] = [];
  
  // First, apply extreme violence replacements
  for (const [pattern, replacement] of EXTREME_VIOLENCE_PATTERNS) {
    const before = result;
    result = result.replace(pattern, replacement);
    if (result !== before) {
      replacements.push(`"${pattern.source}" → "${replacement}"`);
    }
  }
  
  // Then apply strict replacements
  for (const [pattern, replacement] of STRICT_REPLACEMENTS) {
    const before = result;
    result = result.replace(pattern, replacement);
    if (result !== before) {
      replacements.push(`"${pattern.source}" → "${replacement}"`);
    }
  }
  
  // Clean up any double spaces from removals
  result = result.replace(/\s+/g, " ").trim();
  
  return {
    sanitized: result,
    wasModified: replacements.length > 0,
    replacements,
  };
}

/**
 * Apply soft sanitization (Sora/Luma-safe)
 */
export function sanitizeSoft(prompt: string): { 
  sanitized: string; 
  wasModified: boolean;
  replacements: string[];
} {
  let result = prompt;
  const replacements: string[] = [];
  
  // Only apply extreme violence patterns (not weapon swaps)
  for (const [pattern, replacement] of EXTREME_VIOLENCE_PATTERNS) {
    const before = result;
    result = result.replace(pattern, replacement);
    if (result !== before) {
      replacements.push(`"${pattern.source}" → "${replacement}"`);
    }
  }
  
  // Apply soft replacements (cinematic implications)
  for (const [pattern, replacement] of SOFT_REPLACEMENTS) {
    const before = result;
    result = result.replace(pattern, replacement);
    if (result !== before) {
      replacements.push(`"${pattern.source}" → "${replacement}"`);
    }
  }
  
  // Clean up any double spaces from removals
  result = result.replace(/\s+/g, " ").trim();
  
  return {
    sanitized: result,
    wasModified: replacements.length > 0,
    replacements,
  };
}

/**
 * Apply moderation-safe rewrites based on sanitization level
 */
export function sanitizeForModeration(
  prompt: string,
  level: SanitizationLevel = "soft"
): { 
  sanitized: string; 
  wasModified: boolean;
  replacements: string[];
  level: SanitizationLevel;
} {
  if (level === "off") {
    return {
      sanitized: prompt,
      wasModified: false,
      replacements: [],
      level,
    };
  }
  
  if (level === "strict") {
    return { ...sanitizeStrict(prompt), level };
  }
  
  return { ...sanitizeSoft(prompt), level };
}

/**
 * Get recommended sanitization level for a provider
 */
export function getProviderSanitizationLevel(
  provider: VideoProvider,
  brutalityMode: boolean = false
): SanitizationLevel {
  // Brutality mode reduces sanitization but never to "off"
  if (brutalityMode) {
    return provider === "runway" ? "soft" : "soft";
  }
  
  switch (provider) {
    case "runway":
      return "strict";
    case "luma":
      return "soft";
    case "sora":
      return "soft";
    default:
      return "soft";
  }
}

/**
 * Check if a prompt likely needs moderation sanitization.
 * Use this for logging/debugging before sanitization.
 */
export function needsModerationSafety(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  
  // Quick check for common trigger words
  const triggerWords = [
    "sword", "blade", "weapon", "battle cry", "attack", 
    "slay", "kill", "stab", "slash", "blood", "dead",
    "arrow", "spear", "lance", "axe", "mace", "fight to the death",
    "decapitate", "dismember", "gore", "massacre", "slaughter",
  ];
  
  return triggerWords.some(word => lower.includes(word));
}

/**
 * Log moderation sanitization for debugging.
 */
export function logModerationSanitization(
  original: string,
  sanitized: string,
  replacements: string[],
  level: SanitizationLevel,
  jobId?: string
): void {
  if (replacements.length === 0) return;
  
  console.log(`[moderation-safety] ${jobId ? `job=${jobId} ` : ""}level=${level} Applied ${replacements.length} replacements:`);
  replacements.slice(0, 5).forEach(r => console.log(`  - ${r}`));
  if (replacements.length > 5) {
    console.log(`  ... and ${replacements.length - 5} more`);
  }
  console.log(`[moderation-safety] Original: "${original.slice(0, 100)}..."`);
  console.log(`[moderation-safety] Sanitized: "${sanitized.slice(0, 100)}..."`);
}

// =============================================================================
// RETRY LADDER (for moderation 400 errors)
// =============================================================================

export interface RetryContext {
  attempt: number;
  originalPrompt: string;
  provider: VideoProvider;
  brutalityMode?: boolean;
  storySanitizationLevel?: SanitizationLevel;
  lastError?: string;
}

export interface RetryResult {
  prompt: string;
  level: SanitizationLevel;
  shouldDropReference: boolean;
  wasSimplified: boolean;
}

/**
 * Get sanitized prompt for retry attempt
 * Escalates sanitization level with each attempt
 * 
 * CRITICAL: Runway ALWAYS uses strict, even on attempt 1
 */
export function getRetryPrompt(ctx: RetryContext): RetryResult {
  const { attempt, originalPrompt, provider, brutalityMode, storySanitizationLevel } = ctx;
  
  // Runway ALWAYS strict - non-negotiable
  const isRunway = provider === "runway";
  
  if (attempt <= 1) {
    // First attempt: use provider-aware level (Runway = strict, others = soft/story)
    const level: SanitizationLevel = isRunway 
      ? "strict" 
      : (storySanitizationLevel && storySanitizationLevel !== "off" 
          ? storySanitizationLevel 
          : (brutalityMode ? "soft" : "soft"));
    const result = sanitizeForModeration(originalPrompt, level);
    return { prompt: result.sanitized, level, shouldDropReference: false, wasSimplified: false };
  }
  
  if (attempt === 2) {
    // Second attempt: strict sanitization for ALL providers
    const result = sanitizeStrict(originalPrompt);
    return { prompt: result.sanitized, level: "strict", shouldDropReference: false, wasSimplified: false };
  }
  
  // Third+ attempt: strict + simplified + drop reference frame
  // This is the "nuclear option" - forces T2V with heavily sanitized prompt
  const result = sanitizeStrict(originalPrompt);
  
  // Further simplify: remove complex clauses, keep core action
  let simplified = result.sanitized;
  // Remove anything in parentheses
  simplified = simplified.replace(/\([^)]*\)/g, "");
  // Remove anything after a dash or em-dash
  simplified = simplified.replace(/\s*[-–—]\s*[^.]*\./g, ".");
  // Remove injection markers that might be confusing models
  simplified = simplified.replace(/\[ESCALATION[^\]]*\]/g, "");
  simplified = simplified.replace(/\[FORCE[^\]]*\]/g, "");
  simplified = simplified.replace(/\[CAPTURE[^\]]*\]/g, "");
  simplified = simplified.replace(/ESC=[A-Z]+\./g, "");
  simplified = simplified.replace(/FORCE=[A-Z]+:/g, "");
  // Truncate to first 350 chars for Runway safety margin
  simplified = simplified.slice(0, isRunway ? 350 : 400).trim();
  
  return { 
    prompt: simplified, 
    level: "strict", 
    shouldDropReference: true, // Force T2V on 3rd attempt
    wasSimplified: true,
  };
}

/**
 * Detect if an error is a moderation-related failure
 */
export function isModerationError(error: string | undefined): boolean {
  if (!error) return false;
  const lower = error.toLowerCase();
  return lower.includes("moderation") ||
         lower.includes("content policy") ||
         lower.includes("safety") ||
         lower.includes("inappropriate") ||
         lower.includes("400") ||
         lower.includes("blocked");
}

/**
 * Log retry attempt for debugging
 */
export function logRetryAttempt(
  ctx: RetryContext,
  result: RetryResult,
  jobId?: string
): void {
  const prefix = jobId ? `[moderation-retry job=${jobId}]` : "[moderation-retry]";
  console.log(`${prefix} attempt=${ctx.attempt} provider=${ctx.provider} level=${result.level} ` +
    `dropRef=${result.shouldDropReference} simplified=${result.wasSimplified}`);
  if (result.wasSimplified) {
    console.log(`${prefix} Simplified prompt: "${result.prompt.slice(0, 100)}..."`);
  }
}
