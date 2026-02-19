/**
 * Story Types v1.0
 * 
 * Performance-driven story formats, independent of vertical.
 * Vertical determines guardrails; story type determines structure.
 * 
 * 8 standardized types covering the full content spectrum:
 * - viral_hook: scroll-stopping, 3-4 clips, hook-first
 * - pas: problem-agitate-solution, conversion-focused
 * - authority: credibility-building, controlled tone
 * - listicle: retention farming, fast pacing
 * - micro_story: emotional narrative, in media res
 * - before_after: transformation reveal
 * - trend_hijack: cultural moment capture
 * - myth: cinematic/symbolic brand building (existing engine)
 */

// ─── Story Type Enum ────────────────────────────────────────

export type StoryType =
  | "viral_hook"
  | "pas"
  | "authority"
  | "listicle"
  | "micro_story"
  | "before_after"
  | "trend_hijack"
  | "myth";

// ─── Content Goal ───────────────────────────────────────────

export type ContentGoal = "reach" | "sell" | "authority" | "brand" | "retain";

// ─── Emotional Intensity ────────────────────────────────────

export type EmotionalIntensity = "low" | "medium" | "high" | "extreme";

// ─── Scene Beat Definition ──────────────────────────────────

export interface SceneBeat {
  role: string;              // e.g. "hook", "agitate", "solution", "cta"
  description: string;       // Human-readable purpose
  duration_range: [number, number]; // [min_seconds, max_seconds]
  is_hook: boolean;          // Whether this beat IS the hook
  requires_text_overlay: boolean;
  camera_suggestion?: string; // e.g. "close-up", "wide", "pov"
}

// ─── Story Template ─────────────────────────────────────────

export interface StoryTemplate {
  type: StoryType;
  name: string;
  description: string;
  
  // Structure constraints
  beats: SceneBeat[];
  min_clips: number;
  max_clips: number;
  total_duration_range: [number, number]; // [min, max] seconds
  
  // Prompt compilation mode
  prompt_mode: "viral" | "cinematic";
  prompt_char_limit: number;
  
  // Feature flags
  hook_scoring_required: boolean;
  director_brief: boolean;
  escalation_logic: boolean;
  capture_contract: boolean;
  motion_amplification: boolean;
  text_overlay_default: boolean;
  
  // Preferred goals (for selector weighting)
  preferred_goals: ContentGoal[];
  
  // Emotional range
  intensity_range: [EmotionalIntensity, EmotionalIntensity]; // [min, max]
}

// ─── Template Definitions ───────────────────────────────────

