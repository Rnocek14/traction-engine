/**
 * Style Control Layer
 * 
 * Controls visual stylization per-account based on realism_level and visual_style.
 * Prevents uncontrolled sci-fi/fantasy while allowing intentional stylization.
 */

export interface AccountStyleProfile {
  realism_level: number;    // 0=abstract/sci-fi, 100=grounded/realistic
  visual_style: string;     // realistic, cinematic, sci-fi, abstract, hybrid
  style_notes?: string;     // free-text creative direction
}

const DEFAULT_STYLE: AccountStyleProfile = {
  realism_level: 70,
  visual_style: "cinematic",
};

/**
 * Build a style control block for injection into storyboard prompts.
 * This constrains GPT's visual imagination to match the account identity.
 */
export function buildStyleControlBlock(style?: AccountStyleProfile | null): string {
  const s = style ?? DEFAULT_STYLE;
  const level = s.realism_level ?? 70;
  const vs = s.visual_style ?? "cinematic";

  const lines: string[] = [];
  lines.push(`\n═══ VISUAL STYLE CONTROL ═══`);
  lines.push(`Style: ${vs.toUpperCase()} | Realism: ${level}/100`);

  if (level >= 80) {
    // Highly grounded
    lines.push(`VISUAL RULES (HIGH REALISM):
- Scenes MUST depict real-world settings: offices, kitchens, streets, stores
- NO holograms, glowing UI, sci-fi environments, or abstract void spaces
- Metaphors must be grounded (e.g., "padlock on a door" not "floating digital lock in cyber-void")
- Lighting must be natural or practical (lamps, windows, screens)
- Allow subtle visual enhancement: dramatic angles, slow-motion, cinematic color grading`);
  } else if (level >= 50) {
    // Balanced — cinematic with controlled metaphors
    lines.push(`VISUAL RULES (CINEMATIC):
- Mix real-world scenes with 1-2 stylized metaphor scenes per video
- Stylized scenes should REPRESENT the concept (e.g., glowing shield = protection)
- Avoid unrelated fantasy (no dragons, spaceships, or generic sci-fi unless topic is sci-fi)
- Hook scene may use eye-catching stylization; value scenes should stay grounded
- Transitions between real and stylized should feel intentional, not random`);
  } else if (level >= 20) {
    // Heavily stylized
    lines.push(`VISUAL RULES (STYLIZED):
- Lean into cinematic, sci-fi, or abstract visuals
- Environments can be futuristic, neon-lit, or fantastical
- Ground the story with at least 1 relatable real-world element
- Stylization must serve the narrative (not random spectacle)
- Use consistent visual language (don't mix medieval + cyberpunk randomly)`);
  } else {
    // Full abstract
    lines.push(`VISUAL RULES (ABSTRACT):
- Full creative freedom for abstract, surreal, or conceptual visuals
- Focus on visual impact and emotional resonance over realism
- Maintain visual consistency within the piece
- Every visual must still connect to the core message`);
  }

  if (s.style_notes) {
    lines.push(`CREATIVE DIRECTION: ${s.style_notes}`);
  }

  return lines.join("\n");
}

/**
 * Get scene-level style guidance based on beat role and realism level.
 * Returns constraints for the subject/environment generation.
 */
export function getSceneStyleHint(
  beatRole: string,
  realism: number,
): { allow_stylized: boolean; style_hint: string } {
  const isHook = beatRole === "hook" || beatRole === "pattern_interrupt";
  const isCTA = beatRole.includes("cta");
  const isValue = beatRole.includes("value") || beatRole.includes("tip") || beatRole.includes("step");

  // Hooks get more stylization freedom regardless of realism
  if (isHook && realism >= 50) {
    return { allow_stylized: true, style_hint: "eye-catching, can use stylized metaphor" };
  }

  // CTAs should feel grounded/actionable
  if (isCTA) {
    return { allow_stylized: false, style_hint: "grounded, clear, action-oriented" };
  }

  // Value beats should match realism level
  if (isValue && realism >= 60) {
    return { allow_stylized: false, style_hint: "realistic, specific, demonstrative" };
  }

  return {
    allow_stylized: realism < 60,
    style_hint: realism >= 70 ? "real-world setting" : realism >= 40 ? "cinematic" : "stylized/abstract",
  };
}

/**
 * Validate a scene prompt against the style profile.
 * Returns warnings if the prompt violates style constraints.
 */
export function checkStyleCompliance(
  prompt: string,
  realism: number,
): string[] {
  const warnings: string[] = [];
  const lower = prompt.toLowerCase();

  if (realism >= 75) {
    const sciFiTerms = ["hologram", "holographic", "cyber void", "digital dimension", "neon grid", "virtual reality", "floating in space", "quantum", "portal"];
    for (const term of sciFiTerms) {
      if (lower.includes(term)) {
        warnings.push(`High-realism account but prompt contains sci-fi term: "${term}"`);
      }
    }
  }

  if (realism <= 30) {
    const boringTerms = ["person sitting at desk", "person at computer", "office cubicle"];
    for (const term of boringTerms) {
      if (lower.includes(term)) {
        warnings.push(`Low-realism account but prompt is too mundane: "${term}"`);
      }
    }
  }

  return warnings;
}
