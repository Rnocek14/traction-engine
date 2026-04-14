/**
 * Content Quality Engine v1.0
 * 
 * Validates that generated content actually delivers on the title's promise.
 * Three layers:
 *   1. Title-Promise Detection — extracts "N things" patterns
 *   2. Narration Quality Gate — rejects filler/generic content
 *   3. Structure Enforcement — ensures hook → value → CTA format
 */

// ─── Title-Promise Detection ────────────────────────────────

export interface TitlePromise {
  has_count: boolean;
  count: number;
  noun: string;          // "hacks", "tips", "reasons", etc.
  full_match: string;    // "5 Resume Hacks"
  format: "listicle";    // expandable later
}

const COUNT_PATTERN = /\b(\d{1,2})\s+(tips?|hacks?|tricks?|ways?|reasons?|things?|steps?|signs?|mistakes?|secrets?|facts?|rules?|lessons?|ideas?|strategies?|methods?|tools?|habits?|examples?)\b/i;

/**
 * Parse a title like "5 Resume Hacks That Get You Hired" into a structured promise.
 */
export function parseTitlePromise(title: string): TitlePromise | null {
  const match = title.match(COUNT_PATTERN);
  if (!match) return null;
  return {
    has_count: true,
    count: parseInt(match[1], 10),
    noun: match[2].toLowerCase(),
    full_match: match[0],
    format: "listicle",
  };
}

// ─── Narration Quality Gate ─────────────────────────────────

const FILLER_PHRASES = [
  "confidence is key",
  "unlock your potential",
  "believe in yourself",
  "the secret is within",
  "you got this",
  "stay motivated",
  "dream big",
  "never give up",
  "you deserve it",
  "take the leap",
  "trust the process",
  "anything is possible",
  "sky is the limit",
  "change your life",
  "transform your future",
  "start your journey",
  "embrace the change",
  "make it happen",
  "be the best version",
  "live your best life",
  "did you know",
  "wait for the twist",
  "you won't believe",
  "what happens next will shock",
  "something incredible happened",
  "everything changed",
  "this changes everything",
];

