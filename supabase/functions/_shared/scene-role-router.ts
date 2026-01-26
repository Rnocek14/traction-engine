/**
 * Scene Role Router
 * 
 * Deterministic routing from scene roles to providers.
 * Replaces the tag-extraction heuristic approach with explicit role mapping.
 * 
 * Features:
 * - Role-based provider selection
 * - Tier-aware Sora limiting (volume vs hero)
 * - Fallback chain for reliability
 * - Continuity override for chained scenes
 */

export type SceneRole = 
  | "hook" 
  | "problem" 
  | "story_a" 
  | "reset" 
  | "story_b" 
  | "cta" 
  | "atmosphere"
  | "establish";

export type VideoProvider = "sora" | "runway" | "luma";
export type StoryTier = "volume" | "hero";
export type PromptStyle = "runway" | "luma" | "sora";

export interface SceneRoleConfig {
  defaultProvider: VideoProvider;
  fallbackProviders: VideoProvider[];
  durationRange: [number, number];
  promptStyle: PromptStyle;
}

/**
 * Role to provider mapping with fallback chains
 * 
 * Philosophy:
 * - Sora = Story backbone (coherent, cinematic hero moments)
 * - Runway = Attention mechanics (hooks, resets, punchy motion)
 * - Luma = Atmosphere/physics (smoke, water, particles, mood glue)
 */
const ROLE_CONFIGS: Record<SceneRole, SceneRoleConfig> = {
  hook: {
    defaultProvider: "runway",
    fallbackProviders: ["luma", "sora"],
    durationRange: [2, 4],
    promptStyle: "runway",
  },
  problem: {
    defaultProvider: "luma",
    fallbackProviders: ["runway", "sora"],
    durationRange: [4, 6],
    promptStyle: "luma",
  },
  story_a: {
    defaultProvider: "sora",
    fallbackProviders: ["luma", "runway"],
    durationRange: [6, 8],
    promptStyle: "sora",
  },
  reset: {
    defaultProvider: "runway",
    fallbackProviders: ["luma", "sora"],
    durationRange: [2, 3],
    promptStyle: "runway",
  },
  story_b: {
    defaultProvider: "sora",
    fallbackProviders: ["luma", "runway"],
    durationRange: [6, 10],
    promptStyle: "sora",
  },
  cta: {
    defaultProvider: "luma",
    fallbackProviders: ["runway", "sora"],
    durationRange: [4, 6],
    promptStyle: "luma",
  },
  atmosphere: {
    defaultProvider: "luma",
    fallbackProviders: ["runway", "sora"],
    durationRange: [3, 5],
    promptStyle: "luma",
  },
  establish: {
    defaultProvider: "sora",
    fallbackProviders: ["luma", "runway"],
    durationRange: [4, 6],
    promptStyle: "sora",
  },
};

export interface RoleRoutingOptions {
  /** Story tier - affects Sora usage limits */
  tier?: StoryTier;
  /** Number of Sora scenes already used in this story */
  soraUsedCount?: number;
  /** Whether this scene is chained (I2V) from a previous scene */
  isChained?: boolean;
  /** Force a specific provider (user override) */
  forceProvider?: VideoProvider;
  /** All roles in the template (for smart story_a fallback) */
  templateRoles?: SceneRole[];
}

export interface RoleRoutingResult {
  provider: VideoProvider;
  promptStyle: PromptStyle;
  suggestedDuration: number;
  routingReason: string;
  fallbackProviders: VideoProvider[];
}

/**
 * Route a scene to the best provider based on its role
 * 
 * VOLUME TIER LOGIC (improved):
 * - If template has story_b: only story_b gets Sora
 * - If template has NO story_b: story_a gets Sora (for quick_hook-style templates)
 * - Limit: 1 Sora scene total in volume tier
 * 
 * HERO TIER: All story roles get their default provider (Sora for story scenes)
 */
