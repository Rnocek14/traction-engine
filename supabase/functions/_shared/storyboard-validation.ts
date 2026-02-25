/**
 * Storyboard Validation v1.0
 * 
 * Extracted from generate-storyboard to reduce bundle size.
 * Handles legacy-mode post-GPT validation:
 * - Action verb validation
 * - Spectacle budget
 * - Story forces / escalation contract
 * - Protagonist language cleanup
 * - Shot signature variety
 */

import type {
  GeneratedScene, GeneratedStoryboard, SceneRole, CutType, CutZone, ChangeType,
} from "./storyboard-prompts.ts";
import { SOFT_WARN_VERBS, PREFERRED_ACTION_VERBS, ROLE_TO_ZONE } from "./storyboard-prompts.ts";

// Re-export aliases used by index.ts
export const BANNED_VERBS = SOFT_WARN_VERBS;
export const REQUIRED_ACTION_VERBS = PREFERRED_ACTION_VERBS;

// ─── Action Verb Validation ─────────────────────────────────

export interface VerbValidationResult {
  sceneIndex: number;
  valid: boolean;
  bannedVerb: string | null;
  hasActionVerb: boolean;
}

export function validateActionVerbs(scenes: GeneratedScene[]): VerbValidationResult[] {
  return scenes.map((scene, i) => {
    const promptLower = scene.prompt.toLowerCase();
    const first20Words = promptLower.split(/\s+/).slice(0, 20).join(" ");
    const firstClause = promptLower.split(/[,.:!?]/)[0] || "";

    const bannedVerbFound = SOFT_WARN_VERBS.find(verb => {
      const regex = new RegExp(`\\b${verb}\\b`, "i");
      return regex.test(firstClause);
    });

    const hasActionVerb = PREFERRED_ACTION_VERBS.some(verb => {
      const regex = new RegExp(`\\b${verb}\\b`, "i");
      return regex.test(first20Words);
    });

    return {
      sceneIndex: i,
      valid: !bannedVerbFound && hasActionVerb,
      bannedVerb: bannedVerbFound || null,
      hasActionVerb,
    };
  });
}

// ─── Spectacle Budget ───────────────────────────────────────

export function validateSpectacleBudget(scenes: GeneratedScene[]): string[] {
  const spectacleCount = scenes.filter(s => s.subject_required === false).length;
  const faceCount = scenes.filter(s => s.coverage_type === "face").length;
  const minSpectacle = Math.max(1, Math.floor(scenes.length * 0.25));
  const maxSpectacle = Math.ceil(scenes.length * 0.6);
  const maxFace = Math.max(2, Math.ceil(scenes.length * 0.35));

  const warnings: string[] = [];
  if (spectacleCount < minSpectacle) warnings.push(`spectacle_count=${spectacleCount} < min=${minSpectacle}`);
  if (spectacleCount > maxSpectacle) warnings.push(`spectacle_count=${spectacleCount} > max=${maxSpectacle}`);
  if (faceCount > maxFace) warnings.push(`face_count=${faceCount} > max=${maxFace}`);
  return warnings;
}

// ─── Story Forces & Escalation Contract ─────────────────────

function getSetpieceDelta(s: GeneratedScene, i: number): string | null {
  const rawDelta = s.setpiece_delta ?? s.state_to ?? s.action_summary ?? null;
  if (rawDelta && !s.setpiece_delta) {
    console.log(`[storyboard-validation] Scene ${i + 1}: using fallback for setpiece_delta (field: ${s.state_to ? 'state_to' : 'action_summary'})`);
  }
  const normalized = rawDelta ? rawDelta.trim().toLowerCase() : null;
  return normalized && normalized.length > 0 ? normalized : null;
}

function inferForceType(scene: GeneratedScene): "weather" | "predator" | "hazard" | "pursuit" | "time" | "resource" | "social" {
  const text = `${scene.prompt || ""} ${scene.alternate_subject || ""}`.toLowerCase();
  if (/water|rain|flood|storm|wind|snow|cold|heat|fire/.test(text)) return "weather";
  if (/spider|bird|shadow|predator|beast|creature|enemy|hunt|dragon|monster/.test(text)) return "predator";
  if (/chase|follow|track|escape|flee|run|pursuit/.test(text)) return "pursuit";
  if (/collapse|debris|fall|trap|rock|cliff|explosion|crash/.test(text)) return "hazard";
  if (/deadline|countdown|closing|timer|urgent/.test(text)) return "time";
  if (/crowd|rival|reject|social|pressure/.test(text)) return "social";
  return "hazard";
}

