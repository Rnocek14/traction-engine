/**
 * Platform Optimizer v1.0 (P3)
 * 
 * Enforces short-form platform best practices:
 *   1. Format Templates — deterministic content structures
 *   2. Pacing Rules — duration constraints per zone
 *   3. Text Overlay Strategy — per-scene overlay guidance
 *   4. Retention Structure — micro-payoff enforcement
 *   5. Visual Instruction Enhancement — specific vs. generic scene prompts
 */

// ─── Format Templates ──────────────────────────────────────

export type ContentFormat =
  | "stop_doing_this"
  | "listicle"
  | "before_after"
  | "hidden_trick"
  | "problem_solution"
  | "comparison"
  | "pov"
  | "default";

export interface FormatTemplate {
  id: ContentFormat;
  name: string;
  /** Optimal hook categories for this format */
  preferred_hooks: string[];
  /** Pacing profile */
  pacing: "aggressive" | "medium" | "breathe";
  /** Narration style hint injected into GPT prompt */
  narration_style: string;
  /** Text overlay style */
  overlay_style: "bold_statement" | "numbered" | "question" | "minimal";
  /** Detection patterns in title/concept */
  detect_patterns: RegExp[];
}

export const FORMAT_TEMPLATES: Record<ContentFormat, FormatTemplate> = {
  stop_doing_this: {
    id: "stop_doing_this",
    name: "Stop Doing This",
    preferred_hooks: ["shock", "fear"],
    pacing: "aggressive",
    narration_style: "Confrontational, direct. Open with a mistake the viewer is making. Each beat reveals why it's wrong and what to do instead. Short punchy sentences.",
    overlay_style: "bold_statement",
    detect_patterns: [
      /\bstop\s+(doing|putting|using|making|saying)\b/i,
      /\bmistakes?\b.*\b(ruin|kill|destroy|hurt)\b/i,
      /\bwrong\b.*\b(way|method|approach)\b/i,
      /\bnever\s+(do|say|put|use)\b/i,
    ],
  },
  listicle: {
    id: "listicle",
    name: "Listicle",
    preferred_hooks: ["curiosity", "promise"],
    pacing: "medium",
    narration_style: "Numbered delivery. Each item gets its own beat with a clear transition. Use 'First...', 'Next...', 'Finally...' pacing. Each point must be independently valuable.",
    overlay_style: "numbered",
    detect_patterns: [
      /\b\d+\s+(tips?|hacks?|tricks?|ways?|things?|steps?|signs?|mistakes?|secrets?|facts?|rules?|lessons?|ideas?|strategies?|methods?|tools?|habits?|examples?)\b/i,
      /\btop\s+\d+\b/i,
    ],
  },
  before_after: {
    id: "before_after",
    name: "Before / After",
    preferred_hooks: ["novelty", "promise"],
    pacing: "medium",
    narration_style: "Contrast-driven. Show the 'before' state (pain/problem), then the transformation. Use 'Instead of X, do Y' framing. Visual contrast is key.",
    overlay_style: "bold_statement",
    detect_patterns: [
      /\bbefore\s*(and|\/|vs\.?|→)\s*after\b/i,
      /\btransform(ation|ed|ing)?\b/i,
      /\bglow.?up\b/i,
      /\binstead of\b/i,
    ],
  },
  hidden_trick: {
    id: "hidden_trick",
    name: "Hidden Trick",
    preferred_hooks: ["curiosity", "novelty"],
    pacing: "aggressive",
    narration_style: "Conspiratorial, insider knowledge tone. Build intrigue, then deliver the reveal. Use 'Most people don't know...' or 'The trick is...' framing.",
    overlay_style: "bold_statement",
    detect_patterns: [
      /\b(hidden|secret|unknown|overlooked)\s+(trick|hack|feature|method|technique)\b/i,
      /\bnobody\s+(knows?|tells?|talks?)\b/i,
      /\bmost people don't\b/i,
    ],
  },
  problem_solution: {
    id: "problem_solution",
    name: "Problem → Solution",
    preferred_hooks: ["fear", "shock"],
    pacing: "medium",
    narration_style: "Empathetic opening that names the pain, then a clear pivot to the solution. Use 'Here's the fix' or 'Try this instead' transitions.",
    overlay_style: "bold_statement",
    detect_patterns: [
      /\b(fix|solve|solution|stop|eliminate|get rid of)\b/i,
      /\b(problem|issue|struggle|pain|frustrat)\b/i,
      /\bthis is why\b/i,
    ],
  },
  comparison: {
    id: "comparison",
    name: "Comparison",
    preferred_hooks: ["novelty", "authority"],
    pacing: "medium",
    narration_style: "Side-by-side evaluation tone. Be opinionated — pick a winner. Use 'A does X, but B does Y' structure.",
    overlay_style: "bold_statement",
    detect_patterns: [
      /\bvs\.?\b/i,
      /\bcompare|comparison|better\s+than|worse\s+than\b/i,
      /\bwhich\s+(is|one)\s+better\b/i,
    ],
  },
  pov: {
    id: "pov",
    name: "POV",
    preferred_hooks: ["social_proof", "fear"],
    pacing: "aggressive",
    narration_style: "First-person perspective. Immersive, story-driven. Use 'POV: you just...' framing. Quick cuts, relatable moments.",
    overlay_style: "minimal",
    detect_patterns: [
      /\bpov\b/i,
      /\bwhen you\b.*\b(realize|discover|find out)\b/i,
    ],
  },
  default: {
    id: "default",
    name: "Standard",
    preferred_hooks: ["curiosity", "promise"],
    pacing: "medium",
    narration_style: "Clear, engaging delivery. Hook → value → payoff structure.",
    overlay_style: "bold_statement",
    detect_patterns: [],
  },
};