export function routeBySceneRole(
  role: SceneRole,
  options: RoleRoutingOptions = {}
): RoleRoutingResult {
  const config = ROLE_CONFIGS[role] || ROLE_CONFIGS.story_a;
  const { 
    tier = "volume", 
    soraUsedCount = 0, 
    isChained = false, 
    forceProvider,
    templateRoles = []
  } = options;
  
  // Force provider override
  if (forceProvider) {
    return {
      provider: forceProvider,
      promptStyle: getPromptStyleForProvider(forceProvider),
      suggestedDuration: Math.round((config.durationRange[0] + config.durationRange[1]) / 2),
      routingReason: `Forced to ${forceProvider} by user override`,
      fallbackProviders: config.fallbackProviders.filter(p => p !== forceProvider),
    };
  }
  
  // Determine provider based on role and tier
  let provider = config.defaultProvider;
  let routingReason = `Role '${role}' routes to ${provider}`;
  
  // Tier-based Sora limiting
  if (provider === "sora" && tier === "volume") {
    const VOLUME_SORA_LIMIT = 1;
    
    // Check if already used Sora quota
    if (soraUsedCount >= VOLUME_SORA_LIMIT) {
      provider = config.fallbackProviders[0];
      routingReason = `Volume tier: Sora limit (${VOLUME_SORA_LIMIT}) reached, using ${provider}`;
    } else {
      // Smart routing: check if template has story_b
      const hasStoryB = templateRoles.includes("story_b");
      
      if (hasStoryB) {
        // Template has story_b - reserve Sora for it
        if (role === "story_b") {
          // story_b gets Sora
          routingReason = `Volume tier: story_b gets Sora (primary story beat)`;
        } else {
          // Other Sora-default roles fall back
          provider = config.fallbackProviders[0];
          routingReason = `Volume tier: Reserving Sora for story_b, using ${provider} for ${role}`;
        }
      } else {
        // Template has NO story_b - allow story_a to use Sora
        if (role === "story_a") {
          routingReason = `Volume tier: No story_b in template, story_a gets Sora`;
        } else {
          // Other Sora-default roles still fall back
          provider = config.fallbackProviders[0];
          routingReason = `Volume tier: Using ${provider} for ${role} (Sora reserved for story beats)`;
        }
      }
    }
  }
  
  // Chained mode: bias toward consistency
  // Story scenes in chained mode should stick with Sora for continuity
  if (isChained && (role === "story_a" || role === "story_b" || role === "establish")) {
    if (tier === "hero" || (tier === "volume" && role === "story_b")) {
      provider = "sora";
      routingReason = `Chained mode: Using Sora for ${role} continuity`;
    }
  }
  
  const suggestedDuration = Math.round(
    (config.durationRange[0] + config.durationRange[1]) / 2
  );
  
  return {
    provider,
    promptStyle: getPromptStyleForProvider(provider),
    suggestedDuration,
    routingReason,
    fallbackProviders: config.fallbackProviders.filter(p => p !== provider),
  };
}

/**
 * Get prompt style for a provider
 */
function getPromptStyleForProvider(provider: VideoProvider): PromptStyle {
  switch (provider) {
    case "sora": return "sora";
    case "runway": return "runway";
    case "luma": return "luma";
    default: return "sora";
  }
}

/**
 * Get the fallback provider when primary fails
 */
export function getFallbackProvider(
  role: SceneRole,
  failedProvider: VideoProvider
): VideoProvider | null {
  const config = ROLE_CONFIGS[role] || ROLE_CONFIGS.story_a;
  const allProviders = [config.defaultProvider, ...config.fallbackProviders];
  const failedIndex = allProviders.indexOf(failedProvider);
  
  if (failedIndex === -1 || failedIndex >= allProviders.length - 1) {
    return null;
  }
  
  return allProviders[failedIndex + 1];
}

/**
 * Infer a scene role from narrative position if not explicitly set
 * 
 * This is used when GPT doesn't assign a role (legacy scenes)
 */
export function inferRoleFromPosition(
  sceneIndex: number,
  totalScenes: number
): SceneRole {
  // Simple position-based inference
  if (sceneIndex === 0) return "hook";
  if (sceneIndex === totalScenes - 1) return "cta";
  
  const position = sceneIndex / totalScenes;
  
  if (position < 0.25) return "problem";
  if (position < 0.5) return "story_a";
  if (position < 0.65) return "reset";
  if (position < 0.85) return "story_b";
  return "cta";
}

/**
 * Get the duration range for a role
 */
export function getDurationRangeForRole(role: SceneRole): [number, number] {
  return ROLE_CONFIGS[role]?.durationRange || [4, 6];
}

/**
 * Validate and clamp duration to role's valid range
 */
export function clampDurationToRole(duration: number, role: SceneRole): number {
  const [min, max] = getDurationRangeForRole(role);
  return Math.max(min, Math.min(max, duration));
}
