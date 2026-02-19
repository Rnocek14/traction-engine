/**
 * Story Type Router v1.0
 * 
 * Two-layer selection:
 *   1. StoryTypeSelector: picks format based on goal + intensity + rotation
 *   2. ConstraintMerger: combines story template constraints with vertical guardrails
 *   3. PreflightValidator: blocks bad combos before generation
 * 
 * This is the top-level orchestration layer.
 */

import {
  type StoryType,
  type ContentGoal,
  type EmotionalIntensity,
  type StoryTemplate,
  STORY_TEMPLATES,
  getStoryTemplate,
  isViralMode,
} from "./story-types.ts";

import {
  type ContentVertical,
  type VerticalProfile,
  type ModerationLevel,
  type TonePreset,
  VERTICAL_PROFILES,
  getVerticalProfile,
  isStoryTypeAllowed,
} from "./vertical-profiles.ts";

// ─── Selection Request ──────────────────────────────────────

export interface StoryTypeRequest {
  vertical: ContentVertical;
  goal: ContentGoal;
  emotional_intensity?: EmotionalIntensity;
  recent_story_types?: StoryType[];  // Last 5 for rotation
  forced_type?: StoryType;           // Manual override
}

// ─── Merged Constraints (output of the router) ─────────────

export interface MergedConstraints {
  // Identity
  story_type: StoryType;
  vertical: ContentVertical;
  template: StoryTemplate;
  vertical_profile: VerticalProfile;
  
  // Effective constraints (merged)
  max_clips: number;
  clip_duration_range: [number, number]; // Global min/max across beats
  total_duration_range: [number, number];
  prompt_char_limit: number;
  prompt_mode: "viral" | "cinematic";
  
  // Moderation
  moderation_level: ModerationLevel;
  require_disclaimer: boolean;
  disclaimer_text?: string;
  
  // Feature flags (intersection of template + vertical)
  hook_scoring_required: boolean;
  director_brief: boolean;
  escalation_logic: boolean;
  capture_contract: boolean;
  motion_amplification: boolean;
  text_overlay_default: boolean;
  
  // Tone
  allowed_tones: TonePreset[];
  
  // Visual
  visual_style: VerticalProfile["visual_style"];
  
  // Metadata
  selection_reason: string;
}

// ─── Intensity Rank ─────────────────────────────────────────

const INTENSITY_RANK: Record<EmotionalIntensity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  extreme: 3,
};

// ─── Goal → Story Type Mapping (Primary) ────────────────────

const GOAL_TYPE_MAP: Record<ContentGoal, StoryType[]> = {
  reach:     ["viral_hook", "listicle", "trend_hijack", "before_after"],
  sell:      ["pas", "before_after", "viral_hook"],
  authority: ["authority", "listicle", "micro_story"],
  brand:     ["myth", "micro_story", "authority"],
  retain:    ["listicle", "viral_hook", "micro_story"],
};

// ═══════════════════════════════════════════════════════════
// 1. STORY TYPE SELECTOR
// ═══════════════════════════════════════════════════════════

export function selectStoryType(request: StoryTypeRequest): { type: StoryType; reason: string } {
  const { vertical, goal, emotional_intensity, recent_story_types, forced_type } = request;
  
  // Manual override
  if (forced_type) {
    if (!isStoryTypeAllowed(vertical, forced_type)) {
      return { type: forced_type, reason: `forced:${forced_type} (warning: not recommended for ${vertical})` };
    }
    return { type: forced_type, reason: `forced:${forced_type}` };
  }
  
  // Get candidates from goal mapping
  const candidates = GOAL_TYPE_MAP[goal] || ["viral_hook"];
  
  // Filter by vertical compatibility
  const allowed = candidates.filter(t => isStoryTypeAllowed(vertical, t));
  
  if (allowed.length === 0) {
    return { type: "viral_hook", reason: "fallback: no compatible types for vertical" };
  }
  
  // Filter by emotional intensity if specified
  let filtered = allowed;
  if (emotional_intensity) {
    const requestedRank = INTENSITY_RANK[emotional_intensity];
    filtered = allowed.filter(t => {
      const template = STORY_TEMPLATES[t];
      const minRank = INTENSITY_RANK[template.intensity_range[0]];
      const maxRank = INTENSITY_RANK[template.intensity_range[1]];
      return requestedRank >= minRank && requestedRank <= maxRank;
    });
    if (filtered.length === 0) filtered = allowed; // Fallback
  }
  
  // Rotation: avoid repeating recent types
  if (recent_story_types && recent_story_types.length > 0) {
    const notRecent = filtered.filter(t => !recent_story_types.includes(t));
    if (notRecent.length > 0) {
      filtered = notRecent;
    }
    // If all candidates are recent, just use them anyway (small pool)
  }
  
  // Pick first available (priority order from GOAL_TYPE_MAP)
  const selected = filtered[0];
  
  return {
    type: selected,
    reason: `goal=${goal} vertical=${vertical} intensity=${emotional_intensity || "any"} candidates=[${allowed.join(",")}] selected=${selected}`,
  };
}

// ═══════════════════════════════════════════════════════════
// 2. CONSTRAINT MERGER
// ═══════════════════════════════════════════════════════════

