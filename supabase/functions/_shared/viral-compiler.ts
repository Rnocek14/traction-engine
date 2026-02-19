/**
 * Viral Prompt Compiler v1.2
 * 
 * Stripped-down prompt compiler for viral story types.
 * NO director briefs, NO escalation deltas, NO capture contracts.
 * 
 * Output: 150-300 character prompts focused on:
 * - Subject (who/what)
 * - Action (what happens)
 * - Style anchor (visual feel)
 * - Platform format (aspect ratio, aesthetic)
 * 
 * v1.2 fix:
 * - Fix #5: Removed structural labels ("Setting:", "lighting.")
 *   Prompts now flow as natural prose: "in a bright kitchen, lit with warm light"
 * - Shortened style anchor ("9:16 vertical" instead of "Vertical 9:16")
 */

import type { MergedConstraints } from "./story-type-router.ts";
import type { SceneBeat, Pacing } from "./story-types.ts";
import { sanitizePromptText } from "./prompt-compliance.ts";

// ─── Scene Input ────────────────────────────────────────────

export interface ViralSceneInput {
  scene_id: string;
  /** 0-based beat index */
  beat_index: number;
  beat: SceneBeat;           // From story template
  subject: string;           // "A person holding a supplement bottle"
  action: string;            // "turns to camera with surprised expression"
  environment?: string;      // "modern kitchen, morning light"
  text_overlay?: string;     // "You won't believe this..."
  mood?: string;             // "energetic", "shocking", "calm"
  hook_category?: string;    // Assigned hook category for hook beats
}

// ─── Compiled Output ────────────────────────────────────────

export interface ViralPromptOutput {
  scene_id: string;
  beat_index: number;
  prompt: string;
  char_count: number;
  word_count: number;
  was_truncated: boolean;
  truncation_method?: "words" | "chars";
  beat_role: string;
  camera_suggestion: string;
  duration_target: number;
  text_overlay?: string;
  hook_category?: string;
  /** Compliance replacements applied */
  compliance_replacements?: string[];
  /** Whether compliance modified the prompt */
  compliance_modified?: boolean;
}

// ─── Style Anchors (keyed by Pacing enum) ───────────────────

const STYLE_ANCHORS: Record<Pacing, string> = {
  fast: "9:16 vertical. Energetic, handheld phone aesthetic, punchy and scroll-stopping.",
  moderate: "9:16 vertical. Natural pacing, clean framing, engaging and authentic.",
  slow: "9:16 vertical. Deliberate pacing, steady camera, thoughtful and composed.",
};

// ─── Camera Direction Map ───────────────────────────────────

const CAMERA_MAP: Record<string, string> = {
  "close-up": "Tight close-up",
  "medium": "Medium shot, waist-up",
  "wide": "Wide establishing shot",
  "dynamic": "Dynamic push-in",
  "pov": "First-person POV",
  "product-focus": "Product hero shot, shallow depth of field",
  "tracking": "Smooth tracking shot",
  "dramatic": "Low angle dramatic framing",
};

// ─── Story-Type Camera Lead Patterns ────────────────────────
// Per-type "first words" that front-load the right framing for each format.
// Falls back to beat.camera_suggestion if no override exists.

import type { StoryType } from "./story-types.ts";

const STORY_TYPE_CAMERA_LEADS: Partial<Record<StoryType, Record<string, string>>> = {
  authority:     { contrarian_hook: "Static medium shot:", evidence: "Medium shot, waist-up:", takeaway: "Tight close-up:", credibility_cta: "Tight close-up:" },
  pas:           { hook_pain: "Tight close-up:", agitate: "Medium shot:", solution: "Product hero shot:", proof_cta: "Tight close-up:" },
  listicle:      { curiosity_hook: "Quick cuts montage:", item_1: "Medium shot:", item_2: "Dynamic push-in:", item_3_cta: "Tight close-up:" },
  trend_hijack:  { trend_hook: "Handheld phone POV:", twist: "Medium shot:", value_cta: "Tight close-up:" },
  viral_hook:    { hook: "Dynamic push-in:", payoff: "Medium shot:", escalate: "Dynamic push-in:", cta: "Tight close-up:" },
  micro_story:   { in_media_res: "Tight close-up:", conflict: "Medium shot:", turning_point: "Dynamic push-in:", resolution: "Tight close-up:" },
  before_after:  { shock_hook: "Tight close-up:", before: "Medium shot:", after_reveal: "Dynamic push-in:", how_cta: "Tight close-up:" },
  myth:          { symbolic_hook: "Slow tracking shot:", tension: "Dynamic push-in:", escalation: "Smooth tracking shot:", climax: "Low angle dramatic framing:", resolution: "Wide establishing shot:" },
};

