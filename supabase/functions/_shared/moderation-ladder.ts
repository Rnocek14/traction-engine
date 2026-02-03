/**
 * Moderation Ladder for Story Mode (v2 - FIXED)
 * 
 * Implements "AI sanitize first, then fallback" strategy:
 * 1. Stage 0: Raw prompt (no modification)
 * 2. Stage 1: Auto-sanitize + retry on LOCKED provider
 * 3. Stage 2: Fallback to alternate provider with style constraints preserved
 * 4. Stage 3: Fail (surface AI Fix button)
 * 
 * FIX: Uses stage-based system instead of numeric attempts to avoid math bugs
 * FIX: Fallback chain uses ORIGINAL provider, not current provider
 * FIX: locked_provider comes from story settings, not character continuity mode
 * 
 * Key insight: For Myth Mode, we must inject style anchors even on fallback
 * to prevent "style drift" (suddenly looking realistic instead of silhouette)
 */

import { type SceneRole } from "./scene-role-router.ts";

// =============================================================================
// TYPES
// =============================================================================

export type StoryMode = "myth" | "film" | "short_story" | "default";
export type VideoProvider = "sora" | "runway" | "luma";
export type LadderStage = 0 | 1 | 2 | 3;

export interface ModerationLadderContext {
  storyMode: StoryMode;
  /** Provider locked at story level (from storyboard_json.locked_provider) */
  lockedProvider: VideoProvider | null;
  /** Current provider being used for this attempt */
  currentProvider: VideoProvider;
  /** Original provider before any fallback (used for fallback chain lookup) */
  originalProvider: VideoProvider;
  /** Stage in the ladder (0=raw, 1=sanitize, 2=fallback, 3=fail) */
  stage: LadderStage;
  originalPrompt: string;
  lastError?: string;
  sceneRole?: SceneRole;
  brutalityMode?: boolean;
}

export interface ModerationLadderResult {
  action: "retry_sanitized" | "fallback" | "fail";
  provider: VideoProvider;
  prompt: string;
  dropReference: boolean;
  styleAnchorsInjected: boolean;
  telemetry: ModerationTelemetry;
}

export interface ModerationTelemetry {
  stage: LadderStage;
  originalProvider: VideoProvider;
  finalProvider: VideoProvider;
  sanitized: boolean;
  fallbackUsed: boolean;
  droppedReference: boolean;
  stylePreserved: boolean;
  failureReason?: string;
}

// =============================================================================
// MYTH MODE STYLE ANCHORS (must be injected on fallback)
// =============================================================================

const MYTH_STYLE_INJECTION = `[STYLE: flat silhouette animation, shadow-puppet, parchment texture, 2D cutout, high contrast, storybook illustration]
[CONSTRAINT: NO realistic faces, NO detailed eyes, NO 3D rendering, silhouettes ONLY]
[PALETTE: amber, charcoal, parchment, gold, muted earth tones]
`;

// Patterns to strip from prompts when doing Myth Mode fallback
// These realistic cinematography blocks cause style drift
const REALISTIC_CINEMATOGRAPHY_PATTERNS = [
  // Capture contract blocks
  /\[CAPTURE:[^\]]*\]\n?/gi,
  /\[TEXTURE:[^\]]*\]\n?/gi,
  /\[LIGHTING:[^\]]*\]\n?/gi,
  // On-location language
  /on-location shoot/gi,
  /practical lighting/gi,
  /shot on film/gi,
  /physical surfaces/gi,
  /real materials/gi,
  // 3D/realistic terms
  /photorealistic/gi,
  /3D render/gi,
  /realistic faces?/gi,
];

