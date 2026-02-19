/**
 * Vertical Profiles v1.0
 * 
 * Guardrails layer. Vertical determines RULES, not structure.
 * 
 * Each vertical defines:
 * - Moderation strictness
 * - Emotional ceiling
 * - Claim tolerance
 * - Required disclaimers
 * - Tone boundaries
 * - Banned hook types
 * 
 * Story type is chosen independently; vertical constraints
 * are merged on top to filter what's allowed.
 */

import type { StoryType, EmotionalIntensity } from "./story-types.ts";

// ─── Vertical Enum ──────────────────────────────────────────

export type ContentVertical =
  | "health"
  | "finance"
  | "saas"
  | "education"
  | "entertainment"
  | "ecommerce"
  | "lifestyle"
  | "news";

// ─── Moderation Strictness ──────────────────────────────────

export type ModerationLevel = "strict" | "moderate" | "relaxed";

// ─── Hook Types ─────────────────────────────────────────────

export type HookCategory =
  | "curiosity"
  | "novelty"
  | "shock"
  | "fear"
  | "authority"
  | "promise"
  | "social_proof";

// ─── Tone ───────────────────────────────────────────────────

export type TonePreset = "authoritative" | "friendly" | "urgent" | "playful" | "neutral" | "inspirational";

// ─── Vertical Profile ───────────────────────────────────────

export interface VerticalProfile {
  vertical: ContentVertical;
  name: string;
  
  // Moderation
  moderation: ModerationLevel;
  
  // Emotional constraints
  max_emotional_intensity: EmotionalIntensity;
  
  // Claim rules
  claim_rules: {
    allow_unverified_claims: boolean;
    allow_income_claims: boolean;
    allow_health_claims: boolean;
    allow_guarantees: boolean;
    require_disclaimer: boolean;
    disclaimer_text?: string;
  };
  
  // Tone
  preferred_tones: TonePreset[];
  banned_tones: TonePreset[];
  
  // Hook filtering
  banned_hook_categories: HookCategory[];
  preferred_hook_categories: HookCategory[];
  
  // Story type compatibility (all allowed unless excluded)
  excluded_story_types: StoryType[];
  
  // Visual style hints
  visual_style: {
    aesthetic: string;        // e.g. "clean, professional", "raw, authentic"
    lighting: string;         // e.g. "bright, natural", "moody, dramatic"
    pacing: "fast" | "moderate" | "slow";
  };
}

// ─── Profile Definitions ────────────────────────────────────

