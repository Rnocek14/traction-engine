/**
 * Story Type Router v1.2
 * 
 * Two-layer selection:
 *   1. StoryTypeSelector: picks format based on goal + intensity + rotation
 *   2. ConstraintMerger: combines story template constraints with vertical guardrails
 *   3. PreflightValidator: blocks bad combos before generation
 * 
 * v1.2 fixes:
 *   - Fix #1: undefined intensity → skip intensity filter (not default to max)
 *   - Fix #2: Single source of truth for effectiveIntensity via selectStoryType return
 *   - Fix #3: Hook category fallback when intersection is empty
 *   - Fix #4: beat_index (0-based) documented; positional fallback clarified
 *   - Fix #5: Deprecated prompt_mode in favor of compiler
 */

import {
  type StoryType,
  type ContentGoal,
  type EmotionalIntensity,
  type StoryTemplate,
  type HookCategory,
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

// Re-export for convenience
export type { MergedConstraints, FeatureFlags, StoryTypeRequest, PreflightResult };

// ─── Selection Request ──────────────────────────────────────

interface StoryTypeRequest {
  vertical: ContentVertical;
  goal: ContentGoal;
  emotional_intensity?: EmotionalIntensity; // undefined = don't filter
  recent_story_types?: StoryType[];  // Last 5 for rotation
  forced_type?: StoryType;           // Manual override
}

// ─── Feature Flags (grouped for clean branching) ────────────

interface FeatureFlags {
  director_brief: boolean;
  capture_contract: boolean;
  motion_amplification: boolean;
  escalation_logic: boolean;
  hook_scoring_required: boolean;
  text_overlay_default: boolean;
}

// ─── Selection Result ───────────────────────────────────────

interface StoryTypeSelection {
  type: StoryType;
  reason: string;
  /** The effective intensity after clamping. undefined if caller didn't specify. */
  effective_intensity?: EmotionalIntensity;
}

// ─── Merged Constraints (output of the router) ─────────────

interface MergedConstraints {
  // Identity
  story_type: StoryType;
  vertical: ContentVertical;
  template: StoryTemplate;
  vertical_profile: VerticalProfile;
  
  // Effective constraints (merged)
  max_clips: number;
  clip_duration_range: [number, number];
  total_duration_range: [number, number];
  prompt_char_limit: number;
  prompt_max_words: number;
  
  /** Primary branch key: "viral" | "cinematic" */
  compiler: "viral" | "cinematic";
  /** @deprecated Use `compiler` instead */
  prompt_mode: "viral" | "cinematic";
  
  // Moderation
  moderation_level: ModerationLevel;
  require_disclaimer: boolean;
  disclaimer_text?: string;
  
  /** Resolved hook categories (template ∩ vertical, with fallback) */
  allowed_hook_categories: HookCategory[];
  
  /** Grouped feature flags */
  features: FeatureFlags;
  
  // Legacy flat flags (derived from features)
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
  effective_intensity?: EmotionalIntensity;
}

// ─── Intensity Rank ─────────────────────────────────────────

const INTENSITY_RANK: Record<EmotionalIntensity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  extreme: 3,
};

const RANK_TO_INTENSITY: EmotionalIntensity[] = ["low", "medium", "high", "extreme"];

/**
 * Clamp requested intensity to vertical's max.
 * Returns undefined if requested is undefined (= don't filter).
 */
function clampIntensity(
  requested: EmotionalIntensity | undefined,
  verticalMax: EmotionalIntensity
): EmotionalIntensity | undefined {
  // Fix #1: If not specified, return undefined → skip intensity filter
  if (!requested) return undefined;
  const reqRank = INTENSITY_RANK[requested];
  const maxRank = INTENSITY_RANK[verticalMax];
  return RANK_TO_INTENSITY[Math.min(reqRank, maxRank)];
}

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