const VAGUE_PATTERNS = [
  /^(it'?s|this is) (important|amazing|incredible|unbelievable)/i,
  /^(have you ever|imagine if|what if)\b/i,
  /\b(simply|just|really|truly|absolutely|literally)\s+(amazing|incredible|life.?changing)/i,
  /\b(game.?changer|life.?changing|mind.?blowing)\b/i,
];

export interface NarrationIssue {
  scene_index: number;
  issue: "too_short" | "filler" | "vague" | "no_specifics";
  detail: string;
  narration: string;
}

/**
 * Validate a single narration line for quality.
 * Returns issues found (empty = good).
 */
export function validateNarrationQuality(
  narration: string,
  sceneIndex: number,
  beatRole?: string,
): NarrationIssue[] {
  const issues: NarrationIssue[] = [];
  const trimmed = narration.trim();

  // Skip validation for pause markers
  if (trimmed === "(pause)" || trimmed === "...") return issues;

  // 1. Minimum word count (12 words for value scenes, 8 for hook/cta)
  const words = trimmed.split(/\s+/).filter(Boolean);
  const isValueScene = !beatRole || !["hook", "cta", "proof_cta", "value_cta", "how_cta", "credibility_cta", "item_3_cta"].some(r => beatRole.includes(r));
  const minWords = isValueScene ? 12 : 8;

  if (words.length < minWords) {
    issues.push({
      scene_index: sceneIndex,
      issue: "too_short",
      detail: `${words.length} words (min ${minWords})`,
      narration: trimmed,
    });
  }

  // 2. Filler phrase detection
  const lower = trimmed.toLowerCase();
  for (const filler of FILLER_PHRASES) {
    if (lower.includes(filler)) {
      issues.push({
        scene_index: sceneIndex,
        issue: "filler",
        detail: `Contains filler: "${filler}"`,
        narration: trimmed,
      });
      break;
    }
  }

  // 3. Vague pattern detection
  for (const pattern of VAGUE_PATTERNS) {
    if (pattern.test(trimmed)) {
      issues.push({
        scene_index: sceneIndex,
        issue: "vague",
        detail: `Matches vague pattern: ${pattern.source.slice(0, 40)}`,
        narration: trimmed,
      });
      break;
    }
  }

  // 4. Specificity check — value scenes should contain at least one concrete element
  //    (number, proper noun, action verb, or technical term)
  if (isValueScene && words.length >= minWords) {
    const hasNumber = /\d/.test(trimmed);
    const hasQuote = /["']/.test(trimmed);
    const hasSpecificWord = /\b(percent|%|dollar|\$|study|research|data|report|according|example|specifically|such as|like the|called|named|known as)\b/i.test(trimmed);
    const hasActionInstruction = /\b(use|add|remove|include|write|list|mention|replace|avoid|put|place|create|build|start|stop|try|switch|apply|format|highlight)\b/i.test(trimmed);

    if (!hasNumber && !hasQuote && !hasSpecificWord && !hasActionInstruction) {
      issues.push({
        scene_index: sceneIndex,
        issue: "no_specifics",
        detail: "No concrete details (numbers, examples, instructions)",
        narration: trimmed,
      });
    }
  }

  return issues;
}

// ─── Batch Validation ───────────────────────────────────────

export interface ContentQualityReport {
  title_promise: TitlePromise | null;
  narration_issues: NarrationIssue[];
  structure_valid: boolean;
  structure_issues: string[];
  value_scene_count: number;
  filler_scene_count: number;
  overall_pass: boolean;
  /** Regeneration needed? */
  needs_regeneration: boolean;
  /** Summary for logging */
  summary: string;
}

/**
 * Run full content quality check on generated scenes.
 */
export function validateContentQuality(
  title: string,
  scenes: Array<{
    narration_line?: string;
    beat_role?: string;
    role?: string;
  }>,
): ContentQualityReport {
  const promise = parseTitlePromise(title);

  // Collect narration issues
  const allIssues: NarrationIssue[] = [];
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const narration = scene.narration_line || "";
    const role = scene.beat_role || scene.role || "";
    const issues = validateNarrationQuality(narration, i, role);
    allIssues.push(...issues);
  }

  // Structure check
  const structureIssues: string[] = [];

  // Count value scenes (non-hook, non-CTA)
  const ctaRoles = ["cta", "proof_cta", "value_cta", "how_cta", "credibility_cta", "item_3_cta"];
  const valueScenes = scenes.filter((s, i) => {
    const role = s.beat_role || s.role || "";
    const isHook = role.includes("hook") || i === 0;
    const isCta = ctaRoles.some(r => role.includes(r)) || i === scenes.length - 1;
    return !isHook && !isCta;
  });

  // Title promise enforcement
  if (promise) {
    if (valueScenes.length < promise.count) {
      structureIssues.push(
        `Title promises ${promise.count} ${promise.noun} but only ${valueScenes.length} value scenes exist`
      );
    }
  }

  // Must have at least 1 hook scene
  const hasHook = scenes.some((s, i) => {
    const role = s.beat_role || s.role || "";
    return role.includes("hook") || i === 0;
  });
  if (!hasHook) structureIssues.push("Missing hook scene");

  // Must have CTA
  const hasCta = scenes.some(s => {
    const role = s.beat_role || s.role || "";
    return ctaRoles.some(r => role.includes(r));
  });
  if (!hasCta) structureIssues.push("Missing CTA scene");

  const fillerCount = allIssues.filter(i => i.issue === "filler").length;
  const criticalIssues = allIssues.filter(i => i.issue === "filler" || i.issue === "no_specifics");

  // Fail if >50% of value scenes have critical issues
  const criticalThreshold = Math.ceil(valueScenes.length * 0.5);
  const needsRegen = criticalIssues.length >= criticalThreshold || structureIssues.length > 0;

  const report: ContentQualityReport = {
    title_promise: promise,
    narration_issues: allIssues,
    structure_valid: structureIssues.length === 0,
    structure_issues: structureIssues,
    value_scene_count: valueScenes.length,
    filler_scene_count: fillerCount,
    overall_pass: !needsRegen,
    needs_regeneration: needsRegen,
    summary: needsRegen
      ? `FAIL: ${criticalIssues.length} critical issues, ${structureIssues.length} structure issues`
      : `PASS: ${allIssues.length} minor issues, ${valueScenes.length} value scenes`,
  };

  return report;
}

// ─── Prompt Enhancement for Title Promises ──────────────────

/**
 * Build additional GPT instructions when a title contains a numeric promise.
 * This block is injected into the template prompt to force distinct content points.
 */
export function buildTitlePromiseBlock(title: string): string {
  const promise = parseTitlePromise(title);
  if (!promise) return "";

  return `
TITLE PROMISE ENFORCEMENT (CRITICAL):
The title "${title}" promises exactly ${promise.count} distinct ${promise.noun}.
You MUST generate EXACTLY ${promise.count} value beats, each containing:
- ONE specific, actionable ${promise.noun.replace(/s$/, "")}
- A concrete example, number, or instruction (NOT generic advice)
- Content that would be genuinely useful to the viewer

BANNED in value beats:
- "Confidence is key" or similar motivational filler
- Generic advice without specific actions
- Repeated/overlapping points
- Vague statements like "it's important to..."

Each value beat narration_line MUST:
- Start with an actionable verb OR a specific fact
- Contain at least one concrete detail (name, number, technique)
- Be distinct from every other beat's content
`;
}

/**
 * Build quality enforcement rules for the compile-story-script prompt.
 */
export function buildCompileQualityRules(title: string): string {
  const promise = parseTitlePromise(title);

  let rules = `
CONTENT QUALITY RULES (MANDATORY):
1. Every segment must contain SPECIFIC, ACTIONABLE information
2. Remove ALL motivational filler ("believe in yourself", "confidence is key", etc.)
3. Replace vague statements with concrete instructions or facts
4. Each segment must teach, inform, or demonstrate something specific
5. If a segment is generic, rewrite it with a specific example or technique
`;

  if (promise) {
    rules += `
TITLE PROMISE: "${title}" — This video promises ${promise.count} ${promise.noun}.
- Ensure each value segment delivers a DISTINCT, SPECIFIC ${promise.noun.replace(/s$/, "")}
- Number them implicitly in the narration (e.g., "First..." "Next..." "Another powerful technique...")
- Each must be independently valuable — a viewer should learn something concrete from each one
`;
  }

  return rules;
}
