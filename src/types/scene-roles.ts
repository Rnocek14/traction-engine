/**
 * Scene Role Type System
 * 
 * Defines scene roles for deterministic provider routing.
 * Each role maps to an optimal provider based on the role's purpose.
 * 
 * Philosophy:
 * - Sora = Story backbone (coherent, cinematic hero moments)
 * - Runway = Attention mechanics (hooks, brainrot resets, punchy motion)
 * - Luma = Atmosphere/physics (smoke, water, particles, mood glue)
 */

export type SceneRole = 
  | "hook"        // Pattern interrupt, curiosity spike (0-3s)
  | "problem"     // "Here's what's happening to you" (3-8s)
  | "story_a"     // First narrative beat - establish (8-15s)
  | "reset"       // Quick attention reset (15-17s)
  | "story_b"     // Payoff/reveal/transformation (17-30s)
  | "cta"         // Call to action (30-40s)
  | "atmosphere"  // Texture transition, physics glue
  | "establish";  // Wide establishing shot

export type VideoProvider = "sora" | "runway" | "luma";
export type PromptStyle = "motion_first" | "physics_first" | "director_brief";

export interface SceneRoleConfig {
  role: SceneRole;
  /** Default provider for this role */
  defaultProvider: VideoProvider;
  /** Fallback chain if primary fails */
  fallbackProviders: VideoProvider[];
  /** Valid duration range [min, max] in seconds */
  durationRange: [number, number];
  /** Which prompt compiler style to use */
  promptStyle: PromptStyle;
  /** Human-readable description */
  description: string;
  /** Provider display color for UI */
  color: string;
}

/**
 * Scene role configurations with default providers and fallbacks
 * 
 * Routing logic:
 * - hook/reset → Runway (fast, punchy, kinetic)
 * - story_a/story_b/establish → Sora (coherence, cinematic)
 * - problem/atmosphere → Luma (physics, mood)
 * - cta → Luma (but consider template-first in future)
 */
export const SCENE_ROLE_CONFIGS: Record<SceneRole, SceneRoleConfig> = {
  hook: {
    role: "hook",
    defaultProvider: "runway",
    fallbackProviders: ["luma", "sora"],
    durationRange: [2, 4],
    promptStyle: "motion_first",
    description: "Pattern interrupt, curiosity spike",
    color: "bg-green-500",
  },
  problem: {
    role: "problem",
    defaultProvider: "luma",
    fallbackProviders: ["runway", "sora"],
    durationRange: [4, 6],
    promptStyle: "physics_first",
    description: "Show the pain point with atmospheric mood",
    color: "bg-blue-500",
  },
  story_a: {
    role: "story_a",
    defaultProvider: "sora",
    fallbackProviders: ["luma", "runway"],
    durationRange: [6, 8],
    promptStyle: "director_brief",
    description: "First narrative beat - establish the story",
    color: "bg-purple-500",
  },
  reset: {
    role: "reset",
    defaultProvider: "runway",
    fallbackProviders: ["luma", "sora"],
    durationRange: [2, 3],
    promptStyle: "motion_first",
    description: "Quick attention reset, micro-cut",
    color: "bg-green-500",
  },
  story_b: {
    role: "story_b",
    defaultProvider: "sora",
    fallbackProviders: ["luma", "runway"],
    durationRange: [6, 10],
    promptStyle: "director_brief",
    description: "Payoff, reveal, transformation",
    color: "bg-purple-500",
  },
  cta: {
    role: "cta",
    defaultProvider: "luma",
    fallbackProviders: ["runway", "sora"],
    durationRange: [4, 6],
    promptStyle: "physics_first",
    description: "Call to action, proof, result",
    color: "bg-blue-500",
  },
  atmosphere: {
    role: "atmosphere",
    defaultProvider: "luma",
    fallbackProviders: ["runway", "sora"],
    durationRange: [3, 5],
    promptStyle: "physics_first",
    description: "Texture transition, physics glue",
    color: "bg-blue-500",
  },
  establish: {
    role: "establish",
    defaultProvider: "sora",
    fallbackProviders: ["luma", "runway"],
    durationRange: [4, 6],
    promptStyle: "director_brief",
    description: "Wide establishing shot, environment",
    color: "bg-purple-500",
  },
};

/**
 * Get config for a scene role
 */
export function getSceneRoleConfig(role: SceneRole): SceneRoleConfig {
  return SCENE_ROLE_CONFIGS[role] || SCENE_ROLE_CONFIGS.story_a;
}

/**
 * Get the provider for a role with tier awareness
 * Volume tier limits Sora usage, Hero tier allows full Sora
 */
export function getProviderForRole(
  role: SceneRole,
  tier: "volume" | "hero" = "volume",
  soraUsedCount: number = 0
): VideoProvider {
  const config = getSceneRoleConfig(role);
  
  // Hero tier: always use default provider
  if (tier === "hero") {
    return config.defaultProvider;
  }
  
  // Volume tier: limit Sora to 1 scene (story_b only)
  if (config.defaultProvider === "sora") {
    // Allow Sora only for story_b in volume tier, and only 1 usage
    if (role === "story_b" && soraUsedCount === 0) {
      return "sora";
    }
    // Otherwise use first fallback
    return config.fallbackProviders[0];
  }
  
  return config.defaultProvider;
}

/**
 * Get fallback provider when primary fails
 */
export function getFallbackProvider(
  role: SceneRole,
  failedProvider: VideoProvider
): VideoProvider | null {
  const config = getSceneRoleConfig(role);
  const allProviders = [config.defaultProvider, ...config.fallbackProviders];
  const failedIndex = allProviders.indexOf(failedProvider);
  
  if (failedIndex === -1 || failedIndex >= allProviders.length - 1) {
    return null; // No more fallbacks
  }
  
  return allProviders[failedIndex + 1];
}

/**
 * Provider display info for UI
 */
export const PROVIDER_DISPLAY: Record<VideoProvider, { label: string; emoji: string; color: string }> = {
  sora: { label: "Sora", emoji: "🎬", color: "bg-purple-500" },
  runway: { label: "Runway", emoji: "🚀", color: "bg-green-500" },
  luma: { label: "Luma", emoji: "✨", color: "bg-blue-500" },
};

/**
 * Role display info for UI badges
 */
export const ROLE_DISPLAY: Record<SceneRole, { label: string; shortLabel: string }> = {
  hook: { label: "Hook", shortLabel: "HK" },
  problem: { label: "Problem", shortLabel: "PR" },
  story_a: { label: "Story A", shortLabel: "SA" },
  reset: { label: "Reset", shortLabel: "RS" },
  story_b: { label: "Story B", shortLabel: "SB" },
  cta: { label: "CTA", shortLabel: "CT" },
  atmosphere: { label: "Atmosphere", shortLabel: "AT" },
  establish: { label: "Establish", shortLabel: "ES" },
};
