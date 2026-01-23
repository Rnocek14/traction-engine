/**
 * Video Provider Types and Capabilities
 * Unified abstraction for Sora 2, Runway Gen-3/Gen-4, and Luma Dream Machine
 */

export type VideoProvider = "sora" | "runway" | "luma";

/**
 * Provider-specific size formats
 */
export type SoraSize = "720x1280" | "1280x720" | "1024x1792" | "1792x1024";
export type RunwaySize = "720:1280" | "1280:720" | "1280:768" | "768:1280";
export type LumaSize = "720x1280" | "1280x720" | "1024x1024";

/**
 * Provider-specific duration constraints
 */
export type SoraDuration = 4 | 8 | 12;
export type RunwayDuration = 5 | 10;
export type LumaDuration = 5 | 10;

/**
 * Unified video size with provider-specific mappings
 */
export interface VideoSizeOption {
  value: string;
  label: string;
  aspectRatio: string;
  soraValue: SoraSize;
  runwayValue: RunwaySize;
  lumaValue: LumaSize;
}

export const UNIFIED_SIZE_OPTIONS: VideoSizeOption[] = [
  {
    value: "vertical",
    label: "9:16 Vertical (720p)",
    aspectRatio: "9:16",
    soraValue: "720x1280",
    runwayValue: "720:1280",
    lumaValue: "720x1280",
  },
  {
    value: "landscape",
    label: "16:9 Landscape (720p)",
    aspectRatio: "16:9",
    soraValue: "1280x720",
    runwayValue: "1280:720",
    lumaValue: "1280x720",
  },
  {
    value: "vertical_pro",
    label: "9:16 Pro",
    aspectRatio: "9:16",
    soraValue: "1024x1792",
    runwayValue: "768:1280",
    lumaValue: "720x1280", // Luma doesn't have higher res vertical
  },
  {
    value: "landscape_pro",
    label: "16:9 Pro",
    aspectRatio: "16:9",
    soraValue: "1792x1024",
    runwayValue: "1280:768",
    lumaValue: "1280x720", // Luma doesn't have higher res landscape
  },
  {
    value: "square",
    label: "1:1 Square",
    aspectRatio: "1:1",
    soraValue: "720x1280", // Fallback - Sora doesn't support square
    runwayValue: "720:1280", // Fallback - Runway doesn't support square
    lumaValue: "1024x1024",
  },
];

/**
 * Provider capability definitions
 */
export interface ProviderCapabilities {
  provider: VideoProvider;
  displayName: string;
  models: ProviderModel[];
  durations: number[];
  sizes: string[];
  supportsImageToVideo: boolean;
  supportsKeyframes: boolean;
  maxKeyframes: number;
  creditsPerSecond: Record<string, number>;
  maxDuration: number;
  /** Strengths - used for smart routing */
  strengths: ProviderStrength[];
}

export type ProviderStrength = 
  | "character_consistency"
  | "motion_physics"
  | "environment_realism"
  | "low_light"
  | "action_sequences"
  | "portrait_quality"
  | "establishing_shots"
  | "atmospheric"
  | "fast_generation";

export interface ProviderModel {
  id: string;
  label: string;
  quality: "draft" | "standard" | "pro";
  description: string;
}

export const SORA_CAPABILITIES: ProviderCapabilities = {
  provider: "sora",
  displayName: "Sora 2",
  models: [
    { id: "sora-2", label: "Sora 2", quality: "standard", description: "Fast, high-quality" },
    { id: "sora-2-pro", label: "Sora 2 Pro", quality: "pro", description: "Maximum quality, slower" },
  ],
  durations: [4, 8, 12],
  sizes: ["720x1280", "1280x720", "1024x1792", "1792x1024"],
  supportsImageToVideo: true,
  supportsKeyframes: false,
  maxKeyframes: 1,
  creditsPerSecond: {
    "sora-2": 15,
    "sora-2-pro": 30,
  },
  maxDuration: 12,
  strengths: ["portrait_quality", "atmospheric", "establishing_shots"],
};

