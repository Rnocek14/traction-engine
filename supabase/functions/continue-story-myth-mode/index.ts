/**
 * Myth Mode - Story Continuation
 * 
 * Generates video clips for Myth Mode stories using:
 * - Silhouette/shadow-puppet visual style
 * - T2V only (no I2V - abstraction over identity)
 * - Slow motion, fade transitions
 * - Symbolic prompts with style anchors
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  type MythStoryboard,
  type MythScene,
  buildMythPromptV2,
  buildMythPromptV3,
  premiseWantsAction,
  MYTH_STYLE_ANCHORS,
  LIGHT_BEHAVIOR_V2,
} from "../_shared/myth-continuity.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Snap duration to Sora-valid values (4, 8, or 12 seconds)
 */
function snapDurationForSora(seconds: number): number {
  if (seconds <= 6) return 4;
  if (seconds <= 10) return 8;
  return 12;
}

/**
 * Get scene duration with escalation-based bump:
 * - High escalation (>=2), high setpiece (>=2), or action beats get 12s
 * - Otherwise use scene.duration_seconds or default 7
 */
function getSceneDuration(scene: MythScene): number {
  const isHighEscalation = (scene.escalation_delta ?? 0) >= 2;
  const isSetpiece = (scene.setpiece_delta ?? 0) >= 2;
  const isActionBeat = ["battle", "chase", "clash", "ascension", "transformation"].includes(scene.beat_type);
  
  if (isHighEscalation || isSetpiece || isActionBeat) {
    return 12; // Full 12s for spectacle payoff
  }
  return scene.duration_seconds || 7;
}

