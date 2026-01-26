/**
 * continue-story-chain
 * 
 * Cron-triggered function that advances story generation chains.
 * Runs every 30s to check for stories needing the next scene queued.
 * 
 * Logic:
 * 1. Find stories with status='generating'
 * 2. Check if the latest scene is done
 * 3. If done, queue the next scene using the thumbnail as reference
 * 4. If all scenes done, mark story complete
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Extract routing tags from scene metadata for smart provider selection
 */
function extractRoutingTags(scene: { prompt: string; camera_direction?: string }): string[] {
  const tags: string[] = [];
  
  const prompt = scene.prompt.toLowerCase();
  
  // Action/motion detection
  if (/action|fight|battle|explosion|chase|run|jump/.test(prompt)) {
    tags.push("action");
  }
  if (/slow|peaceful|calm|serene|quiet/.test(prompt)) {
    tags.push("slow_motion");
  }
  
  // Shot type from camera direction
  if (scene.camera_direction) {
    const cam = scene.camera_direction.toLowerCase();
    if (/close/.test(cam)) tags.push("close_up");
    if (/wide/.test(cam)) tags.push("wide_shot");
    if (/tracking|follow/.test(cam)) tags.push("tracking");
    if (/aerial|drone/.test(cam)) tags.push("aerial");
  }
  
  // Genre/style detection
  if (/fantasy|dragon|magic|wizard|medieval/.test(prompt)) {
    tags.push("fantasy");
  }
  if (/horror|dark|scary|creepy/.test(prompt)) {
    tags.push("horror");
  }
  if (/nature|landscape|forest|ocean|mountain/.test(prompt)) {
    tags.push("nature");
  }
  if (/person|character|man|woman|figure/.test(prompt)) {
    tags.push("character");
  }
  
  return tags.slice(0, 5); // Limit to top 5 tags
}

/**
 * Snap duration to valid Sora values (4, 8, or 12 seconds)
 */
