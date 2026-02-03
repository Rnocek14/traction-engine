/**
 * Myth Mode - Story Continuation
 * 
 * Generates video clips for Myth Mode stories using:
 * - Silhouette/shadow-puppet visual style
 * - T2V only (no I2V - abstraction over identity)
 * - Slow motion, fade transitions
 * - Symbolic prompts with style anchors
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type MythStoryboard,
  type MythScene,
  buildMythPrompt,
  MYTH_STYLE_ANCHORS,
  MYTH_NEGATIVE_ANCHORS,
} from "../_shared/myth-continuity.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ContinueMythStoryRequest {
  story_job_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body: ContinueMythStoryRequest = await req.json();

    if (!body.story_job_id) {
      throw new Error("story_job_id is required");
    }

    // Load story job
    const { data: storyJob, error: storyError } = await supabase
      .from("story_jobs")
      .select("*")
      .eq("id", body.story_job_id)
      .single();

    if (storyError || !storyJob) {
      throw new Error(`Story not found: ${storyError?.message}`);
    }

    if (storyJob.story_type !== "myth") {
      throw new Error(`Story is not myth mode: ${storyJob.story_type}`);
    }

    const rawStoryboard = storyJob.storyboard_json as Record<string, unknown>;
    const continuityAnchors = storyJob.continuity_anchors as Record<string, unknown> || {};
    
    // Merge continuity_anchors into storyboard for buildMythPrompt
    // (create-story-myth-mode stores character/setting in continuity_anchors)
    const storyboard: Partial<MythStoryboard> & { 
      scenes: MythScene[];
      style_anchors?: string[];
      negative_anchors?: string[];
    } = {
      title: rawStoryboard.title as string,
      premise: rawStoryboard.premise as string,
      moral: (continuityAnchors.moral || rawStoryboard.moral) as string,
      character: (continuityAnchors.character || rawStoryboard.character) as MythStoryboard["character"],
      setting: (continuityAnchors.setting || rawStoryboard.setting) as MythStoryboard["setting"],
      scenes: rawStoryboard.scenes as MythScene[],
      style_anchors: rawStoryboard.style_anchors as string[],
      negative_anchors: rawStoryboard.negative_anchors as string[],
    };

    if (!storyboard?.scenes?.length) {
      throw new Error("No scenes in storyboard");
    }

    // Get existing video jobs to find what's already generated
    const { data: existingJobs } = await supabase
      .from("video_jobs")
      .select("sequence_index, status")
      .eq("story_job_id", body.story_job_id);

    const completedIndices = new Set(
      (existingJobs || [])
        .filter(j => j.status !== "failed")
        .map(j => j.sequence_index)
    );

    // Update story status to generating
    await supabase
      .from("story_jobs")
      .update({ status: "generating" })
      .eq("id", body.story_job_id);

    // Queue scenes that aren't already processed
    const queuedScenes: number[] = [];
    let queuedCount = 0;

    // Find or create a placeholder script_run for video jobs
    let scriptRunId: string;
    const { data: existingScriptRun } = await supabase
      .from("script_runs")
      .select("id")
      .eq("account_id", storyJob.account_id)
      .limit(1)
      .maybeSingle();

    if (existingScriptRun) {
      scriptRunId = existingScriptRun.id;
    } else {
      const { data: newScriptRun, error: scriptError } = await supabase
        .from("script_runs")
        .insert({
          account_id: storyJob.account_id,
          status: "draft",
          script_content: { type: "myth_mode_placeholder" },
        })
        .select()
        .single();

      if (scriptError || !newScriptRun) {
        throw new Error(`Failed to create script_run: ${scriptError?.message}`);
      }
      scriptRunId = newScriptRun.id;
    }

    for (let i = 0; i < storyboard.scenes.length; i++) {
      if (completedIndices.has(i)) {
        console.log(`[myth-mode] Scene ${i} already queued, skipping`);
        continue;
      }

      const scene = storyboard.scenes[i] as MythScene;
      
      // Build the mythic prompt with style constraints
      const mythPrompt = buildMythPrompt(scene, storyboard);
      
      console.log(`[myth-mode] Queueing scene ${i}: ${scene.beat_type}`);
      console.log(`[myth-mode] Prompt preview: ${mythPrompt.slice(0, 200)}...`);

      // Myth Mode always uses T2V (no I2V - we want abstraction, not identity)
      // Use Sora as primary provider for best 2D animation handling
      const { error: queueError } = await supabase
        .from("video_jobs")
        .insert({
          script_run_id: scriptRunId,
          story_job_id: body.story_job_id,
          sequence_index: i,
          provider: "sora", // Sora handles stylized/2D better
          status: "queued",
          original_prompt: scene.visual_description || scene.narration,
          enriched_prompt: mythPrompt,
          style_hints: JSON.stringify({
            mode: "myth",
            beat_type: scene.beat_type,
            silhouette: scene.has_silhouette,
            style_anchors: MYTH_STYLE_ANCHORS.slice(0, 5),
          }),
          settings: {
            size: "1280x720",
            duration: scene.duration_seconds || 7,
            style: "myth",
            no_faces: true,
            silhouette_only: true,
          },
        });

      if (queueError) {
        console.error(`[myth-mode] Failed to queue scene ${i}:`, queueError);
        continue;
      }

      queuedScenes.push(i);
      queuedCount++;
    }

    // Update story with progress
    await supabase
      .from("story_jobs")
      .update({
        status: queuedCount > 0 ? "generating" : "done",
      })
      .eq("id", body.story_job_id);

    // Trigger processing
    if (queuedCount > 0) {
      await supabase.functions.invoke("process-video", { body: {} });
    }

    console.log(`[myth-mode] Queued ${queuedCount}/${storyboard.scenes.length} scenes`);

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          total: storyboard.scenes.length,
          queued: queuedCount,
          skipped: storyboard.scenes.length - queuedCount,
          scenes: queuedScenes,
        },
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