// FIX #7: Scoped sanitization - only transform when in violent context
// "death" alone is kept (philosophical), but "death by sword" transforms
const MYTH_SANITIZATION_RULES: Array<[RegExp, string]> = [
  // Violence actions to symbolism (contextual)
  [/\b(kill|slay|slaughter|murder)\s+(the\s+)?(enemy|foe|opponent|warrior|soldier|knight)(s)?\b/gi, "overcome $3$4"],
  [/\battack(s|ing)?\s+(the\s+)?(enemy|foe|opponent|warrior)(s)?\b/gi, "confront$1 $3$4"],
  [/\bstab(s|bing)?\s+(through|into)\b/gi, "thrust$1 toward"],
  
  // Blood/gore to shadows (always transform)
  [/\b(blood|gore|bleeding|bloody)\b/gi, "shadows"],
  
  // Combat to confrontation
  [/\b(sword|blade|knife|dagger)\s+(strike|slash|cut)(s|ing)?\b/gi, "shadow movement$3"],
  [/\b(battle|war|warfare)\b/gi, "confrontation"],
  [/\b(army|armies|soldiers|troops)\b/gi, "mass of figures"],
  
  // Death only when graphic
  [/\bdeath\s+by\b/gi, "fall from"],
  [/\bdead\s+bodies?\b/gi, "fallen forms"],
  [/\bdying\s+(in\s+)?agony\b/gi, "fading slowly"],
  
  // Weapons to symbolic shapes (contextual)
  [/\b(gun|pistol|rifle)\b/gi, "iron shape"],
  [/\b(bow|arrow)(s)?\s+(aimed|flying|shot)\b/gi, "arc$2 sweeping"],
];

// =============================================================================
// FALLBACK PROVIDER CHAIN
// FIX #2: Always use the ORIGINAL provider to determine fallback chain
// =============================================================================

const FALLBACK_CHAIN: Record<VideoProvider, VideoProvider[]> = {
  sora: ["luma", "runway"],
  luma: ["sora", "runway"],
  runway: ["luma", "sora"],
};

/**
 * Get the next fallback provider based on the ORIGINAL locked provider
 * FIX #2: Uses originalProvider for chain lookup, tracks position via currentProvider
 */
export function getNextFallbackProvider(
  originalProvider: VideoProvider,
  currentProvider: VideoProvider
): VideoProvider | null {
  const chain = FALLBACK_CHAIN[originalProvider];
  
  // If we're still on original, return first fallback
  if (currentProvider === originalProvider) {
    return chain[0];
  }
  
  // If we're already on a fallback, find next in chain
  const currentIndex = chain.indexOf(currentProvider);
  if (currentIndex >= 0 && currentIndex < chain.length - 1) {
    return chain[currentIndex + 1];
  }
  
  // Exhausted fallback chain
  return null;
}

// =============================================================================
// CORE FUNCTIONS
// =============================================================================

/**
 * Apply Myth-specific sanitization to a prompt
 * FIX #7: Only transforms violent ACTIONS, keeps philosophical terms
 */
export function sanitizeForMythMode(prompt: string): { sanitized: string; changes: string[] } {
  let result = prompt;
  const changes: string[] = [];
  
  for (const [pattern, replacement] of MYTH_SANITIZATION_RULES) {
    const matches = result.match(pattern);
    if (matches) {
      changes.push(`"${matches[0]}" → "${replacement.replace(/\$\d/g, '...')}"`);
      result = result.replace(pattern, replacement);
    }
  }
  
  // Only add symbolic reinforcement if we made changes
  if (changes.length > 0) {
    // Add abstraction reinforcement
    if (!result.includes("symbolic") && !result.includes("silhouette")) {
      result += " [Render as silhouette only, no facial features, symbolic depiction]";
    }
  }
  
  return { sanitized: result, changes };
}

/**
 * Strip realistic cinematography blocks from a prompt
 * Used during Myth Mode fallback to remove conflicting style directives
 */
export function stripRealisticCinematography(prompt: string): { cleaned: string; strippedCount: number } {
  let result = prompt;
  let strippedCount = 0;
  
  for (const pattern of REALISTIC_CINEMATOGRAPHY_PATTERNS) {
    const matches = result.match(pattern);
    if (matches) {
      strippedCount += matches.length;
      result = result.replace(pattern, "");
    }
  }
  
  // Clean up any double newlines left behind
  result = result.replace(/\n{3,}/g, "\n\n").trim();
  
  return { cleaned: result, strippedCount };
}

