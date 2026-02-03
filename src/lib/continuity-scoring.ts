/**
 * Continuity Scoring & Auto-Regeneration Policy Engine
 * 
 * Calculates continuity scores for clips and stories,
 * and suggests regeneration actions based on detected defects.
 */

import type { Tables } from "@/integrations/supabase/types";

type VideoJob = Tables<"video_jobs">;

// ============================================================================
// Types
// ============================================================================

export interface ContinuityAnchors {
  character?: {
    description: string;
    wardrobe: string;
    identity_lock_tokens: string[];
  };
  environment?: {
    location: string;
    time_of_day: string;
    props: string[];
  };
  camera_language?: {
    lens: string;
    movement_style: string;
    framing_rules: string;
  };
  negative_list?: string[];
}

export interface ContinuityResult {
  score: number;
  issues: string[];
  suggestions: RegenSuggestion[];
}

export interface RegenSuggestion {
  action: "retry_same" | "switch_provider" | "add_constraints" | "manual_review";
  reason: string;
  constraints?: Record<string, unknown>;
}

export type StoryType = "short_story" | "brainrot" | "info" | "hybrid" | "film_continuity" | "myth";

export type SceneRole = "hook" | "problem" | "story_a" | "reset" | "story_b" | "cta" | "atmosphere" | "establish";

export type ChangeType = "info" | "emotion" | "goal" | "stakes" | "location";

export type CutZone = "hook" | "setup" | "escalation" | "payoff" | "button";

// Story Forces - external pressures acting on the protagonist
export type ForceType = "weather" | "predator" | "time" | "pursuit" | "hazard" | "social" | "resource" | "army" | "supernatural";

// Escalation level (0=neutral, 3=crisis peak)
export type EscalationLevel = 0 | 1 | 2 | 3;

// Sanitization level for moderation safety
export type SanitizationLevel = "off" | "soft" | "strict";

export interface StoryScene {
  id: string;
  prompt?: string; // Standard mode prompt
  subject_action?: string; // Film mode action (alternative to prompt)
  visual_description?: string; // Myth mode visual description
  duration_target?: number; // Standard mode
  duration_seconds?: number; // Film mode / Myth mode (alternative to duration_target)
  sequence_index?: number;
  index?: number; // Film mode uses 'index' instead of 'sequence_index'
  camera_direction?: string;
  camera_move?: string; // Film mode camera
  role?: SceneRole;
  enrichedPrompt?: string;
  coverage?: string; // Film mode coverage type
  // Director Brain fields (Phase 1)
  change_type?: ChangeType;
  narration_line?: string;
  onscreen_text?: string;
  is_hero_shot?: boolean;
  zone?: CutZone;
  // Cut type architecture (Phase 2)
  cut_type?: "hard" | "continuity";
  // Film mode specific
  subject_required?: boolean;
  shot_signature?: {
    framing?: string;
    angle?: string;
    lens?: string;
    motion?: string;
  };
  realism_hints?: string[];
  timing_beats?: string;
  setpiece_delta?: string;
  // Story Forces (Phase 8) - external pressure/escalation
  force_present?: boolean;           // Is an external force acting in this scene?
  force_type?: ForceType;            // What kind of force?
  escalation_delta?: EscalationLevel;  // How much worse than previous? 0=neutral, 3=crisis
  // Myth mode specific
  beat_type?: string; // "introduction" | "journey" | "trial" | "revelation" | "moral"
  has_silhouette?: boolean;
  silhouette_action?: string;
  symbolic_elements?: string[];
  narration?: string; // Myth mode narration (different from narration_line)
  // Legacy fields for transformation tracking
  action_summary?: string;
  state_from?: string;
  state_to?: string;
  alternate_subject?: string;
}

/**
 * Get the effective prompt from a scene (supports standard, Film Mode, and Myth Mode)
 * 
 * Priority:
 * 1. prompt (standard mode)
 * 2. subject_action (Film Mode)
 * 3. visual_description (Myth Mode)
 */
export function getScenePrompt(scene: StoryScene): string {
  // Myth mode scenes use visual_description instead of prompt
  const mythScene = scene as StoryScene & { visual_description?: string };
  return scene.prompt || scene.subject_action || mythScene.visual_description || "";
}

/**
 * Get the effective duration from a scene (supports both standard and Film Mode)
 */
export function getSceneDuration(scene: StoryScene): number {
  return scene.duration_target || scene.duration_seconds || 4;
}

/**
 * Get the effective sequence index from a scene (supports both standard and Film Mode)
 */
export function getSceneIndex(scene: StoryScene): number {
  return scene.sequence_index ?? scene.index ?? 0;
}

export interface Storyboard {
  scenes: StoryScene[];
  // Director Brain fields (Phase 1)
  story_spine?: string;
  motif_anchors?: string[];
  palette_keywords?: string[];
}

// ============================================================================
// Defect Mappings
// ============================================================================

