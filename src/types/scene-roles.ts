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

// ============================================================================
// Change Type - What changes from beat to beat
// ============================================================================

/**
 * Every cut must change something meaningful (no montage drift).
 * This type tracks what changes at each beat.
 */
export type ChangeType = 
  | "info"      // New information revealed
  | "emotion"   // Feeling/tone shift
  | "goal"      // What character wants changes
  | "stakes"    // Why it matters increases
  | "location"; // Physical move with meaning

// ============================================================================
// Scene Roles
// ============================================================================

export type SceneRole =
  | "hook"        // Pattern interrupt, curiosity spike (0-3s)
  | "problem"     // "Here's what's happening to you" (3-8s)
  | "story_a"     // First narrative beat - establish (8-15s)
  | "reset"       // Quick attention reset (15-17s)
  | "story_b"     // Payoff/reveal/transformation (17-30s)
  | "cta"         // Call to action (30-40s)
  | "atmosphere"  // Texture transition, physics glue
  | "establish";  // Wide establishing shot

// ============================================================================
// Coverage Type - Camera Framing for Action vs Identity
// ============================================================================

/**
 * Coverage type determines camera framing and whether face is visible.
 * This is the final authority on I2V vs T2V - coverage overrides soft continuity.
 * 
 * Philosophy:
 * - Face coverage → I2V (preserve identity)
 * - Non-face coverage → T2V (maximize motion freedom)
 */
export type CoverageType =
  | "face"       // Closeup, emotional beat. Identity critical. Use for: reactions, reveals, CTA
  | "body"       // Full-body action. Face visible but secondary. Use for: running, fighting
  | "back"       // Back-turned or silhouette. Face not visible. Use for: sprinting away, dramatic reveals
  | "wide"       // Environment-dominant, figure small. Use for: establishing, chase across landscape
  | "pov"        // First-person, helmet cam, visor view. Use for: diving, falling, subjective action
  | "obscured"   // Face hidden by dust/rain/blur/darkness. Use for: storm scenes, dramatic tension
  | "none";      // Pure spectacle / abstract / environment-only. No character identity needed.

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
 * Phase 5: Sora-first for story-advancing content
 * 
 * Routing philosophy:
 * - hook/reset → Runway (fast, punchy, kinetic - attention mechanics)
 * - story_a/story_b/establish/problem/cta → Sora (narrative, coherence)
 * - atmosphere → Luma (physics, texture, mood glue only)
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
    // Phase 5: Changed from luma → sora (narrative clarity > atmosphere)
    defaultProvider: "sora",
    fallbackProviders: ["luma", "runway"],
    durationRange: [4, 6],
    promptStyle: "director_brief",
    description: "Show the pain point with narrative clarity",
    color: "bg-purple-500",
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
    // Phase 5: Changed from luma → sora (story resolution > atmosphere)
    defaultProvider: "sora",
    fallbackProviders: ["luma", "runway"],
    durationRange: [4, 6],
    promptStyle: "director_brief",
    description: "Call to action, proof, result",
    color: "bg-purple-500",
  },
  atmosphere: {
    role: "atmosphere",
    // Keep Luma for pure texture/physics shots
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
 * Get the provider for a role with tier awareness (LEGACY - use getProviderForRoleWithContext when possible)
 * Volume tier limits Sora usage, Hero tier allows full Sora
 * 
 * @deprecated Use getProviderForRoleWithContext for template-aware routing
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
  
  // Volume tier: limit Sora to 1 scene (story_b preferred, else story_a)
  if (config.defaultProvider === "sora") {
    if (soraUsedCount >= 1) {
      return config.fallbackProviders[0];
    }
    // Allow Sora for story_b or story_a (when no story_b context available)
    if (role === "story_b" || role === "story_a") {
      return "sora";
    }
    // Other Sora-default roles fall back
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

/**
 * Coverage type display info for UI
 */
export const COVERAGE_DISPLAY: Record<CoverageType, { label: string; emoji: string; color: string }> = {
  face: { label: "Face", emoji: "👤", color: "bg-purple-500" },
  body: { label: "Body", emoji: "🏃", color: "bg-blue-500" },
  back: { label: "Back", emoji: "🔙", color: "bg-green-500" },
  wide: { label: "Wide", emoji: "🌄", color: "bg-amber-500" },
  pov: { label: "POV", emoji: "👁️", color: "bg-red-500" },
  obscured: { label: "Obscured", emoji: "🌫️", color: "bg-gray-500" },
  none: { label: "Spectacle", emoji: "✨", color: "bg-pink-500" },
};

/**
 * Default coverage by scene role (fallback when not explicitly set)
 */
export const DEFAULT_COVERAGE_BY_ROLE: Record<SceneRole, CoverageType> = {
  hook: "wide",        // Establish with freedom
  problem: "obscured", // Tension/chaos
  story_a: "body",     // Action-focused
  reset: "back",       // Quick energy burst
  story_b: "body",     // Building to payoff
  cta: "face",         // Emotional connection
  atmosphere: "wide",  // Environmental
  establish: "wide",   // Environmental
};

/**
 * Coverage types that allow maximum motion freedom (T2V)
 * Face is NOT visible, so identity doesn't need preserving
 */
export const MOTION_FREE_COVERAGE: CoverageType[] = ["back", "wide", "pov", "obscured", "none"];

/**
 * Coverage types that need face preservation (I2V when possible)
 */
export const FACE_CRITICAL_COVERAGE: CoverageType[] = ["face"];

/**
 * Coverage that's hybrid - I2V if good reference, T2V if not
 */
export const HYBRID_COVERAGE: CoverageType[] = ["body"];

/**
 * Infer role from narrative position (canonical implementation)
 * Used when scene doesn't have an explicit role assigned.
 * 
 * This is the single source of truth - import this function
 * in UI and edge functions instead of reimplementing.
 */
export function inferRoleFromPosition(sceneIndex: number, totalScenes: number): SceneRole {
  // Handle edge cases
  if (totalScenes <= 0) totalScenes = 6; // Default assumption
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
 * Check if a template/scene-list has story_b role
 * Used to determine if story_a should get Sora in volume tier
 */
export function hasStoryBRole(roles: SceneRole[]): boolean {
  return roles.includes("story_b");
}

/**
 * Get the provider for a role with tier awareness (ENHANCED)
 * 
 * Volume tier logic:
 * - If story_b exists: only story_b gets Sora
 * - If no story_b: story_a gets Sora (for quick_hook-style templates)
 * - Limit: 1 Sora scene total
 * 
 * Hero tier: all story roles get Sora
 */
export function getProviderForRoleWithContext(
  role: SceneRole,
  tier: "volume" | "hero",
  soraUsedCount: number,
  templateRoles: SceneRole[] = []
): VideoProvider {
  const config = getSceneRoleConfig(role);
  
  // Hero tier: always use default provider
  if (tier === "hero") {
    return config.defaultProvider;
  }
  
  // Volume tier: smart Sora limiting
  if (config.defaultProvider === "sora") {
    // Already used Sora quota
    if (soraUsedCount >= 1) {
      return config.fallbackProviders[0];
    }
    
    const hasStoryB = hasStoryBRole(templateRoles);
    
    // If story_b exists, only it gets Sora
    if (hasStoryB) {
      if (role === "story_b") {
        return "sora";
      }
      return config.fallbackProviders[0];
    }
    
    // No story_b in template - allow story_a to use Sora
    if (role === "story_a") {
      return "sora";
    }
    
    // Other Sora-default roles fall back
    return config.fallbackProviders[0];
  }
  
  return config.defaultProvider;
}
