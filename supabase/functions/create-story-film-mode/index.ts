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
