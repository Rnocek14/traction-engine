/**
 * Moderation Ladder for Story Mode
 * 
 * Implements "AI sanitize first, then fallback" strategy:
 * 1. Auto-sanitize + retry on locked provider
 * 2. If still fails, fallback to alternate provider with style constraints preserved
 * 3. Log everything for observability
 * 
 * Key insight: For Myth Mode, we must inject style anchors even on fallback
 * to prevent "style drift" (suddenly looking realistic instead of silhouette)
 */

import { type VideoProvider, type SceneRole } from "./scene-role-router.ts";

// =============================================================================
// TYPES
// =============================================================================

export type StoryMode = "myth" | "film" | "short_story" | "default";

export interface ModerationLadderContext {
  storyMode: StoryMode;
  lockedProvider: VideoProvider | null;
  currentProvider: VideoProvider;
  attempt: number;
  maxAttempts?: number;
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
  attempt: number;
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

const MYTH_SANITIZATION_RULES: Array<[RegExp, string]> = [
  // Violence to symbolism
  [/\b(kill|slay|slaughter|murder)\b/gi, "overcome"],
  [/\b(blood|gore|bleeding)\b/gi, "shadows"],
  [/\b(death|dying|dead)\b/gi, "fading"],
  [/\b(attack|strike|stab)\b/gi, "confront"],
  [/\b(sword|blade|knife|dagger)\b/gi, "staff"],
  [/\b(gun|pistol|rifle|weapon)\b/gi, "iron shape"],
  [/\b(army|soldiers|troops)\b/gi, "mass of figures"],
  [/\b(battle|combat|warfare)\b/gi, "confrontation"],
  [/\b(enemy|enemies|foe)\b/gi, "challenger"],
  [/\b(war|conflict)\b/gi, "struggle"],
  
  // Bodies to silhouettes
  [/\bface\b/gi, "silhouette"],
  [/\beyes\b/gi, "form"],
  [/\bmouth\b/gi, "shape"],
  [/\bbody\b/gi, "figure"],
  [/\bflesh\b/gi, "shadow"],
];

// =============================================================================
// FALLBACK PROVIDER CHAIN
// =============================================================================

const FALLBACK_CHAIN: Record<VideoProvider, VideoProvider[]> = {
  sora: ["luma", "runway"],
  luma: ["sora", "runway"],
  runway: ["luma", "sora"],
};

// =============================================================================
// CORE FUNCTIONS
// =============================================================================

/**
 * Apply Myth-specific sanitization to a prompt
 * Transforms violent/explicit content to symbolic/abstract equivalents
 */
export function sanitizeForMythMode(prompt: string): { sanitized: string; changes: string[] } {
  let result = prompt;
  const changes: string[] = [];
  
  for (const [pattern, replacement] of MYTH_SANITIZATION_RULES) {
    const matches = result.match(pattern);
    if (matches) {
      changes.push(`"${matches[0]}" → "${replacement}"`);
      result = result.replace(pattern, replacement);
    }
  }
  
  // Always add symbolic language hints
  if (changes.length > 0) {
    // Add abstraction reinforcement
    if (!result.includes("symbolic")) {
      result = result.replace(/\.$/, ", depicted symbolically.");
    }
    if (!result.includes("silhouette") && !result.includes("shadow")) {
      result += " [Render as silhouette only, no facial features]";
    }
  }
  
  return { sanitized: result, changes };
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

/**
 * Get the next fallback provider
 */
export function getNextFallbackProvider(
  currentProvider: VideoProvider,
  lockedProvider: VideoProvider | null
): VideoProvider | null {
  const chain = FALLBACK_CHAIN[currentProvider];
  
  // If locked, only fallback after exhausting retries on locked
  // This function is called AFTER sanitization retry failed
  if (lockedProvider && currentProvider === lockedProvider) {
    return chain[0]; // First fallback option
  }
  
  // If already on fallback, try next in chain
  const currentIndex = chain.indexOf(currentProvider);
  if (currentIndex >= 0 && currentIndex < chain.length - 1) {
    return chain[currentIndex + 1];
  }
  
  return null;
}

/**
 * Main moderation ladder logic
 * 
 * Strategy:
 * - Attempt 1: Sanitize + retry on same provider
 * - Attempt 2: Fallback to next provider with style anchors
 * - Attempt 3: Fail (surface AI Fix button)
 */
export function processModerationLadder(ctx: ModerationLadderContext): ModerationLadderResult {
  const maxAttempts = ctx.maxAttempts ?? 3;
  const isMythMode = ctx.storyMode === "myth";
  
  // Base telemetry
  const telemetry: ModerationTelemetry = {
    attempt: ctx.attempt,
    originalProvider: ctx.lockedProvider || ctx.currentProvider,
    finalProvider: ctx.currentProvider,
    sanitized: false,
    fallbackUsed: false,
    droppedReference: false,
    stylePreserved: true,
  };
  
  // ATTEMPT 1: Sanitize + retry on same provider
  if (ctx.attempt === 1) {
    let sanitizedPrompt = ctx.originalPrompt;
    let sanitized = false;
    
    if (isMythMode) {
      const { sanitized: mythSanitized, changes } = sanitizeForMythMode(ctx.originalPrompt);
      if (changes.length > 0) {
        sanitizedPrompt = mythSanitized;
        sanitized = true;
        console.log(`[moderation-ladder] Myth sanitization: ${changes.length} changes - ${changes.slice(0, 3).join(", ")}`);
      }
    }
    
    // Even if not Myth, apply basic moderation-safe transforms
    // (The existing moderation-safety.ts handles this, so we just mark as sanitized)
    
    telemetry.sanitized = sanitized;
    telemetry.finalProvider = ctx.lockedProvider || ctx.currentProvider;
    
    return {
      action: "retry_sanitized",
      provider: ctx.lockedProvider || ctx.currentProvider,
      prompt: sanitizedPrompt,
      dropReference: false,
      styleAnchorsInjected: false,
      telemetry,
    };
  }
  
  // ATTEMPT 2: Fallback to alternate provider with style preservation
  if (ctx.attempt === 2) {
    const fallbackProvider = getNextFallbackProvider(ctx.currentProvider, ctx.lockedProvider);
    
    if (!fallbackProvider) {
      // No fallback available - fail
      telemetry.failureReason = "No fallback provider available";
      return {
        action: "fail",
        provider: ctx.currentProvider,
        prompt: ctx.originalPrompt,
        dropReference: false,
        styleAnchorsInjected: false,
        telemetry,
      };
    }
    
    let fallbackPrompt = ctx.originalPrompt;
    
    // For Myth Mode, inject style anchors to preserve aesthetic
    if (isMythMode) {
      fallbackPrompt = injectMythStyleAnchors(fallbackPrompt);
      // Also apply Myth sanitization
      const { sanitized } = sanitizeForMythMode(fallbackPrompt);
      fallbackPrompt = sanitized;
      console.log(`[moderation-ladder] Myth fallback: ${ctx.currentProvider} → ${fallbackProvider} with style anchors`);
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
  
  // ATTEMPT 3+: Nuclear option - drop reference, simplify prompt, then fail
  if (ctx.attempt >= maxAttempts) {
    telemetry.failureReason = `Exhausted ${maxAttempts} attempts`;
    telemetry.droppedReference = true;
    
    return {
      action: "fail",
      provider: ctx.currentProvider,
      prompt: ctx.originalPrompt,
      dropReference: true,
      styleAnchorsInjected: false,
      telemetry,
    };
  }
  
  // Default: fail
  telemetry.failureReason = "Unexpected attempt state";
  return {
    action: "fail",
    provider: ctx.currentProvider,
    prompt: ctx.originalPrompt,
    dropReference: false,
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
      console.log(`${prefix}: RETRY on ${provider} (sanitized=${telemetry.sanitized})`);
      break;
    case "fallback":
      console.log(`${prefix}: FALLBACK ${telemetry.originalProvider} → ${provider} (style=${telemetry.stylePreserved})`);
      break;
    case "fail":
      console.log(`${prefix}: FAIL after ${telemetry.attempt} attempts (reason=${telemetry.failureReason})`);
      break;
  }
}

/**
 * Check if an error is a moderation/content policy error
 */
export function isModerationRelatedError(error: string): boolean {
  const moderationPatterns = [
    /content.*policy/i,
    /safety.*filter/i,
    /moderation/i,
    /blocked/i,
    /inappropriate/i,
    /violat/i,
    /prohibited/i,
    /not allowed/i,
    /unsafe/i,
    /400.*content/i,
    /403/i,
  ];
  
  return moderationPatterns.some(p => p.test(error));
}

/**
 * Build telemetry object for video_jobs.style_hints
 */
export function buildModerationTelemetryForDb(telemetry: ModerationTelemetry): Record<string, unknown> {
  return {
    moderation_ladder: {
      attempt: telemetry.attempt,
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
