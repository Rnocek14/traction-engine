/**
 * Story Templates Library
 * 
 * Pre-defined story structures with role assignments.
 * Each template defines the narrative arc and duration targets.
 */

import type { SceneRole } from "@/types/scene-roles";

export type StoryTier = "volume" | "hero";

export interface StoryTemplateScene {
  role: SceneRole;
  durationTarget: number;
  promptGuidance: string;
}

export interface StoryTemplate {
  id: string;
  name: string;
  description: string;
  /** Target total duration in seconds */
  targetDuration: number;
  /** Ordered list of scene roles */
  scenes: StoryTemplateScene[];
  /** Recommended tier for this template */
  recommendedTier: StoryTier;
}

/**
 * Tier configurations
 * - Volume: Fast iteration, limited Sora usage
 * - Hero: Full quality, more Sora scenes
 */
export interface TierConfig {
  /** Maximum number of Sora scenes allowed */
  soraSceneLimit: number;
  /** Prioritize quality over speed */
  qualityPriority: boolean;
  /** Transition style between clips */
  transitionStyle: "fast" | "smooth";
}

export const TIER_CONFIGS: Record<StoryTier, TierConfig> = {
  volume: {
    soraSceneLimit: 1,
    qualityPriority: false,
    transitionStyle: "fast",
  },
  hero: {
    soraSceneLimit: 4,
    qualityPriority: true,
    transitionStyle: "smooth",
  },
};

/**
 * Pre-defined story templates
 */
export const STORY_TEMPLATES: StoryTemplate[] = [
  {
    id: "social_short",
    name: "Social Short (25-40s)",
    description: "Standard TikTok/Reels format with attention resets",
    targetDuration: 35,
    recommendedTier: "volume",
    scenes: [
      {
        role: "hook",
        durationTarget: 3,
        promptGuidance: "Pattern interrupt - curiosity spike, fast motion",
      },
      {
        role: "problem",
        durationTarget: 5,
        promptGuidance: "Show the pain point with atmospheric mood",
      },
      {
        role: "story_a",
        durationTarget: 7,
        promptGuidance: "First narrative beat - establish the situation",
      },
      {
        role: "reset",
        durationTarget: 2,
        promptGuidance: "Quick attention reset - micro-cut, whip pan",
      },
      {
        role: "story_b",
        durationTarget: 8,
        promptGuidance: "Payoff, reveal, transformation - the hero moment",
      },
      {
        role: "cta",
        durationTarget: 5,
        promptGuidance: "Call to action, proof, result",
      },
    ],
  },
  {
    id: "quick_hook",
    name: "Quick Hook (15-20s)",
    description: "Fast format for testing hooks",
    targetDuration: 18,
    recommendedTier: "volume",
    scenes: [
      {
        role: "hook",
        durationTarget: 3,
        promptGuidance: "Immediate attention grab",
      },
      {
        role: "story_a",
        durationTarget: 8,
        promptGuidance: "Combined problem and solution",
      },
      {
        role: "cta",
        durationTarget: 5,
        promptGuidance: "Direct call to action",
      },
    ],
  },
  {
    id: "hero_story",
    name: "Hero Story (45-60s)",
    description: "Full cinematic treatment for high-performing concepts",
    targetDuration: 50,
    recommendedTier: "hero",
    scenes: [
      {
        role: "hook",
        durationTarget: 3,
        promptGuidance: "Cinematic pattern interrupt",
      },
      {
        role: "problem",
        durationTarget: 5,
        promptGuidance: "Immersive problem visualization",
      },
      {
        role: "story_a",
        durationTarget: 8,
        promptGuidance: "Establish the world and stakes",
      },
      {
        role: "atmosphere",
        durationTarget: 4,
        promptGuidance: "Transition beat - physics/texture glue",
      },
      {
        role: "story_b",
        durationTarget: 10,
        promptGuidance: "The hero moment - full payoff",
      },
      {
        role: "reset",
        durationTarget: 2,
        promptGuidance: "Quick pattern break before CTA",
      },
      {
        role: "cta",
        durationTarget: 6,
        promptGuidance: "Compelling call to action",
      },
    ],
  },
  {
    id: "brainrot",
    name: "Brainrot (10-15s)",
    description: "Maximum dopamine, quick cuts, high energy",
    targetDuration: 12,
    recommendedTier: "volume",
    scenes: [
      {
        role: "hook",
        durationTarget: 2,
        promptGuidance: "Immediate visual shock",
      },
      {
        role: "reset",
        durationTarget: 2,
        promptGuidance: "Whip pan or jump cut",
      },
      {
        role: "story_b",
        durationTarget: 4,
        promptGuidance: "The payoff moment",
      },
      {
        role: "cta",
        durationTarget: 3,
        promptGuidance: "Quick direct action",
      },
    ],
  },
  {
    id: "cinematic_intro",
    name: "Cinematic Intro (30-45s)",
    description: "Brand/product introduction with atmosphere",
    targetDuration: 38,
    recommendedTier: "hero",
    scenes: [
      {
        role: "establish",
        durationTarget: 5,
        promptGuidance: "Wide establishing shot of the world",
      },
      {
        role: "atmosphere",
        durationTarget: 4,
        promptGuidance: "Mood-setting transition",
      },
      {
        role: "story_a",
        durationTarget: 8,
        promptGuidance: "Introduce the subject/product",
      },
      {
        role: "story_b",
        durationTarget: 10,
        promptGuidance: "Reveal the value/transformation",
      },
      {
        role: "cta",
        durationTarget: 6,
        promptGuidance: "Elegant call to action",
      },
    ],
  },
];

/**
 * Get template by ID
 */
export function getStoryTemplate(id: string): StoryTemplate | undefined {
  return STORY_TEMPLATES.find(t => t.id === id);
}

/**
 * Get the appropriate tier for a template
 */
export function getRecommendedTier(templateId: string): StoryTier {
  const template = getStoryTemplate(templateId);
  return template?.recommendedTier || "volume";
}

/**
 * Calculate total duration for a template
 */
export function calculateTemplateDuration(templateId: string): number {
  const template = getStoryTemplate(templateId);
  if (!template) return 0;
  return template.scenes.reduce((sum, s) => sum + s.durationTarget, 0);
}
