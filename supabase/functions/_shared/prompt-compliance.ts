/**
 * Prompt Compliance Layer v1.0
 * 
 * Compile-time guardrails that enforce vertical-specific rules:
 * - Banned phrase replacement (absolute claims → softened language)
 * - Disclaimer injection (once per story, not per scene)
 * - Hard violation detection for strict verticals
 * 
 * Runs AFTER prompt compilation, BEFORE generation.
 */

import type { ContentVertical, VerticalProfile } from "./vertical-profiles.ts";
import { getVerticalProfile } from "./vertical-profiles.ts";

// ─── Banned Phrase Rules ────────────────────────────────────

interface PhraseRule {
  pattern: RegExp;
  replacement: string;
  /** Only enforce in these verticals (empty = all) */
  verticals: ContentVertical[];
  /** If true, flag as hard error instead of auto-replacing */
  hard_block: boolean;
}

const PHRASE_RULES: PhraseRule[] = [
  // Absolute guarantees
  { pattern: /\bguaranteed?\b/gi, replacement: "may help", verticals: ["health", "finance"], hard_block: false },
  { pattern: /\bwill cure\b/gi, replacement: "may support", verticals: ["health"], hard_block: true },
  { pattern: /\bcures?\b/gi, replacement: "supports", verticals: ["health"], hard_block: false },
  { pattern: /\balways works?\b/gi, replacement: "often helps", verticals: ["health", "finance"], hard_block: false },
  { pattern: /\b100%\b/gi, replacement: "significantly", verticals: ["health", "finance"], hard_block: false },
  
  // Income / ROI claims
  { pattern: /\bdouble your money\b/gi, replacement: "grow your portfolio", verticals: ["finance"], hard_block: true },
  { pattern: /\brisk[- ]free\b/gi, replacement: "lower-risk", verticals: ["finance"], hard_block: false },
  { pattern: /\bmake \$[\d,]+/gi, replacement: "build income", verticals: ["finance"], hard_block: false },
  { pattern: /\bearn \$[\d,]+/gi, replacement: "earn income", verticals: ["finance"], hard_block: false },
  
  // Health absolute claims
  { pattern: /\bproven to\b/gi, replacement: "shown to help", verticals: ["health"], hard_block: false },
  { pattern: /\bclinically proven\b/gi, replacement: "supported by research", verticals: ["health"], hard_block: false },
  { pattern: /\bno side effects?\b/gi, replacement: "well-tolerated", verticals: ["health"], hard_block: false },
];

// ─── CTA Style Templates ───────────────────────────────────

export type CTAStyle = "soft" | "direct" | "loop" | "educational" | "compliant";

export const CTA_TEMPLATES: Record<ContentVertical, { style: CTAStyle; phrases: string[] }> = {
  health:        { style: "compliant", phrases: ["Learn more from your provider", "Save this for later", "Talk to a professional"] },
  finance:       { style: "compliant", phrases: ["Do your own research", "Save this breakdown", "Follow for more insights"] },
  saas:          { style: "direct",    phrases: ["Try it free", "Link in bio", "Start your trial"] },
  education:     { style: "educational", phrases: ["Save this", "Follow for part 2", "Share with someone who needs this"] },
  entertainment: { style: "loop",      phrases: ["Wait for the twist", "Watch again", "Tag someone"] },
  ecommerce:     { style: "direct",    phrases: ["Shop now", "Link in bio", "Limited time"] },
  lifestyle:     { style: "soft",      phrases: ["Try this today", "Save for later", "Follow for more"] },
  news:          { style: "educational", phrases: ["Stay informed", "Follow for updates", "Share this story"] },
};

// ─── Hook Category Weights ──────────────────────────────────

export type HookWeights = Record<string, number>;

export const VERTICAL_HOOK_WEIGHTS: Record<ContentVertical, HookWeights> = {
  health:        { curiosity: 0.5, authority: 0.35, social_proof: 0.15 },
  finance:       { authority: 0.5, curiosity: 0.3, fear: 0.2 },
  saas:          { curiosity: 0.35, promise: 0.35, novelty: 0.3 },
  education:     { curiosity: 0.5, novelty: 0.3, authority: 0.2 },
  entertainment: { shock: 0.35, novelty: 0.35, curiosity: 0.3 },
  ecommerce:     { curiosity: 0.3, social_proof: 0.3, novelty: 0.2, promise: 0.2 },
  lifestyle:     { curiosity: 0.35, promise: 0.35, social_proof: 0.3 },
  news:          { curiosity: 0.35, novelty: 0.25, shock: 0.2, fear: 0.2 },
};

// ─── Compliance Result ──────────────────────────────────────

