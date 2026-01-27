/**
 * Film Continuity Mode - Story Creation
 * 
 * Clean implementation with ZERO legacy guardrails:
 * - Face-only I2V
 * - Variety contract
 * - Minimal prompts
 * - Character bible via text only
 * - Anchor library instead of frame chaining
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type FilmStoryboard,
  type FilmScene,
  type AnchorLibrary,
  buildStoryboardGenerationPrompt,
  generateNonCollidingSignature,
  signaturesCollide,
  pickRealismHints,
} from "../_shared/film-continuity.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateStoryRequest {
  account_id: string;
  premise: string;
  character_description?: string; // Optional - will use premise if not provided
  scene_count?: number;
  title?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body: CreateStoryRequest = await req.json();

    if (!body.account_id || !body.premise) {
      throw new Error("account_id and premise are required");
    }

    // Character description is optional - derive from premise if not provided
    const characterDescription = body.character_description?.trim() || 
      "The main character from the story premise";

    const sceneCount = body.scene_count || 6;

    // Generate storyboard via GPT-4o
    const systemPrompt = buildStoryboardGenerationPrompt(
      body.premise,
      characterDescription,
      sceneCount
    );

    console.log("[film-mode] Generating storyboard...");

    const llmResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a cinematographer creating shot lists. Output valid JSON only." },
          { role: "user", content: systemPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.8,
      }),
    });

    if (!llmResponse.ok) {
      const err = await llmResponse.text();
      throw new Error(`OpenAI error: ${err}`);
    }

    const llmData = await llmResponse.json();
    const rawContent = llmData.choices?.[0]?.message?.content;
    
    if (!rawContent) {
      throw new Error("No content from LLM");
    }

    let storyboard: FilmStoryboard;
    try {
      storyboard = JSON.parse(rawContent);
    } catch {
      throw new Error(`Invalid JSON from LLM: ${rawContent.slice(0, 200)}`);
    }

    // Validate and fix variety contract
    const usedRealism: string[] = [];
    let previousSignature = null;
    
    for (let i = 0; i < storyboard.scenes.length; i++) {
      const scene = storyboard.scenes[i];
      
      // Ensure scene has ID
      scene.id = crypto.randomUUID();
      scene.index = i;
      
      // Determine scene type for signature generation
      let sceneType: "action" | "spectacle" | "emotional" | "establishing" = "action";
      if (!scene.subject_required) sceneType = "spectacle";
      else if (scene.coverage === "face") sceneType = "emotional";
      else if (scene.coverage === "wide" && i === 0) sceneType = "establishing";
      
      // Enforce variety contract on shot signatures
      if (previousSignature && scene.shot_signature) {
        if (signaturesCollide(scene.shot_signature, previousSignature)) {
          console.log(`[film-mode] Scene ${i} signature collision, regenerating...`);
          scene.shot_signature = generateNonCollidingSignature(previousSignature, sceneType);
        }
      } else if (!scene.shot_signature) {
        scene.shot_signature = generateNonCollidingSignature(previousSignature, sceneType);
      }
      
      previousSignature = scene.shot_signature;
      
      // Add rotating realism hints
      scene.realism_hints = pickRealismHints(usedRealism);
      usedRealism.push(...scene.realism_hints);
      
      // Default duration if missing
      if (!scene.duration_seconds) {
        scene.duration_seconds = scene.coverage === "face" ? 4 : 5;
      }
    }

    // === STORY FORCES VALIDATION (Escalation Contract) ===
    // FIX: Clamp escalation_delta to 0-3 range before validation
    for (const scene of storyboard.scenes) {
      if (typeof scene.escalation_delta === 'number') {
        scene.escalation_delta = Math.max(0, Math.min(3, Math.floor(scene.escalation_delta))) as 0 | 1 | 2 | 3;
      }
    }
    
    const forceScenes = storyboard.scenes.filter(s => s.force_present === true);
    const highEscalationScenes = storyboard.scenes.filter(s => (s.escalation_delta ?? 0) >= 2);
    const peakScenes = storyboard.scenes.filter(s => (s.escalation_delta ?? 0) >= 3);
    
    // FIX: Normalize setpiece_delta (trim whitespace, lowercase, filter empty)
    const normalizeSetpieceDelta = (s: FilmScene): string | null => {
      const delta = (s.setpiece_delta || "").trim().toLowerCase();
      return delta.length > 0 ? delta : null;
    };
    const uniqueSetpieceDeltas = new Set(
      storyboard.scenes.map(normalizeSetpieceDelta).filter(Boolean)
    );

    const forceIssues: string[] = [];
    if (forceScenes.length < 2) {
      forceIssues.push(`force_present=${forceScenes.length}/2 (need more external pressure)`);
    }
    // Require 1 peak (escalation=3) instead of 3 scenes with >=2
    if (peakScenes.length < 1) {
      forceIssues.push(`escalation_delta=3 count=${peakScenes.length}/1 (needs peak tension)`);
    }
    if (highEscalationScenes.length < 2) {
      forceIssues.push(`escalation_delta≥2 count=${highEscalationScenes.length}/2 (needs rising tension)`);
    }
    if (uniqueSetpieceDeltas.size < 2) {
      forceIssues.push(`setpiece_deltas=${uniqueSetpieceDeltas.size}/2 (need location/state changes)`);
    }

    if (forceIssues.length > 0) {
      console.warn("[film-mode] ⚠️ Escalation Contract not met:");
      forceIssues.forEach(issue => console.warn(`  - ${issue}`));
      
      // Context-aware force type inference based on scene content
      const inferForceType = (scene: FilmScene): "weather" | "predator" | "hazard" | "pursuit" | "time" | "resource" | "social" => {
        const text = `${scene.subject_action || ""} ${scene.alternate_subject || ""}`.toLowerCase();
        if (/water|rain|flood|storm|wind|snow|cold|heat/.test(text)) return "weather";
        if (/spider|bird|shadow|predator|beast|creature|enemy|hunt/.test(text)) return "predator";
        if (/chase|follow|track|escape|flee|run/.test(text)) return "pursuit";
        if (/collapse|debris|fall|fire|trap|rock|cliff/.test(text)) return "hazard";
        if (/deadline|countdown|closing|timer|urgent/.test(text)) return "time";
        if (/crowd|rival|reject|social|pressure/.test(text)) return "social";
        return "hazard"; // Default
      };
      
      // Auto-fix: inject forces into mid-story scenes (2-4) first, then spectacle
      let forcesAdded = 0;
      const midSceneIndices = [2, 3, 4].filter(i => i < storyboard.scenes.length);
      
      // First pass: spectacle scenes in mid-story
      for (const i of midSceneIndices) {
        if (forceScenes.length + forcesAdded >= 2) break;
        const scene = storyboard.scenes[i];
        if (!scene.force_present && !scene.subject_required) {
          scene.force_present = true;
          scene.force_type = inferForceType(scene);
          scene.escalation_delta = 2;
          console.log(`[film-mode] Auto-injected ${scene.force_type} force into spectacle scene ${i}`);
          forcesAdded++;
        }
      }
      
      // Second pass: hero scenes in mid-story (2-4 only, not hook/CTA)
      for (const i of midSceneIndices) {
        if (forceScenes.length + forcesAdded >= 2) break;
        const scene = storyboard.scenes[i];
        if (!scene.force_present && scene.subject_required) {
          scene.force_present = true;
          scene.force_type = inferForceType(scene);
          scene.escalation_delta = scene.escalation_delta ?? 2;
          console.log(`[film-mode] Auto-injected ${scene.force_type} force into hero scene ${i}`);
          forcesAdded++;
        }
      }
      
      // FIX: Ensure one peak scene (escalation=3) with safe bounds
      // For short stories (5 scenes), peakIndex = min(4, 3) = 3 (scene 4, 0-indexed)
      // For 6+ scenes, peakIndex = 4 (scene 5)
      // Never point to CTA (last scene) or hook (first scene)
      const peakIndex = Math.min(4, Math.max(2, storyboard.scenes.length - 2));
      if (peakScenes.length === 0 && peakIndex >= 0 && peakIndex < storyboard.scenes.length - 1) {
        storyboard.scenes[peakIndex].escalation_delta = 3;
        console.log(`[film-mode] Set peak escalation_delta=3 on scene ${peakIndex}`);
      }
      
      // Boost escalation on scenes 2-4 (mid-story tension)
      for (const i of [2, 3, 4].filter(idx => idx < storyboard.scenes.length - 1)) {
        const scene = storyboard.scenes[i];
        if ((scene.escalation_delta ?? 0) < 2) {
          scene.escalation_delta = 2;
          console.log(`[film-mode] Boosted escalation_delta on scene ${i}`);
        }
      }
    }
    
    // === STORY FORCES SUMMARY LOG ===
    const finalForces = storyboard.scenes.filter(s => s.force_present === true).length;
    const finalPeak = storyboard.scenes.findIndex(s => (s.escalation_delta ?? 0) >= 3);
    const finalHigh = storyboard.scenes.filter(s => (s.escalation_delta ?? 0) >= 2).length;
    const finalDeltas = new Set(storyboard.scenes.map(s => s.setpiece_delta).filter(Boolean)).size;
    
    console.log(`[film-mode] ✓ Story Forces summary: forces=${finalForces}/6, peak=${finalPeak >= 0 ? `scene ${finalPeak}` : 'none'}, escalation≥2=${finalHigh}, unique_deltas=${finalDeltas}`);
    console.log(`[film-mode] Per-scene breakdown:`);
    storyboard.scenes.forEach((s, i) => {
      console.log(`  ${i}: role=${s.subject_required ? 'hero' : 'spectacle'} force=${s.force_type || '-'} esc=${s.escalation_delta ?? 0} delta="${s.setpiece_delta || '-'}"`);
    });

    // Validate coverage distribution
    const coverages = storyboard.scenes.map(s => s.coverage);
    const hasFace = coverages.includes("face");
    const hasNonFace = coverages.some(c => c !== "face" && c !== "none");
    const hasSpectacle = storyboard.scenes.some(s => !s.subject_required);

    if (!hasFace) {
      console.warn("[film-mode] No face coverage - adding to scene 5");
      if (storyboard.scenes[4]) {
        storyboard.scenes[4].coverage = "face";
        storyboard.scenes[4].subject_required = true;
      }
    }
    if (!hasSpectacle && storyboard.scenes.length > 2) {
      console.warn("[film-mode] No spectacle - making scene 2 spectacle");
      if (storyboard.scenes[1]) {
        storyboard.scenes[1].subject_required = false;
        storyboard.scenes[1].coverage = "none";
        storyboard.scenes[1].alternate_subject = "environment threat";
        // Also make it a force carrier
        storyboard.scenes[1].force_present = true;
        storyboard.scenes[1].force_type = "hazard";
        storyboard.scenes[1].escalation_delta = 2;
      }
    }

    // Initialize empty anchor library
    const anchorLibrary: AnchorLibrary = {};

    // Create story job in database
    const { data: storyJob, error: storyError } = await supabase
      .from("story_jobs")
      .insert({
        account_id: body.account_id,
        title: body.title || storyboard.title || "Film Mode Story",
        status: "draft",
        story_type: "film_continuity",
        total_clips: storyboard.scenes.length,
        completed_clips: 0,
        storyboard_json: {
          ...storyboard,
          mode: "film_continuity",
          anchor_library: anchorLibrary,
          generation_settings: {
            face_only_i2v: true,
            variety_contract: true,
            minimal_prompts: true,
            legacy_guardrails: false,
          },
        },
        continuity_anchors: {
          character_bible: storyboard.character_bible,
          location_logic: storyboard.location_logic,
        },
      })
      .select()
      .single();

    if (storyError || !storyJob) {
      throw new Error(`Failed to create story: ${storyError?.message}`);
    }

    console.log("[film-mode] Story created:", storyJob.id);

    return new Response(
      JSON.stringify({
        success: true,
        story: {
          id: storyJob.id,
          title: storyJob.title,
          mode: "film_continuity",
          scene_count: storyboard.scenes.length,
          settings: {
            face_only_i2v: true,
            variety_contract: true,
            minimal_prompts: true,
          },
        },
        storyboard,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("[film-mode] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