export function mergeConstraints(
  storyType: StoryType,
  vertical: ContentVertical,
  selectionReason: string
): MergedConstraints {
  const template = getStoryTemplate(storyType);
  const profile = getVerticalProfile(vertical);
  
  // Compute global clip duration range from beats
  let globalMinDuration = Infinity;
  let globalMaxDuration = 0;
  for (const beat of template.beats) {
    globalMinDuration = Math.min(globalMinDuration, beat.duration_range[0]);
    globalMaxDuration = Math.max(globalMaxDuration, beat.duration_range[1]);
  }
  
  // Allowed tones: intersection of preferred + not banned
  const allowed_tones = profile.preferred_tones.filter(
    t => !profile.banned_tones.includes(t)
  );
  
  // For strict moderation verticals, disable some cinematic features
  const isStrict = profile.moderation === "strict";
  
  return {
    story_type: storyType,
    vertical,
    template,
    vertical_profile: profile,
    
    max_clips: template.max_clips,
    clip_duration_range: [globalMinDuration, globalMaxDuration],
    total_duration_range: template.total_duration_range,
    prompt_char_limit: template.prompt_char_limit,
    prompt_mode: template.prompt_mode,
    
    moderation_level: profile.moderation,
    require_disclaimer: profile.claim_rules.require_disclaimer,
    disclaimer_text: profile.claim_rules.disclaimer_text,
    
    hook_scoring_required: template.hook_scoring_required,
    director_brief: template.director_brief && !isStrict,
    escalation_logic: template.escalation_logic,
    capture_contract: template.capture_contract,
    motion_amplification: template.motion_amplification,
    text_overlay_default: template.text_overlay_default,
    
    allowed_tones,
    visual_style: profile.visual_style,
    
    selection_reason: selectionReason,
  };
}

// ═══════════════════════════════════════════════════════════
// 3. PREFLIGHT VALIDATOR
// ═══════════════════════════════════════════════════════════

export interface PreflightResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function preflightValidate(
  constraints: MergedConstraints,
  storyboard: {
    scenes: Array<{
      id: string;
      prompt: string;
      duration_target: number;
      sequence_index: number;
    }>;
  }
): PreflightResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  const { scenes } = storyboard;
  const { template, vertical_profile } = constraints;
  
  // ── Clip count ──
  if (scenes.length > template.max_clips) {
    errors.push(
      `Too many clips: ${scenes.length} > max ${template.max_clips} for ${template.type}`
    );
  }
  if (scenes.length < template.min_clips) {
    errors.push(
      `Too few clips: ${scenes.length} < min ${template.min_clips} for ${template.type}`
    );
  }
  
  // ── Total duration ──
  const totalDuration = scenes.reduce((sum, s) => sum + (s.duration_target || 5), 0);
  if (totalDuration > template.total_duration_range[1]) {
    warnings.push(
      `Total duration ${totalDuration}s exceeds max ${template.total_duration_range[1]}s`
    );
  }
  if (totalDuration < template.total_duration_range[0]) {
    warnings.push(
      `Total duration ${totalDuration}s below min ${template.total_duration_range[0]}s`
    );
  }
  
  // ── Per-scene duration ──
  for (const scene of scenes) {
    const dur = scene.duration_target || 5;
    if (dur > constraints.clip_duration_range[1] + 1) {
      warnings.push(
        `Scene ${scene.sequence_index}: ${dur}s exceeds typical max ${constraints.clip_duration_range[1]}s`
      );
    }
  }
  
  // ── Prompt length ──
  for (const scene of scenes) {
    if (scene.prompt && scene.prompt.length > constraints.prompt_char_limit) {
      warnings.push(
        `Scene ${scene.sequence_index}: prompt ${scene.prompt.length} chars > limit ${constraints.prompt_char_limit}`
      );
    }
  }
  
  // ── Hook presence (for viral modes) ──
  if (constraints.hook_scoring_required) {
    const hookBeat = template.beats.find(b => b.is_hook);
    if (hookBeat && scenes.length > 0) {
      const firstScene = scenes[0];
      if (!firstScene.prompt || firstScene.prompt.length < 10) {
        warnings.push("Hook scene has insufficient prompt content");
      }
    }
  }
  
  // ── Vertical moderation check ──
  if (vertical_profile.moderation === "strict") {
    for (const scene of scenes) {
      if (!scene.prompt) continue;
      const lower = scene.prompt.toLowerCase();
      // Basic checks - real moderation happens at prompt compile time
      if (lower.includes("guarantee") && !vertical_profile.claim_rules.allow_guarantees) {
        warnings.push(`Scene ${scene.sequence_index}: contains "guarantee" in strict vertical`);
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ═══════════════════════════════════════════════════════════
// 4. CONVENIENCE: Full routing pipeline
// ═══════════════════════════════════════════════════════════

/**
 * One-call route: select type → merge constraints → return ready-to-use config
 */
export function routeStory(request: StoryTypeRequest): {
  constraints: MergedConstraints;
  selection: { type: StoryType; reason: string };
} {
  const selection = selectStoryType(request);
  const constraints = mergeConstraints(selection.type, request.vertical, selection.reason);
  
  return { constraints, selection };
}

/**
 * Full pipeline: route + validate a storyboard
 */
export function routeAndValidate(
  request: StoryTypeRequest,
  storyboard: {
    scenes: Array<{
      id: string;
      prompt: string;
      duration_target: number;
      sequence_index: number;
    }>;
  }
): {
  constraints: MergedConstraints;
  selection: { type: StoryType; reason: string };
  preflight: PreflightResult;
} {
  const { constraints, selection } = routeStory(request);
  const preflight = preflightValidate(constraints, storyboard);
  
  return { constraints, selection, preflight };
}