/**
 * Inject Myth style anchors to a prompt (for fallback preservation)
 */
export function injectMythStyleAnchors(prompt: string): string {
  // Don't double-inject
  if (prompt.includes("[STYLE:") && prompt.includes("silhouette")) {
    return prompt;
  }
  
  // Prepend style block
  return MYTH_STYLE_INJECTION + prompt;
}

// =============================================================================
// MAIN LADDER LOGIC (Stage-based)
// =============================================================================

/**
 * Main moderation ladder logic
 * 
 * FIX #1: Uses explicit stages instead of numeric math:
 * - Stage 0: Raw prompt (first attempt, before ladder is called)
 * - Stage 1: Sanitize + retry on locked/original provider
 * - Stage 2: Fallback to next provider with style anchors
 * - Stage 3: Fail (surface AI Fix button)
 */
export function processModerationLadder(ctx: ModerationLadderContext): ModerationLadderResult {
  const { 
    storyMode, 
    lockedProvider, 
    currentProvider, 
    originalProvider,
    stage, 
    originalPrompt, 
    brutalityMode 
  } = ctx;
  
  const isMythMode = storyMode === "myth";
  const effectiveOriginalProvider = originalProvider || lockedProvider || currentProvider;
  
  // Base telemetry
  const telemetry: ModerationTelemetry = {
    stage,
    originalProvider: effectiveOriginalProvider,
    finalProvider: currentProvider,
    sanitized: false,
    fallbackUsed: false,
    droppedReference: false,
    stylePreserved: true,
  };
  
  // STAGE 1: Sanitize + retry on same provider
  if (stage === 1) {
    let sanitizedPrompt = originalPrompt;
    let sanitized = false;
    
    if (isMythMode) {
      const { sanitized: mythSanitized, changes } = sanitizeForMythMode(originalPrompt);
      if (changes.length > 0) {
        sanitizedPrompt = mythSanitized;
        sanitized = true;
        console.log(`[moderation-ladder] Myth sanitization: ${changes.length} changes - ${changes.slice(0, 3).join(", ")}`);
      }
    }
    
    telemetry.sanitized = sanitized;
    telemetry.finalProvider = lockedProvider || currentProvider;
    
    return {
      action: "retry_sanitized",
      provider: lockedProvider || currentProvider,
      prompt: sanitizedPrompt,
      dropReference: false,
      styleAnchorsInjected: false,
      telemetry,
    };
  }
  
  // STAGE 2: Fallback to alternate provider with style preservation
  if (stage === 2) {
    // FIX #2: Use originalProvider for fallback chain lookup
    const fallbackProvider = getNextFallbackProvider(effectiveOriginalProvider, currentProvider);
    
    if (!fallbackProvider) {
      telemetry.failureReason = "No fallback provider available";
      telemetry.stage = 3;
      return {
        action: "fail",
        provider: currentProvider,
        prompt: originalPrompt,
        dropReference: false,
        styleAnchorsInjected: false,
        telemetry,
      };
    }
    
    let fallbackPrompt = originalPrompt;
    
    // For Myth Mode, inject style anchors to preserve aesthetic
    if (isMythMode) {
      // CRITICAL FIX: Strip realistic cinematography FIRST to prevent style drift
      // This removes [CAPTURE:], [TEXTURE:], "on-location shoot", etc.
      const { cleaned, strippedCount } = stripRealisticCinematography(fallbackPrompt);
      fallbackPrompt = cleaned;
      if (strippedCount > 0) {
        console.log(`[moderation-ladder] Myth fallback: stripped ${strippedCount} realistic cinematography patterns`);
      }
      
      // Then inject Myth style anchors at the top
      fallbackPrompt = injectMythStyleAnchors(fallbackPrompt);
      // Also apply Myth sanitization
      const { sanitized } = sanitizeForMythMode(fallbackPrompt);
      fallbackPrompt = sanitized;
      console.log(`[moderation-ladder] Myth fallback: ${currentProvider} → ${fallbackProvider} with style anchors`);
    }
    
    telemetry.fallbackUsed = true;
    telemetry.finalProvider = fallbackProvider;
    telemetry.stylePreserved = isMythMode;
    
    return {
      action: "fallback",
      provider: fallbackProvider,
      prompt: fallbackPrompt,
      dropReference: false, // Keep reference on first fallback attempt
      styleAnchorsInjected: isMythMode,
      telemetry,
    };
  }
  
  // STAGE 3+: Fail - surface AI Fix button
  telemetry.failureReason = "Exhausted moderation ladder";
  telemetry.droppedReference = true;
  telemetry.stage = 3;
  
  return {
    action: "fail",
    provider: currentProvider,
    prompt: originalPrompt,
    dropReference: true,
    styleAnchorsInjected: false,
    telemetry,
  };
}

