/**
 * Constraint Profiles System v1.0
 * 
 * Implements tiered constraint budgets to prevent prompt bloat.
 * 
 * Tiers:
 * - Tier 0: Safety/compliance (always applied, minimal chars)
 * - Tier 1: Stability rails (identity, continuity - optional)
 * - Tier 2: Cinematic polish (cinematography, motion - optional, capped)
 * 
 * Rule: If over budget, drop Tier 2 first, then Tier 1, never Tier 0.
 */

export type VideoProvider = "sora" | "runway" | "luma";
export type StoryMode = "default" | "myth" | "film" | "spectacle" | "brutality";
export type SanitizationLevel = "off" | "soft" | "strict";

/**
 * Constraint tiers - controls what gets included
 */
export interface ConstraintTier {
  tier0: boolean; // Safety - always true
  tier1: boolean; // Stability rails
  tier2: boolean; // Cinematic polish
}

/**
 * Character budgets per tier
 */
export interface TierBudgets {
  tier0Max: number;
  tier1Max: number;
  tier2Max: number;
  totalMax: number;
}

/**
 * Full constraint profile configuration
 */
export interface ConstraintProfile {
  name: string;
  mode: StoryMode;
  provider: VideoProvider;
  
  // Tier enablement
  tiers: ConstraintTier;
  
  // Character budgets
  budgets: TierBudgets;
  
  // Sanitization level override (provider-aware)
  sanitizationLevel: SanitizationLevel;
  
  // Block enablement (fine-grained control)
  blocks: {
    captureContract: boolean;
    cinematographyDirective: boolean;
    motionAmplification: boolean;
    narrativeContext: boolean;
    coverageDirective: boolean;
    qualityStandards: boolean; // DEPRECATED - always false now
    realismAnchors: boolean;
    identityAnchors: boolean;
  };
  
  // Storyboard validation settings
  storyboardValidation: {
    bannedVerbsMode: "hard" | "soft" | "off"; // hard=reject, soft=warn, off=ignore
    requiredVerbsMode: "hard" | "soft" | "off";
    forceEscalationMode: "hard" | "soft" | "off";
  };
}

/**
 * Provider-specific base budgets
 * These are the MAXIMUM chars allowed per provider
 */
export const PROVIDER_BUDGETS: Record<VideoProvider, TierBudgets> = {
  sora: {
    tier0Max: 100,
    tier1Max: 300,
    tier2Max: 600,
    totalMax: 1000, // Sora can handle more, but we cap for quality
  },
  runway: {
    tier0Max: 50,
    tier1Max: 100,
    tier2Max: 150,
    totalMax: 300, // Runway punishes long prompts
  },
  luma: {
    tier0Max: 75,
    tier1Max: 200,
    tier2Max: 400,
    totalMax: 700,
  },
};

/**
 * Mode-specific budget multipliers
 * Spectacle/brutality get more creative headroom
 */
export const MODE_BUDGET_MULTIPLIERS: Record<StoryMode, number> = {
  default: 1.0,
  myth: 0.8, // Myth needs style anchors, less room for constraints
  film: 1.0, // Film mode is balanced
  spectacle: 0.6, // Spectacle prioritizes action - minimal constraints
  brutality: 0.5, // Brutality is minimal rails
};

/**
 * Get the default constraint profile for a mode/provider combination
 */
export function getConstraintProfile(
  mode: StoryMode,
  provider: VideoProvider
): ConstraintProfile {
  const baseBudgets = PROVIDER_BUDGETS[provider];
  const multiplier = MODE_BUDGET_MULTIPLIERS[mode];
  
  // Spectacle and brutality modes disable Tier 2 by default
  const enableTier2 = !["spectacle", "brutality"].includes(mode);
  
  // Brutality mode uses minimal Tier 1
  const enableTier1 = mode !== "brutality";
  
  // Sanitization: Runway always strict, others mode-dependent
  let sanitizationLevel: SanitizationLevel = "soft";
  if (provider === "runway") {
    sanitizationLevel = "strict";
  } else if (["brutality", "spectacle"].includes(mode)) {
    sanitizationLevel = "off"; // Trust the creative, skip soft sanitization
  }
  
  // Block enablement based on mode
  const blocks = {
    captureContract: mode === "film", // Only film mode uses capture contract
    cinematographyDirective: enableTier2 && mode !== "myth",
    motionAmplification: enableTier2 && !["myth", "spectacle"].includes(mode),
    narrativeContext: enableTier1,
    coverageDirective: false, // DEPRECATED - always disabled now
    qualityStandards: false, // DELETED - CGI trigger
    realismAnchors: mode === "film" && enableTier2,
    identityAnchors: enableTier1 && mode !== "spectacle",
  };
  
  // Storyboard validation: spectacle/brutality use soft mode
  const storyboardValidation = {
    bannedVerbsMode: (["spectacle", "brutality"].includes(mode) ? "off" : mode === "film" ? "hard" : "soft") as "hard" | "soft" | "off",
    requiredVerbsMode: (["spectacle", "brutality"].includes(mode) ? "off" : mode === "film" ? "hard" : "soft") as "hard" | "soft" | "off",
    forceEscalationMode: (["spectacle", "brutality"].includes(mode) ? "off" : "soft") as "hard" | "soft" | "off",
  };
  
  return {
    name: `${mode}-${provider}`,
    mode,
    provider,
    tiers: {
      tier0: true,
      tier1: enableTier1,
      tier2: enableTier2,
    },
    budgets: {
      tier0Max: Math.round(baseBudgets.tier0Max * multiplier),
      tier1Max: Math.round(baseBudgets.tier1Max * multiplier),
      tier2Max: Math.round(baseBudgets.tier2Max * multiplier),
      totalMax: Math.round(baseBudgets.totalMax * multiplier),
    },
    sanitizationLevel,
    blocks,
    storyboardValidation,
  };
}