export function enforceEscalationContract(storyboard: GeneratedStoryboard): void {
  // Clamp escalation_delta
  for (const scene of storyboard.scenes) {
    if (typeof scene.escalation_delta === 'number') {
      scene.escalation_delta = Math.max(0, Math.min(3, Math.floor(scene.escalation_delta))) as 0 | 1 | 2 | 3;
    }
  }

  const forceScenes = storyboard.scenes.filter(s => s.force_present === true);
  const highEscalationScenes = storyboard.scenes.filter(s => (s.escalation_delta ?? 0) >= 2);
  const peakScenes = storyboard.scenes.filter(s => (s.escalation_delta ?? 0) >= 3);
  const uniqueSetpieceDeltas = new Set(storyboard.scenes.map((s, i) => getSetpieceDelta(s, i)).filter(Boolean));

  const forceIssues: string[] = [];
  if (forceScenes.length < 2) forceIssues.push(`force_present=${forceScenes.length}/2`);
  if (peakScenes.length < 1) forceIssues.push(`escalation_delta=3 count=${peakScenes.length}/1`);
  if (highEscalationScenes.length < 2) forceIssues.push(`escalation_delta≥2 count=${highEscalationScenes.length}/2`);
  if (uniqueSetpieceDeltas.size < 2) forceIssues.push(`setpiece_deltas=${uniqueSetpieceDeltas.size}/2`);

  if (forceIssues.length === 0) return;

  console.warn(`[storyboard-validation] Escalation Contract issues: ${forceIssues.join("; ")}`);

  // Auto-fix forces
  const midSceneIndices = [2, 3, 4].filter(i => i < storyboard.scenes.length);
  let forcesAdded = 0;

  for (const pass of ["spectacle", "hero"] as const) {
    for (const i of midSceneIndices) {
      if (forceScenes.length + forcesAdded >= 2) break;
      const scene = storyboard.scenes[i];
      const isSpectacle = scene.subject_required === false;
      if (!scene.force_present && (pass === "spectacle" ? isSpectacle : !isSpectacle)) {
        scene.force_present = true;
        scene.force_type = inferForceType(scene);
        scene.escalation_delta = scene.escalation_delta ?? 2;
        console.log(`[storyboard-validation] Auto-injected ${scene.force_type} force into scene ${i + 1}`);
        forcesAdded++;
      }
    }
  }

  // Ensure peak scene
  const peakIndex = Math.min(4, Math.max(2, storyboard.scenes.length - 2));
  if (peakScenes.length === 0 && peakIndex >= 0 && peakIndex < storyboard.scenes.length - 1) {
    storyboard.scenes[peakIndex].escalation_delta = 3;
    console.log(`[storyboard-validation] Set peak escalation_delta=3 on scene ${peakIndex + 1}`);
  }

  // Boost mid-story escalation
  for (const i of midSceneIndices.filter(idx => idx < storyboard.scenes.length - 1)) {
    if ((storyboard.scenes[i].escalation_delta ?? 0) < 2) {
      storyboard.scenes[i].escalation_delta = 2;
    }
  }
}

export function logStoryForcesSummary(scenes: GeneratedScene[]): void {
  const finalForces = scenes.filter(s => s.force_present === true).length;
  const finalPeakIdx = scenes.findIndex(s => (s.escalation_delta ?? 0) >= 3);
  const finalHigh = scenes.filter(s => (s.escalation_delta ?? 0) >= 2).length;
  const finalDeltas = new Set(scenes.map((s, i) => getSetpieceDelta(s, i)).filter(Boolean)).size;

  console.log(`[storyboard-validation] Story Forces: forces=${finalForces}/${scenes.length}, peak=${finalPeakIdx >= 0 ? `scene ${finalPeakIdx + 1}` : 'none'}, escalation≥2=${finalHigh}, unique_deltas=${finalDeltas}`);
  scenes.forEach((s, i) => {
    const isSpectacle = s.subject_required === false;
    console.log(`  ${i + 1}: role=${isSpectacle ? 'spectacle' : 'hero'} force=${s.force_type || '-'} esc=${s.escalation_delta ?? 0} delta="${getSetpieceDelta(s, i)?.slice(0, 30) || '-'}"`);
  });
}

