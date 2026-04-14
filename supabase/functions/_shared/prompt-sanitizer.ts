/**
 * Prompt Sanitizer v1.0
 * 
 * Strips internal routing metadata, labels, and structural markers
 * from prompts before they are sent to video generation providers.
 * 
 * Video models (Sora, Runway, Luma) should receive clean, natural-language
 * prose — NOT internal routing signals like [CINEMATOGRAPHY role=hook],
 * ESC=URGENCY, FORCE=SOCIAL, or [SPECTACLE_CTX s=2/5 focus=object].
 * 
 * This is the LAST PASS before a prompt reaches the provider API.
 */

export type VideoProvider = "sora" | "runway" | "luma";

/**
 * Provider-specific max prompt lengths (characters).
 * Prompts exceeding these are intelligently trimmed.
 */
const PROVIDER_MAX_CHARS: Record<VideoProvider, number> = {
  runway: 300,
  luma: 400,
  sora: 600,
};

/**
 * Patterns to strip from prompts.
 * Order matters — broader patterns should come after specific ones.
 */
const STRIP_PATTERNS: RegExp[] = [
  // Bracketed labels: [ANYTHING: ...] or [ANYTHING]
  /\[CAPTURE:[^\]]*\]/gi,
  /\[TEXTURE:[^\]]*\]/gi,
  /\[LIGHT:[^\]]*\]/gi,
  /\[OPTICS:[^\]]*\]/gi,
  /\[PRIORITY:[^\]]*\]/gi,
  /\[CINEMATOGRAPHY[^\]]*\]/gi,
  /\[REALISM:[^\]]*\]/gi,
  /\[COVERAGE:[^\]]*\]/gi,
  /\[SPECTACLE[^\]]*\]/gi,
  /\[IMPACT BEAT[^\]]*\]/gi,
  /\[IDENTITY_ANCHORS\]/gi,
  /\[STORY_CTX[^\]]*\]/gi,
  /\[SPECTACLE_CTX[^\]]*\]/gi,
  /\[BEAT TRANSITION\]/gi,
  /\[Continue\][^\n]*/gi,

  // KEY=VALUE patterns on their own line
  /^ESC=[^\n]*/gm,
  /^FORCE=[^\n]*/gm,

  // Standalone routing signals (whole lines)
  /^NO_CHARACTER_IDENTITY_NEEDED\s*$/gm,
  /^PREV_END:[^\n]*/gm,
  /^PREV_EVENT:[^\n]*/gm,
  /^NOW_INTENT:[^\n]*/gm,
  /^THIS_EVENT:[^\n]*/gm,
  /^END_EVENT:[^\n]*/gm,
  /^END_STATE:[^\n]*/gm,
  /^SHOW_CHANGE:[^\n]*/gm,
  /^ARC:[^\n]*/gm,
  /^WARDROBE:[^\n]*/gm,
  /^PROP:[^\n]*/gm,
  /^PALETTE:[^\n]*/gm,
  /^ENVIRONMENT:[^\n]*/gm,
  /^LENS:[^\n]*/gm,
  /^MOTION:[^\n]*/gm,
  /^LIGHTING:[^\n]*/gm,
  /^STAKES:[^\n]*/gm,
  /^INTENSITY:[^\n]*/gm,

  // Escalation/force headers
  /^\[ESCALATION \d+:[^\]]*\]/gm,
  /^\[FORCE:[^\]]*\]/gm,
  /^\[SETPIECE CHANGE:[^\]]*\]/gm,

  // Progression injection ASCII headers
  /^═+.*═+$/gm,
  /^PREVIOUS ACTION FINISHED:[^\n]*/gm,
  /^NEW ACTION REQUIRED:[^\n]*/gm,
  /^WHAT CHANGES:[^\n]*/gm,
  /^IDENTITY:[^\n]*/gm,
  /^Start this shot in the END STATE[^\n]*/gm,
  /^This is the new beat[^\n]*/gm,
  /^Show this change clearly[^\n]*/gm,
  /^Camera motion alone[^\n]*/gm,
  /^Subject must move\.[^\n]*/gm,
  /^Previous:[^\n]*/gm,
  /^New action:[^\n]*/gm,
  /^Change:[^\n]*/gm,

  // Trend intelligence block
  /^TREND INTELLIGENCE[^\n]*$/gm,
  /^- Trending hook styles:[^\n]*/gm,
  /^- Rising emotional angles:[^\n]*/gm,
  /^- Hot format:[^\n]*/gm,
  /^- Related trending topics:[^\n]*/gm,

  // Narrative progression headers  
  /^═══ NARRATIVE PROGRESSION[^\n]*═══$/gm,
];

/**
 * Clean up whitespace after stripping patterns.
 * Collapses multiple blank lines into one, trims edges.
 */
function collapseWhitespace(text: string): string {
  return text
    .replace(/\n{3,}/g, "\n\n")  // Max 2 consecutive newlines
    .replace(/^\s+|\s+$/g, "")    // Trim edges
    .replace(/[ \t]+\n/g, "\n")   // Remove trailing spaces on lines
    .trim();
}

/**
 * Intelligently trim a prompt to max length.
 * Tries to cut at sentence boundaries.
 */
function trimToLength(prompt: string, maxChars: number): string {
  if (prompt.length <= maxChars) return prompt;

  // Try to cut at last sentence boundary before limit
  const truncated = prompt.substring(0, maxChars);
  const lastPeriod = truncated.lastIndexOf(".");
  const lastNewline = truncated.lastIndexOf("\n");
  const cutPoint = Math.max(lastPeriod, lastNewline);

  if (cutPoint > maxChars * 0.6) {
    return truncated.substring(0, cutPoint + 1).trim();
  }

  // Fall back to word boundary
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > maxChars * 0.7) {
    return truncated.substring(0, lastSpace).trim();
  }

  return truncated.trim();
}

/**
 * Main sanitization function.
 * Strips all internal routing metadata and enforces provider length limits.
 * 
 * @param rawPrompt - The enriched prompt with all metadata injected
 * @param provider - Target video provider (determines max length)
 * @returns Clean, natural-language prompt ready for the provider API
 */
export function sanitizePromptForProvider(
  rawPrompt: string,
  provider: VideoProvider
): { cleanPrompt: string; strippedChars: number; wasTrimmed: boolean } {
  const originalLength = rawPrompt.length;
  let prompt = rawPrompt;

  // Apply all strip patterns
  for (const pattern of STRIP_PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    prompt = prompt.replace(pattern, "");
  }

  // Collapse whitespace
  prompt = collapseWhitespace(prompt);

  const strippedChars = originalLength - prompt.length;

  // Enforce provider length limit
  const maxChars = PROVIDER_MAX_CHARS[provider];
  const wasTrimmed = prompt.length > maxChars;
  if (wasTrimmed) {
    prompt = trimToLength(prompt, maxChars);
  }

  return { cleanPrompt: prompt, strippedChars, wasTrimmed };
}

/**
 * Quick check: does this prompt contain routing metadata?
 * Useful for logging/debugging to see if sanitization is needed.
 */
export function hasRoutingMetadata(prompt: string): boolean {
  const indicators = [
    "[CAPTURE:", "[CINEMATOGRAPHY", "[COVERAGE:", "[SPECTACLE",
    "ESC=", "FORCE=", "NO_CHARACTER_IDENTITY_NEEDED",
    "PREV_EVENT:", "THIS_EVENT:", "END_EVENT:",
    "[STORY_CTX", "[SPECTACLE_CTX",
    "TREND INTELLIGENCE",
  ];
  return indicators.some(ind => prompt.includes(ind));
}