// ═══════════════════════════════════════════════════════════
// TRUNCATION
// ═══════════════════════════════════════════════════════════

function truncatePrompt(
  prompt: string,
  maxWords: number,
  maxChars: number
): { text: string; wasTruncated: boolean; method?: "words" | "chars" } {
  let text = prompt;
  let wasTruncated = false;
  let method: "words" | "chars" | undefined;
  
  // Step 1: Truncate by word count
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > maxWords) {
    text = words.slice(0, maxWords).join(" ");
    const lastPeriod = text.lastIndexOf(".");
    if (lastPeriod > text.length * 0.5) {
      text = text.slice(0, lastPeriod + 1);
    } else {
      text += ".";
    }
    wasTruncated = true;
    method = "words";
  }
  
  // Step 2: Truncate by char count (safety net)
  if (text.length > maxChars) {
    const truncated = text.slice(0, maxChars - 3);
    const lastPeriod = truncated.lastIndexOf(".");
    if (lastPeriod > maxChars * 0.5) {
      text = truncated.slice(0, lastPeriod + 1);
    } else {
      text = truncated + "...";
    }
    wasTruncated = true;
    method = method || "chars";
  }
  
  return { text, wasTruncated, method };
}

// ═══════════════════════════════════════════════════════════
// BEAT-AWARE PROMPT SHAPING
// ═══════════════════════════════════════════════════════════

/**
 * Beat-role-specific word/char budgets and style hints.
 * Hook beats: shorter, punchier (12–18 words target).
 * CTA beats: loop-friendly phrasing.
 * Payoff/evidence: allow a second sentence for clarity.
 */
interface BeatBudget {
  wordMultiplier: number;   // Multiplier on base word limit
  charMultiplier: number;   // Multiplier on base char limit
  styleHint?: string;       // Appended to style anchor for this beat
}

function getBeatBudget(role: string, isHook: boolean): BeatBudget {
  if (isHook) {
    return { wordMultiplier: 0.6, charMultiplier: 0.6, styleHint: "Punchy, immediate, one sentence." };
  }
  if (role.includes("cta") || role === "proof_cta" || role === "value_cta" || role === "how_cta" || role === "credibility_cta" || role === "item_3_cta") {
    return { wordMultiplier: 0.7, charMultiplier: 0.7, styleHint: "Loop-friendly, invites rewatch." };
  }
  if (role === "payoff" || role === "evidence" || role === "solution" || role === "after_reveal" || role === "takeaway") {
    return { wordMultiplier: 1.0, charMultiplier: 1.0 }; // Full budget, allows 2 sentences
  }
  return { wordMultiplier: 0.85, charMultiplier: 0.85 }; // Default: slightly tighter
}

// ═══════════════════════════════════════════════════════════
// COMPILER
// ═══════════════════════════════════════════════════════════

/**
 * Compile a single viral scene prompt.
 * Beat-aware shaping: hooks are shorter/punchier, CTAs are loop-friendly.
 * Compliance pass: sanitizes banned phrases for strict verticals.
 */