/**
 * Detect the best content format from a title/concept.
 */
export function detectContentFormat(concept: string): ContentFormat {
  for (const [id, template] of Object.entries(FORMAT_TEMPLATES)) {
    if (id === "default") continue;
    for (const pattern of template.detect_patterns) {
      if (pattern.test(concept)) return id as ContentFormat;
    }
  }
  return "default";
}

// ─── Pacing Rules ───────────────────────────────────────────

export interface PacingProfile {
  /** Max duration for first scene (hook) in seconds */
  hook_max_seconds: number;
  /** Max duration for value scenes */
  value_max_seconds: number;
  /** Max duration for CTA */
  cta_max_seconds: number;
  /** Whether to enforce "no dead air" (scenes with >1s of no action) */
  no_dead_air: boolean;
  /** Description for prompt injection */
  pacing_instruction: string;
}

const PACING_PROFILES: Record<"aggressive" | "medium" | "breathe", PacingProfile> = {
  aggressive: {
    hook_max_seconds: 3,
    value_max_seconds: 4,
    cta_max_seconds: 3,
    no_dead_air: true,
    pacing_instruction: "FAST PACING: Every scene must have visible action or motion. No static shots longer than 1.5s. Cut speed: aggressive. First 2 scenes must be under 3 seconds each.",
  },
  medium: {
    hook_max_seconds: 4,
    value_max_seconds: 6,
    cta_max_seconds: 4,
    no_dead_air: true,
    pacing_instruction: "MEDIUM PACING: Keep energy up throughout. Hook scene under 4 seconds. Value scenes 3-6 seconds. No static talking-head shots.",
  },
  breathe: {
    hook_max_seconds: 5,
    value_max_seconds: 8,
    cta_max_seconds: 5,
    no_dead_air: false,
    pacing_instruction: "CINEMATIC PACING: Allow moments to breathe but maintain forward momentum. Hook still under 5 seconds.",
  },
};

export function getPacingProfile(format: ContentFormat): PacingProfile {
  const template = FORMAT_TEMPLATES[format];
  return PACING_PROFILES[template.pacing];
}

// ─── Text Overlay Strategy ──────────────────────────────────

export interface OverlayGuidance {
  max_words: number;
  style: string;
  hook_instruction: string;
  value_instruction: string;
  cta_instruction: string;
}

export function getOverlayGuidance(format: ContentFormat): OverlayGuidance {
  const template = FORMAT_TEMPLATES[format];

  const styleMap: Record<string, string> = {
    bold_statement: "Bold, punchy text. ALL CAPS for emphasis words. Max 6 words per overlay.",
    numbered: "Number each point clearly (1., 2., 3.). Keep text to 4-5 words per overlay.",
    question: "Frame overlays as questions or challenges. Use '?' endings.",
    minimal: "Minimal text — 2-3 words max. Let visuals carry the message.",
  };

  return {
    max_words: template.overlay_style === "minimal" ? 3 : 6,
    style: styleMap[template.overlay_style] || styleMap.bold_statement,
    hook_instruction: "Hook overlay MUST be large, readable, and create instant tension. It should be visible within the first 0.5 seconds.",
    value_instruction: "Value overlays should reinforce the key takeaway of each scene. One clear point per overlay.",
    cta_instruction: "CTA overlay must be a clear action: 'Follow for more', 'Save this', 'Try it now'.",
  };
}

