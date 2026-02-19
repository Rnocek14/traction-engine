import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertNotEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Import router and types
import {
  selectStoryType,
  mergeConstraints,
  preflightValidate,
  routeStory,
} from "../_shared/story-type-router.ts";

import type { MergedConstraints } from "../_shared/story-type-router.ts";

import { STORY_TEMPLATES } from "../_shared/story-types.ts";
import type { StoryType, ContentGoal, EmotionalIntensity, HookCategory } from "../_shared/story-types.ts";
import type { ContentVertical } from "../_shared/vertical-profiles.ts";
import { VERTICAL_PROFILES } from "../_shared/vertical-profiles.ts";

import {
  compileViralPrompt,
  compileViralStory,
  quickViralPrompt,
} from "../_shared/viral-compiler.ts";
import type { ViralSceneInput } from "../_shared/viral-compiler.ts";

import {
  sanitizePromptText,
  sanitizeStory,
  selectWeightedHookCategory,
  getVerticalCTA,
} from "../_shared/prompt-compliance.ts";

// ═══════════════════════════════════════════════════════════
// A) ROUTER SNAPSHOT TESTS
// ═══════════════════════════════════════════════════════════

Deno.test("selectStoryType: reach goal returns viral-mode type", () => {
  const result = selectStoryType({ vertical: "saas", goal: "reach" });
  assert(["viral_hook", "listicle", "trend_hijack", "before_after"].includes(result.type));
  assert(result.reason.includes("goal=reach"));
});

Deno.test("selectStoryType: brand goal can return myth", () => {
  const result = selectStoryType({ vertical: "entertainment", goal: "brand" });
  assert(["myth", "micro_story", "authority"].includes(result.type));
});

Deno.test("selectStoryType: forced type is respected", () => {
  const result = selectStoryType({ vertical: "health", goal: "reach", forced_type: "authority" });
  assertEquals(result.type, "authority");
  assert(result.reason.includes("forced:authority"));
});

Deno.test("selectStoryType: forced type warns if not recommended for vertical", () => {
  // myth is excluded from news vertical
  const result = selectStoryType({ vertical: "news", goal: "brand", forced_type: "myth" });
  assertEquals(result.type, "myth");
  assert(result.reason.includes("warning"));
});

Deno.test("selectStoryType: undefined intensity → effective_intensity is undefined", () => {
  const result = selectStoryType({ vertical: "finance", goal: "authority" });
  assertEquals(result.effective_intensity, undefined);
});

Deno.test("selectStoryType: intensity clamped to vertical max", () => {
  // Finance max = medium, requesting extreme → should clamp to medium
  const result = selectStoryType({ vertical: "finance", goal: "reach", emotional_intensity: "extreme" });
  assertEquals(result.effective_intensity, "medium");
});

Deno.test("selectStoryType: entertainment allows extreme intensity", () => {
  const result = selectStoryType({ vertical: "entertainment", goal: "reach", emotional_intensity: "extreme" });
  assertEquals(result.effective_intensity, "extreme");
});

Deno.test("selectStoryType: resolved type is always a valid STORY_TEMPLATES key", () => {
  const verticals: ContentVertical[] = ["health", "finance", "saas", "entertainment", "education", "ecommerce", "lifestyle", "news"];
  const goals: ContentGoal[] = ["reach", "sell", "authority", "brand", "retain"];
  
  for (const v of verticals) {
    for (const g of goals) {
      const result = selectStoryType({ vertical: v, goal: g });
      assert(result.type in STORY_TEMPLATES, `Unknown type: ${result.type}`);
    }
  }
});

// ── Constraint merger invariants ──

Deno.test("mergeConstraints: allowed_hook_categories never empty", () => {
  const types: StoryType[] = ["viral_hook", "pas", "authority", "listicle", "micro_story", "before_after", "trend_hijack", "myth"];
  const verticals: ContentVertical[] = ["health", "finance", "saas", "entertainment", "education", "ecommerce", "lifestyle", "news"];
  
  for (const t of types) {
    for (const v of verticals) {
      const c = mergeConstraints(t, v, "test");
      assert(c.allowed_hook_categories.length > 0, `Empty hooks for ${t}/${v}`);
    }
  }
});