export function selectStoryType(request: StoryTypeRequest): StoryTypeSelection {
  const { vertical, goal, emotional_intensity, recent_story_types, forced_type } = request;
  const profile = getVerticalProfile(vertical);
  
  // Fix #1 + #2: Single computation of effective intensity
  const effectiveIntensity = clampIntensity(emotional_intensity, profile.max_emotional_intensity);
  
  // Manual override
  if (forced_type) {
    const warn = !isStoryTypeAllowed(vertical, forced_type);
    return {
      type: forced_type,
      reason: warn
        ? `forced:${forced_type} (warning: not recommended for ${vertical})`
        : `forced:${forced_type}`,
      effective_intensity: effectiveIntensity,
    };
  }
  
  // Get candidates from goal mapping
  const candidates = GOAL_TYPE_MAP[goal] || ["viral_hook"];
  
  // Filter by vertical compatibility
  const allowed = candidates.filter(t => isStoryTypeAllowed(vertical, t));
  
  if (allowed.length === 0) {
    return { type: "viral_hook", reason: "fallback: no compatible types for vertical", effective_intensity: effectiveIntensity };
  }
  
  // Fix #1: Only filter by intensity if explicitly provided
  let filtered = allowed;
  if (effectiveIntensity !== undefined) {
    const requestedRank = INTENSITY_RANK[effectiveIntensity];
    const intensityFiltered = allowed.filter(t => {
      const template = STORY_TEMPLATES[t];
      const minRank = INTENSITY_RANK[template.intensity_range[0]];
      const maxRank = INTENSITY_RANK[template.intensity_range[1]];
      return requestedRank >= minRank && requestedRank <= maxRank;
    });
    if (intensityFiltered.length > 0) filtered = intensityFiltered;
    // If no matches, keep all allowed (fallback)
  }
  
  // Rotation: avoid repeating recent types
  if (recent_story_types && recent_story_types.length > 0) {
    const notRecent = filtered.filter(t => !recent_story_types.includes(t));
    if (notRecent.length > 0) {
      filtered = notRecent;
    }
  }
  
  const selected = filtered[0];
  
  return {
    type: selected,
    reason: `goal=${goal} vertical=${vertical} intensity=${effectiveIntensity ?? "unset"} candidates=[${allowed.join(",")}] selected=${selected}`,
    effective_intensity: effectiveIntensity,
  };
}

// ═══════════════════════════════════════════════════════════
// 2. CONSTRAINT MERGER
// ═══════════════════════════════════════════════════════════

export function mergeConstraints(
  storyType: StoryType,
  vertical: ContentVertical,
  selectionReason: string,
  effectiveIntensity?: EmotionalIntensity
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
  
  // Fix #5 (from prev round): Allowed tones with fallback to ["neutral"]
  let allowed_tones = profile.preferred_tones.filter(
    t => !profile.banned_tones.includes(t)
  );
  if (allowed_tones.length === 0) {
    allowed_tones = ["neutral"];
  }
  
  // Fix #3: Hook category intersection with cascading fallback
  let allowed_hook_categories = template.default_hook_categories.filter(
    (hc) => !profile.banned_hook_categories.includes(hc)
  );
  if (allowed_hook_categories.length === 0) {
    // Fallback 1: use vertical's preferred hooks minus banned
    allowed_hook_categories = profile.preferred_hook_categories.filter(
      (hc) => !profile.banned_hook_categories.includes(hc)
    );
  }
  if (allowed_hook_categories.length === 0) {
    // Fallback 2: universal safe default
    allowed_hook_categories = ["curiosity"];
  }
  
  // Fix #4 (prev round): All cinematic features disabled for strict verticals
  const isStrict = profile.moderation === "strict";
  
  const features: FeatureFlags = {
    director_brief: template.director_brief && !isStrict,
    capture_contract: template.capture_contract && !isStrict,
    motion_amplification: template.motion_amplification && !isStrict,
    escalation_logic: template.escalation_logic && !isStrict,
    hook_scoring_required: template.hook_scoring_required,
    text_overlay_default: template.text_overlay_default,
  };
  
  const compiler = template.prompt_mode;
  
  return {
    story_type: storyType,
    vertical,
    template,
    vertical_profile: profile,
    
    max_clips: template.max_clips,
    clip_duration_range: [globalMinDuration, globalMaxDuration],
    total_duration_range: template.total_duration_range,
    prompt_char_limit: template.prompt_char_limit,
    prompt_max_words: template.prompt_max_words,
    
    compiler,
    prompt_mode: compiler, // deprecated alias
    
    moderation_level: profile.moderation,
    require_disclaimer: profile.claim_rules.require_disclaimer,
    disclaimer_text: profile.claim_rules.disclaimer_text,
    
    allowed_hook_categories,
    
    features,
    
    // Legacy flat flags
    hook_scoring_required: features.hook_scoring_required,
    director_brief: features.director_brief,
    escalation_logic: features.escalation_logic,
    capture_contract: features.capture_contract,
    motion_amplification: features.motion_amplification,
    text_overlay_default: features.text_overlay_default,
    
    allowed_tones,
    visual_style: profile.visual_style,
    
    selection_reason: selectionReason,
    effective_intensity: effectiveIntensity,
  };
}

// ═══════════════════════════════════════════════════════════
// 3. PREFLIGHT VALIDATOR
// ═══════════════════════════════════════════════════════════