interface ContinueMythStoryRequest {
  story_job_id: string;
  /** Force regeneration of all scenes (clears completed indices) */
  force_regen?: boolean;
  /** Regenerate only specific scene indices */
  regen_indices?: number[];
  /** Per-scene keyframe URLs for reference continuity */
  starting_frames?: Record<string, string>;
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
      symbol_arc?: string[];
    } = {
      title: rawStoryboard.title as string,
      premise: rawStoryboard.premise as string,
      moral: (continuityAnchors.moral || rawStoryboard.moral) as string,
      character: (continuityAnchors.character || rawStoryboard.character) as MythStoryboard["character"],
      setting: (continuityAnchors.setting || rawStoryboard.setting) as MythStoryboard["setting"],
      scenes: rawStoryboard.scenes as MythScene[],
      style_anchors: rawStoryboard.style_anchors as string[],
      negative_anchors: rawStoryboard.negative_anchors as string[],
      symbol_arc: (continuityAnchors.symbol_arc || rawStoryboard.symbol_arc) as string[],
    };

    if (!storyboard?.scenes?.length) {
      throw new Error("No scenes in storyboard");
    }

    // Get existing video jobs to find what's already generated
    // Only consider jobs with openai_video_id as "properly queued"
    const { data: existingJobs } = await supabase
      .from("video_jobs")
      .select("id, sequence_index, status, openai_video_id")
      .eq("story_job_id", body.story_job_id);

    // Jobs are "complete" if they have an openai_video_id (properly submitted)
    // or are in done/running status
    const completedIndices = new Set(
      (existingJobs || [])
        .filter(j => 
          j.status === "done" || 
          j.status === "running" || 
          (j.status === "queued" && j.openai_video_id)
        )
        .map(j => j.sequence_index)
    );
    
    // Force regen support: clear completed indices as requested
    if (body.force_regen === true) {
      console.log(`[myth-mode] force_regen=true: clearing all ${completedIndices.size} completed indices`);
      completedIndices.clear();
    } else if (body.regen_indices && Array.isArray(body.regen_indices)) {
      for (const idx of body.regen_indices) {
        if (typeof idx === "number") {
          console.log(`[myth-mode] regen_indices: removing index ${idx} from completed`);
          completedIndices.delete(idx);
        }
      }
    }
    
    // Delete stale jobs (queued but no openai_video_id)
    const staleJobIds = (existingJobs || [])
      .filter(j => j.status === "queued" && !j.openai_video_id)
      .map(j => j.id);
    
    if (staleJobIds.length > 0) {
      console.log(`[myth-mode] Deleting ${staleJobIds.length} stale jobs without openai_video_id`);
      await supabase
        .from("video_jobs")
        .delete()
        .in("id", staleJobIds);
    }

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
      
      // Determine if this story wants action mode
      const generationSettings = (storyboard as any).generation_settings || {};
      const wantsAction = 
        generationSettings.pacing === "fast" ||
        generationSettings.epic_mode ||
        generationSettings.intensity_profile === "action" ||
        generationSettings.intensity_profile === "epic" ||
        premiseWantsAction(storyboard.premise || "");
      
      // Build V3 action-first prompt if action mode, otherwise V2
      const mythPrompt = wantsAction
        ? buildMythPromptV3(scene, storyboard, { 
            intensity_profile: generationSettings.intensity_profile || "action" 
          })
        : buildMythPromptV2(scene, storyboard);
      
      console.log(`[myth-mode-v3] Queueing scene ${i}: ${scene.beat_type} (action=${wantsAction})`);
      console.log(`[myth-mode-v3] Prompt length: ${mythPrompt.length} chars`);
      console.log(`[myth-mode-v3] Prompt: ${mythPrompt}`);

      // Myth Mode always uses T2V (no I2V - we want abstraction, not identity)
      // Call queue-video to properly submit to Sora API
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/queue-video`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            script_run_id: scriptRunId,
            prompt: mythPrompt,
            original_prompt: scene.visual_description || scene.narration,
            settings: {
              size: "1280x720",
              seconds: snapDurationForSora(getSceneDuration(scene)),
            },
            skip_enrichment: true, // Already enriched with mythic style
            bypass_qa: true, // Story mode uses story_jobs flow, not script QA
            story_job_id: body.story_job_id, // Signal this is story mode
            sequence_index: i, // Pass scene index for pro model upgrade + reference lookup
            starting_frames: body.starting_frames, // Per-scene keyframe URLs (pass-through)
          }),
        });

        const result = await response.json();
        
        if (!response.ok || !result.success) {
          console.error(`[myth-mode] Failed to queue scene ${i}:`, result.error);
          continue;
        }

        const jobId = result.job?.id;
        
        // Link job to story with stable scene_id + mark as primary
        if (jobId) {
          // First, unset any existing primary for this scene
          await supabase
            .from("video_jobs")
            .update({ is_primary: false })
            .eq("story_job_id", body.story_job_id)
            .eq("scene_id", scene.id);
          
          // Set the new job as primary with stable scene linkage
          // Include V2 Reiniger-style hints
          await supabase
            .from("video_jobs")
            .update({
              story_job_id: body.story_job_id,
              sequence_index: i,
              scene_id: scene.id,
              is_primary: true,
              style_hints: JSON.stringify({
                mode: "myth",
                prompt_version: wantsAction ? "v3_action" : "v2_reiniger",
                technique_style: wantsAction ? "reiniger_fluid" : "lotte_reiniger_cutout",
                intensity_profile: generationSettings.intensity_profile || (wantsAction ? "action" : "contemplative"),
                beat_type: scene.beat_type,
                silhouette: scene.has_silhouette,
                silhouette_pose: scene.silhouette_pose,
                light_behavior: LIGHT_BEHAVIOR_V2[scene.beat_type],
                start_state: scene.start_state,
                end_state: scene.end_state,
                features: ["articulated_limbs", "paper_layers", "backlit", "fluid_motion"],
                force_present: scene.force_present,
                force_type: scene.force_type,
                escalation_delta: scene.escalation_delta,
              }),
            })
            .eq("id", jobId);
        }

        console.log(`[myth-mode-v3] ✓ Queued scene ${i} as job ${jobId}`);
        queuedScenes.push(i);
        queuedCount++;
      } catch (err) {
        console.error(`[myth-mode] Failed to queue scene ${i}:`, err);
        continue;
      }
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

    console.log(`[myth-mode-v3] Queued ${queuedCount}/${storyboard.scenes.length} scenes`);

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
