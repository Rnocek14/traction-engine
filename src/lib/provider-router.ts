/**
 * Provider Router - Intelligent video provider selection
 * 
 * Routes clips to the optimal provider based on:
 * - Shot type (close-up, wide, establishing, etc.)
 * - Genre/mood (horror, action, documentary, etc.)
 * - Clip characteristics (motion, lighting, character focus)
 * - Style guide preferences
 */

import type { VideoProvider, ProviderStrength } from "@/types/video-provider-types";
import { PROVIDER_CAPABILITIES } from "@/types/video-provider-types";
import type { Clip, StyleGuide } from "@/types/timeline-types";

/**
 * Genre presets with provider routing hints
 */
export type GenrePreset = 
  | "default"
  | "horror"
  | "action"
  | "documentary"
  | "commercial"
  | "cinematic"
  | "vlog"
  | "stylized";

export interface GenreConfig {
  genre: GenrePreset;
  label: string;
  description: string;
  /** Preferred provider for character/dialogue shots */
  characterProvider: VideoProvider;
  /** Preferred provider for establishing/broll */
  environmentProvider: VideoProvider;
  /** Default provider when no routing rule applies */
  defaultProvider: VideoProvider;
  /** Style overrides for this genre */
  styleOverrides: Partial<StyleGuide>;
  /** Provider preferences for specific shot types */
  shotTypeRouting: Partial<Record<string, VideoProvider>>;
}

/**
 * Genre preset configurations
 */
export const GENRE_PRESETS: Record<GenrePreset, GenreConfig> = {
  default: {
    genre: "default",
    label: "Default",
    description: "Balanced routing for general content",
    characterProvider: "sora",
    environmentProvider: "luma",
    defaultProvider: "sora",
    styleOverrides: {},
    shotTypeRouting: {},
  },
  horror: {
    genre: "horror",
    label: "Horror / Dark",
    description: "Low-light, atmospheric, tension-building",
    characterProvider: "runway", // Gen-4 handles dark scenes better
    environmentProvider: "luma",  // Great for moody environments
    defaultProvider: "runway",
    styleOverrides: {
      lighting: "dramatic",
      color_grade: "cool",
      depth_of_field: "shallow",
      motion_style: "handheld",
      mood: "tense and unsettling",
      custom_notes: "Low-key lighting, single motivated practical, strong falloff. Cooler shadows, slightly desaturated mids. Slower camera moves, longer lens, avoid fast pans.",
    },
    shotTypeRouting: {
      "close-up": "runway",
      "extreme-close": "runway",
      "medium-close": "runway",
      "wide": "luma",
      "extreme-wide": "luma",
      "pov": "runway",
      "dutch": "runway",
    },
  },
  action: {
    genre: "action",
    label: "Action / Dynamic",
    description: "Fast motion, physics, energy",
    characterProvider: "sora",
    environmentProvider: "luma", // Best motion physics
    defaultProvider: "luma",
    styleOverrides: {
      motion_style: "tracking",
      camera_style: "dynamic",
      mood: "high energy and kinetic",
    },
    shotTypeRouting: {
      "tracking": "luma",
      "crane": "luma",
      "close-up": "sora",
      "medium": "sora",
    },
  },
  documentary: {
    genre: "documentary",
    label: "Documentary",
    description: "Authentic, natural, handheld",
    characterProvider: "sora",
    environmentProvider: "luma",
    defaultProvider: "sora",
    styleOverrides: {
      camera_style: "documentary",
      lighting: "natural",
      motion_style: "handheld",
      film_stock: "digital",
      mood: "authentic and intimate",
    },
    shotTypeRouting: {
      "over-shoulder": "sora",
      "medium": "sora",
      "wide": "luma",
    },
  },
  commercial: {
    genre: "commercial",
    label: "Commercial / Product",
    description: "Clean, polished, high production value",
    characterProvider: "sora",
    environmentProvider: "sora",
    defaultProvider: "sora",
    styleOverrides: {
      lighting: "studio",
      color_grade: "neutral",
      depth_of_field: "shallow",
      camera_style: "cinematic",
      mood: "aspirational and polished",
    },
    shotTypeRouting: {
      "close-up": "sora",
      "extreme-close": "sora",
    },
  },
  cinematic: {
    genre: "cinematic",
    label: "Cinematic / Film",
    description: "Hollywood-style production quality",
    characterProvider: "runway", // Best consistency
    environmentProvider: "luma",
    defaultProvider: "sora",
    styleOverrides: {
      camera_style: "cinematic",
      film_stock: "portra",
      depth_of_field: "shallow",
      lens: "85mm",
      mood: "dramatic and immersive",
    },
    shotTypeRouting: {
      "close-up": "runway",
      "medium-close": "runway",
      "crane": "luma",
      "tracking": "luma",
      "extreme-wide": "luma",
    },
  },
  vlog: {
    genre: "vlog",
    label: "Vlog / Social",
    description: "Casual, direct, fast turnaround",
    characterProvider: "sora",
    environmentProvider: "luma",
    defaultProvider: "luma", // Fastest generation
    styleOverrides: {
      camera_style: "vlog",
      lighting: "natural",
      motion_style: "handheld",
      lens: "24mm",
      mood: "casual and authentic",
    },
    shotTypeRouting: {
      "pov": "luma",
      "medium": "sora",
    },
  },
  stylized: {
    genre: "stylized",
    label: "Stylized / Art",
    description: "Creative, experimental, unique looks",
    characterProvider: "sora",
    environmentProvider: "sora",
    defaultProvider: "sora",
    styleOverrides: {
      film_stock: "cinestill",
      color_grade: "high_contrast",
      mood: "artistic and unconventional",
    },
    shotTypeRouting: {
      "dutch": "sora",
    },
  },
};

