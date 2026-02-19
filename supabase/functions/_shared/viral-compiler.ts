/**
 * Viral Prompt Compiler v1.0
 * 
 * Stripped-down prompt compiler for viral story types.
 * NO director briefs, NO escalation deltas, NO capture contracts.
 * 
 * Output: 150-300 character prompts focused on:
 * - Subject (who/what)
 * - Action (what happens)
 * - Style anchor (visual feel)
 * - Platform format (aspect ratio, aesthetic)
 * 
 * This replaces the cinematic prompt-compiler.ts for all viral modes.
 */

import type { MergedConstraints } from "./story-type-router.ts";
import type { SceneBeat } from "./story-types.ts";

// ─── Scene Input ────────────────────────────────────────────

export interface ViralSceneInput {
  scene_id: string;
  sequence_index: number;
  beat: SceneBeat;           // From story template
  subject: string;           // "A person holding a supplement bottle"
  action: string;            // "turns to camera with surprised expression"
  environment?: string;      // "modern kitchen, morning light"
  text_overlay?: string;     // "You won't believe this..."
  mood?: string;             // "energetic", "shocking", "calm"
}

// ─── Compiled Output ────────────────────────────────────────

export interface ViralPromptOutput {
  scene_id: string;
  sequence_index: number;
  prompt: string;
  char_count: number;
  was_truncated: boolean;
  beat_role: string;
  camera_suggestion: string;
  duration_target: number;
  text_overlay?: string;
}

// ─── Style Anchors ──────────────────────────────────────────

const STYLE_ANCHORS: Record<string, string> = {
  fast: "Vertical 9:16. Energetic pacing. Handheld phone aesthetic. Punchy, scroll-stopping.",
  moderate: "Vertical 9:16. Natural pacing. Clean framing. Engaging, authentic feel.",
  slow: "Vertical 9:16. Deliberate pacing. Steady camera. Thoughtful, composed.",
};

// ─── Camera Direction Map ───────────────────────────────────

const CAMERA_MAP: Record<string, string> = {
  "close-up": "Tight close-up shot",
  "medium": "Medium shot, waist-up framing",
  "wide": "Wide establishing shot",
  "dynamic": "Dynamic camera movement, slight push-in",
  "pov": "First-person POV perspective",
  "product-focus": "Product hero shot, shallow depth of field",
  "tracking": "Smooth tracking shot following subject",
  "dramatic": "Low angle dramatic framing",
};

// ═══════════════════════════════════════════════════════════
// COMPILER
// ═══════════════════════════════════════════════════════════

/**
 * Compile a single viral scene prompt.
 * Target: 150-300 characters. No structural labels. Pure visual prose.
 */
export function compileViralPrompt(
  scene: ViralSceneInput,
  constraints: MergedConstraints
): ViralPromptOutput {
  const { visual_style } = constraints;
  const charLimit = constraints.prompt_char_limit;
  
  // Build the style anchor
  const styleAnchor = STYLE_ANCHORS[visual_style.pacing] || STYLE_ANCHORS.fast;
  
  // Camera direction
  const camera = scene.beat.camera_suggestion || "medium";
  const cameraDir = CAMERA_MAP[camera] || camera;
  
  // Duration target (midpoint of beat range)
  const duration = Math.round(
    (scene.beat.duration_range[0] + scene.beat.duration_range[1]) / 2
  );
  
  // Mood modifier
  const moodStr = scene.mood ? ` ${scene.mood} mood.` : "";
  
  // Environment
  const envStr = scene.environment ? ` Setting: ${scene.environment}.` : "";
  
  // Lighting from vertical profile
  const lightStr = visual_style.lighting ? ` ${visual_style.lighting} lighting.` : "";
  
  // Assemble prompt as flowing prose (no structural labels)
  let prompt = `${cameraDir}. ${scene.subject} ${scene.action}.${envStr}${lightStr}${moodStr} ${styleAnchor}`;
  
  // Clean up whitespace
  prompt = prompt.replace(/\s+/g, " ").trim();
  
  // Truncate if over limit
  let wasTruncated = false;
  if (prompt.length > charLimit) {
    // Cut at last complete sentence before limit
    const truncated = prompt.slice(0, charLimit - 3);
    const lastPeriod = truncated.lastIndexOf(".");
    if (lastPeriod > charLimit * 0.5) {
      prompt = truncated.slice(0, lastPeriod + 1);
    } else {
      prompt = truncated + "...";
    }
    wasTruncated = true;
  }
  
  return {
    scene_id: scene.scene_id,
    sequence_index: scene.sequence_index,
    prompt,
    char_count: prompt.length,
    was_truncated: wasTruncated,
    beat_role: scene.beat.role,
    camera_suggestion: camera,
    duration_target: duration,
    text_overlay: scene.text_overlay,
  };
}

/**
 * Compile all scenes for a viral story.
 */
export function compileViralStory(
  scenes: ViralSceneInput[],
  constraints: MergedConstraints
): {
  prompts: ViralPromptOutput[];
  total_chars: number;
  total_duration: number;
  stats: {
    avg_chars: number;
    truncated_count: number;
    beat_roles: string[];
  };
} {
  const prompts = scenes.map(s => compileViralPrompt(s, constraints));
  
  const total_chars = prompts.reduce((sum, p) => sum + p.char_count, 0);
  const total_duration = prompts.reduce((sum, p) => sum + p.duration_target, 0);
  const truncated_count = prompts.filter(p => p.was_truncated).length;
  
  return {
    prompts,
    total_chars,
    total_duration,
    stats: {
      avg_chars: Math.round(total_chars / prompts.length),
      truncated_count,
      beat_roles: prompts.map(p => p.beat_role),
    },
  };
}

/**
 * Quick-compile: generate a simple viral prompt from raw inputs.
 * For use when you don't have full MergedConstraints yet.
 */
export function quickViralPrompt(
  subject: string,
  action: string,
  options?: {
    camera?: string;
    environment?: string;
    mood?: string;
    max_chars?: number;
  }
): string {
  const camera = CAMERA_MAP[options?.camera || "medium"] || "Medium shot";
  const env = options?.environment ? ` Setting: ${options.environment}.` : "";
  const mood = options?.mood ? ` ${options.mood} mood.` : "";
  const maxChars = options?.max_chars || 300;
  
  let prompt = `${camera}. ${subject} ${action}.${env}${mood} Vertical 9:16. Energetic pacing. Handheld phone aesthetic.`;
  prompt = prompt.replace(/\s+/g, " ").trim();
  
  if (prompt.length > maxChars) {
    prompt = prompt.slice(0, maxChars - 3) + "...";
  }
  
  return prompt;
}