export const STORY_TEMPLATES: Record<StoryType, StoryTemplate> = {
  
  // ── 1. Viral Hook ──────────────────────────────────────
  viral_hook: {
    type: "viral_hook",
    name: "Viral Hook",
    description: "Scroll-stopping, hook-first, fast payoff. Maximum algorithmic reach.",
    beats: [
      { role: "hook", description: "Interrupt scroll with shock/curiosity/novelty", duration_range: [2, 3], is_hook: true, requires_text_overlay: true, camera_suggestion: "close-up" },
      { role: "payoff", description: "Immediate value delivery or reveal", duration_range: [3, 5], is_hook: false, requires_text_overlay: true, camera_suggestion: "medium" },
      { role: "escalate", description: "Heightened value or surprise twist", duration_range: [3, 5], is_hook: false, requires_text_overlay: false, camera_suggestion: "dynamic" },
      { role: "cta", description: "Quick call to action or loop point", duration_range: [2, 3], is_hook: false, requires_text_overlay: true, camera_suggestion: "close-up" },
    ],
    min_clips: 3,
    max_clips: 4,
    total_duration_range: [10, 16],
    prompt_mode: "viral",
    prompt_char_limit: 300,
    hook_scoring_required: true,
    director_brief: false,
    escalation_logic: false,
    capture_contract: false,
    motion_amplification: false,
    text_overlay_default: true,
    preferred_goals: ["reach", "retain"],
    intensity_range: ["medium", "extreme"],
  },

  // ── 2. Problem-Agitate-Solution ────────────────────────
  pas: {
    type: "pas",
    name: "Problem → Agitate → Solution",
    description: "Classic direct response. Identify pain, amplify it, present product as solution.",
    beats: [
      { role: "hook_pain", description: "Name the pain point immediately", duration_range: [2, 3], is_hook: true, requires_text_overlay: true, camera_suggestion: "close-up" },
      { role: "agitate", description: "Show consequence of NOT solving the problem", duration_range: [3, 5], is_hook: false, requires_text_overlay: true, camera_suggestion: "medium" },
      { role: "solution", description: "Introduce product/service as the fix", duration_range: [3, 5], is_hook: false, requires_text_overlay: true, camera_suggestion: "product-focus" },
      { role: "proof_cta", description: "Social proof or outcome + CTA", duration_range: [3, 4], is_hook: false, requires_text_overlay: true, camera_suggestion: "close-up" },
    ],
    min_clips: 3,
    max_clips: 4,
    total_duration_range: [11, 17],
    prompt_mode: "viral",
    prompt_char_limit: 300,
    hook_scoring_required: true,
    director_brief: false,
    escalation_logic: false,
    capture_contract: false,
    motion_amplification: false,
    text_overlay_default: true,
    preferred_goals: ["sell"],
    intensity_range: ["medium", "high"],
  },

  // ── 3. Authority Breakdown ─────────────────────────────
  authority: {
    type: "authority",
    name: "Authority Breakdown",
    description: "Establish credibility with a contrarian take, evidence, and practical value.",
    beats: [
      { role: "contrarian_hook", description: "Challenge a common belief or misconception", duration_range: [2, 4], is_hook: true, requires_text_overlay: true, camera_suggestion: "medium" },
      { role: "evidence", description: "Present data, logic, or expert reasoning", duration_range: [4, 6], is_hook: false, requires_text_overlay: true, camera_suggestion: "medium" },
      { role: "takeaway", description: "Actionable insight the viewer can use", duration_range: [3, 5], is_hook: false, requires_text_overlay: true, camera_suggestion: "close-up" },
      { role: "credibility_cta", description: "Reinforce authority + follow CTA", duration_range: [2, 3], is_hook: false, requires_text_overlay: true, camera_suggestion: "close-up" },
    ],
    min_clips: 3,
    max_clips: 4,
    total_duration_range: [11, 18],
    prompt_mode: "viral",
    prompt_char_limit: 350,
    hook_scoring_required: true,
    director_brief: false,
    escalation_logic: false,
    capture_contract: false,
    motion_amplification: false,
    text_overlay_default: true,
    preferred_goals: ["authority", "reach"],
    intensity_range: ["low", "medium"],
  },

  // ── 4. Listicle ────────────────────────────────────────
  listicle: {
    type: "listicle",
    name: "Listicle",
    description: "Retention farming. Fast-paced numbered items with curiosity hook.",
    beats: [
      { role: "curiosity_hook", description: "'3 things you didn't know...' or '5 mistakes...'", duration_range: [2, 3], is_hook: true, requires_text_overlay: true, camera_suggestion: "close-up" },
      { role: "item_1", description: "First list item - strongest or most surprising", duration_range: [3, 5], is_hook: false, requires_text_overlay: true, camera_suggestion: "medium" },
      { role: "item_2", description: "Second list item", duration_range: [3, 5], is_hook: false, requires_text_overlay: true, camera_suggestion: "dynamic" },
      { role: "item_3_cta", description: "Third item + CTA or 'follow for more'", duration_range: [3, 5], is_hook: false, requires_text_overlay: true, camera_suggestion: "close-up" },
    ],
    min_clips: 3,
    max_clips: 4,
    total_duration_range: [11, 18],
    prompt_mode: "viral",
    prompt_char_limit: 250,
    hook_scoring_required: true,
    director_brief: false,
    escalation_logic: false,
    capture_contract: false,
    motion_amplification: false,
    text_overlay_default: true,
    preferred_goals: ["reach", "retain"],
    intensity_range: ["low", "high"],
  },

  // ── 5. Micro-Story ─────────────────────────────────────
  micro_story: {
    type: "micro_story",
    name: "Micro-Story",
    description: "Emotional mini-narrative. In media res hook, conflict, resolution.",
    beats: [
      { role: "in_media_res", description: "Drop viewer into the middle of action/emotion", duration_range: [2, 4], is_hook: true, requires_text_overlay: false, camera_suggestion: "close-up" },
      { role: "conflict", description: "Present the challenge or struggle", duration_range: [4, 6], is_hook: false, requires_text_overlay: false, camera_suggestion: "medium" },
      { role: "turning_point", description: "Moment of change or realization", duration_range: [3, 5], is_hook: false, requires_text_overlay: false, camera_suggestion: "dynamic" },
      { role: "resolution", description: "Emotional payoff or insight", duration_range: [3, 4], is_hook: false, requires_text_overlay: true, camera_suggestion: "close-up" },
    ],
    min_clips: 3,
    max_clips: 4,
    total_duration_range: [12, 19],
    prompt_mode: "viral",
    prompt_char_limit: 350,
    hook_scoring_required: false,
    director_brief: false,
    escalation_logic: false,
    capture_contract: false,
    motion_amplification: false,
    text_overlay_default: false,
    preferred_goals: ["reach", "brand"],
    intensity_range: ["medium", "extreme"],
  },

  // ── 6. Before / After ─────────────────────────────────
  before_after: {
    type: "before_after",
    name: "Before / After",
    description: "Transformation reveal. Shock contrast between before and after states.",
    beats: [
      { role: "shock_hook", description: "Show the 'after' result first or tease transformation", duration_range: [2, 3], is_hook: true, requires_text_overlay: true, camera_suggestion: "close-up" },
      { role: "before", description: "The problem state - relatable, painful", duration_range: [3, 5], is_hook: false, requires_text_overlay: true, camera_suggestion: "medium" },
      { role: "after_reveal", description: "The transformed result - satisfying", duration_range: [3, 5], is_hook: false, requires_text_overlay: true, camera_suggestion: "dynamic" },
      { role: "how_cta", description: "Brief method hint + CTA", duration_range: [2, 4], is_hook: false, requires_text_overlay: true, camera_suggestion: "close-up" },
    ],
    min_clips: 3,
    max_clips: 4,
    total_duration_range: [10, 17],
    prompt_mode: "viral",
    prompt_char_limit: 300,
    hook_scoring_required: true,
    director_brief: false,
    escalation_logic: false,
    capture_contract: false,
    motion_amplification: false,
    text_overlay_default: true,
    preferred_goals: ["sell", "reach"],
    intensity_range: ["medium", "high"],
  },

  // ── 7. Trend Hijack ───────────────────────────────────
  trend_hijack: {
    type: "trend_hijack",
    name: "Trend Hijack",
    description: "Ride a cultural moment. Fast turnaround, pattern-interrupt format.",
    beats: [
      { role: "trend_hook", description: "Reference the trend immediately - recognition trigger", duration_range: [2, 3], is_hook: true, requires_text_overlay: true, camera_suggestion: "close-up" },
      { role: "twist", description: "Apply your angle/vertical's perspective to the trend", duration_range: [3, 5], is_hook: false, requires_text_overlay: true, camera_suggestion: "medium" },
      { role: "value_cta", description: "Deliver value + CTA while trend is still hot", duration_range: [3, 4], is_hook: false, requires_text_overlay: true, camera_suggestion: "close-up" },
    ],
    min_clips: 3,
    max_clips: 3,
    total_duration_range: [8, 12],
    prompt_mode: "viral",
    prompt_char_limit: 250,
    hook_scoring_required: false,
    director_brief: false,
    escalation_logic: false,
    capture_contract: false,
    motion_amplification: false,
    text_overlay_default: true,
    preferred_goals: ["reach"],
    intensity_range: ["medium", "high"],
  },

  // ── 8. Myth Mode (Cinematic) ──────────────────────────
  myth: {
    type: "myth",
    name: "Myth / Cinematic",
    description: "Symbolic, brand-building, high-polish. Uses full cinematic engine.",
    beats: [
      { role: "symbolic_hook", description: "Mythic image or archetype introduction", duration_range: [3, 5], is_hook: true, requires_text_overlay: false, camera_suggestion: "wide" },
      { role: "tension", description: "Archetype conflict or challenge", duration_range: [5, 8], is_hook: false, requires_text_overlay: false, camera_suggestion: "dynamic" },
      { role: "escalation", description: "Rising stakes, force amplification", duration_range: [5, 8], is_hook: false, requires_text_overlay: false, camera_suggestion: "tracking" },
      { role: "climax", description: "Peak action or revelation", duration_range: [5, 8], is_hook: false, requires_text_overlay: false, camera_suggestion: "dramatic" },
      { role: "resolution", description: "Mythic resolution or transformation", duration_range: [4, 6], is_hook: false, requires_text_overlay: false, camera_suggestion: "wide" },
    ],
    min_clips: 4,
    max_clips: 6,
    total_duration_range: [22, 35],
    prompt_mode: "cinematic",
    prompt_char_limit: 1000,
    hook_scoring_required: false,
    director_brief: true,
    escalation_logic: true,
    capture_contract: true,
    motion_amplification: true,
    text_overlay_default: false,
    preferred_goals: ["brand"],
    intensity_range: ["high", "extreme"],
  },
};

// ─── Helper: Get template by type ───────────────────────────

export function getStoryTemplate(type: StoryType): StoryTemplate {
  return STORY_TEMPLATES[type];
}

// ─── Helper: Is this a viral-mode story type? ───────────────

export function isViralMode(type: StoryType): boolean {
  return STORY_TEMPLATES[type].prompt_mode === "viral";
}

// ─── Helper: Is this a cinematic-mode story type? ───────────

export function isCinematicMode(type: StoryType): boolean {
  return STORY_TEMPLATES[type].prompt_mode === "cinematic";
}

// ─── Helper: Get all viral story types ──────────────────────

export function getViralStoryTypes(): StoryType[] {
  return Object.keys(STORY_TEMPLATES).filter(
    (k) => STORY_TEMPLATES[k as StoryType].prompt_mode === "viral"
  ) as StoryType[];
}
