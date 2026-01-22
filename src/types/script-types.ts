// ============================================
// Content Engine - Script & Show Bible Types
// ============================================
import { z } from "zod";

// ============================================
// Enums (matching database)
// ============================================
export type ContentVertical = "privacy" | "education" | "health" | "hyperlocal";
export type ClaimPolicyLevel = "standard" | "moderate" | "strict" | "medical";
export type CtaStyle = "soft" | "direct" | "hard_offer";
export type ScriptStatus = "draft" | "qa_passed" | "qa_failed" | "generating" | "published" | "rejected";

// ============================================
// Show Bible / Account Config Types
// ============================================
export interface Persona {
  tone: string; // e.g., "informative", "urgent", "friendly"
  vibe: string; // e.g., "expert", "peer", "mentor"
}

export interface Audience {
  who: string; // target audience description
  pain_points: string[]; // what problems they have
}

export interface StyleRules {
  max_length_seconds: number;
  pacing: "slow" | "medium" | "fast";
  profanity: boolean;
  emoji_allowed: boolean;
}

export interface DisclaimerRules {
  always_required: boolean;
  trigger_keywords: string[];
}

export interface AccountConfig {
  id: string;
  account_id: string;
  vertical: ContentVertical;
  persona: Persona;
  audience: Audience;
  promise: string;
  content_pillars: string[];
  banned_topics: string[];
  claim_policy: ClaimPolicyLevel;
  cta_style: CtaStyle;
  cta_destination?: string;
  cta_phrases: string[];
  style_rules: StyleRules;
  disclaimer_rules: DisclaimerRules;
  uniqueness_salt: string;
  created_at: string;
  updated_at: string;
}

// ============================================
// Content Policy Types
// ============================================
export interface ContentPolicy {
  id: string;
  vertical: ContentVertical;
  banned_phrases: string[];
  required_disclaimers: string[];
  prohibited_claim_types: string[];
  fact_check_required: boolean;
  safety_rules: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ============================================
// Topic Bank Types
// ============================================
export interface Topic {
  id: string;
  vertical: ContentVertical;
  pillar: string;
  topic_prompt: string;
  hook_variants: string[];
  claim_sensitivity: number; // 1-5
  suggested_cta?: string;
  motif_hints: string[];
  is_evergreen: boolean;
  seasonal_tags: string[];
  trend_keywords: string[];
  times_used: number;
  last_used_at?: string;
  cooldown_days: number;
  created_at: string;
}

// ============================================
// Script Content Schema (the actual generated content)
// ============================================
export interface OnScreenText {
  timestamp: number; // seconds
  text: string;
  duration?: number; // how long to show
}

export interface ScriptContent {
  hook: string; // 0-2s opener
  voiceover: string; // full TTS text
  on_screen_text: OnScreenText[];
  scene_prompts: string[]; // 1-3 Sora prompts
  broll_keywords: string[]; // fallback motifs
  caption: string;
  hashtags: string[];
  cta: string;
  disclaimer?: string;
}

// ============================================
// Script Run (generated script record)
// ============================================
export interface QAResult {
  passed: boolean;
  checks: {
    structure_valid: boolean;
    length_valid: boolean;
    banned_topics_clear: boolean;
    claim_policy_compliant: boolean;
    disclaimer_present: boolean;
    uniqueness_valid: boolean;
  };
  errors: string[];
  warnings: string[];
}

export interface ScriptRun {
  id: string;
  account_id: string;
  topic_id?: string;
  status: ScriptStatus;
  script_content: ScriptContent;
  qa_results?: QAResult;
  qa_passed_at?: string;
  qa_failed_reason?: string;
  safety_flags: string[];
  fact_claims: string[];
  generation_cost_cents: number;
  hook_hash?: string;
  voiceover_hash?: string;
  scene_hash?: string;
  created_at: string;
  published_at?: string;
}

// ============================================
// Zod Validation Schemas
// ============================================

export const onScreenTextSchema = z.object({
  timestamp: z.number().min(0),
  text: z.string().min(1).max(100),
  duration: z.number().min(0.5).max(10).optional(),
});

export const scriptContentSchema = z.object({
  hook: z.string()
    .min(5, "Hook must be at least 5 characters")
    .max(150, "Hook must be under 150 characters"),
  voiceover: z.string()
    .min(50, "Voiceover must be at least 50 characters")
    .max(1500, "Voiceover must be under 1500 characters"),
  on_screen_text: z.array(onScreenTextSchema).min(1).max(10),
  scene_prompts: z.array(z.string().min(10).max(300)).min(1).max(3),
  broll_keywords: z.array(z.string().max(50)).max(10),
  caption: z.string().min(10).max(300),
  hashtags: z.array(z.string().regex(/^[a-zA-Z0-9_]+$/).max(30)).min(1).max(10),
  cta: z.string().min(5).max(100),
  disclaimer: z.string().max(200).optional(),
});

export const personaSchema = z.object({
  tone: z.string().min(1).max(50),
  vibe: z.string().min(1).max(50),
});

export const audienceSchema = z.object({
  who: z.string().min(1).max(200),
  pain_points: z.array(z.string().max(100)).max(10),
});

export const styleRulesSchema = z.object({
  max_length_seconds: z.number().min(15).max(180),
  pacing: z.enum(["slow", "medium", "fast"]),
  profanity: z.boolean(),
  emoji_allowed: z.boolean(),
});

export const disclaimerRulesSchema = z.object({
  always_required: z.boolean(),
  trigger_keywords: z.array(z.string().max(50)).max(20),
});

// ============================================
// Validation Utilities
// ============================================

export function validateScriptContent(content: unknown): { valid: boolean; errors: string[]; data?: ScriptContent } {
  const result = scriptContentSchema.safeParse(content);
  if (result.success) {
    return { valid: true, errors: [], data: result.data as ScriptContent };
  }
  return { 
    valid: false, 
    errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
  };
}

// Simple hash function for fingerprinting
export function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

// Generate fingerprints for a script
export function generateScriptFingerprints(content: ScriptContent): {
  hook_hash: string;
  voiceover_hash: string;
  scene_hash: string;
} {
  return {
    hook_hash: simpleHash(content.hook.toLowerCase().trim()),
    voiceover_hash: simpleHash(content.voiceover.toLowerCase().trim()),
    scene_hash: simpleHash(content.scene_prompts.join('|').toLowerCase()),
  };
}