const DEFECT_DEDUCTIONS: Record<string, number> = {
  flicker: 20,
  jitter: 15,
  identity_drift: 25,
  temporal_artifact: 15,
  morph: 20,
  texture_crawl: 10,
  frame_skip: 15,
  color_shift: 10,
};

const BAD_RAW_TAGS = [
  "x_flicker",
  "x_jitter",
  "x_morph",
  "x_temporal_artifact",
  "x_identity_drift",
  "x_texture_crawl",
];

// ============================================================================
// Scoring Functions
// ============================================================================

/**
 * Calculate continuity score for a single clip
 */
export function calculateContinuityScore(
  clip: VideoJob,
  _prevClip: VideoJob | null = null,
  _anchors: ContinuityAnchors | null = null
): ContinuityResult {
  let score = 100;
  const issues: string[] = [];
  const suggestions: RegenSuggestion[] = [];

  // Parse defects from auto_defects JSONB
  const defects = parseDefects(clip.auto_defects);
  
  for (const defect of defects) {
    const defectType = typeof defect === "string" ? defect : defect.type;
    const deduction = DEFECT_DEDUCTIONS[defectType] || 5;
    score -= deduction;
    issues.push(`Detected ${defectType} (-${deduction})`);
    
    // Add specific suggestions
    if (defectType === "flicker" || defectType === "jitter") {
      suggestions.push({
        action: "switch_provider",
        reason: `${defectType} detected - Runway often handles this better`,
        constraints: { provider: "runway" },
      });
    }
    if (defectType === "identity_drift") {
      suggestions.push({
        action: "add_constraints",
        reason: "Identity drift detected - add negative prompt",
        constraints: { 
          negativePrompt: "identity change, face morphing, different person" 
        },
      });
    }
  }

  // Check raw routing tags for bad signals
  const rawTags = clip.raw_routing_tags || [];
  const hasBadTags = BAD_RAW_TAGS.some(t => rawTags.includes(t));
  if (hasBadTags) {
    score -= 15;
    issues.push("Artifact tags detected in raw routing (-15)");
  }

  // Check artifact flags
  const artifactFlags = clip.auto_artifact_flags || [];
  for (const flag of artifactFlags) {
    if (DEFECT_DEDUCTIONS[flag] && !defects.some(d => 
      (typeof d === "string" ? d : d.type) === flag
    )) {
      score -= DEFECT_DEDUCTIONS[flag] / 2; // Half penalty if not in defects
      issues.push(`Artifact flag: ${flag}`);
    }
  }

  // Bonus for high quality indicators
  if (clip.auto_best_use === "continuity_critical" || 
      clip.auto_best_use === "hero_shot") {
    score += 5;
    issues.push("High quality indicator (+5)");
  }

  // If score is very low, suggest manual review
  if (score < 40) {
    suggestions.push({
      action: "manual_review",
      reason: "Score too low for automated fix",
    });
  } else if (score < 60 && suggestions.length === 0) {
    suggestions.push({
      action: "retry_same",
      reason: "Moderate quality - retry with same settings",
      constraints: { seed: (clip.settings as Record<string, unknown>)?.seed },
    });
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    issues,
    suggestions,
  };
}

/**
 * Calculate aggregate continuity score for a story
 */
export function calculateStoryScore(
  clips: VideoJob[],
  anchors: ContinuityAnchors | null = null
): {
  score: number;
  weakestClipId: string | null;
  weakestScore: number;
  clipScores: Map<string, ContinuityResult>;
} {
  if (clips.length === 0) {
    return { score: 100, weakestClipId: null, weakestScore: 100, clipScores: new Map() };
  }

  const clipScores = new Map<string, ContinuityResult>();
  let totalScore = 0;
  let weakestClipId: string | null = null;
  let weakestScore = 100;

  // Sort by sequence_index
  const sorted = [...clips].sort((a, b) => 
    (a.sequence_index || 0) - (b.sequence_index || 0)
  );

  for (let i = 0; i < sorted.length; i++) {
    const clip = sorted[i];
    const prevClip = i > 0 ? sorted[i - 1] : null;
    const result = calculateContinuityScore(clip, prevClip, anchors);
    
    clipScores.set(clip.id, result);
    totalScore += result.score;
    
    if (result.score < weakestScore) {
      weakestScore = result.score;
      weakestClipId = clip.id;
    }
  }

  return {
    score: Math.round(totalScore / clips.length),
    weakestClipId,
    weakestScore,
    clipScores,
  };
}

// ============================================================================
// Auto-Regeneration Policies
// ============================================================================

export interface RegenPolicy {
  id: string;
  name: string;
  trigger: (clip: VideoJob) => boolean;
  action: RegenSuggestion["action"];
  constraints?: Record<string, unknown>;
}

