/**
 * Moderation Safety Layer
 * 
 * Sanitizes prompts to avoid triggering AI provider content moderation.
 * 
 * Key insight: Action-oriented prompts with medieval/fantasy combat
 * often trigger moderation due to weapon and violence language.
 * This layer rewrites terms to be "cinematically equivalent" but safer.
 * 
 * Example: "KNIGHTS CHARGE forward DRAWING their swords" →
 *          "KNIGHTS CHARGE forward RAISING their shields"
 */

// Weapon terms → safer equivalents (preserve action, reduce violence signaling)
const WEAPON_REPLACEMENTS: Array<[RegExp, string]> = [
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

// Extreme violence that should be removed or replaced
const REMOVE_PATTERNS: Array<[RegExp, string]> = [
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

/**
 * Apply moderation-safe rewrites to a prompt.
 * Returns the sanitized prompt and whether any changes were made.
 */
export function sanitizeForModeration(prompt: string): { 
  sanitized: string; 
  wasModified: boolean;
  replacements: string[];
} {
  let result = prompt;
  const replacements: string[] = [];
  
  // First, apply extreme violence replacements
  for (const [pattern, replacement] of REMOVE_PATTERNS) {
    const before = result;
    result = result.replace(pattern, replacement);
    if (result !== before) {
      replacements.push(`"${pattern.source}" → "${replacement}"`);
    }
  }
  
  // Then apply safe replacements
  for (const [pattern, replacement] of WEAPON_REPLACEMENTS) {
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
  jobId?: string
): void {
  if (replacements.length === 0) return;
  
  console.log(`[moderation-safety] ${jobId ? `job=${jobId} ` : ""}Applied ${replacements.length} replacements:`);
  replacements.forEach(r => console.log(`  - ${r}`));
  console.log(`[moderation-safety] Original: "${original.slice(0, 100)}..."`);
  console.log(`[moderation-safety] Sanitized: "${sanitized.slice(0, 100)}..."`);
}