Deno.test("mergeConstraints: allowed_tones never empty", () => {
  const c = mergeConstraints("viral_hook", "health", "test");
  assert(c.allowed_tones.length > 0);
});

Deno.test("mergeConstraints: strict verticals disable cinematic features", () => {
  const strictVerticals: ContentVertical[] = ["health", "finance", "news"];
  for (const v of strictVerticals) {
    const c = mergeConstraints("myth", v, "test");
    assertEquals(c.features.director_brief, false, `director_brief should be disabled for ${v}`);
    assertEquals(c.features.capture_contract, false, `capture_contract should be disabled for ${v}`);
    assertEquals(c.features.motion_amplification, false, `motion_amplification should be disabled for ${v}`);
    assertEquals(c.features.escalation_logic, false, `escalation_logic should be disabled for ${v}`);
  }
});

Deno.test("mergeConstraints: disclaimer present for health/finance", () => {
  const healthC = mergeConstraints("viral_hook", "health", "test");
  assertEquals(healthC.require_disclaimer, true);
  assert(healthC.disclaimer_text && healthC.disclaimer_text.length > 0);
  
  const financeC = mergeConstraints("viral_hook", "finance", "test");
  assertEquals(financeC.require_disclaimer, true);
  assert(financeC.disclaimer_text && financeC.disclaimer_text.length > 0);
  
  const entertainC = mergeConstraints("viral_hook", "entertainment", "test");
  assertEquals(entertainC.require_disclaimer, false);
});

Deno.test("mergeConstraints: effective_intensity propagated as optional", () => {
  const withIntensity = mergeConstraints("viral_hook", "saas", "test", "high");
  assertEquals(withIntensity.effective_intensity, "high");
  
  const withoutIntensity = mergeConstraints("viral_hook", "saas", "test");
  assertEquals(withoutIntensity.effective_intensity, undefined);
});

Deno.test("mergeConstraints: compiler matches template prompt_mode", () => {
  const viral = mergeConstraints("viral_hook", "saas", "test");
  assertEquals(viral.compiler, "viral");
  
  const myth = mergeConstraints("myth", "entertainment", "test");
  assertEquals(myth.compiler, "cinematic");
});

// ── Preflight validator ──

Deno.test("preflightValidate: too many clips → error", () => {
  const c = mergeConstraints("trend_hijack", "saas", "test"); // max_clips = 3
  const scenes = Array.from({ length: 5 }, (_, i) => ({
    id: `s${i}`, prompt: "test prompt here", duration_target: 3, beat_index: i,
  }));
  const result = preflightValidate(c, { scenes });
  assertEquals(result.valid, false);
  assert(result.errors.some(e => e.includes("Too many")));
});

Deno.test("preflightValidate: valid storyboard passes", () => {
  const c = mergeConstraints("viral_hook", "saas", "test");
  const scenes = c.template.beats.map((beat, i) => ({
    id: `s${i}`,
    prompt: "A person demonstrates the product in a modern office.",
    duration_target: Math.round((beat.duration_range[0] + beat.duration_range[1]) / 2),
    beat_index: i,
    beat_role: beat.role,
  }));
  const result = preflightValidate(c, { scenes });
  assertEquals(result.valid, true);
  assertEquals(result.errors.length, 0);
});

Deno.test("preflightValidate: hook at wrong position → warning", () => {
  const c = mergeConstraints("viral_hook", "saas", "test");
  const scenes = [
    { id: "s0", prompt: "Normal scene.", duration_target: 4, beat_index: 0, beat_role: "payoff" },
    { id: "s1", prompt: "Hook scene.", duration_target: 3, beat_index: 1, beat_role: "hook" },
    { id: "s2", prompt: "CTA scene.", duration_target: 3, beat_index: 2, beat_role: "cta" },
  ];
  const result = preflightValidate(c, { scenes });
  assert(result.warnings.some(w => w.includes("hook") && w.includes("not at position 0")));
});