interface PreflightResult {
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
      /** 0-based index matching template.beats position */
      beat_index: number;
      beat_role?: string;
    }>;
  }
): PreflightResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  const { scenes } = storyboard;
  const { template, vertical_profile } = constraints;
  
  // ── Clip count ──
  if (scenes.length > template.max_clips) {
    errors.push(`Too many clips: ${scenes.length} > max ${template.max_clips} for ${template.type}`);
  }
  if (scenes.length < template.min_clips) {
    errors.push(`Too few clips: ${scenes.length} < min ${template.min_clips} for ${template.type}`);
  }
  
  // ── Total duration ──
  const totalDuration = scenes.reduce((sum, s) => sum + (s.duration_target || 5), 0);
  if (totalDuration > template.total_duration_range[1]) {
    warnings.push(`Total duration ${totalDuration}s exceeds max ${template.total_duration_range[1]}s`);
  }
  if (totalDuration < template.total_duration_range[0]) {
    warnings.push(`Total duration ${totalDuration}s below min ${template.total_duration_range[0]}s`);
  }
  
  // ── Fix #4 + #6: Per-scene beat-level duration validation ──
  // beat_index is 0-based, matching template.beats[] position
  for (const scene of scenes) {
    const dur = scene.duration_target || 5;
    const idx = scene.beat_index; // always 0-based
    
    // Resolve beat: by explicit role first, then by beat_index
    let matchedBeat = scene.beat_role
      ? template.beats.find(b => b.role === scene.beat_role)
      : undefined;
    
    if (!matchedBeat && idx >= 0 && idx < template.beats.length) {
      matchedBeat = template.beats[idx];
    }
    
    if (matchedBeat) {
      if (dur < matchedBeat.duration_range[0]) {
        warnings.push(`Scene ${idx} (${matchedBeat.role}): ${dur}s below beat min ${matchedBeat.duration_range[0]}s`);
      }
      if (dur > matchedBeat.duration_range[1]) {
        warnings.push(`Scene ${idx} (${matchedBeat.role}): ${dur}s exceeds beat max ${matchedBeat.duration_range[1]}s`);
      }
    }
  }
  
  // ── Prompt length (chars + words) ──
  for (const scene of scenes) {
    if (!scene.prompt) continue;
    
    if (scene.prompt.length > constraints.prompt_char_limit) {
      warnings.push(`Scene ${scene.beat_index}: prompt ${scene.prompt.length} chars > limit ${constraints.prompt_char_limit}`);
    }
    
    const wordCount = scene.prompt.split(/\s+/).filter(Boolean).length;
    if (wordCount > constraints.prompt_max_words) {
      warnings.push(`Scene ${scene.beat_index}: prompt ${wordCount} words > limit ${constraints.prompt_max_words}`);
    }
  }
  
  // ── Hook presence ──
  if (constraints.features.hook_scoring_required) {
    const hookBeat = template.beats.find(b => b.is_hook);
    if (hookBeat && scenes.length > 0) {
      const firstScene = scenes[0];
      if (!firstScene.prompt || firstScene.prompt.length < 10) {
        warnings.push("Hook scene has insufficient prompt content");
      }
    }
  }
  
  // ── Cheap heuristic warnings (NOT real moderation) ──
  if (vertical_profile.moderation === "strict") {
    for (const scene of scenes) {
      if (!scene.prompt) continue;
      const lower = scene.prompt.toLowerCase();
      if (lower.includes("guarantee") && !vertical_profile.claim_rules.allow_guarantees) {
        warnings.push(`Scene ${scene.beat_index}: heuristic: "guarantee" in strict vertical`);
      }
      if (lower.includes("cure") && !vertical_profile.claim_rules.allow_health_claims) {
        warnings.push(`Scene ${scene.beat_index}: heuristic: "cure" in strict vertical`);
      }
    }
  }
  
  return { valid: errors.length === 0, errors, warnings };
}

// ═══════════════════════════════════════════════════════════
// 4. CONVENIENCE: Full routing pipeline
// ═══════════════════════════════════════════════════════════

/**
 * One-call route: select type → merge constraints → return ready-to-use config
 */
export function routeStory(request: StoryTypeRequest): {
  constraints: MergedConstraints;
  selection: StoryTypeSelection;
} {
  // Fix #2: Single source of truth — selectStoryType computes and returns effectiveIntensity
  const selection = selectStoryType(request);
  const constraints = mergeConstraints(
    selection.type,
    request.vertical,
    selection.reason,
    selection.effective_intensity
  );
  
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
      beat_index: number;
      beat_role?: string;
    }>;
  }
): {
  constraints: MergedConstraints;
  selection: StoryTypeSelection;
  preflight: PreflightResult;
} {
  const { constraints, selection } = routeStory(request);
  const preflight = preflightValidate(constraints, storyboard);
  
  return { constraints, selection, preflight };
}