/**
 * Log moderation ladder decision for observability
 */
export function logModerationLadderDecision(
  sceneIndex: number,
  storyJobId: string,
  result: ModerationLadderResult
): void {
  const { action, provider, telemetry } = result;
  
  const prefix = `[moderation-ladder] story=${storyJobId.slice(0, 8)} scene=${sceneIndex + 1}`;
  
  switch (action) {
    case "retry_sanitized":
      console.log(`${prefix}: RETRY on ${provider} (stage=1, sanitized=${telemetry.sanitized})`);
      break;
    case "fallback":
      console.log(`${prefix}: FALLBACK ${telemetry.originalProvider} → ${provider} (stage=2, style=${telemetry.stylePreserved})`);
      break;
    case "fail":
      console.log(`${prefix}: FAIL at stage=${telemetry.stage} (reason=${telemetry.failureReason})`);
      break;
  }
}

/**
 * Check if an error is a moderation/content policy error
 * FIX #6: Removed generic 403 - now requires explicit moderation signals
 */
export function isModerationRelatedError(error: string): boolean {
  const lower = error.toLowerCase();
  
  // FIX #6: Be specific - require BOTH status code context AND moderation keywords
  // Generic 403 alone could be auth issues
  const moderationKeywords = [
    "content policy",
    "safety filter",
    "moderation",
    "blocked by",
    "inappropriate content",
    "violat", // violates, violation
    "prohibited",
    "not allowed content",
    "unsafe content",
    "harmful content",
  ];
  
  // Status codes alone are NOT enough - must have keyword
  const hasKeyword = moderationKeywords.some(kw => lower.includes(kw));
  
  // Special case: 400 with "content" in message
  const is400ContentError = lower.includes("400") && lower.includes("content");
  
  return hasKeyword || is400ContentError;
}

/**
 * Build telemetry object for video_jobs.style_hints
 * Returns object that should be MERGED with existing style_hints
 */
export function buildModerationTelemetryForDb(telemetry: ModerationTelemetry): Record<string, unknown> {
  return {
    moderation_ladder: {
      stage: telemetry.stage,
      original_provider: telemetry.originalProvider,
      final_provider: telemetry.finalProvider,
      sanitized: telemetry.sanitized,
      fallback_used: telemetry.fallbackUsed,
      dropped_reference: telemetry.droppedReference,
      style_preserved: telemetry.stylePreserved,
      failure_reason: telemetry.failureReason,
    },
  };
}

/**
 * Helper to safely merge moderation telemetry with existing style_hints
 * FIX #5: Always merge, never overwrite
 */
export function mergeStyleHints(
  existing: Record<string, unknown> | string | null,
  moderationTelemetry: Record<string, unknown> | null
): Record<string, unknown> {
  // Parse existing if string
  let parsed: Record<string, unknown> = {};
  if (typeof existing === "string") {
    try {
      const obj = JSON.parse(existing);
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        parsed = obj as Record<string, unknown>;
      }
    } catch {
      // Invalid JSON - start fresh but log
      console.warn("[moderation-ladder] Could not parse existing style_hints as object");
    }
  } else if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    parsed = existing;
  }
  
  // Merge moderation telemetry
  if (moderationTelemetry) {
    return { ...parsed, ...moderationTelemetry };
  }
  
  return parsed;
}