export const RUNWAY_CAPABILITIES: ProviderCapabilities = {
  provider: "runway",
  displayName: "Runway Gen-4",
  models: [
    { id: "gen3a_turbo", label: "Gen-3α Turbo", quality: "draft", description: "Fastest generation" },
    { id: "gen3a", label: "Gen-3α", quality: "standard", description: "Higher quality, slower" },
    { id: "gen4_turbo", label: "Gen-4 Turbo", quality: "pro", description: "Best consistency" },
  ],
  durations: [5, 10],
  sizes: ["720:1280", "1280:720", "768:1280", "1280:768"],
  supportsImageToVideo: true,
  supportsKeyframes: true,
  maxKeyframes: 2,
  creditsPerSecond: {
    "gen3a_turbo": 5,
    "gen3a": 10,
    "gen4_turbo": 20,
  },
  maxDuration: 10,
  strengths: ["character_consistency", "portrait_quality", "low_light"],
};

export const LUMA_CAPABILITIES: ProviderCapabilities = {
  provider: "luma",
  displayName: "Luma Ray2",
  models: [
    { id: "ray2", label: "Ray2", quality: "standard", description: "Natural motion, realistic physics" },
    { id: "ray2-flash", label: "Ray2 Flash", quality: "draft", description: "Fast generation" },
  ],
  durations: [5, 10],
  sizes: ["720x1280", "1280x720", "1024x1024"],
  supportsImageToVideo: true,
  supportsKeyframes: true,
  maxKeyframes: 2,
  creditsPerSecond: {
    "ray2": 8,
    "ray2-flash": 4,
  },
  maxDuration: 10,
  strengths: ["motion_physics", "environment_realism", "action_sequences", "atmospheric", "fast_generation"],
};

export const PROVIDER_CAPABILITIES: Record<VideoProvider, ProviderCapabilities> = {
  sora: SORA_CAPABILITIES,
  runway: RUNWAY_CAPABILITIES,
  luma: LUMA_CAPABILITIES,
};

/**
 * Quality tier configurations per provider
 */
export interface QualityTierConfig {
  tier: "draft" | "standard" | "pro";
  label: string;
  model: string;
  seconds: number;
  size: string;
  description: string;
  estimatedCredits: number;
}

export const SORA_QUALITY_TIERS: QualityTierConfig[] = [
  {
    tier: "draft",
    label: "Draft",
    model: "sora-2",
    seconds: 4,
    size: "720x1280",
    description: "Fast preview",
    estimatedCredits: 60,
  },
  {
    tier: "standard",
    label: "Standard",
    model: "sora-2",
    seconds: 8,
    size: "720x1280",
    description: "Balanced",
    estimatedCredits: 120,
  },
  {
    tier: "pro",
    label: "Pro",
    model: "sora-2-pro",
    seconds: 4,
    size: "1024x1792",
    description: "Best quality",
    estimatedCredits: 120,
  },
];

export const RUNWAY_QUALITY_TIERS: QualityTierConfig[] = [
  {
    tier: "draft",
    label: "Turbo",
    model: "gen3a_turbo",
    seconds: 5,
    size: "720:1280",
    description: "Fastest",
    estimatedCredits: 25,
  },
  {
    tier: "standard",
    label: "Quality",
    model: "gen3a",
    seconds: 10,
    size: "720:1280",
    description: "Higher fidelity",
    estimatedCredits: 100,
  },
  {
    tier: "pro",
    label: "Gen-4",
    model: "gen4_turbo",
    seconds: 10,
    size: "1280:720",
    description: "Best consistency",
    estimatedCredits: 200,
  },
];

export const LUMA_QUALITY_TIERS: QualityTierConfig[] = [
  {
    tier: "draft",
    label: "Flash",
    model: "ray2-flash",
    seconds: 5,
    size: "720x1280",
    description: "Fast preview",
    estimatedCredits: 20,
  },
  {
    tier: "standard",
    label: "Ray2",
    model: "ray2",
    seconds: 5,
    size: "720x1280",
    description: "Natural motion",
    estimatedCredits: 40,
  },
  {
    tier: "pro",
    label: "Ray2 10s",
    model: "ray2",
    seconds: 10,
    size: "1280x720",
    description: "Extended duration",
    estimatedCredits: 80,
  },
];

export const QUALITY_TIERS_BY_PROVIDER: Record<VideoProvider, QualityTierConfig[]> = {
  sora: SORA_QUALITY_TIERS,
  runway: RUNWAY_QUALITY_TIERS,
  luma: LUMA_QUALITY_TIERS,
};

/**
 * Convert Sora size format to Runway format
 */