function snapToSoraDuration(seconds: number): number {
  if (seconds <= 6) return 4;
  if (seconds <= 10) return 8;
  return 12;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find stories that are generating
    const { data: activeStories, error: storiesError } = await supabase
      .from("story_jobs")
      .select("id, storyboard_json, continuity_anchors, total_clips, completed_clips")
      .eq("status", "generating")
      .limit(5);

    if (storiesError) {
      throw new Error(`Failed to fetch stories: ${storiesError.message}`);
    }

    if (!activeStories?.length) {
      return new Response(
        JSON.stringify({ success: true, message: "No active stories" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[chain-continue] Found ${activeStories.length} active stories`);

    const results: Array<{ storyId: string; action: string; nextScene?: number }> = [];

    for (const story of activeStories) {
      const scenes = (story.storyboard_json as { scenes?: Array<{ id: string; prompt: string; enriched_prompt?: string; duration_target: number }> })?.scenes || [];
      const totalScenes = scenes.length;

      if (totalScenes === 0) {
        console.log(`[chain-continue] Story ${story.id} has no scenes, skipping`);
        continue;
      }

      // Get all clips for this story
      const { data: clips, error: clipsError } = await supabase
        .from("video_jobs")
        .select("id, sequence_index, status, thumbnail_url, script_run_id")
        .eq("story_job_id", story.id)
        .order("sequence_index", { ascending: true })
        .order("created_at", { ascending: false });

      if (clipsError) {
        console.error(`[chain-continue] Failed to fetch clips for ${story.id}: ${clipsError.message}`);
        continue;
      }

      // Dedupe: get best clip per sequence_index
      const clipsByIndex = new Map<number, typeof clips[0]>();
      for (const clip of clips || []) {
        const existing = clipsByIndex.get(clip.sequence_index);
        if (!existing || (clip.status === "done" && existing.status !== "done")) {
          clipsByIndex.set(clip.sequence_index, clip);
        }
      }

      // Find the highest completed scene
      let highestDoneIndex = -1;
      let latestThumbnail: string | null = null;
      let latestScriptRunId: string | null = null;
      let hasRunningJob = false;

      for (let i = 0; i < totalScenes; i++) {
        const clip = clipsByIndex.get(i);
        if (clip?.status === "done" && clip.thumbnail_url) {
          highestDoneIndex = i;
          latestThumbnail = clip.thumbnail_url;
          latestScriptRunId = clip.script_run_id;
        } else if (clip?.status === "running" || clip?.status === "queued") {
          hasRunningJob = true;
        }
      }

      // If there's a running job, wait for it
      if (hasRunningJob) {
        console.log(`[chain-continue] Story ${story.id} has running job, waiting`);
        results.push({ storyId: story.id, action: "waiting" });
        continue;
      }

      const nextSceneIndex = highestDoneIndex + 1;

      // Check if all scenes are done
      if (nextSceneIndex >= totalScenes) {
        console.log(`[chain-continue] Story ${story.id} complete! ${totalScenes} scenes done`);
        await supabase
          .from("story_jobs")
          .update({ status: "done", completed_clips: totalScenes })
          .eq("id", story.id);
        
        // Fire-and-forget: request analysis without blocking story completion
        // Cron is the guarantee; this is just for faster feedback
        console.log(`[chain-continue] Requesting analysis for ${story.id} (fire-and-forget)`);
        void fetch(`${supabaseUrl}/functions/v1/auto-rate-story`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ story_id: story.id }),
        })
          .then(async (r) => {
            const text = await r.text().catch(() => "");
            console.log(`[chain-continue] auto-rate-story response for ${story.id}: ${r.status}`, text.slice(0, 200));
          })
          .catch((e) => {
            console.error(`[chain-continue] auto-rate-story fire-and-forget failed for ${story.id} (cron will retry):`, e);
          });
        
        results.push({ storyId: story.id, action: "completed" });
        continue;
      }

      // Need to queue next scene
      const nextScene = scenes[nextSceneIndex];
      const prompt = nextScene.enriched_prompt || nextScene.prompt;
      const isFirstScene = nextSceneIndex === 0;

      // For I2V scenes, we need a reference image
      if (!isFirstScene && !latestThumbnail) {
        console.error(`[chain-continue] Story ${story.id} scene ${nextSceneIndex} needs reference but none available`);
        await supabase
          .from("story_jobs")
          .update({ status: "partial" })
          .eq("id", story.id);
        results.push({ storyId: story.id, action: "failed_no_reference", nextScene: nextSceneIndex });
        continue;
      }

      // Get or create script_run_id
      let scriptRunId = latestScriptRunId;
      if (!scriptRunId) {
        const { data: newScript, error: scriptError } = await supabase
          .from("script_runs")
          .insert({
            account_id: "lab-story",
            status: "qa_passed",
            script_content: { type: "story_chain", story_job_id: story.id },
          })
          .select("id")
          .single();

        if (scriptError || !newScript) {
          console.error(`[chain-continue] Failed to create script: ${scriptError?.message}`);
          continue;
        }
        scriptRunId = newScript.id;
      }

      console.log(`[chain-continue] Queueing scene ${nextSceneIndex + 1}/${totalScenes} for story ${story.id} [${isFirstScene ? "T2V" : "I2V"}]`);

      // Extract routing hints from scene metadata
      const sceneRoutingTags = extractRoutingTags(nextScene);
      
      // Queue via SMART router (will pick best provider per scene)
      const response = await fetch(`${supabaseUrl}/functions/v1/queue-video-smart`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${supabaseServiceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          script_run_id: scriptRunId,
          prompt: prompt,
          settings: {
            size: "720x1280",
            // Sora only supports 4/8/12s, snap to nearest valid value
            seconds: snapToSoraDuration(nextScene.duration_target || 5),
          },
          starting_frame_url: isFirstScene ? undefined : latestThumbnail,
          provider: "smart", // Let the router decide based on scene content
          routing_hint: {
            shot_type: nextScene.camera_direction,
            is_chained: !isFirstScene, // I2V scenes are chained
            routing_tags: sceneRoutingTags,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        console.error(`[chain-continue] Failed to queue: ${data.error}`);
        results.push({ storyId: story.id, action: "queue_failed", nextScene: nextSceneIndex });
        continue;
      }

      // Link job to story
      const jobId = data.job?.id;
      if (jobId) {
        await supabase
          .from("video_jobs")
          .update({
            story_job_id: story.id,
            sequence_index: nextSceneIndex,
            original_prompt: nextScene.prompt,
            style_hints: JSON.stringify(story.continuity_anchors || {}),
          })
          .eq("id", jobId);
      }

      // Update progress
      await supabase
        .from("story_jobs")
        .update({ completed_clips: highestDoneIndex + 1 })
        .eq("id", story.id);

      console.log(`[chain-continue] ✓ Queued scene ${nextSceneIndex + 1} as job ${jobId}`);
      results.push({ storyId: story.id, action: "queued", nextScene: nextSceneIndex });
    }

    return new Response(
      JSON.stringify({ success: true, processed: results.length, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[chain-continue] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
