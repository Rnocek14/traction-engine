/**
 * Story Type Router v1.1
 * 
 * Two-layer selection:
 *   1. StoryTypeSelector: picks format based on goal + intensity + rotation
 *   2. ConstraintMerger: combines story template constraints with vertical guardrails
 *   3. PreflightValidator: blocks bad combos before generation
 * 
 * v1.1 fixes:
 *   - Fix #1: prompt_max_words in MergedConstraints
 *   - Fix #2: Clamp intensity by vertical max_emotional_intensity
 *   - Fix #3: allowed_hook_categories computed from template ∩ vertical
 *   - Fix #4: All cinematic features disabled for strict verticals
 *   - Fix #5: Tone fallback to ["neutral"] when empty
 *   - Fix #6: Beat-level duration validation in preflight
 *   - Fix #8: Preflight moderation renamed to "cheap heuristic warnings"
 *   - Added compiler field ("viral" | "cinematic") for clean branching
 *   - Added features group for consolidated boolean checks
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

// ─── Selection Request ──────────────────────────────────────

export interface StoryTypeRequest {
  vertical: ContentVertical;
  goal: ContentGoal;
  emotional_intensity?: EmotionalIntensity;
  recent_story_types?: StoryType[];  // Last 5 for rotation
  forced_type?: StoryType;           // Manual override
}

// ─── Feature Flags (grouped for clean branching) ────────────

export interface FeatureFlags {
  director_brief: boolean;
  capture_contract: boolean;
  motion_amplification: boolean;
  escalation_logic: boolean;
  hook_scoring_required: boolean;
  text_overlay_default: boolean;
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
  /** Fix #1: Word budget */
  prompt_max_words: number;
  
  /** Clean compiler branch: "viral" | "cinematic" */
  compiler: "viral" | "cinematic";
  /** Alias kept for backward compat */
  prompt_mode: "viral" | "cinematic";
  
  // Moderation
  moderation_level: ModerationLevel;
  require_disclaimer: boolean;
  disclaimer_text?: string;
  
  /** Fix #3: Resolved hook categories (template ∩ vertical allowed) */
  allowed_hook_categories: HookCategory[];
  
  /** Grouped feature flags for easy branching */
  features: FeatureFlags;
  
  // Legacy flat flags (kept for backward compat, derived from features)
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
  /** Fix #2: The effective intensity after vertical clamping */
  effective_intensity: EmotionalIntensity;
}

// ─── Intensity Rank ─────────────────────────────────────────

const INTENSITY_RANK: Record<EmotionalIntensity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  extreme: 3,
};

const RANK_TO_INTENSITY: EmotionalIntensity[] = ["low", "medium", "high", "extreme"];

