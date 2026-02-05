/**
 * Myth Mode - Story Creation
 * 
 * Storybook-style narrative engine inspired by "The Tale of the Three Brothers":
 * - Silhouette/shadow-puppet visuals
 * - Third-person omniscient narration
 * - Symbolic abstraction (no realistic faces)
 * - Moral/fable structure
 * - 3-5 scenes with slow pacing
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type MythStoryboard,
  type MythScene,
  buildMythStoryboardPrompt,
  MYTH_STYLE_ANCHORS,
  MYTH_NEGATIVE_ANCHORS,
  MYTH_BEAT_CONFIGS,
  SILHOUETTE_POSES,
  validatePoseVariety,
  generateFallbackStates,
} from "../_shared/myth-continuity.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateMythStoryRequest {
  account_id: string;
  premise: string;
  scene_count?: number;
  title?: string;
  pacing?: "slow" | "dynamic" | "fast";
  epic_mode?: boolean;
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
    const body: CreateMythStoryRequest = await req.json();

    if (!body.account_id || !body.premise) {
      throw new Error("account_id and premise are required");
    }

    const sceneCount = body.scene_count || 3; // Default to 3 scenes for myth mode
    const pacing = body.pacing || "dynamic"; // Default to dynamic, not slow
    const epicMode = body.epic_mode || false;

    // Generate storyboard via GPT-4o with myth-specific prompting
    const systemPrompt = buildMythStoryboardPrompt(body.premise, sceneCount);

    console.log("[myth-mode] Generating mythic storyboard...");

    const llmResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { 
            role: "system", 
            content: "You are a master storyteller creating mythic fables. Your stories are told in the style of ancient legends with symbolic imagery and timeless wisdom. Output valid JSON only." 
          },
          { role: "user", content: systemPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.9, // Slightly higher for more creative/poetic output
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

    let storyboard: MythStoryboard;
    try {
      storyboard = JSON.parse(rawContent);
    } catch {
      throw new Error(`Invalid JSON from LLM: ${rawContent.slice(0, 200)}`);
    }

    // === VALIDATION & FALLBACKS (varied to prevent repetition) ===
    
    const fallbackArchetypes = ["the keeper", "the lost one", "the dreamer", "the maker", "the watcher"];
    const fallbackSymbols = ["broken key", "empty vessel", "fading ember", "silver thread", "cracked mirror"];
    const fallbackRealms = ["the realm where echoes live", "lands beyond the last sunset", "the garden of stone", "shores of forgotten seas"];
    const fallbackMorals = [
      "And so the lesson was etched in silence, waiting for those wise enough to hear.",
      "What was lost taught more than what was found.",
      "The truth, like all truths, revealed itself only to those who stopped searching.",
      "In the end, the answer had been there all along, hidden in plain sight.",
    ];

    // Ensure character exists (with variety)
    if (!storyboard.character) {
      console.warn("[myth-mode] Missing character, synthesizing varied defaults...");
      storyboard.character = {
        archetype: fallbackArchetypes[Math.floor(Math.random() * fallbackArchetypes.length)],
        silhouette: "solitary figure against the horizon",
        symbol: fallbackSymbols[Math.floor(Math.random() * fallbackSymbols.length)],
      };
    }

    // Ensure setting exists (with variety)
    if (!storyboard.setting) {
      console.warn("[myth-mode] Missing setting, synthesizing varied defaults...");
      storyboard.setting = {
        realm: fallbackRealms[Math.floor(Math.random() * fallbackRealms.length)],
        palette: ["amber", "charcoal", "parchment", "gold"],
        texture: "parchment",
      };
    }

    // Ensure moral exists (with variety)
    if (!storyboard.moral) {
      storyboard.moral = fallbackMorals[Math.floor(Math.random() * fallbackMorals.length)];
    }

    // Ensure symbol_arc exists
    if (!storyboard.symbol_arc || storyboard.symbol_arc.length < storyboard.scenes.length) {
      console.log("[myth-mode] Generating fallback symbol_arc...");
      const symbol = storyboard.character?.symbol || "object";
      storyboard.symbol_arc = storyboard.scenes.map((scene, i) => {
        const states = ["intact and gleaming", "beginning to change", "transforming", "scattered/broken", "released/transcended"];
        return `Scene ${i}: ${symbol} ${states[i % states.length]}`;
      });
    }

    // Process scenes
    for (let i = 0; i < storyboard.scenes.length; i++) {
      const scene = storyboard.scenes[i];

      // Ensure scene has ID
      scene.id = crypto.randomUUID();
      scene.index = i;

      // Ensure beat type
      if (!scene.beat_type) {
        if (i === 0) scene.beat_type = "introduction";
        else if (i === storyboard.scenes.length - 1) scene.beat_type = "moral";
        else if (i < storyboard.scenes.length / 2) scene.beat_type = "journey";
        else scene.beat_type = "trial";
      }

      // Default duration based on beat type
      if (!scene.duration_seconds) {
        scene.duration_seconds = MYTH_BEAT_CONFIGS[scene.beat_type]?.typical_duration || 7;
      }

      // Ensure symbolic elements
      if (!scene.symbolic_elements || scene.symbolic_elements.length === 0) {
        scene.symbolic_elements = ["distant horizon", "winding path"];
      }

      // Ensure environment_motion exists (Phase 2)
      if (!scene.environment_motion || scene.environment_motion.length === 0) {
        scene.environment_motion = [
          `${scene.symbolic_elements[0] || "shadows"} shift slowly`,
          "background elements drift with purpose",
        ];
      }

      // Ensure start/end states exist (Phase 2)
      if (!scene.start_state || !scene.end_state) {
        const fallbackStates = generateFallbackStates(scene, storyboard);
        scene.start_state = scene.start_state || fallbackStates.start_state;
        scene.end_state = scene.end_state || fallbackStates.end_state;
      }

      // Ensure silhouette_pose exists and varies (Phase 2)
      if (!scene.silhouette_pose) {
        // Assign different poses to adjacent scenes
        const poseIndex = i % SILHOUETTE_POSES.length;
        scene.silhouette_pose = SILHOUETTE_POSES[poseIndex];
      }

      // Default silhouette presence
      if (scene.has_silhouette === undefined) {
        scene.has_silhouette = true;
      }
    }

    // Validate pose variety
    const poseValidation = validatePoseVariety(storyboard.scenes);
    if (!poseValidation.valid) {
      console.warn("[myth-mode] Pose variety issues:", poseValidation.issues);
      // Fix adjacent same poses by rotating
      for (let i = 1; i < storyboard.scenes.length; i++) {
        if (storyboard.scenes[i].silhouette_pose === storyboard.scenes[i - 1].silhouette_pose) {
          const nextIndex = (SILHOUETTE_POSES.indexOf(storyboard.scenes[i].silhouette_pose!) + 2) % SILHOUETTE_POSES.length;
          storyboard.scenes[i].silhouette_pose = SILHOUETTE_POSES[nextIndex];
        }
      }
    }

    // Ensure last scene is "moral" beat
    if (storyboard.scenes.length > 0) {
      const lastScene = storyboard.scenes[storyboard.scenes.length - 1];
      lastScene.beat_type = "moral";
    }

    console.log(`[myth-mode] Generated ${storyboard.scenes.length} mythic scenes`);
    console.log(`[myth-mode] Moral: "${storyboard.moral}"`);

    // Create story job in database
    const { data: storyJob, error: storyError } = await supabase
      .from("story_jobs")
      .insert({
        account_id: body.account_id,
        title: body.title || storyboard.title || "Mythic Tale",
        status: "draft",
        story_type: "myth",
        total_clips: storyboard.scenes.length,
        completed_clips: 0,
        storyboard_json: {
          ...storyboard,
          mode: "myth",
          style_anchors: MYTH_STYLE_ANCHORS,
          negative_anchors: MYTH_NEGATIVE_ANCHORS,
          symbol_arc: storyboard.symbol_arc,
          generation_settings: {
            prompt_version: "v2",
            technique_style: "reiniger",
            articulated_limbs: true,
            paper_layers: true,
            backlit_from_below: true,
              silhouette_only: !epicMode,
            no_faces: true,
              pacing: pacing,
              epic_mode: epicMode,
          },
        },
        continuity_anchors: {
          character: storyboard.character,
          setting: storyboard.setting,
          moral: storyboard.moral,
          symbol_arc: storyboard.symbol_arc,
        },
      })
      .select()
      .single();

    if (storyError || !storyJob) {
      throw new Error(`Failed to create story: ${storyError?.message}`);
    }

    console.log("[myth-mode] Story created:", storyJob.id);

    return new Response(
      JSON.stringify({
        success: true,
        story: {
          id: storyJob.id,
          title: storyJob.title,
          mode: "myth",
          moral: storyboard.moral,
          scene_count: storyboard.scenes.length,
          settings: {
          silhouette_only: !epicMode,
            no_faces: true,
          pacing: pacing,
          epic_mode: epicMode,
          },
        },
        storyboard,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("[myth-mode] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
