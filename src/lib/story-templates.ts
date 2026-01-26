/**
 * Story Templates Library
 * 
 * Pre-defined story structures with role assignments.
 * Each template defines the narrative arc and duration targets.
 */

import type { SceneRole, ChangeType } from "@/types/scene-roles";
import type { CutZone } from "@/lib/cut-cadence";

export type StoryTier = "volume" | "hero";

export interface StoryTemplateScene {
  role: SceneRole;
  durationTarget: number;
  promptGuidance: string;
  /** Cut cadence zone for attention pacing */
  zone: CutZone;
  /** What typically changes at this beat */
  defaultChangeType: ChangeType;
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
        zone: "hook",
        defaultChangeType: "info",
      },
      {
        role: "problem",
        durationTarget: 5,
        promptGuidance: "Show the pain point with atmospheric mood",
        zone: "setup",
        defaultChangeType: "emotion",
      },
      {
        role: "story_a",
        durationTarget: 7,
        promptGuidance: "First narrative beat - establish the situation",
        zone: "setup",
        defaultChangeType: "info",
      },
      {
        role: "reset",
        durationTarget: 2,
        promptGuidance: "Quick attention reset - micro-cut, whip pan",
        zone: "escalation",
        defaultChangeType: "stakes",
      },
      {
        role: "story_b",
        durationTarget: 8,
        promptGuidance: "Payoff, reveal, transformation - the hero moment",
        zone: "escalation",
        defaultChangeType: "goal",
      },
      {
        role: "cta",
        durationTarget: 5,
        promptGuidance: "Call to action, proof, result",
        zone: "payoff",
        defaultChangeType: "stakes",
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
        zone: "hook",
        defaultChangeType: "info",
      },
      {
        role: "story_a",
        durationTarget: 8,
        promptGuidance: "Combined problem and solution",
        zone: "setup",
        defaultChangeType: "goal",
      },
      {
        role: "cta",
        durationTarget: 5,
        promptGuidance: "Direct call to action",
        zone: "button",
        defaultChangeType: "stakes",
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
        zone: "hook",
        defaultChangeType: "info",
      },
      {
        role: "problem",
        durationTarget: 5,
        promptGuidance: "Immersive problem visualization",
        zone: "setup",
        defaultChangeType: "emotion",
      },
      {
        role: "story_a",
        durationTarget: 8,
        promptGuidance: "Establish the world and stakes",
        zone: "setup",
        defaultChangeType: "info",
      },
      {
        role: "atmosphere",
        durationTarget: 4,
        promptGuidance: "Transition beat - physics/texture glue",
        zone: "escalation",
        defaultChangeType: "emotion",
      },
      {
        role: "story_b",
        durationTarget: 10,
        promptGuidance: "The hero moment - full payoff",
        zone: "escalation",
        defaultChangeType: "goal",
      },
      {
        role: "reset",
        durationTarget: 2,
        promptGuidance: "Quick pattern break before CTA",
        zone: "escalation",
        defaultChangeType: "stakes",
      },
      {
        role: "cta",
        durationTarget: 6,
        promptGuidance: "Compelling call to action",
        zone: "payoff",
        defaultChangeType: "stakes",
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
        zone: "hook",
        defaultChangeType: "info",
      },
      {
        role: "reset",
        durationTarget: 2,
        promptGuidance: "Whip pan or jump cut",
        zone: "escalation",
        defaultChangeType: "stakes",
      },
      {
        role: "story_b",
        durationTarget: 4,
        promptGuidance: "The payoff moment",
        zone: "escalation",
        defaultChangeType: "goal",
      },
      {
        role: "cta",
        durationTarget: 3,
        promptGuidance: "Quick direct action",
        zone: "button",
        defaultChangeType: "stakes",
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
        zone: "setup",
        defaultChangeType: "location",
      },
      {
        role: "atmosphere",
        durationTarget: 4,
        promptGuidance: "Mood-setting transition",
        zone: "setup",
        defaultChangeType: "emotion",
      },
      {
        role: "story_a",
        durationTarget: 8,
        promptGuidance: "Introduce the subject/product",
        zone: "setup",
        defaultChangeType: "info",
      },
      {
        role: "story_b",
        durationTarget: 10,
        promptGuidance: "Reveal the value/transformation",
        zone: "payoff",
        defaultChangeType: "goal",
      },
      {
        role: "cta",
        durationTarget: 6,
        promptGuidance: "Elegant call to action",
        zone: "button",
        defaultChangeType: "stakes",
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