/** Fix #2: Clamp intensity to vertical max */
function clampIntensity(
  requested: EmotionalIntensity | undefined,
  verticalMax: EmotionalIntensity
): EmotionalIntensity {
  if (!requested) return verticalMax; // Default to vertical max
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

export function selectStoryType(request: StoryTypeRequest): { type: StoryType; reason: string } {
  const { vertical, goal, emotional_intensity, recent_story_types, forced_type } = request;
  const profile = getVerticalProfile(vertical);
  
  // Fix #2: Clamp intensity before filtering
  const effectiveIntensity = clampIntensity(emotional_intensity, profile.max_emotional_intensity);
  
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
  
  // Filter by effective intensity (clamped)
  let filtered = allowed;
  const requestedRank = INTENSITY_RANK[effectiveIntensity];
  filtered = allowed.filter(t => {
    const template = STORY_TEMPLATES[t];
    const minRank = INTENSITY_RANK[template.intensity_range[0]];
    const maxRank = INTENSITY_RANK[template.intensity_range[1]];
    return requestedRank >= minRank && requestedRank <= maxRank;
  });
  if (filtered.length === 0) filtered = allowed; // Fallback
  
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
    reason: `goal=${goal} vertical=${vertical} intensity=${effectiveIntensity}(requested=${emotional_intensity || "any"}) candidates=[${allowed.join(",")}] selected=${selected}`,
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
  
  // Fix #5: Allowed tones with fallback to ["neutral"]
  let allowed_tones = profile.preferred_tones.filter(
    t => !profile.banned_tones.includes(t)
  );
  if (allowed_tones.length === 0) {
    allowed_tones = ["neutral"];
  }
  
  // Fix #3: Compute allowed hook categories = template defaults minus vertical bans
  const allowed_hook_categories = template.default_hook_categories.filter(
    (hc) => !profile.banned_hook_categories.includes(hc)
  );
  
  // Fix #4: For strict moderation verticals, disable ALL cinematic add-ons
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
    prompt_mode: compiler, // backward compat alias
    
    moderation_level: profile.moderation,
    require_disclaimer: profile.claim_rules.require_disclaimer,
    disclaimer_text: profile.claim_rules.disclaimer_text,
    
    allowed_hook_categories,
    
    features,
    
    // Legacy flat flags (derived from features)
    hook_scoring_required: features.hook_scoring_required,
    director_brief: features.director_brief,
    escalation_logic: features.escalation_logic,
    capture_contract: features.capture_contract,
    motion_amplification: features.motion_amplification,
    text_overlay_default: features.text_overlay_default,
    
    allowed_tones,
    visual_style: profile.visual_style,
    
    selection_reason: selectionReason,
    effective_intensity: effectiveIntensity || clampIntensity(undefined, profile.max_emotional_intensity),
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
      beat_role?: string; // Fix #6: Optional beat binding for per-beat validation
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
  
  // ── Fix #6: Per-scene beat-level duration validation ──
  for (const scene of scenes) {
    const dur = scene.duration_target || 5;
    
    // If scene has a beat_role binding, validate against that beat's range
    if (scene.beat_role) {
      const matchedBeat = template.beats.find(b => b.role === scene.beat_role);
      if (matchedBeat) {
        if (dur < matchedBeat.duration_range[0]) {
          warnings.push(
            `Scene ${scene.sequence_index} (${scene.beat_role}): ${dur}s below beat min ${matchedBeat.duration_range[0]}s`
          );
        }
        if (dur > matchedBeat.duration_range[1]) {
          warnings.push(
            `Scene ${scene.sequence_index} (${scene.beat_role}): ${dur}s exceeds beat max ${matchedBeat.duration_range[1]}s`
          );
        }
      }
    } else if (scene.sequence_index < template.beats.length) {
      // Fallback: match by position
      const positionalBeat = template.beats[scene.sequence_index];
      if (dur > positionalBeat.duration_range[1]) {
        warnings.push(
          `Scene ${scene.sequence_index} (inferred ${positionalBeat.role}): ${dur}s exceeds beat max ${positionalBeat.duration_range[1]}s`
        );
      }
      if (dur < positionalBeat.duration_range[0]) {
        warnings.push(
          `Scene ${scene.sequence_index} (inferred ${positionalBeat.role}): ${dur}s below beat min ${positionalBeat.duration_range[0]}s`
        );
      }
    }
  }
  
  // ── Prompt length (chars + words) ──
  for (const scene of scenes) {
    if (!scene.prompt) continue;
    
    if (scene.prompt.length > constraints.prompt_char_limit) {
      warnings.push(
        `Scene ${scene.sequence_index}: prompt ${scene.prompt.length} chars > limit ${constraints.prompt_char_limit}`
      );
    }
    
    // Fix #1: Word count check
    const wordCount = scene.prompt.split(/\s+/).filter(Boolean).length;
    if (wordCount > constraints.prompt_max_words) {
      warnings.push(
        `Scene ${scene.sequence_index}: prompt ${wordCount} words > limit ${constraints.prompt_max_words}`
      );
    }
  }
  
  // ── Hook presence (for types requiring hook scoring) ──
  if (constraints.features.hook_scoring_required) {
    const hookBeat = template.beats.find(b => b.is_hook);
    if (hookBeat && scenes.length > 0) {
      const firstScene = scenes[0];
      if (!firstScene.prompt || firstScene.prompt.length < 10) {
        warnings.push("Hook scene has insufficient prompt content");
      }
    }
  }
  
  // ── Fix #8: Cheap heuristic warnings (not real moderation) ──
  // Real moderation happens at prompt compile time via the moderation ladder.
  // These are structural sanity checks only.
  if (vertical_profile.moderation === "strict") {
    for (const scene of scenes) {
      if (!scene.prompt) continue;
      const lower = scene.prompt.toLowerCase();
      if (lower.includes("guarantee") && !vertical_profile.claim_rules.allow_guarantees) {
        warnings.push(`Scene ${scene.sequence_index}: heuristic: contains "guarantee" in strict vertical`);
      }
      if (lower.includes("cure") && !vertical_profile.claim_rules.allow_health_claims) {
        warnings.push(`Scene ${scene.sequence_index}: heuristic: contains "cure" in strict vertical`);
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
  const profile = getVerticalProfile(request.vertical);
  const effectiveIntensity = clampIntensity(request.emotional_intensity, profile.max_emotional_intensity);
  const selection = selectStoryType(request);
  const constraints = mergeConstraints(selection.type, request.vertical, selection.reason, effectiveIntensity);
  
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
      beat_role?: string;
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