// ─── Retention Structure ────────────────────────────────────

export interface RetentionRule {
  rule: string;
  applies_to: "hook" | "value" | "cta" | "all";
}

/**
 * Retention rules enforced at the prompt level.
 * Each scene must deliver a micro-payoff.
 */
export const RETENTION_RULES: RetentionRule[] = [
  { rule: "Hook must create an open loop (unanswered question) within 1.5 seconds", applies_to: "hook" },
  { rule: "Each value scene must close a micro-loop AND open the next one", applies_to: "value" },
  { rule: "No scene should be purely transitional — every scene teaches, shows, or reveals", applies_to: "all" },
  { rule: "CTA must feel like a natural conclusion, not an abrupt sell", applies_to: "cta" },
  { rule: "If a scene doesn't make the viewer curious about the next scene, it fails", applies_to: "value" },
];

// ─── Visual Instruction Enhancement ────────────────────────

/**
 * Banned vague visual descriptors and their specific replacements.
 */
const VAGUE_VISUALS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bperson\s+(doing|at|in|with)\s+something\b/i, replacement: "a specific person performing a clear, visible action" },
  { pattern: /\bsomeone\s+(looking|standing|sitting)\b/i, replacement: "a person actively engaged in a task with visible tools or objects" },
  { pattern: /\bgeneric\s+(scene|shot|view|image)\b/i, replacement: "a specific environment with identifiable objects and clear lighting" },
  { pattern: /\babstract\s+(visual|image|scene)\b/i, replacement: "a concrete physical demonstration or real-world example" },
  { pattern: /\bbeautiful\s+(scene|shot|landscape)\b/i, replacement: "a visually distinct scene with specific colors, textures, and depth" },
];

/**
 * Enhance a visual prompt to be more specific and platform-optimized.
 */
export function enhanceVisualInstruction(prompt: string): { enhanced: string; was_modified: boolean } {
  let result = prompt;
  let modified = false;

  for (const { pattern, replacement } of VAGUE_VISUALS) {
    if (pattern.test(result)) {
      result = result.replace(pattern, replacement);
      modified = true;
    }
  }

  return { enhanced: result, was_modified: modified };
}

// ─── Build P3 Prompt Block ─────────────────────────────────

/**
 * Build the complete P3 platform optimization block for injection
 * into the storyboard generation prompt.
 */
export function buildPlatformOptimizationBlock(concept: string): string {
  const format = detectContentFormat(concept);
  const template = FORMAT_TEMPLATES[format];
  const pacing = getPacingProfile(format);
  const overlay = getOverlayGuidance(format);

  const retentionBlock = RETENTION_RULES
    .map(r => `- ${r.rule}`)
    .join("\n");

  return `
PLATFORM OPTIMIZATION (P3 — SHORT-FORM VIDEO BEST PRACTICES):

DETECTED FORMAT: ${template.name} (${format})
NARRATION STYLE: ${template.narration_style}

${pacing.pacing_instruction}

TEXT OVERLAY RULES:
- ${overlay.style}
- ${overlay.hook_instruction}
- ${overlay.value_instruction}
- ${overlay.cta_instruction}

RETENTION STRUCTURE (every scene must follow these):
${retentionBlock}

VISUAL RULES:
- First scene MUST show something visually engaging within 0.5 seconds
- Every scene needs visible ACTION — no static talking heads
- Product videos: show the product being USED, not just displayed
- Prefer specific actions over abstract concepts
- Environment must match the topic (resume video → office/laptop, cooking → kitchen)

FIRST 2-SECOND RULE:
- The opening frame must immediately communicate the topic
- Large, readable text overlay in the first frame
- Motion or visual change within the first second
- No slow fades, no blank screens, no gradual reveals
`;
}

/**
 * Get format-specific hook category override if the detected format
 * has strong preferences that differ from the default.
 */
export function getFormatHookOverride(concept: string, currentCategory: string): string | null {
  const format = detectContentFormat(concept);
  const template = FORMAT_TEMPLATES[format];

  // Only override if current category isn't in the preferred list
  if (template.preferred_hooks.includes(currentCategory)) return null;
  return template.preferred_hooks[0] || null;
}