export const VERTICAL_PROFILES: Record<ContentVertical, VerticalProfile> = {
  
  health: {
    vertical: "health",
    name: "Health & Wellness",
    moderation: "strict",
    max_emotional_intensity: "medium",
    claim_rules: {
      allow_unverified_claims: false,
      allow_income_claims: false,
      allow_health_claims: false, // Must be evidence-backed
      allow_guarantees: false,
      require_disclaimer: true,
      disclaimer_text: "Not medical advice. Consult a healthcare professional.",
    },
    preferred_tones: ["authoritative", "friendly"],
    banned_tones: ["urgent", "playful"],
    banned_hook_categories: ["shock"],
    preferred_hook_categories: ["curiosity", "authority", "social_proof"],
    excluded_story_types: [], // All types allowed
    visual_style: {
      aesthetic: "clean, natural, trustworthy",
      lighting: "bright, warm, natural",
      pacing: "moderate",
    },
  },

  finance: {
    vertical: "finance",
    name: "Finance & Investing",
    moderation: "strict",
    max_emotional_intensity: "medium",
    claim_rules: {
      allow_unverified_claims: false,
      allow_income_claims: false, // Regulatory risk
      allow_health_claims: false,
      allow_guarantees: false,
      require_disclaimer: true,
      disclaimer_text: "Not financial advice. Past performance doesn't guarantee future results.",
    },
    preferred_tones: ["authoritative", "neutral"],
    banned_tones: ["playful"],
    banned_hook_categories: ["shock"],
    preferred_hook_categories: ["curiosity", "authority", "fear"],
    excluded_story_types: [],
    visual_style: {
      aesthetic: "professional, data-driven, modern",
      lighting: "clean, neutral",
      pacing: "moderate",
    },
  },

  saas: {
    vertical: "saas",
    name: "SaaS & Software",
    moderation: "moderate",
    max_emotional_intensity: "high",
    claim_rules: {
      allow_unverified_claims: false,
      allow_income_claims: true, // "Save X hours" etc.
      allow_health_claims: false,
      allow_guarantees: false,
      require_disclaimer: false,
    },
    preferred_tones: ["friendly", "urgent", "authoritative"],
    banned_tones: [],
    banned_hook_categories: [],
    preferred_hook_categories: ["curiosity", "promise", "novelty"],
    excluded_story_types: [],
    visual_style: {
      aesthetic: "modern, sleek, product-focused",
      lighting: "bright, clean",
      pacing: "fast",
    },
  },

  education: {
    vertical: "education",
    name: "Education & Learning",
    moderation: "moderate",
    max_emotional_intensity: "medium",
    claim_rules: {
      allow_unverified_claims: false,
      allow_income_claims: false,
      allow_health_claims: false,
      allow_guarantees: false,
      require_disclaimer: false,
    },
    preferred_tones: ["authoritative", "friendly", "inspirational"],
    banned_tones: ["urgent"],
    banned_hook_categories: ["shock"],
    preferred_hook_categories: ["curiosity", "novelty", "authority"],
    excluded_story_types: [],
    visual_style: {
      aesthetic: "clean, informative, structured",
      lighting: "bright, neutral",
      pacing: "moderate",
    },
  },

  entertainment: {
    vertical: "entertainment",
    name: "Entertainment & Gaming",
    moderation: "relaxed",
    max_emotional_intensity: "extreme",
    claim_rules: {
      allow_unverified_claims: true,
      allow_income_claims: false,
      allow_health_claims: false,
      allow_guarantees: false,
      require_disclaimer: false,
    },
    preferred_tones: ["playful", "urgent", "friendly"],
    banned_tones: [],
    banned_hook_categories: [],
    preferred_hook_categories: ["shock", "novelty", "curiosity"],
    excluded_story_types: [],
    visual_style: {
      aesthetic: "dynamic, bold, eye-catching",
      lighting: "dramatic, high contrast",
      pacing: "fast",
    },
  },

  ecommerce: {
    vertical: "ecommerce",
    name: "E-Commerce & Products",
    moderation: "moderate",
    max_emotional_intensity: "high",
    claim_rules: {
      allow_unverified_claims: false,
      allow_income_claims: false,
      allow_health_claims: false,
      allow_guarantees: false, // "Money-back" needs careful wording
      require_disclaimer: false,
    },
    preferred_tones: ["friendly", "urgent", "playful"],
    banned_tones: [],
    banned_hook_categories: [],
    preferred_hook_categories: ["curiosity", "social_proof", "novelty", "promise"],
    excluded_story_types: [],
    visual_style: {
      aesthetic: "product-forward, lifestyle, aspirational",
      lighting: "bright, studio or natural",
      pacing: "fast",
    },
  },

  lifestyle: {
    vertical: "lifestyle",
    name: "Lifestyle & Personal Development",
    moderation: "moderate",
    max_emotional_intensity: "high",
    claim_rules: {
      allow_unverified_claims: true,
      allow_income_claims: false,
      allow_health_claims: false,
      allow_guarantees: false,
      require_disclaimer: false,
    },
    preferred_tones: ["inspirational", "friendly", "playful"],
    banned_tones: [],
    banned_hook_categories: [],
    preferred_hook_categories: ["curiosity", "promise", "social_proof"],
    excluded_story_types: [],
    visual_style: {
      aesthetic: "warm, authentic, relatable",
      lighting: "golden hour, natural",
      pacing: "moderate",
    },
  },

  news: {
    vertical: "news",
    name: "News & Current Events",
    moderation: "strict",
    max_emotional_intensity: "high",
    claim_rules: {
      allow_unverified_claims: false,
      allow_income_claims: false,
      allow_health_claims: false,
      allow_guarantees: false,
      require_disclaimer: false,
    },
    preferred_tones: ["authoritative", "neutral", "urgent"],
    banned_tones: ["playful"],
    banned_hook_categories: [],
    preferred_hook_categories: ["curiosity", "novelty", "shock", "fear"],
    excluded_story_types: ["myth"],
    visual_style: {
      aesthetic: "documentary, raw, immediate",
      lighting: "natural, available light",
      pacing: "fast",
    },
  },
};

// ─── Helpers ────────────────────────────────────────────────

export function getVerticalProfile(vertical: ContentVertical): VerticalProfile {
  return VERTICAL_PROFILES[vertical];
}

/**
 * Check if a story type is allowed for a vertical
 */
export function isStoryTypeAllowed(vertical: ContentVertical, storyType: StoryType): boolean {
  const profile = VERTICAL_PROFILES[vertical];
  return !profile.excluded_story_types.includes(storyType);
}

/**
 * Check if a hook category is allowed for a vertical
 */
export function isHookAllowed(vertical: ContentVertical, hookCategory: HookCategory): boolean {
  const profile = VERTICAL_PROFILES[vertical];
  return !profile.banned_hook_categories.includes(hookCategory);
}

/**
 * Get the moderation level for a vertical
 */
export function getModerationLevel(vertical: ContentVertical): ModerationLevel {
  return VERTICAL_PROFILES[vertical].moderation;
}