export function soraToRunwaySize(soraSize: SoraSize): RunwaySize {
  const mapping: Record<SoraSize, RunwaySize> = {
    "720x1280": "720:1280",
    "1280x720": "1280:720",
    "1024x1792": "768:1280",
    "1792x1024": "1280:768",
  };
  return mapping[soraSize] || "720:1280";
}

/**
 * Convert Runway size format to Sora format
 */
export function runwayToSoraSize(runwaySize: RunwaySize): SoraSize {
  const mapping: Record<RunwaySize, SoraSize> = {
    "720:1280": "720x1280",
    "1280:720": "1280x720",
    "768:1280": "1024x1792",
    "1280:768": "1792x1024",
  };
  return mapping[runwaySize] || "720x1280";
}

/**
 * Convert Sora size to Luma format
 */
export function soraToLumaSize(soraSize: SoraSize): LumaSize {
  const mapping: Record<SoraSize, LumaSize> = {
    "720x1280": "720x1280",
    "1280x720": "1280x720",
    "1024x1792": "720x1280", // Luma max is 720p
    "1792x1024": "1280x720",
  };
  return mapping[soraSize] || "720x1280";
}

/**
 * Map Sora duration to nearest Runway duration
 */
export function soraToRunwayDuration(soraDuration: SoraDuration): RunwayDuration {
  if (soraDuration <= 5) return 5;
  return 10;
}

/**
 * Map Runway duration to nearest Sora duration
 */
export function runwayToSoraDuration(runwayDuration: RunwayDuration): SoraDuration {
  if (runwayDuration === 5) return 4;
  return 8;
}

/**
 * Map Sora duration to Luma duration
 */
export function soraToLumaDuration(soraDuration: SoraDuration): LumaDuration {
  if (soraDuration <= 5) return 5;
  return 10;
}

/**
 * Get the optimal provider duration for a requested timeline duration.
 * Uses the provider's capabilities to select the smallest valid duration >= requested.
 * 
 * @param provider - The video provider ("sora" | "runway" | "luma")
 * @param requestedSeconds - The exact timeline clip duration (source of truth)
 * @param model - Optional model override (unused for now, but allows future model-specific durations)
 * @returns { providerSeconds, requestedSeconds } - Provider bucket and original request
 */
export function getProviderDuration(
  provider: VideoProvider,
  requestedSeconds: number,
  _model?: string
): { providerSeconds: number; requestedSeconds: number } {
  const capabilities = PROVIDER_CAPABILITIES[provider];
  const validDurations = capabilities.durations;
  
  // Find smallest valid duration >= requested, or max if requested exceeds all
  let providerSeconds = validDurations[validDurations.length - 1]; // Default to max
  for (const d of validDurations) {
    if (d >= requestedSeconds) {
      providerSeconds = d;
      break;
    }
  }
  
  return { providerSeconds, requestedSeconds };
}

/** Minimum scene duration for quality video generation */
export const MIN_SCENE_DURATION = 3;

/**
 * Check if a timeline duration is too short for quality video generation
 */
export function isClipDurationTooShort(requestedSeconds: number): boolean {
  return requestedSeconds < MIN_SCENE_DURATION;
}

/**
 * Check if a timeline duration exceeds provider max and needs splitting
 */
export function isClipDurationTooLong(provider: VideoProvider, requestedSeconds: number): boolean {
  const capabilities = PROVIDER_CAPABILITIES[provider];
  return requestedSeconds > capabilities.maxDuration;
}

/**
 * Get provider display info
 */
export function getProviderDisplayInfo(provider: VideoProvider): { icon: string; label: string; color: string } {
  switch (provider) {
    case "runway":
      return { icon: "Zap", label: "Runway", color: "text-green-500" };
    case "luma":
      return { icon: "Sun", label: "Luma", color: "text-amber-500" };
    default:
      return { icon: "Sparkles", label: "Sora", color: "text-violet-500" };
  }
}

/**
 * Calculate estimated cost for a generation
 */
export function estimateGenerationCredits(
  provider: VideoProvider,
  model: string,
  duration: number,
  clipCount: number = 1
): number {
  const capabilities = PROVIDER_CAPABILITIES[provider];
  const creditsPerSecond = capabilities.creditsPerSecond[model] || 10;
  return creditsPerSecond * duration * clipCount;
}
