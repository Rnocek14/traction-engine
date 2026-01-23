/**
 * Style Guide Presets for one-click cinematography templates
 */

import type { StyleGuide } from "@/types/timeline-types";

export interface StylePreset {
  id: string;
  name: string;
  description: string;
  icon: string; // emoji for quick identification
  guide: Partial<StyleGuide>;
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "documentary",
    name: "Documentary",
    description: "Authentic, observational feel with natural lighting",
    icon: "📹",
    guide: {
      camera_style: "documentary",
      lighting: "natural",
      lens: "35mm",
      depth_of_field: "medium",
      color_grade: "neutral",
      motion_style: "handheld",
      mood: "calm",
    },
  },
  {
    id: "cinematic_horror",
    name: "Cinematic Horror",
    description: "Dark, moody with dramatic shadows and tension",
    icon: "🎬",
    guide: {
      camera_style: "cinematic",
      lighting: "dramatic",
      lens: "24mm",
      depth_of_field: "shallow",
      color_grade: "high_contrast",
      motion_style: "smooth",
      mood: "dramatic",
      custom_notes: "Low-key lighting with motivated practical sources. Deep shadows, minimal fill. Unsettling, tense atmosphere.",
    },
  },
  {
    id: "warm_lifestyle",
    name: "Warm Lifestyle",
    description: "Inviting, cozy aesthetic with golden tones",
    icon: "☀️",
    guide: {
      camera_style: "cinematic",
      lighting: "golden_hour",
      lens: "85mm",
      depth_of_field: "shallow",
      color_grade: "warm",
      motion_style: "smooth",
      mood: "hopeful",
      time_of_day: "golden_hour",
    },
  },
  {
    id: "modern_minimal",
    name: "Modern Minimal",
    description: "Clean, contemporary look with balanced lighting",
    icon: "✨",
    guide: {
      camera_style: "static",
      lighting: "soft",
      lens: "50mm",
      depth_of_field: "medium",
      color_grade: "neutral",
      motion_style: "static",
      mood: "calm",
      film_stock: "digital",
    },
  },
  {
    id: "vintage_film",
    name: "Vintage Film",
    description: "Nostalgic Kodak film look with warm grain",
    icon: "📷",
    guide: {
      camera_style: "documentary",
      lighting: "natural",
      lens: "35mm",
      depth_of_field: "medium",
      color_grade: "vintage",
      motion_style: "handheld",
      mood: "intimate",
      film_stock: "portra",
    },
  },
  {
    id: "high_energy",
    name: "High Energy",
    description: "Dynamic movement with punchy colors",
    icon: "⚡",
    guide: {
      camera_style: "dynamic",
      lighting: "studio",
      lens: "24mm",
      depth_of_field: "deep",
      color_grade: "high_contrast",
      motion_style: "tracking",
      mood: "energetic",
    },
  },
  {
    id: "intimate_portrait",
    name: "Intimate Portrait",
    description: "Close, personal feel with beautiful bokeh",
    icon: "💫",
    guide: {
      camera_style: "cinematic",
      lighting: "soft",
      lens: "85mm",
      depth_of_field: "shallow",
      color_grade: "warm",
      motion_style: "smooth",
      mood: "intimate",
    },
  },
  {
    id: "night_noir",
    name: "Night Noir",
    description: "Moody night scenes with neon-tinged colors",
    icon: "🌙",
    guide: {
      camera_style: "cinematic",
      lighting: "dramatic",
      lens: "35mm",
      depth_of_field: "shallow",
      color_grade: "cool",
      motion_style: "smooth",
      mood: "dramatic",
      time_of_day: "night",
      film_stock: "cinestill",
      custom_notes: "Neon-lit urban environment. High contrast with deep blacks and color separation.",
    },
  },
];

/**
 * Get a preset by ID
 */
export function getStylePreset(id: string): StylePreset | undefined {
  return STYLE_PRESETS.find((p) => p.id === id);
}

/**
 * Apply a preset to an existing style guide (merges, preserving character/location/wardrobe)
 */
export function applyPreset(
  currentGuide: StyleGuide | undefined,
  preset: StylePreset
): StyleGuide {
  return {
    // Keep user-defined content
    character: currentGuide?.character,
    location: currentGuide?.location,
    wardrobe: currentGuide?.wardrobe,
    props: currentGuide?.props,
    reference_image_url: currentGuide?.reference_image_url,
    // Apply preset cinematography
    ...preset.guide,
  };
}