// ═══════════════════════════════════════════════════════════
// B) COMPILER GOLDEN-OUTPUT TESTS
// ═══════════════════════════════════════════════════════════

function makeSampleScene(overrides?: Partial<ViralSceneInput>): ViralSceneInput {
  return {
    scene_id: "test-1",
    beat_index: 0,
    beat: {
      role: "hook",
      description: "Test hook",
      duration_range: [2, 3],
      is_hook: true,
      requires_text_overlay: true,
      camera_suggestion: "close-up",
    },
    subject: "A person",
    action: "turns to camera with surprised expression",
    environment: "modern kitchen, morning light",
    mood: "energetic",
    ...overrides,
  };
}

Deno.test("compileViralPrompt: output within word limit", () => {
  const c = mergeConstraints("viral_hook", "saas", "test");
  const scene = makeSampleScene();
  const result = compileViralPrompt(scene, c);
  // Hook beats have 0.6 multiplier → 50 * 0.6 = 30 words max
  assert(result.word_count <= 30, `Hook prompt too long: ${result.word_count} words`);
});

Deno.test("compileViralPrompt: no structural labels in output", () => {
  const c = mergeConstraints("viral_hook", "saas", "test");
  const scene = makeSampleScene();
  const result = compileViralPrompt(scene, c);
  const lower = result.prompt.toLowerCase();
  assert(!lower.includes("setting:"), `Contains "Setting:" label`);
  assert(!lower.includes("lighting:"), `Contains "Lighting:" label`);
  assert(!lower.includes("mood:"), `Contains "Mood:" label`);
  assert(!lower.includes("camera:"), `Contains "Camera:" label`);
});

Deno.test("compileViralPrompt: no fragmented punctuation", () => {
  const c = mergeConstraints("viral_hook", "saas", "test");
  const scene = makeSampleScene();
  const result = compileViralPrompt(scene, c);
  assert(!result.prompt.includes(".."), `Double dots in prompt: ${result.prompt}`);
  assert(!result.prompt.includes(". ."), `Spaced dots in prompt: ${result.prompt}`);
});

Deno.test("compileViralPrompt: hook beats are shorter than non-hook", () => {
  const c = mergeConstraints("viral_hook", "saas", "test");
  
  const hookScene = makeSampleScene(); // is_hook: true
  const hookResult = compileViralPrompt(hookScene, c);
  
  const payoffScene = makeSampleScene({
    beat_index: 1,
    beat: { role: "payoff", description: "Payoff", duration_range: [3, 5], is_hook: false, requires_text_overlay: true, camera_suggestion: "medium" },
  });
  const payoffResult = compileViralPrompt(payoffScene, c);
  
  // Hook should be shorter (or equal at worst due to truncation)
  assert(hookResult.char_count <= payoffResult.char_count + 10,
    `Hook (${hookResult.char_count}) should be shorter than payoff (${payoffResult.char_count})`);
});

Deno.test("compileViralPrompt: hook_category propagated to output", () => {
  const c = mergeConstraints("viral_hook", "saas", "test");
  const scene = makeSampleScene({ hook_category: "curiosity" });
  const result = compileViralPrompt(scene, c);
  assertEquals(result.hook_category, "curiosity");
});

Deno.test("compileViralStory: stats are correct", () => {
  const c = mergeConstraints("viral_hook", "saas", "test");
  const template = c.template;
  const scenes: ViralSceneInput[] = template.beats.map((beat, i) => makeSampleScene({
    scene_id: `s${i}`,
    beat_index: i,
    beat,
  }));
  
  const result = compileViralStory(scenes, c);
  assertEquals(result.prompts.length, template.beats.length);
  assert(result.total_duration > 0);
  assert(result.stats.avg_chars > 0);
  assert(result.stats.avg_words > 0);
  assertEquals(result.stats.beat_roles.length, template.beats.length);
});

