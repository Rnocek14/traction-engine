/**
 * Canonical Story Engine Audit Schema v1.0
 * 
 * Single consistent shape persisted in storyboard_json.story_engine.
 * Used by: Wizard → generate-storyboard → continue-story-chain → UI
 * 
 * This is the "source of truth" contract — all pipeline stages read/write
 * into this shape so metadata never drifts.
 */

import type { ContentVertical } from "./vertical-profiles.ts";
import type { ContentGoal, StoryType, EmotionalIntensity } from "./story-types.ts";
import type { ResearchBrief } from "./research-engine.ts";

// ─── Canonical Audit Shape ──────────────────────────────────

export interface StoryEngineAudit {
  /** Schema version — bump on breaking changes, never rename existing fields */
  version: string;

  /** What the user/system requested */
  request: {
    vertical: ContentVertical;
    goal: ContentGoal;
    emotional_intensity?: EmotionalIntensity;
    requested_story_type?: StoryType;
  };

  /** What the router resolved */
  selection: {
    resolved_story_type: StoryType;
    reason: string;
    effective_intensity?: EmotionalIntensity;
  };

  /** Merged constraints summary (not full MergedConstraints — just key decisions) */
  constraints: {
    compiler: "viral" | "cinematic";
    moderation_level: "strict" | "moderate" | "relaxed";
    allowed_tones: string[];
    allowed_hook_categories: string[];
    render_hints?: {
      camera_bias: string[];
      overlay_density: "minimal" | "moderate" | "dense";
    };
  };

  /** Preflight validation results */
  preflight: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };

  /** Compliance pass results */
  compliance: {
    disclaimer?: string;
    total_replacements: number;
    has_hard_blocks: boolean;
    hard_blocks?: string[];
  };

  /** Deterministic RNG metadata */
  rng: {
    seed?: string;
    version: string;
  };

  /** Research brief (append-only, v1) — present when research pipeline was invoked */
  research?: ResearchBrief;
}

// ─── Builder Helper ─────────────────────────────────────────

/**
 * Build a StoryEngineAudit from pipeline outputs.
 * Designed to be called once after routing + preflight + compliance.
 */
export function buildStoryEngineAudit(params: {
  vertical: ContentVertical;
  goal: ContentGoal;
  emotional_intensity?: EmotionalIntensity;
  requested_story_type?: StoryType;
  resolved_story_type: StoryType;
  selection_reason: string;
  effective_intensity?: EmotionalIntensity;
  compiler: "viral" | "cinematic";
  moderation_level: "strict" | "moderate" | "relaxed";
  allowed_tones: string[];
  allowed_hook_categories: string[];
  render_hints?: { camera_bias: string[]; overlay_density: "minimal" | "moderate" | "dense" };
  preflight: { valid: boolean; errors: string[]; warnings: string[] };
  compliance: { disclaimer?: string; total_replacements: number; has_hard_blocks: boolean; hard_blocks?: string[] };
  rng_seed?: string;
  research?: ResearchBrief;
}): StoryEngineAudit {
  const audit: StoryEngineAudit = {
    version: "v1",
    request: {
      vertical: params.vertical,
      goal: params.goal,
      emotional_intensity: params.emotional_intensity,
      requested_story_type: params.requested_story_type,
    },
    selection: {
      resolved_story_type: params.resolved_story_type,
      reason: params.selection_reason,
      effective_intensity: params.effective_intensity,
    },
    constraints: {
      compiler: params.compiler,
      moderation_level: params.moderation_level,
      allowed_tones: params.allowed_tones,
      allowed_hook_categories: params.allowed_hook_categories,
      render_hints: params.render_hints,
    },
    preflight: params.preflight,
    compliance: params.compliance,
    rng: {
      seed: params.rng_seed,
      version: "v1",
    },
  };
  if (params.research) {
    audit.research = params.research;
  }
  return audit;
}

// ─── Deterministic RNG (mulberry32) ─────────────────────────

/**
 * Simple hash for string → 32-bit seed.
 */
export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Mulberry32 seeded PRNG. Returns a function that produces [0, 1) values.
 */
export function mulberry32(seed: number): () => number {
  let t = seed + 0x6D2B79F5;
  return () => {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Create a seeded RNG from a story job ID.
 */
export function seededRng(storyJobId: string): () => number {
  return mulberry32(hashString(storyJobId));
}