/**
 * Shot type to provider strength mapping
 */
const SHOT_TYPE_STRENGTHS: Record<string, ProviderStrength[]> = {
  "extreme-wide": ["environment_realism", "establishing_shots", "atmospheric"],
  "wide": ["environment_realism", "establishing_shots"],
  "medium-wide": ["motion_physics", "action_sequences"],
  "medium": ["character_consistency", "portrait_quality"],
  "medium-close": ["character_consistency", "portrait_quality"],
  "close-up": ["portrait_quality", "character_consistency"],
  "extreme-close": ["portrait_quality"],
  "over-shoulder": ["character_consistency"],
  "pov": ["motion_physics", "environment_realism"],
  "dutch": ["atmospheric", "low_light"],
  "low-angle": ["character_consistency", "atmospheric"],
  "high-angle": ["environment_realism", "establishing_shots"],
  "tracking": ["motion_physics", "action_sequences"],
  "crane": ["environment_realism", "establishing_shots", "motion_physics"],
};

/**
 * Get the best provider for a given set of strength requirements
 */
function getBestProviderForStrengths(
  requiredStrengths: ProviderStrength[],
  preferFast: boolean = false
): VideoProvider {
  const providers: VideoProvider[] = ["sora", "runway", "luma"];
  
  let bestProvider: VideoProvider = "sora";
  let bestScore = 0;
  
  for (const provider of providers) {
    const capabilities = PROVIDER_CAPABILITIES[provider];
    let score = 0;
    
    for (const strength of requiredStrengths) {
      if (capabilities.strengths.includes(strength)) {
        score += 1;
      }
    }
    
    // Bonus for fast generation if preferred
    if (preferFast && capabilities.strengths.includes("fast_generation")) {
      score += 0.5;
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestProvider = provider;
    }
  }
  
  return bestProvider;
}

export interface RoutingDecision {
  provider: VideoProvider;
  reason: string;
  confidence: "high" | "medium" | "low";
  alternativeProvider?: VideoProvider;
}

/**
 * Route a clip to the optimal provider based on its characteristics
 */