export const REGEN_POLICIES: RegenPolicy[] = [
  {
    id: "flicker_switch",
    name: "Switch provider on flicker",
    trigger: (clip) => {
      const defects = parseDefects(clip.auto_defects);
      return defects.some(d => (typeof d === "string" ? d : d.type) === "flicker");
    },
    action: "switch_provider",
    constraints: { provider: "runway" },
  },
  {
    id: "jitter_switch",
    name: "Switch provider on jitter",
    trigger: (clip) => {
      const defects = parseDefects(clip.auto_defects);
      return defects.some(d => (typeof d === "string" ? d : d.type) === "jitter");
    },
    action: "switch_provider",
    constraints: { provider: "luma" },
  },
  {
    id: "identity_drift_fix",
    name: "Add constraints on identity drift",
    trigger: (clip) => {
      const defects = parseDefects(clip.auto_defects);
      return defects.some(d => (typeof d === "string" ? d : d.type) === "identity_drift");
    },
    action: "add_constraints",
    constraints: { 
      negativePrompt: "identity change, face morphing, different person, aging" 
    },
  },
  {
    id: "low_score_retry",
    name: "Retry on low continuity score",
    trigger: (clip) => (clip.continuity_score || 100) < 50,
    action: "retry_same",
  },
  {
    id: "multiple_failures_manual",
    name: "Manual review after multiple issues",
    trigger: (clip) => {
      const defects = parseDefects(clip.auto_defects);
      return defects.length >= 3;
    },
    action: "manual_review",
  },
];

/**
 * Get applicable regeneration policies for a clip
 */
export function getApplicablePolicies(clip: VideoJob): RegenPolicy[] {
  return REGEN_POLICIES.filter(policy => policy.trigger(clip));
}

// ============================================================================
// Story Type Configuration
// ============================================================================

export interface StoryTypeConfig {
  name: string;
  description: string;
  clipPacing: "fast" | "medium" | "slow";
  typicalClipCount: [number, number];
  continuityStrictness: "strict" | "moderate" | "loose";
  defaultDuration: number;
}

export const STORY_TYPE_CONFIGS: Record<StoryType, StoryTypeConfig> = {
  short_story: {
    name: "Short Story",
    description: "Narrative arc with character continuity",
    clipPacing: "medium",
    typicalClipCount: [4, 8],
    continuityStrictness: "strict",
    defaultDuration: 5,
  },
  brainrot: {
    name: "Brain Rot",
    description: "Fast cuts, high energy, meme-style",
    clipPacing: "fast",
    typicalClipCount: [6, 12],
    continuityStrictness: "loose",
    defaultDuration: 3,
  },
  info: {
    name: "Informational",
    description: "Educational content with clear visuals",
    clipPacing: "slow",
    typicalClipCount: [3, 6],
    continuityStrictness: "moderate",
    defaultDuration: 6,
  },
  hybrid: {
    name: "Hybrid",
    description: "Mix of styles, custom pacing",
    clipPacing: "medium",
    typicalClipCount: [4, 10],
    continuityStrictness: "moderate",
    defaultDuration: 5,
  },
  film_continuity: {
    name: "Film Mode",
    description: "Film-first architecture with face-only I2V and variety contract",
    clipPacing: "medium",
    typicalClipCount: [6, 10],
    continuityStrictness: "moderate",
    defaultDuration: 4,
  },
  myth: {
    name: "Myth Mode",
    description: "Storybook style with silhouettes, fables, and symbolic abstraction",
    clipPacing: "slow",
    typicalClipCount: [3, 5],
    continuityStrictness: "loose",
    defaultDuration: 7,
  },
};

// ============================================================================
// Helpers
// ============================================================================

interface Defect {
  type: string;
  severity?: string;
}

export function parseDefects(defects: unknown): Defect[] {
  if (!defects) return [];
  if (Array.isArray(defects)) {
    return defects.map(d => {
      if (typeof d === "string") return { type: d };
      if (typeof d === "object" && d !== null && "type" in d) return d as Defect;
      return { type: String(d) };
    });
  }
  return [];
}

/**
 * Get quality gate thresholds for a story type
 */
export function getQualityThresholds(storyType: StoryType): {
  hardBlock: number;
  softWarning: number;
} {
  const config = STORY_TYPE_CONFIGS[storyType];
  
  switch (config.continuityStrictness) {
    case "strict":
      return { hardBlock: 40, softWarning: 70 };
    case "moderate":
      return { hardBlock: 30, softWarning: 60 };
    case "loose":
      return { hardBlock: 20, softWarning: 50 };
    default:
      return { hardBlock: 30, softWarning: 60 };
  }
}

/**
 * Check if a clip passes quality gate for its story type
 */
export function passesQualityGate(
  clip: VideoJob,
  storyType: StoryType
): { passes: boolean; isHardBlock: boolean; isWarning: boolean } {
  const score = clip.continuity_score ?? 100;
  const thresholds = getQualityThresholds(storyType);
  
  return {
    passes: score >= thresholds.hardBlock,
    isHardBlock: score < thresholds.hardBlock,
    isWarning: score >= thresholds.hardBlock && score < thresholds.softWarning,
  };
}