export function compileViralPrompt(
  scene: ViralSceneInput,
  constraints: MergedConstraints
): ViralPromptOutput {
  const { visual_style } = constraints;
  const baseCharLimit = constraints.prompt_char_limit;
  const baseWordLimit = constraints.prompt_max_words;
  
  // Beat-aware budgets
  const budget = getBeatBudget(scene.beat.role, scene.beat.is_hook);
  const charLimit = Math.round(baseCharLimit * budget.charMultiplier);
  const wordLimit = Math.round(baseWordLimit * budget.wordMultiplier);
  
  // Style anchor
  let styleAnchor = STYLE_ANCHORS[visual_style.pacing] || STYLE_ANCHORS.fast;
  if (budget.styleHint) {
    styleAnchor = `${budget.styleHint} ${styleAnchor}`;
  }
  
  // Camera direction
  const camera = scene.beat.camera_suggestion || "medium";
  const cameraDir = CAMERA_MAP[camera] || camera;
  
  // Duration target (midpoint of beat range)
  const duration = Math.round(
    (scene.beat.duration_range[0] + scene.beat.duration_range[1]) / 2
  );
  
  // Build as flowing prose — camera + subject + action in first ~12 words
  // Prompt order: Camera → Subject + Action → Environment → Lighting → Mood → Style anchor (last)
  // Hook beats: single punchy sentence, no style anchor.
  const parts: string[] = [];
  
  // Camera lead: use story-type-specific lead if available, else generic
  const storyType = constraints.story_type;
  const typeLeads = STORY_TYPE_CAMERA_LEADS[storyType];
  const beatLead = typeLeads?.[scene.beat.role];
  const cameraLead = beatLead || `${cameraDir}:`;
  
  // Front-load camera + subject + action as a single sentence (first ~12 words)
  let coreSentence = `${cameraLead} ${scene.subject} ${scene.action}`;
  
  // Hook beats: stop here. Single sentence, no environment/lighting/style bloat.
  if (scene.beat.is_hook) {
    coreSentence += ".";
    parts.push(coreSentence);
  } else {
    // Non-hook: append environment, lighting, mood after core action
    if (scene.environment) {
      coreSentence += `, in a ${scene.environment}`;
    }
    if (visual_style.lighting) {
      coreSentence += `, lit with ${visual_style.lighting} light`;
    }
    if (scene.mood) {
      coreSentence += `, ${scene.mood} mood`;
    }
    coreSentence += ".";
    parts.push(coreSentence);
    
    // Style anchor at the end (lowest priority tokens)
    parts.push(styleAnchor);
  }
  
  let prompt = parts.join(" ").replace(/\s+/g, " ").trim();
  
  // Compliance pass: sanitize banned phrases for the vertical
  const compliance = sanitizePromptText(prompt, constraints.vertical);
  prompt = compliance.text;
  
  // Truncate (words first, then chars)
  const { text, wasTruncated, method } = truncatePrompt(prompt, wordLimit, charLimit);
  prompt = text;
  
  return {
    scene_id: scene.scene_id,
    beat_index: scene.beat_index,
    prompt,
    char_count: prompt.length,
    word_count: prompt.split(/\s+/).filter(Boolean).length,
    was_truncated: wasTruncated,
    truncation_method: method,
    beat_role: scene.beat.role,
    camera_suggestion: camera,
    duration_target: duration,
    text_overlay: scene.text_overlay,
    hook_category: scene.hook_category,
    compliance_replacements: compliance.replacements.length > 0 ? compliance.replacements : undefined,
    compliance_modified: compliance.was_modified || undefined,
  };
}

/**
 * Compile all scenes for a viral story.
 */
export function compileViralStory(
  scenes: ViralSceneInput[],
  constraints: MergedConstraints
): {
  prompts: ViralPromptOutput[];
  total_chars: number;
  total_duration: number;
  stats: {
    avg_chars: number;
    avg_words: number;
    truncated_count: number;
    beat_roles: string[];
  };
} {
  const prompts = scenes.map(s => compileViralPrompt(s, constraints));
  
  const total_chars = prompts.reduce((sum, p) => sum + p.char_count, 0);
  const total_words = prompts.reduce((sum, p) => sum + p.word_count, 0);
  const total_duration = prompts.reduce((sum, p) => sum + p.duration_target, 0);
  const truncated_count = prompts.filter(p => p.was_truncated).length;
  
  return {
    prompts,
    total_chars,
    total_duration,
    stats: {
      avg_chars: Math.round(total_chars / prompts.length),
      avg_words: Math.round(total_words / prompts.length),
      truncated_count,
      beat_roles: prompts.map(p => p.beat_role),
    },
  };
}

/**
 * Quick-compile: generate a simple viral prompt from raw inputs.
 */
export function quickViralPrompt(
  subject: string,
  action: string,
  options?: {
    camera?: string;
    environment?: string;
    mood?: string;
    max_chars?: number;
    max_words?: number;
  }
): string {
  const camera = CAMERA_MAP[options?.camera || "medium"] || "Medium shot";
  const env = options?.environment ? `, in a ${options.environment}` : "";
  const mood = options?.mood ? `, ${options.mood} mood` : "";
  const maxChars = options?.max_chars || 300;
  const maxWords = options?.max_words || 50;
  
  let prompt = `${camera}. ${subject} ${action}${env}${mood}. 9:16 vertical. Energetic, handheld phone aesthetic.`;
  prompt = prompt.replace(/\s+/g, " ").trim();
  
  const { text } = truncatePrompt(prompt, maxWords, maxChars);
  return text;
}