export function routeClipToProvider(
  clip: Clip,
  styleGuide?: StyleGuide | null,
  genrePreset: GenrePreset = "default",
  preferFast: boolean = false
): RoutingDecision {
  const genreConfig = GENRE_PRESETS[genrePreset];
  
  // 1. Check for explicit shot type routing
  const shotType = clip.camera_direction;
  if (shotType && genreConfig.shotTypeRouting[shotType]) {
    return {
      provider: genreConfig.shotTypeRouting[shotType]!,
      reason: `Genre preset routes ${shotType} shots to this provider`,
      confidence: "high",
    };
  }
  
  // 2. Infer from shot type strengths
  if (shotType && SHOT_TYPE_STRENGTHS[shotType]) {
    const requiredStrengths = SHOT_TYPE_STRENGTHS[shotType];
    const provider = getBestProviderForStrengths(requiredStrengths, preferFast);
    
    // Check if this is a "character" shot (close/medium)
    const isCharacterShot = ["close-up", "medium-close", "medium", "over-shoulder", "extreme-close"]
      .includes(shotType);
    
    if (isCharacterShot) {
      return {
        provider: genreConfig.characterProvider,
        reason: "Character/dialogue shot routed to consistency-focused provider",
        confidence: "high",
        alternativeProvider: provider,
      };
    }
    
    // Check if this is an environment shot
    const isEnvironmentShot = ["extreme-wide", "wide", "crane", "tracking", "high-angle"]
      .includes(shotType);
    
    if (isEnvironmentShot) {
      return {
        provider: genreConfig.environmentProvider,
        reason: "Environment/establishing shot routed to motion-focused provider",
        confidence: "high",
        alternativeProvider: provider,
      };
    }
    
    return {
      provider,
      reason: `Best match for ${shotType} shot requirements`,
      confidence: "medium",
    };
  }
  
  // 3. Analyze prompt for hints
  const prompt = (clip.prompt || "").toLowerCase();
  
  // Character/face keywords
  if (/\b(face|eyes|portrait|closeup|character|person|dialogue|speaking|talking)\b/.test(prompt)) {
    return {
      provider: genreConfig.characterProvider,
      reason: "Prompt indicates character focus",
      confidence: "medium",
    };
  }
  
  // Environment/motion keywords
  if (/\b(landscape|environment|establishing|aerial|drone|moving|running|action|explosion|chase)\b/.test(prompt)) {
    return {
      provider: genreConfig.environmentProvider,
      reason: "Prompt indicates environment/motion focus",
      confidence: "medium",
    };
  }
  
  // Horror/dark keywords
  if (/\b(dark|shadow|horror|creepy|scary|night|dim|moody|tension)\b/.test(prompt)) {
    return {
      provider: "runway",
      reason: "Dark/horror content benefits from Runway's low-light handling",
      confidence: "medium",
      alternativeProvider: "luma",
    };
  }
  
  // 4. Fall back to genre default
  return {
    provider: preferFast ? "luma" : genreConfig.defaultProvider,
    reason: preferFast ? "Fast generation preferred" : "Using genre default provider",
    confidence: "low",
  };
}

/**
 * Route multiple clips and return routing decisions
 */
export function routeClips(
  clips: Clip[],
  styleGuide?: StyleGuide | null,
  genrePreset: GenrePreset = "default",
  preferFast: boolean = false
): Map<string, RoutingDecision> {
  const decisions = new Map<string, RoutingDecision>();
  
  for (const clip of clips) {
    decisions.set(clip.id, routeClipToProvider(clip, styleGuide, genrePreset, preferFast));
  }
  
  return decisions;
}

/**
 * Get routing summary for a set of clips
 */
export function getRoutingSummary(
  clips: Clip[],
  styleGuide?: StyleGuide | null,
  genrePreset: GenrePreset = "default"
): { sora: number; runway: number; luma: number } {
  const decisions = routeClips(clips, styleGuide, genrePreset);
  
  const summary = { sora: 0, runway: 0, luma: 0 };
  for (const decision of decisions.values()) {
    summary[decision.provider]++;
  }
  
  return summary;
}

/**
 * Merge style guide with genre preset overrides
 */
export function mergeStyleWithGenre(
  styleGuide: StyleGuide | undefined | null,
  genrePreset: GenrePreset
): StyleGuide {
  const genreConfig = GENRE_PRESETS[genrePreset];
  
  return {
    ...genreConfig.styleOverrides,
    ...(styleGuide || {}),
  };
}