export interface ComplianceResult {
  /** Sanitized prompt text */
  text: string;
  /** Whether any replacements were made */
  was_modified: boolean;
  /** List of replacements applied */
  replacements: string[];
  /** Hard-block violations (generation should be stopped) */
  hard_blocks: string[];
  /** Disclaimer to append (once per story, not per scene) */
  disclaimer?: string;
}

// ═══════════════════════════════════════════════════════════
// SANITIZE PROMPT TEXT
// ═══════════════════════════════════════════════════════════

/**
 * Sanitize a single prompt against vertical compliance rules.
 * Replaces banned phrases and detects hard violations.
 */
export function sanitizePromptText(
  prompt: string,
  vertical: ContentVertical
): ComplianceResult {
  const profile = getVerticalProfile(vertical);
  let text = prompt;
  const replacements: string[] = [];
  const hard_blocks: string[] = [];
  
  for (const rule of PHRASE_RULES) {
    // Skip rules that don't apply to this vertical
    if (rule.verticals.length > 0 && !rule.verticals.includes(vertical)) continue;
    
    // Reset before each use to avoid stale lastIndex
    rule.pattern.lastIndex = 0;
    const match = text.match(rule.pattern);
    if (match) {
      if (rule.hard_block) {
        hard_blocks.push(`Banned phrase detected: "${match[0]}"`);
      } else {
        text = text.replace(rule.pattern, rule.replacement);
        replacements.push(`"${match[0]}" → "${rule.replacement}"`);
      }
    }
    rule.pattern.lastIndex = 0;
  }
  
  return {
    text,
    was_modified: replacements.length > 0,
    replacements,
    hard_blocks,
    disclaimer: profile.claim_rules.require_disclaimer
      ? profile.claim_rules.disclaimer_text
      : undefined,
  };
}

// ═══════════════════════════════════════════════════════════
// SANITIZE FULL STORY (batch)
// ═══════════════════════════════════════════════════════════

export interface StorySanitizeResult {
  scenes: Array<{
    scene_id: string;
    original_prompt: string;
    sanitized_prompt: string;
    was_modified: boolean;
    replacements: string[];
    hard_blocks: string[];
  }>;
  /** One disclaimer for the entire story (not per scene) */
  disclaimer?: string;
  /** True if ANY scene has hard blocks */
  has_hard_blocks: boolean;
  total_replacements: number;
}

export function sanitizeStory(
  scenes: Array<{ scene_id: string; prompt: string }>,
  vertical: ContentVertical
): StorySanitizeResult {
  const profile = getVerticalProfile(vertical);
  const results = scenes.map(scene => {
    const result = sanitizePromptText(scene.prompt, vertical);
    return {
      scene_id: scene.scene_id,
      original_prompt: scene.prompt,
      sanitized_prompt: result.text,
      was_modified: result.was_modified,
      replacements: result.replacements,
      hard_blocks: result.hard_blocks,
    };
  });
  
  return {
    scenes: results,
    disclaimer: profile.claim_rules.require_disclaimer
      ? profile.claim_rules.disclaimer_text
      : undefined,
    has_hard_blocks: results.some(r => r.hard_blocks.length > 0),
    total_replacements: results.reduce((sum, r) => sum + r.replacements.length, 0),
  };
}

// ═══════════════════════════════════════════════════════════
// HOOK WEIGHT SELECTION
// ═══════════════════════════════════════════════════════════

/**
 * Select a hook category using weighted random from vertical weights,
 * filtered by allowed categories.
 */
export function selectWeightedHookCategory(
  vertical: ContentVertical,
  allowedCategories: string[],
  rng: () => number = Math.random
): string {
  const weights = VERTICAL_HOOK_WEIGHTS[vertical];
  
  // Filter to only allowed categories
  const candidates = allowedCategories.filter(cat => cat in weights);
  if (candidates.length === 0) return allowedCategories[0] || "curiosity";
  
  // Normalize weights
  const totalWeight = candidates.reduce((sum, cat) => sum + (weights[cat] || 0), 0);
  if (totalWeight === 0) return candidates[0];
  
  // Weighted random selection
  let roll = rng() * totalWeight;
  for (const cat of candidates) {
    roll -= weights[cat] || 0;
    if (roll <= 0) return cat;
  }
  
  return candidates[0];
}

/**
 * Get CTA phrase for a vertical.
 */
export function getVerticalCTA(vertical: ContentVertical, rng: () => number = Math.random): { style: CTAStyle; phrase: string } {
  const config = CTA_TEMPLATES[vertical];
  const phrase = config.phrases[Math.floor(rng() * config.phrases.length)];
  return { style: config.style, phrase };
}