// ─── Protagonist Language Cleanup ───────────────────────────

const PROTAGONIST_PATTERNS = [
  /\b(the\s+)?(astronaut|knight|hero|protagonist|character|figure|warrior|soldier|explorer|adventurer|person|man|woman)\b/gi,
  /\b(he|she|they|him|her|them|his|hers|their)\s+(is|are|was|were|runs?|sprints?|dives?|grabs?|looks?|watches?|sees?|reacts?)/gi,
];

export function cleanProtagonistFromSpectacle(storyboard: GeneratedStoryboard): void {
  storyboard.scenes = storyboard.scenes.map(scene => {
    if (scene.subject_required === false) {
      let cleanedPrompt = scene.prompt;
      PROTAGONIST_PATTERNS.forEach(pattern => {
        cleanedPrompt = cleanedPrompt.replace(pattern, "");
        pattern.lastIndex = 0;
      });
      cleanedPrompt = cleanedPrompt.replace(/\s+/g, " ").trim();
      if (cleanedPrompt !== scene.prompt) {
        return { ...scene, prompt: cleanedPrompt };
      }
    }
    return scene;
  });
}

// ─── Shot Signature Variety ─────────────────────────────────

interface ShotSignature {
  framing: string;
  angle: string;
  motion: string;
  primaryAction: string;
}

interface VarietyIssue {
  sceneIndex: number;
  type: "framing_angle" | "motion" | "action";
  detail: string;
}

function extractShotSignature(scene: GeneratedScene): ShotSignature {
  const prompt = scene.prompt.toLowerCase();
  const camDir = (scene.camera_direction || "").toLowerCase();

  let framing = "medium";
  if (camDir.includes("wide") || camDir.includes("establish") || scene.coverage_type === "wide") framing = "wide";
  else if (camDir.includes("close") || scene.coverage_type === "face") framing = "close";
  else if (prompt.includes("full body") || scene.coverage_type === "body") framing = "full";

  let angle = "eye";
  if (camDir.includes("low") || prompt.includes("looking up")) angle = "low";
  else if (camDir.includes("high") || camDir.includes("overhead") || prompt.includes("looking down")) angle = "high";
  else if (camDir.includes("dutch") || camDir.includes("tilt")) angle = "dutch";

  let motion = "static";
  if (camDir.includes("track") || camDir.includes("follow")) motion = "tracking";
  else if (camDir.includes("pan") || camDir.includes("whip")) motion = "pan";
  else if (camDir.includes("dolly") || camDir.includes("push")) motion = "dolly";
  else if (camDir.includes("crane") || camDir.includes("jib")) motion = "crane";
  else if (camDir.includes("handheld")) motion = "handheld";

  const actionVerb = scene.beat_action?.split(",")[0]?.trim() ||
    PREFERRED_ACTION_VERBS.find(v => prompt.includes(v)) || "unknown";

  return { framing, angle, motion, primaryAction: actionVerb };
}

function detectVarietyIssues(signatures: ShotSignature[]): VarietyIssue[] {
  const issues: VarietyIssue[] = [];
  for (let i = 1; i < signatures.length; i++) {
    const prev = signatures[i - 1];
    const curr = signatures[i];
    if (prev.framing === curr.framing && prev.angle === curr.angle) {
      issues.push({ sceneIndex: i, type: "framing_angle", detail: `same framing+angle (${curr.framing}/${curr.angle})` });
    }
    if (prev.motion === curr.motion && prev.motion !== "static") {
      issues.push({ sceneIndex: i, type: "motion", detail: `same motion (${curr.motion})` });
    }
    if (prev.primaryAction === curr.primaryAction && prev.primaryAction !== "unknown") {
      issues.push({ sceneIndex: i, type: "action", detail: `same action verb (${curr.primaryAction})` });
    }
  }
  return issues;
}