Deno.test("quickViralPrompt: output within limits", () => {
  const result = quickViralPrompt("A chef", "plates a dish with precision", {
    environment: "restaurant kitchen",
    mood: "focused",
    max_chars: 200,
    max_words: 30,
  });
  assert(result.length <= 200);
  assert(result.split(/\s+/).filter(Boolean).length <= 30);
});

// ═══════════════════════════════════════════════════════════
// C) COMPLIANCE TESTS
// ═══════════════════════════════════════════════════════════

Deno.test("sanitizePromptText: health vertical replaces 'guaranteed'", () => {
  const result = sanitizePromptText("This product is guaranteed to work", "health");
  assert(result.was_modified);
  assert(!result.text.includes("guaranteed"));
  assert(result.replacements.length > 0);
});

Deno.test("sanitizePromptText: 'will cure' is hard-blocked in health", () => {
  const result = sanitizePromptText("This will cure your condition", "health");
  assert(result.hard_blocks.length > 0);
});

Deno.test("sanitizePromptText: finance replaces 'risk-free'", () => {
  const result = sanitizePromptText("A risk-free investment opportunity", "finance");
  assert(result.was_modified);
  assert(!result.text.includes("risk-free"));
});

Deno.test("sanitizePromptText: entertainment allows edgy language", () => {
  const result = sanitizePromptText("This product is guaranteed awesome", "entertainment");
  // Entertainment is not in the health/finance verticals for guarantee rule
  assertEquals(result.was_modified, false);
  assertEquals(result.hard_blocks.length, 0);
});

Deno.test("sanitizePromptText: disclaimer returned for strict verticals", () => {
  const health = sanitizePromptText("A healthy product", "health");
  assert(health.disclaimer !== undefined);
  
  const saas = sanitizePromptText("A great tool", "saas");
  assertEquals(saas.disclaimer, undefined);
});

Deno.test("sanitizeStory: batch sanitization works", () => {
  const result = sanitizeStory([
    { scene_id: "s1", prompt: "This is guaranteed to help" },
    { scene_id: "s2", prompt: "Normal prompt here" },
    { scene_id: "s3", prompt: "This will cure everything" },
  ], "health");
  
  assertEquals(result.scenes.length, 3);
  assert(result.scenes[0].was_modified); // guaranteed → replaced
  assertEquals(result.scenes[1].was_modified, false); // no issues
  assert(result.has_hard_blocks); // "will cure" is hard-blocked
  assert(result.disclaimer !== undefined);
});

Deno.test("selectWeightedHookCategory: deterministic with fixed rng", () => {
  const allowed: HookCategory[] = ["curiosity", "authority"];
  // rng=0.01 always picks first weighted category
  const result = selectWeightedHookCategory("finance", allowed, () => 0.01);
  assert(allowed.includes(result as HookCategory));
  // With same rng, result is stable
  const result2 = selectWeightedHookCategory("finance", allowed, () => 0.01);
  assertEquals(result, result2);
});

Deno.test("selectWeightedHookCategory: returns allowed category", () => {
  const allowed: HookCategory[] = ["curiosity", "authority"];
  const result = selectWeightedHookCategory("finance", allowed);
  assert(allowed.includes(result as HookCategory));
});

Deno.test("selectWeightedHookCategory: fallback when no weights match", () => {
  const result = selectWeightedHookCategory("health", ["nonexistent_category" as HookCategory]);
  assertEquals(result, "nonexistent_category"); // Returns first allowed even if no weight
});

Deno.test("getVerticalCTA: deterministic with fixed rng", () => {
  const cta1 = getVerticalCTA("saas", () => 0);
  const cta2 = getVerticalCTA("saas", () => 0);
  assertEquals(cta1.phrase, cta2.phrase);
  assertEquals(cta1.style, "direct");
});

