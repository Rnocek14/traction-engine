/**
 * generate-storyboard
 * 
 * Uses GPT-4o to generate a complete multi-scene storyboard
 * from a simple concept or description.
 * 
 * Two paths:
 * - Template mode (story_engine provided): uses routeStory() pipeline
 * - Legacy mode: freeform GPT-4o storyboard generation
 */

import {
  MIN_CLIP_DURATION, MAX_CLIP_DURATION, TIMING_LIGHT_ROLES,
  snapToProvider, estimateNarrationDuration, bucketAwareRebalance, formatProviderBuckets,
} from "../_shared/timing-helpers.ts";
import type { SceneRole, CutZone, CutType, ChangeType, GeneratedStoryboard } from "../_shared/storyboard-prompts.ts";
import { SYSTEM_PROMPT, STORY_TYPE_GUIDANCE } from "../_shared/storyboard-prompts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GenerateRequest {
  concept: string;
  story_type?: "short_story" | "brainrot" | "info" | "hybrid";
  scene_count?: number;
  story_engine?: {
    vertical: string;
    goal: string;
    emotional_intensity?: string;
    requested_story_type?: string;
    research_mode?: "auto" | "on" | "off";
  };
  generator_mode?: "legacy" | "template";
  tier?: "volume" | "hero";
  brutality_mode?: boolean;
  sanitization_level?: string;
  character_continuity_mode?: boolean;
  locked_provider?: string;
  debug_persist?: boolean;
  debug_tag?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const body = await req.json() as GenerateRequest;
    const { concept, story_type = "short_story", scene_count } = body;
    const tier = body.tier || "volume";

    // ═══════════════════════════════════════════════════════════
    // TEMPLATE MODE: story_engine provided → use routeStory() pipeline
    // ═══════════════════════════════════════════════════════════
    const useTemplateMode = !!(body.story_engine?.vertical && body.story_engine?.goal) || body.generator_mode === "template";

    if (useTemplateMode && body.story_engine) {
      const { routeStory, preflightValidate } = await import("../_shared/story-type-router.ts");
      const viralMod = await import("../_shared/viral-compiler.ts");
      const compileViralPrompt = viralMod.compileViralPrompt;
      const { sanitizePromptText, selectWeightedHookCategory, getVerticalCTA, sanitizeStory } = await import("../_shared/prompt-compliance.ts");
      const { buildStoryEngineAudit, seededRng } = await import("../_shared/story-engine-audit.ts");
      const { buildResearchBrief, buildClaimConstraintBlock, checkClaimCoverage, validateClaimIds, scanTextForBannedLanguage, detectResearchIntent } = await import("../_shared/research-engine.ts");
      const { checkStrictComplianceBlock, checkCompiledHardBlocks, checkClaimCoverageBlock, resolveDebugPersist, buildDebugPayload, writeDebugPersist } = await import("../_shared/story-preflight.ts");

      type ContentVertical = string;
      type ContentGoal = string;
      type EmotionalIntensity = string;
      type StoryType = string;

      const vertical = body.story_engine.vertical as ContentVertical;
      const goal = body.story_engine.goal as ContentGoal;
      const emotional_intensity = body.story_engine.emotional_intensity as EmotionalIntensity | undefined;
      const requested_story_type = body.story_engine.requested_story_type as StoryType | undefined;
      const researchMode = body.story_engine.research_mode || "auto";

      console.log(`[generate-storyboard] Template mode: vertical=${vertical} goal=${goal} intensity=${emotional_intensity || "unset"} research=${researchMode}`);

      // 1. Route story → get constraints + selection
      const { constraints, selection } = routeStory({
        vertical,
        goal,
        emotional_intensity,
        forced_type: requested_story_type,
      });

      const template = constraints.template;
      console.log(`[generate-storyboard] Resolved: type=${selection.type} compiler=${constraints.compiler} beats=${template.beats.length}`);

      // 1b. Research intent detection
      const researchIntent = detectResearchIntent(concept, vertical);
      console.log(`[generate-storyboard] Research intent: needs=${researchIntent.needs_research} intent=${researchIntent.intent} reason=${researchIntent.reason}`);

      // 1c. Research step
      const researchBrief = await buildResearchBrief({
        concept,
        vertical,
        mode: researchMode as "auto" | "on" | "off",
      });

      if (researchBrief.activated) {
        console.log(`[generate-storyboard] Research: grounded=${researchBrief.grounded} claims=${researchBrief.claims.length} sources=${researchBrief.sources.length}`);
        if (researchMode === "on" && !researchBrief.grounded) {
          return new Response(
            JSON.stringify({
              error: `Research mode is "on" but retrieval failed: ${researchBrief.failure_reason || "unknown error"}. Set research_mode to "auto" or "off" to proceed without research.`,
              research_failure: true,
            }),
            { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      const claimConstraints = buildClaimConstraintBlock(researchBrief, vertical);

      // 2. Seeded RNG
      const tempId = crypto.randomUUID();
      const rng = seededRng(tempId);

      // 3. Hook + CTA selection
      const hookCategory = selectWeightedHookCategory(
        vertical,
        constraints.allowed_hook_categories.map(String),
        rng
      );
      const ctaResult = getVerticalCTA(vertical, rng);
      console.log(`[generate-storyboard] Hook category: ${hookCategory}, CTA: "${ctaResult.phrase}"`);

      // 4. Compiler fork
      if (constraints.compiler === "cinematic") {
        console.log(`[generate-storyboard] Cinematic compiler → falling through to legacy GPT`);
      } else {
        // ── VIRAL TEMPLATE PIPELINE ──
        const beatPrompts = template.beats.map((beat, i) => {
          const isHook = beat.is_hook;
          const isCTA = beat.role.includes("cta") || beat.role === "proof_cta" || beat.role === "value_cta" || beat.role === "how_cta" || beat.role === "credibility_cta" || beat.role === "item_3_cta";
          return `Beat ${i + 1} (${beat.role}): ${beat.description}${isHook ? ` [hook_category: ${hookCategory}]` : ""}${isCTA ? ` [CTA: "${ctaResult.phrase}"]` : ""}`;
        });

        const templatePrompt = `You are an elite short-form video scriptwriter who creates VIRAL, FASCINATING content. Given a concept and beat structure, generate scene content.

CONCEPT: "${concept}"
STORY TYPE: ${selection.type} (${template.name})
VERTICAL: ${vertical}
TONE: ${constraints.allowed_tones.join(", ")}
${claimConstraints}
BEAT STRUCTURE (generate content for each):
${beatPrompts.join("\n")}

For each beat, return:
- subject: Who/what is on screen — MUST directly illustrate the narration fact
- action: What they DO physically (use action verbs)
- environment: Where — MUST match the setting implied by the fact
- mood: Single word
- text_overlay: Short punchy text (MAX 6 words)
- narration_line: REQUIRED voiceover line (10-25 words, specific, surprising, conversational)
${researchBrief.activated && researchBrief.grounded ? '- claim_ids: Array of claim IDs this beat references (e.g., ["claim_001"])' : ""}

VISUAL-NARRATION ALIGNMENT: The subject and environment MUST visually depict the specific fact in narration_line.
TONE CONSISTENCY: The LAST scene MUST maintain the same mood as the rest.
NARRATION: Must be SPECIFIC, FACTUAL, SURPRISING, CONVERSATIONAL. No vague filler or clickbait.

Return ONLY valid JSON: {"beats":[{...}]}`;

        console.log(`[generate-storyboard] Calling GPT for ${template.beats.length} beats...`);

        const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: "You generate scene content for short-form video. Return ONLY valid JSON, no markdown." },
              { role: "user", content: templatePrompt },
            ],
            temperature: 0.7,
            max_tokens: 1500,
          }),
        });

        if (!gptResponse.ok) {
          const errText = await gptResponse.text();
          console.error(`[generate-storyboard] GPT error: ${gptResponse.status} ${errText}`);
          throw new Error(`GPT API error: ${gptResponse.status}`);
        }

        const gptData = await gptResponse.json();
        const gptContent = gptData.choices?.[0]?.message?.content || "";

        let sceneContents: Array<{
          subject: string; action: string; environment: string;
          mood: string; text_overlay: string; narration_line: string;
          claim_ids?: string[];
        }>;

        try {
          const jsonMatch = gptContent.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error("No JSON in GPT response");
          const parsed = JSON.parse(jsonMatch[0]);
          sceneContents = parsed.beats || parsed.scenes || [];
        } catch (parseErr) {
          console.error("[generate-storyboard] Failed to parse GPT response:", gptContent.slice(0, 500));
          throw new Error("Failed to parse scene content from GPT");
        }

        if (sceneContents.length < template.beats.length) {
          console.warn(`[generate-storyboard] GPT returned ${sceneContents.length} beats, expected ${template.beats.length}`);
          while (sceneContents.length < template.beats.length) {
            sceneContents.push({
              subject: "visual scene", action: "reveals", environment: "dramatic setting",
              mood: "intense", text_overlay: "Watch this", narration_line: "Something incredible happened next.",
            });
          }
        }

        // 5. Validate claim IDs
        if (researchBrief.activated && researchBrief.grounded) {
          const validIds = new Set(researchBrief.claims.map(c => c.id));
          for (const content of sceneContents) {
            if (content.claim_ids) {
              const validation = validateClaimIds(content.claim_ids, validIds);
              if (validation.invalid.length > 0) {
                console.warn(`[generate-storyboard] Invalid claim IDs removed: ${validation.invalid.join(", ")}`);
                content.claim_ids = validation.valid;
              }
            }
          }

          // Banned language scan
          const bannedScan = scanTextForBannedLanguage(
            sceneContents.map(c => c.narration_line),
            vertical,
            researchBrief
          );
          if (bannedScan.errors.length > 0) {
            console.warn(`[generate-storyboard] Banned language: ${bannedScan.errors.join("; ")}`);
          }

          // Strict compliance block
          const claimValidation = validateClaimIds(
            sceneContents.flatMap(c => c.claim_ids || []),
            new Set(researchBrief.claims.map(c => c.id))
          );
          const strictCheck = checkStrictComplianceBlock(vertical, claimValidation.errors, bannedScan.errors);
          if (strictCheck.blocked) return strictCheck.response;
        }

        // 5a. Compile prompts
        const storyboardId = crypto.randomUUID();
        const allSanitizedTerms: string[] = [];
        const compileHardBlocks: string[] = [];

        const compiledScenes = template.beats.map((beat, i) => {
          const content = sceneContents[i];
          const sceneInput = {
            beat_role: beat.role,
            beat_description: beat.description,
            subject: content.subject,
            action: content.action,
            environment: content.environment,
            narration_line: content.narration_line,
            mood: content.mood,
            text_overlay: content.text_overlay,
            hook_category: beat.is_hook ? hookCategory : undefined,
          };

          const compiled = compileViralPrompt(sceneInput, constraints);
          const compliance = sanitizePromptText(compiled.prompt, vertical);
          const finalPrompt = compliance.text;

          if (compliance.replacements.length > 0) {
            allSanitizedTerms.push(...compliance.replacements.map(r => `Scene ${i}: ${r}`));
          }
          if (compliance.hard_blocks.length > 0) {
            compileHardBlocks.push(...compliance.hard_blocks.map(hb => `Scene ${i} (${beat.role}): ${hb}`));
          }

          return {
            id: `scene_${storyboardId}_${i}`,
            prompt: finalPrompt,
            duration_target: compiled.duration_target,
            camera_direction: compiled.camera_suggestion,
            role: beat.role as SceneRole,
            beat_role: beat.role,
            beat_index: i,
            change_type: (i === 0 ? "info" : "emotion") as ChangeType,
            narration_line: content.narration_line,
            onscreen_text: content.text_overlay,
            claim_ids: content.claim_ids || [],
            sequence_index: i,
            zone: (beat.is_hook ? "hook" : beat.role.includes("cta") ? "payoff" : "setup") as CutZone,
            cut_type: (i === 0 || beat.is_hook ? "hard" : "continuity") as CutType,
            camera_lead_source: compiled.camera_lead_source,
            compliance_modified: compliance.was_modified || undefined,
          };
        });

        // 5b. Narration-aware duration adjustment
        const defaultProvider = "sora";
        const narrationDurations = compiledScenes.map(s => {
          const est = estimateNarrationDuration(s.narration_line || "");
          return est > 0 ? est : s.duration_target;
        });

        const totalEstimatedAudio = narrationDurations.reduce((sum, d) => sum + d, 0);
        const totalTemplateDuration = compiledScenes.reduce((sum, s) => sum + s.duration_target, 0);
        const driftPct = totalTemplateDuration > 0
          ? Math.abs(totalEstimatedAudio - totalTemplateDuration) / totalTemplateDuration
          : 1;

        const maxFeasibleTotal = compiledScenes.length * MAX_CLIP_DURATION;
        let overflowWarningMsg: string | undefined;
        if (totalEstimatedAudio > maxFeasibleTotal * 1.15) {
          overflowWarningMsg = `Narration overflow: ${totalEstimatedAudio.toFixed(1)}s estimated vs ${maxFeasibleTotal}s max capacity. Consider shortening narration.`;
          console.warn(`[generate-storyboard] ⚠️ ${overflowWarningMsg}`);
        }

        let timingDiagnostics: {
          estimated_audio_total: number; template_total: number; final_total: number;
          drift_pct: number; adjusted: boolean; provider_buckets: string;
          per_scene: number[]; overflow_warning?: boolean;
        };

        if (driftPct > 0.15) {
          console.log(`[generate-storyboard] Narration drift ${(driftPct * 100).toFixed(0)}% — adjusting durations`);
          const targetTotal = Math.min(Math.round((totalTemplateDuration * 0.3 + totalEstimatedAudio * 0.7)), maxFeasibleTotal);
          const totalWeight = narrationDurations.reduce((sum, d) => sum + d, 0) || 1;
          const rawAllocated = narrationDurations.map(d => (d / totalWeight) * targetTotal);

          for (let i = 0; i < rawAllocated.length; i++) {
            const words = (compiledScenes[i].narration_line || "").trim().split(/\s+/).filter(Boolean).length;
            const beatRole = compiledScenes[i].beat_role || compiledScenes[i].role;
            if (words < 4 && !TIMING_LIGHT_ROLES.has(beatRole)) {
              rawAllocated[i] = Math.min(rawAllocated[i], MIN_CLIP_DURATION);
            }
          }

          const snapped = rawAllocated.map(d => snapToProvider(d, defaultProvider));
          const rebalanced = bucketAwareRebalance(snapped, targetTotal, defaultProvider);

          for (let i = 0; i < compiledScenes.length; i++) {
            compiledScenes[i].duration_target = rebalanced[i];
          }

          const finalTotal = rebalanced.reduce((sum, d) => sum + d, 0);
          console.log(`[generate-storyboard] Adjusted durations: [${rebalanced.join(", ")}] total=${finalTotal}s`);

          timingDiagnostics = {
            estimated_audio_total: Math.round(totalEstimatedAudio * 10) / 10,
            template_total: totalTemplateDuration, final_total: finalTotal,
            drift_pct: Math.round(driftPct * 100), adjusted: true,
            provider_buckets: formatProviderBuckets(defaultProvider),
            per_scene: rebalanced, overflow_warning: !!overflowWarningMsg || undefined,
          };
        } else {
          for (let i = 0; i < compiledScenes.length; i++) {
            compiledScenes[i].duration_target = snapToProvider(compiledScenes[i].duration_target, defaultProvider);
          }
          const finalTotal = compiledScenes.reduce((sum, s) => sum + s.duration_target, 0);

          timingDiagnostics = {
            estimated_audio_total: Math.round(totalEstimatedAudio * 10) / 10,
            template_total: totalTemplateDuration, final_total: finalTotal,
            drift_pct: Math.round(driftPct * 100), adjusted: false,
            provider_buckets: formatProviderBuckets(defaultProvider),
            per_scene: compiledScenes.map(s => s.duration_target),
            overflow_warning: !!overflowWarningMsg || undefined,
          };
        }

        // Block hard blocks in strict verticals
        const hardBlockCheck = checkCompiledHardBlocks(vertical, constraints.moderation_level, compileHardBlocks);
        if (hardBlockCheck.blocked) return hardBlockCheck.response;

        // 6. Preflight
        const preflight = preflightValidate(constraints, {
          scenes: compiledScenes.map(s => ({
            id: s.id, prompt: s.prompt, duration_target: s.duration_target,
            beat_index: s.beat_index, beat_role: s.beat_role,
          })),
        });

        if (!preflight.valid) console.error(`[generate-storyboard] Preflight errors: ${preflight.errors.join("; ")}`);
        if (preflight.warnings.length > 0) console.warn(`[generate-storyboard] Preflight warnings: ${preflight.warnings.join("; ")}`);
        if (overflowWarningMsg) preflight.warnings.push(overflowWarningMsg);

        // Claim coverage
        let claimCoverage = undefined;
        if (researchBrief.activated && researchBrief.grounded && researchBrief.claims.length > 0) {
          claimCoverage = checkClaimCoverage(
            compiledScenes.map(s => ({ claim_ids: s.claim_ids, beat_role: s.beat_role })),
            researchBrief, vertical,
          );
          if (claimCoverage.errors.length > 0) {
            preflight.errors.push(...claimCoverage.errors);
            preflight.valid = false;
          }
          if (claimCoverage.warnings.length > 0) preflight.warnings.push(...claimCoverage.warnings);

          const coverageBlock = checkClaimCoverageBlock(vertical, claimCoverage);
          if (coverageBlock.blocked) return coverageBlock.response;
        }

        // 7. Compliance
        const storyCompliance = sanitizeStory(
          compiledScenes.map(s => ({ scene_id: s.id, prompt: s.prompt })), vertical
        );

        // 8. Audit
        const audit = buildStoryEngineAudit({
          vertical, goal, emotional_intensity,
          requested_story_type, resolved_story_type: selection.type,
          selection_reason: selection.reason, effective_intensity: selection.effective_intensity,
          compiler: constraints.compiler, moderation_level: constraints.moderation_level,
          allowed_tones: constraints.allowed_tones.map(String),
          allowed_hook_categories: constraints.allowed_hook_categories.map(String),
          render_hints: constraints.vertical_profile.render_hints,
          preflight, compliance: {
            disclaimer: storyCompliance.disclaimer, total_replacements: storyCompliance.total_replacements,
            has_hard_blocks: storyCompliance.has_hard_blocks,
            sanitized_terms: allSanitizedTerms.length > 0 ? allSanitizedTerms.slice(0, 200) : undefined,
          },
          rng_seed: tempId,
          research: researchBrief.activated ? researchBrief : undefined,
          research_intent: researchIntent, claim_coverage: claimCoverage,
          timing: timingDiagnostics,
        });

        // 9. Title/spine via GPT
        const metaResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: "Return only valid JSON. No markdown." },
              { role: "user", content: `Given concept "${concept}" for a ${selection.type} video, return:\n{"title":"short catchy title","story_spine":"desire→tension→turn→payoff in 1 sentence","motif_anchors":["visual motif 1","visual motif 2"],"palette_keywords":["color1","color2","texture"]}` },
            ],
            temperature: 0.5, max_tokens: 200,
          }),
        });

        let meta = { title: concept.slice(0, 50), story_spine: "", motif_anchors: [] as string[], palette_keywords: [] as string[] };
        if (metaResponse.ok) {
          try {
            const metaData = await metaResponse.json();
            const metaContent = metaData.choices?.[0]?.message?.content || "";
            const metaJson = metaContent.match(/\{[\s\S]*\}/);
            if (metaJson) meta = { ...meta, ...JSON.parse(metaJson[0]) };
          } catch { /* use defaults */ }
        } else {
          await metaResponse.text();
        }

        // 10. Debug persist
        const debugConfig = resolveDebugPersist(body.debug_persist, body.debug_tag, undefined, tempId);
        let debugPersistId: string | null = null;
        if (debugConfig.enabled) {
          const debugPayload = buildDebugPayload(audit, vertical, goal, tier);
          debugPersistId = await writeDebugPersist(debugConfig, debugPayload);
        }

        // 11. Response
        console.log(`[generate-storyboard] ✓ Template mode complete: ${compiledScenes.length} scenes, type=${selection.type}`);

        return new Response(
          JSON.stringify({
            title: meta.title, story_spine: meta.story_spine,
            motif_anchors: meta.motif_anchors, palette_keywords: meta.palette_keywords,
            scenes: compiledScenes,
            anchors: {
              character: { description: "", wardrobe: "", identity_lock_tokens: [] },
              environment: { location: "", time_of_day: "", props: [] },
              camera_language: { lens: "50mm", movement_style: "smooth", framing_rules: "" },
              negative_list: ["flicker", "jitter", "identity drift", "morph"],
            },
            tier, generator_mode: "template",
            resolved_story_type: selection.type, selection_reason: selection.reason,
            effective_intensity: selection.effective_intensity,
            compiler: constraints.compiler, moderation_level: constraints.moderation_level,
            allowed_tones: constraints.allowed_tones,
            allowed_hook_categories: constraints.allowed_hook_categories,
            hook_category: hookCategory, cta_phrase: ctaResult.phrase,
            preflight, compliance: {
              disclaimer: storyCompliance.disclaimer,
              total_replacements: storyCompliance.total_replacements,
              has_hard_blocks: storyCompliance.has_hard_blocks,
            },
            story_engine_audit: audit,
            ...(debugPersistId ? { debug_persist_id: debugPersistId } : {}),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ═══════════════════════════════════════════════════════════
    // LEGACY MODE: GPT-4o freeform storyboard generation
    // ═══════════════════════════════════════════════════════════
    console.log(`[generate-storyboard] Legacy mode: concept="${concept.slice(0, 60)}..." type=${story_type}`);

    if (!concept?.trim()) {
      return new Response(
        JSON.stringify({ error: "concept required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const typeGuidance = STORY_TYPE_GUIDANCE[story_type] || STORY_TYPE_GUIDANCE.short_story;
    const sceneGuidance = scene_count ? `Create exactly ${scene_count} scenes.` : "";

    const userPrompt = `Create a storyboard for this concept:\n\n"${concept}"\n\nStory Type: ${story_type}\n${typeGuidance}\n${sceneGuidance}\n\nGenerate a complete, filmable storyboard with vivid, specific visual prompts for each scene.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7, max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    let storyboard: GeneratedStoryboard;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in response");
      storyboard = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      throw new Error("Failed to parse storyboard response");
    }

    // ── Legacy validation (lazy-loaded to keep bundle small) ──
    const {
      validateActionVerbs, validateSpectacleBudget,
      enforceEscalationContract, logStoryForcesSummary,
      cleanProtagonistFromSpectacle, enforceVariety,
      assignSceneIdsAndZones,
    } = await import("../_shared/storyboard-validation.ts");

    // Action verb validation
    const validationResults = validateActionVerbs(storyboard.scenes);
    const invalidScenes = validationResults.filter(r => !r.valid);
    if (invalidScenes.length > 0) {
      console.warn(`[generate-storyboard] Validation warnings for ${invalidScenes.length} scenes`);
    }

    // Spectacle budget
    const budgetWarnings = validateSpectacleBudget(storyboard.scenes);
    if (budgetWarnings.length > 0) {
      budgetWarnings.forEach(w => console.warn(`[generate-storyboard] ⚠️ ${w}`));
    }

    // Escalation contract
    enforceEscalationContract(storyboard);
    logStoryForcesSummary(storyboard.scenes);

    // Protagonist language cleanup
    cleanProtagonistFromSpectacle(storyboard);

    // Shot signature variety
    await enforceVariety(storyboard, openaiKey);

    // Ensure negatives
    const baseNegatives = ["flicker", "jitter", "identity drift", "morph"];
    if (storyboard.anchors) {
      storyboard.anchors.negative_list = [
        ...new Set([...(storyboard.anchors.negative_list || []), ...baseNegatives])
      ];
    }

    // Defaults
    const storySpine = storyboard.story_spine || "";
    const motifAnchors = storyboard.motif_anchors || [];
    const paletteKeywords = storyboard.palette_keywords || [];

    // Assign IDs, zones, durations
    const scenesWithIds = assignSceneIdsAndZones(storyboard, tier);

    return new Response(
      JSON.stringify({
        title: storyboard.title,
        story_spine: storySpine,
        motif_anchors: motifAnchors,
        palette_keywords: paletteKeywords,
        scenes: scenesWithIds,
        anchors: storyboard.anchors,
        tier,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("generate-storyboard error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