/**
 * Detect shot signature variety issues and attempt to fix via GPT rewrites.
 * Returns remaining issues after retries.
 */
export async function enforceVariety(
  storyboard: GeneratedStoryboard,
  openaiKey: string,
  maxRetries = 2,
): Promise<VarietyIssue[]> {
  let signatures = storyboard.scenes.map(extractShotSignature);
  let issues = detectVarietyIssues(signatures);
  let retryCount = 0;

  while (issues.length > 0 && retryCount < maxRetries) {
    retryCount++;
    console.log(`[storyboard-validation] Variety retry ${retryCount}/${maxRetries}: ${issues.length} collisions`);

    const scenesToRewrite = [...new Set(issues.map(i => i.sceneIndex))];
    for (const sceneIndex of scenesToRewrite) {
      const scene = storyboard.scenes[sceneIndex];
      const prevScene = storyboard.scenes[sceneIndex - 1];
      const prevSig = signatures[sceneIndex - 1];
      const issuesForScene = issues.filter(i => i.sceneIndex === sceneIndex);

      const constraints: string[] = [];
      if (issuesForScene.some(i => i.type === "framing_angle")) {
        const newFraming = prevSig.framing === "wide" ? "close" : (prevSig.framing === "close" ? "medium" : "wide");
        const newAngle = prevSig.angle === "eye" ? "low" : (prevSig.angle === "low" ? "high" : "eye");
        constraints.push(`MUST use ${newFraming} framing OR ${newAngle} angle`);
      }
      if (issuesForScene.some(i => i.type === "motion")) {
        const altMotions = ["tracking", "dolly", "crane", "handheld", "pan"].filter(m => m !== prevSig.motion);
        constraints.push(`MUST use ${altMotions[0]} or ${altMotions[1]} camera motion (NOT ${prevSig.motion})`);
      }
      if (issuesForScene.some(i => i.type === "action")) {
        constraints.push(`MUST use a DIFFERENT primary action verb (NOT ${prevSig.primaryAction})`);
      }

      const rewritePrompt = `Rewrite ONLY this scene prompt to fix shot signature collision:\n\nORIGINAL SCENE ${sceneIndex + 1}:\nprompt: "${scene.prompt}"\ncamera_direction: "${scene.camera_direction}"\nrole: "${scene.role}"\n\nPREVIOUS SCENE ${sceneIndex}:\nprompt: "${prevScene.prompt}"\ncamera_direction: "${prevScene.camera_direction}"\n\nCONSTRAINTS:\n${constraints.join("\n")}\n\nReturn ONLY JSON: {"prompt":"...","camera_direction":"..."}`;

      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: "You are a cinematographer. Return only valid JSON, no markdown." },
              { role: "user", content: rewritePrompt },
            ],
            temperature: 0.9,
            max_tokens: 300,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const content = data.choices?.[0]?.message?.content || "";
          const match = content.match(/\{[\s\S]*\}/);
          if (match) {
            const rewrite = JSON.parse(match[0]);
            if (rewrite.prompt) storyboard.scenes[sceneIndex].prompt = rewrite.prompt;
            if (rewrite.camera_direction) storyboard.scenes[sceneIndex].camera_direction = rewrite.camera_direction;
            console.log(`[storyboard-validation] ✓ Rewrote scene ${sceneIndex + 1}`);
          }
        } else {
          await res.text(); // consume
        }
      } catch (err) {
        console.warn(`[storyboard-validation] Rewrite failed for scene ${sceneIndex + 1}:`, err);
      }
    }

    signatures = storyboard.scenes.map(extractShotSignature);
    issues = detectVarietyIssues(signatures);
  }

  if (issues.length > 0) {
    console.warn(`[storyboard-validation] ${issues.length} variety issues remain after ${retryCount} retries`);
  } else {
    console.log(`[storyboard-validation] ✓ Shot Signature Variety OK${retryCount > 0 ? ` (after ${retryCount} rewrites)` : ""}`);
  }

  return issues;
}