Deno.test("getVerticalCTA: returns valid CTA", () => {
  const verticals: ContentVertical[] = ["health", "finance", "saas", "entertainment", "education", "ecommerce", "lifestyle", "news"];
  for (const v of verticals) {
    const cta = getVerticalCTA(v);
    assert(cta.phrase.length > 0, `Empty CTA for ${v}`);
    assert(cta.style.length > 0, `Empty style for ${v}`);
  }
});

// ═══════════════════════════════════════════════════════════
// D) FULL PIPELINE E2E
// ═══════════════════════════════════════════════════════════

Deno.test("routeStory: full pipeline returns consistent shape", () => {
  const { constraints, selection } = routeStory({ vertical: "saas", goal: "sell" });
  
  assert(constraints.story_type in STORY_TEMPLATES);
  assertEquals(constraints.story_type, selection.type);
  assert(constraints.compiler === "viral" || constraints.compiler === "cinematic");
  assert(constraints.allowed_hook_categories.length > 0);
  assert(constraints.allowed_tones.length > 0);
  assert(constraints.selection_reason.length > 0);
});

Deno.test("routeStory + compile: end-to-end viral pipeline", () => {
  const { constraints } = routeStory({ vertical: "health", goal: "sell" });
  
  if (constraints.compiler === "viral") {
    const scenes: ViralSceneInput[] = constraints.template.beats.map((beat, i) => ({
      scene_id: `e2e-${i}`,
      beat_index: i,
      beat,
      subject: "A person",
      action: "demonstrates a wellness routine",
      environment: "bright studio",
    }));
    
    const compiled = compileViralStory(scenes, constraints);
    
    // All prompts should be within limits
    for (const p of compiled.prompts) {
      assert(p.char_count <= constraints.prompt_char_limit, `Prompt exceeds char limit: ${p.char_count}`);
      // No structural labels
      assert(!p.prompt.toLowerCase().includes("setting:"));
    }
    
    // Preflight should pass
    const preflight = preflightValidate(constraints, {
      scenes: compiled.prompts.map(p => ({
        id: p.scene_id,
        prompt: p.prompt,
        duration_target: p.duration_target,
        beat_index: p.beat_index,
        beat_role: p.beat_role,
      })),
    });
    assertEquals(preflight.valid, true);
  }
});

// ═══════════════════════════════════════════════════════════
// E) NEW HARDENING TESTS
// ═══════════════════════════════════════════════════════════

Deno.test("preflightValidate: beat count mismatch → warning", () => {
  const c = mergeConstraints("viral_hook", "saas", "test");
  // Create fewer scenes than template beats
  const scenes = [{ id: "s0", prompt: "Test.", duration_target: 3, beat_index: 0, beat_role: "hook" }];
  const result = preflightValidate(c, { scenes });
  assert(result.warnings.some(w => w.includes("does not match template beat count")));
});

Deno.test("preflightValidate: hard-blocked phrase in strict vertical → error", () => {
  const c = mergeConstraints("viral_hook", "health", "test");
  const scenes = c.template.beats.map((beat, i) => ({
    id: `s${i}`,
    prompt: i === 0 ? "This will cure your pain" : "Normal prompt",
    duration_target: Math.round((beat.duration_range[0] + beat.duration_range[1]) / 2),
    beat_index: i,
    beat_role: beat.role,
  }));
  const result = preflightValidate(c, { scenes });
  assertEquals(result.valid, false);
  assert(result.errors.some(e => e.includes("hard-blocked phrase")));
});

Deno.test("preflightValidate: hard-blocked phrase in relaxed vertical → no error", () => {
  const c = mergeConstraints("viral_hook", "entertainment", "test");
  const scenes = c.template.beats.map((beat, i) => ({
    id: `s${i}`,
    prompt: "This will cure your boredom",
    duration_target: Math.round((beat.duration_range[0] + beat.duration_range[1]) / 2),
    beat_index: i,
    beat_role: beat.role,
  }));
  const result = preflightValidate(c, { scenes });
  assert(!result.errors.some(e => e.includes("hard-blocked")));
});
