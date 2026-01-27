/**
 * Film Continuity Mode - Scene Chain Continuation
 * 
 * Zero legacy guardrails:
 * - Face-only I2V (all other coverage = T2V)
 * - Anchor library (not frame chaining)
 * - Minimal prompts (one camera + one action)
 * - No motion amplification, progression injection, capture contracts
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type FilmStoryboard,
  type FilmScene,
  type AnchorLibrary,
  getCutType,
  getAnchorForScene,
  updateAnchorLibrary,
  buildFilmPrompt,
} from "../_shared/film-continuity.ts";
import {
  buildForceEscalationBlock,
  logForceEscalationInjection,
  type ForceType,
  type EscalationLevel,
} from "../_shared/force-escalation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find active film_continuity stories
    const { data: stories, error: storiesError } = await supabase
      .from("story_jobs")
      .select("*")
      .eq("story_type", "film_continuity")
      .in("status", ["draft", "generating"])
      .order("created_at", { ascending: true });

    if (storiesError) {
      throw new Error(`Failed to fetch stories: ${storiesError.message}`);
    }

    if (!stories || stories.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No active film-mode stories" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Array<{ story_id: string; action: string; scene_index?: number }> = [];

    for (const story of stories) {
      // Check for running jobs
      const { data: runningJobs } = await supabase
        .from("video_jobs")
        .select("id")
        .eq("story_job_id", story.id)
        .in("status", ["queued", "running"])
        .limit(1);

      if (runningJobs && runningJobs.length > 0) {
        results.push({ story_id: story.id, action: "waiting_for_job" });
        continue;
      }

      const storyboard = story.storyboard_json as FilmStoryboard & { 
        anchor_library?: AnchorLibrary;
        generation_settings?: Record<string, boolean>;
      };
      
      if (!storyboard?.scenes) {
        console.error(`[film-chain] Story ${story.id} has no scenes`);
        continue;
      }

      // Find next scene to generate
      const { data: completedJobs } = await supabase
        .from("video_jobs")
        .select("sequence_index, thumbnail_url, output_url")
        .eq("story_job_id", story.id)
        .eq("status", "done")
        .order("sequence_index", { ascending: true });

      const completedIndices = new Set((completedJobs || []).map(j => j.sequence_index));
      const nextScene = storyboard.scenes.find(s => !completedIndices.has(s.index));

      if (!nextScene) {
        // All scenes complete
        await supabase
          .from("story_jobs")
          .update({ status: "done", completed_clips: storyboard.scenes.length })
          .eq("id", story.id);
        
        results.push({ story_id: story.id, action: "completed" });
        continue;
      }

      // Update anchor library from completed scenes
      let anchorLibrary: AnchorLibrary = storyboard.anchor_library || {};
      for (const job of (completedJobs || [])) {
        if (job.thumbnail_url && job.sequence_index !== undefined) {
          const scene = storyboard.scenes.find(s => s.index === job.sequence_index);
          if (scene) {
            anchorLibrary = updateAnchorLibrary(anchorLibrary, scene, job.thumbnail_url);
          }
        }
      }

      // Determine cut type (face-only I2V rule)
      const cutType = getCutType(nextScene);
      const isFirstScene = nextScene.index === 0;
      
      // Get anchor only for face I2V scenes
      let startingFrameUrl: string | null = null;
      if (cutType === "i2v" && !isFirstScene) {
        startingFrameUrl = getAnchorForScene(nextScene, anchorLibrary);
      }

      // Build minimal prompt (no legacy guardrails)
      let prompt = buildFilmPrompt(nextScene, storyboard, isFirstScene);
      
      // === FORCE/ESCALATION INJECTION (Phase 8) ===
      // Even Film Mode injects force/escalation for intensity
      const forceEscalationBlock = buildForceEscalationBlock(
        {
          force_present: nextScene.force_present,
          force_type: nextScene.force_type as ForceType | undefined,
          escalation_delta: nextScene.escalation_delta as EscalationLevel | undefined,
          setpiece_delta: nextScene.setpiece_delta,
        },
        nextScene.index,
        false // brutality_mode (could be read from storyboard settings)
      );
      
      // Log force/escalation
      logForceEscalationInjection(nextScene.index, {
        force_present: nextScene.force_present,
        force_type: nextScene.force_type as ForceType | undefined,
        escalation_delta: nextScene.escalation_delta as EscalationLevel | undefined,
        setpiece_delta: nextScene.setpiece_delta,
      });
      
      // Prepend force/escalation to minimal prompt
      prompt = forceEscalationBlock + prompt;

      console.log(`[film-chain] Scene ${nextScene.index}: coverage=${nextScene.coverage}, cut=${cutType}, i2v=${!!startingFrameUrl}`);
      console.log(`[film-chain] Prompt:\n${prompt}`);

      // Create a script_run for this story if needed (required by video_jobs FK)
      let scriptRunId: string;
      const { data: existingScript } = await supabase
        .from("script_runs")
        .select("id")
        .eq("account_id", story.account_id)
        .eq("hook_hash", `film_story_${story.id}`)
        .maybeSingle();

      if (existingScript) {
        scriptRunId = existingScript.id;
      } else {
        const { data: newScript, error: scriptError } = await supabase
          .from("script_runs")
          .insert({
            account_id: story.account_id,
            status: "qa_passed",
            hook_hash: `film_story_${story.id}`,
            script_content: {
              mode: "film_continuity",
              story_id: story.id,
              title: story.title,
            },
          })
          .select()
          .single();

        if (scriptError || !newScript) {
          throw new Error(`Failed to create script_run: ${scriptError?.message}`);
        }
        scriptRunId = newScript.id;
      }

      // Create video job with minimal metadata
      const { data: job, error: jobError } = await supabase
        .from("video_jobs")
        .insert({
          script_run_id: scriptRunId,
          story_job_id: story.id,
          sequence_index: nextScene.index,
          provider: "sora",
          status: "queued",
          original_prompt: nextScene.subject_action,
          enriched_prompt: prompt,
          settings: {
            size: "720x1280",
            provider_seconds: nextScene.duration_seconds <= 5 ? 4 : 8,
            requested_seconds: nextScene.duration_seconds,
            model: "sora-2",
          },
          style_hints: JSON.stringify({
            mode: "film_continuity",
            coverage: nextScene.coverage,
            cut_type: cutType,
            has_anchor: !!startingFrameUrl,
            shot_signature: nextScene.shot_signature,
            realism_hints: nextScene.realism_hints,
            subject_required: nextScene.subject_required,
          }),
        })
        .select()
        .single();

      if (jobError || !job) {
        throw new Error(`Failed to create job: ${jobError?.message}`);
      }

      // Queue to Sora
      const form = new FormData();
      form.set("prompt", prompt);
      form.set("model", "sora-2");
      form.set("size", "720x1280");
      form.set("seconds", String(nextScene.duration_seconds <= 5 ? 4 : 8));

      // Only add starting frame for face I2V
      if (startingFrameUrl) {
        try {
          const imgRes = await fetch(startingFrameUrl);
          if (imgRes.ok) {
            const blob = await imgRes.blob();
            form.set("input_reference", new File([blob], "anchor.jpg", { type: "image/jpeg" }));
            console.log(`[film-chain] Using face anchor: ${startingFrameUrl}`);
          }
        } catch (e) {
          console.warn(`[film-chain] Failed to fetch anchor, proceeding as T2V:`, e);
        }
      }

      const soraResponse = await fetch("https://api.openai.com/v1/videos", {
        method: "POST",
        headers: { "Authorization": `Bearer ${openaiKey}` },
        body: form,
      });

      if (!soraResponse.ok) {
        const errText = await soraResponse.text();
        console.error(`[film-chain] Sora error:`, errText);
        
        await supabase
          .from("video_jobs")
          .update({ status: "failed", error: errText.slice(0, 500) })
          .eq("id", job.id);

        results.push({ story_id: story.id, action: "sora_error", scene_index: nextScene.index });
        continue;
      }

      const soraData = await soraResponse.json();
      
      await supabase
        .from("video_jobs")
        .update({
          status: "running",
          openai_video_id: soraData.id,
          openai_status: soraData.status || "queued",
          settings: {
            ...job.settings,
            provider_job_id: soraData.id,
          },
        })
        .eq("id", job.id);

      // Update story status
      await supabase
        .from("story_jobs")
        .update({
          status: "generating",
          completed_clips: completedIndices.size,
          storyboard_json: {
            ...storyboard,
            anchor_library: anchorLibrary,
          },
        })
        .eq("id", story.id);

      results.push({ 
        story_id: story.id, 
        action: "queued_scene", 
        scene_index: nextScene.index 
      });
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("[film-chain] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
