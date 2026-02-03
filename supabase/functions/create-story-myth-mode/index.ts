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

    // === VALIDATION & FALLBACKS ===

    // Ensure character exists
    if (!storyboard.character) {
      console.warn("[myth-mode] Missing character, synthesizing defaults...");
      storyboard.character = {
        archetype: "the wanderer",
        silhouette: "cloaked figure with walking staff",
        symbol: "lantern",
      };
    }

    // Ensure setting exists
    if (!storyboard.setting) {
      console.warn("[myth-mode] Missing setting, synthesizing defaults...");
      storyboard.setting = {
        realm: "ancient forest at twilight",
        palette: ["amber", "charcoal", "parchment", "gold"],
        texture: "parchment",
      };
    }

    // Ensure moral exists
    if (!storyboard.moral) {
      storyboard.moral = "And so it was that wisdom comes not from the journey's end, but from the paths we choose.";
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

      // Default silhouette presence
      if (scene.has_silhouette === undefined) {
        scene.has_silhouette = true;
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
          generation_settings: {
            silhouette_only: true,
            no_faces: true,
            slow_pacing: true,
            symbolic_visuals: true,
            fade_transitions: true,
          },
        },
        continuity_anchors: {
          character: storyboard.character,
          setting: storyboard.setting,
          moral: storyboard.moral,
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
            silhouette_only: true,
            no_faces: true,
            slow_pacing: true,
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