// ─── Scene ID & Zone Assignment (legacy post-processing) ────

type ZoneDuration = { min: number; max: number; reason: string };

const ZONE_DURATIONS: Record<CutZone, ZoneDuration> = {
  hook: { min: 0.4, max: 0.9, reason: "Pattern interrupt - keep it punchy" },
  setup: { min: 1.2, max: 2.0, reason: "Establish context" },
  escalation: { min: 1.0, max: 1.8, reason: "Build tension" },
  payoff: { min: 1.8, max: 3.5, reason: "Let it land" },
  button: { min: 1.0, max: 2.0, reason: "Clean hold for CTA" },
};

const DEFAULT_CUT_TYPES: Record<SceneRole, CutType> = {
  hook: "hard", problem: "hard", story_a: "continuity", reset: "hard",
  story_b: "continuity", cta: "hard", atmosphere: "hard", establish: "hard",
};

const CONTINUITY_SOURCE_ROLES: SceneRole[] = ["problem", "story_a", "story_b"];

export function assignSceneIdsAndZones(
  storyboard: GeneratedStoryboard,
  tier: string,
): Record<string, unknown>[] {
  const storyboardId = crypto.randomUUID?.() ?? `sb_${Date.now()}`;
  const hasStoryB = storyboard.scenes.some(s => s.role === "story_b");
  const heroRole = hasStoryB ? "story_b" : "story_a";
  const totalScenes = storyboard.scenes.length;

  return storyboard.scenes.map((scene, i) => {
    const isFinalScene = i === totalScenes - 1;
    const effectiveRole: SceneRole = (scene.role as SceneRole) || "story_a";
    const positionRatio = i / Math.max(totalScenes - 1, 1);
    const effectiveChangeType = scene.change_type || "info";

    // Cut type resolution
    const prevScene = i > 0 ? storyboard.scenes[i - 1] : null;
    const prevRole: SceneRole | null = prevScene ? ((prevScene.role as SceneRole) || "story_a") : null;
    let computedCutType: CutType = DEFAULT_CUT_TYPES[effectiveRole] || "hard";

    if (i === 0) computedCutType = "hard";
    else if (["hook", "cta", "reset"].includes(effectiveRole)) computedCutType = "hard";
    else if (computedCutType === "continuity" && (!prevRole || !CONTINUITY_SOURCE_ROLES.includes(prevRole))) {
      computedCutType = "hard";
    }

    // Zone computation
    let computedZone: CutZone = (isFinalScene && effectiveRole === "cta")
      ? "button"
      : (scene as any).zone || ROLE_TO_ZONE[effectiveRole] || "setup";

    if (effectiveRole === "reset" && effectiveChangeType === "info" && positionRatio < 0.4) {
      computedZone = "hook";
    }

    const zoneDuration = ZONE_DURATIONS[computedZone];
    let t = 0.5;
    if (computedZone === "hook") t = 0.3;
    else if (computedZone === "button") t = 0.5;
    else if (computedZone === "setup") t = positionRatio < 0.35 ? 0.35 : 0.5;
    else if (computedZone === "payoff") t = positionRatio > 0.7 ? 0.7 : 0.6;

    const durationMid = zoneDuration.min + (zoneDuration.max - zoneDuration.min) * t;

    return {
      id: `scene_${storyboardId}_${i}`,
      ...scene,
      role: effectiveRole,
      sequence_index: i,
      change_type: effectiveChangeType,
      cut_type: computedCutType,
      zone: computedZone,
      duration_suggested: Math.round(durationMid * 10) / 10,
      duration_min: zoneDuration.min,
      duration_max: zoneDuration.max,
      duration_reason: zoneDuration.reason,
      is_hero_shot: tier === "hero"
        ? ["story_a", "story_b", "establish"].includes(effectiveRole)
        : effectiveRole === heroRole,
      force_present: scene.force_present,
      force_type: scene.force_type,
      escalation_delta: scene.escalation_delta,
      setpiece_delta: scene.setpiece_delta ?? scene.state_to ?? null,
      state_from: scene.state_from,
      state_to: scene.state_to,
      alternate_subject: scene.alternate_subject,
    };
  });
}