/**
 * Assemble prompt blocks respecting constraint budget
 * Drops Tier 2 first, then Tier 1, never Tier 0
 */
export interface AssembledPrompt {
  finalPrompt: string;
  creative: string;
  constraints: {
    tier0: string;
    tier1: string;
    tier2: string;
  };
  stats: {
    creativeChars: number;
    tier0Chars: number;
    tier1Chars: number;
    tier2Chars: number;
    totalConstraintChars: number;
    totalChars: number;
    constraintPercent: number;
    tier2Dropped: boolean;
    tier1Dropped: boolean;
    overBudget: boolean;
    creativeTruncated?: boolean;
  };
}

/**
 * Assemble prompt with constraint budget enforcement
 */
export function assembleWithBudget(
  profile: ConstraintProfile,
  creative: string,
  tier0Block: string,
  tier1Block: string,
  tier2Block: string
): AssembledPrompt {
  const budgets = profile.budgets;
  
  // Truncate each tier to its budget
  const tier0 = tier0Block.slice(0, budgets.tier0Max);
  let tier1 = profile.tiers.tier1 ? tier1Block.slice(0, budgets.tier1Max) : "";
  let tier2 = profile.tiers.tier2 ? tier2Block.slice(0, budgets.tier2Max) : "";
  
  // Calculate totals
  let totalConstraints = tier0.length + tier1.length + tier2.length;
  let totalChars = creative.length + totalConstraints;
  
  let tier2Dropped = false;
  let tier1Dropped = false;
  
  // If over budget, drop Tier 2 first
  if (totalChars > budgets.totalMax && tier2.length > 0) {
    tier2 = "";
    tier2Dropped = true;
    totalConstraints = tier0.length + tier1.length;
    totalChars = creative.length + totalConstraints;
  }
  
  // If still over budget, drop Tier 1
  if (totalChars > budgets.totalMax && tier1.length > 0) {
    tier1 = "";
    tier1Dropped = true;
    totalConstraints = tier0.length;
    totalChars = creative.length + totalConstraints;
  }
  
  // LAST RESORT: If still over budget, truncate creative to fit
  let truncatedCreative = creative;
  let creativeTruncated = false;
  if (totalChars > budgets.totalMax) {
    const availableForCreative = budgets.totalMax - tier0.length;
    if (availableForCreative > 50) {
      truncatedCreative = creative.slice(0, availableForCreative - 3) + "...";
      creativeTruncated = true;
      totalChars = tier0.length + truncatedCreative.length;
    }
    // If tier0 alone exceeds budget, we still proceed but flag overBudget
  }
  
  // Assemble final prompt (Tier 0 first for injection survival)
  const finalPrompt = [tier0, tier1, tier2, truncatedCreative].filter(Boolean).join("\n\n");
  
  return {
    finalPrompt,
    creative: truncatedCreative,
    constraints: {
      tier0,
      tier1,
      tier2,
    },
    stats: {
      creativeChars: truncatedCreative.length,
      tier0Chars: tier0.length,
      tier1Chars: tier1.length,
      tier2Chars: tier2.length,
      totalConstraintChars: totalConstraints,
      totalChars: finalPrompt.length,
      constraintPercent: Math.round((totalConstraints / totalChars) * 100),
      tier2Dropped,
      tier1Dropped,
      overBudget: finalPrompt.length > budgets.totalMax,
      creativeTruncated,
    },
  };
}

/**
 * Get sanitization level for a mode/provider/story setting combination
 */
export function getEffectiveSanitizationLevel(
  provider: VideoProvider,
  mode: StoryMode,
  storySanitizationLevel?: SanitizationLevel,
  brutalityMode?: boolean
): SanitizationLevel {
  // Runway ALWAYS strict - non-negotiable
  if (provider === "runway") {
    return "strict";
  }
  
  // Story-level override takes precedence (including explicit "off")
  if (storySanitizationLevel !== undefined) {
    return storySanitizationLevel;
  }
  
  // Brutality/spectacle modes skip sanitization for Sora/Luma
  if (brutalityMode || ["brutality", "spectacle"].includes(mode)) {
    return "off";
  }
  
  // Default: soft for Sora/Luma
  return "soft";
}

/**
 * Describe a constraint profile for logging
 */
export function describeProfile(profile: ConstraintProfile): string {
  const enabledBlocks = Object.entries(profile.blocks)
    .filter(([_, enabled]) => enabled)
    .map(([name]) => name);
  
  return `[${profile.name}] tiers=${profile.tiers.tier1 ? "0,1" : "0"}${profile.tiers.tier2 ? ",2" : ""} ` +
    `budget=${profile.budgets.totalMax}c sanitization=${profile.sanitizationLevel} ` +
    `blocks=[${enabledBlocks.join(",")}]`;
}
