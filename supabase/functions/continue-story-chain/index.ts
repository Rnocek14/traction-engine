/**
 * continue-story-chain (v2)
 * 
 * Cron-triggered function that advances story generation chains.
 * Runs every 30s to check for stories needing the next scene queued.
 * 
 * Features:
 * - Visual continuity via I2V chaining
 * - Progression injection to prevent repeated actions
 * - Role-based provider routing
 * - Dimension-aware resize for Sora
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { 
  routeBySceneRole, 
  inferRoleFromPosition,
  clampDurationToRole,
  type SceneRole,
  type VideoProvider,
} from "../_shared/scene-role-router.ts";
import { type MotifScene } from "../_shared/motif-injection.ts";
import { applyProgressionInjection, buildProgressionContext } from "../_shared/progression-injection.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Parse size string to width/height
 */
function parseSize(size: string): { width: number; height: number } {
  const match = size.match(/^(\d+)x(\d+)$/);
  if (match) {
    return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
  }
  // Default to portrait 9:16
  return { width: 720, height: 1280 };
}

/**
 * Call FFmpeg service to resize an image to target dimensions
 */
async function resizeStartingFrame(
  imageUrl: string,
  targetWidth: number,
  targetHeight: number,
  storyJobId: string,
  sceneIndex: number
): Promise<string | null> {
  const ffmpegServiceUrl = Deno.env.get("FFMPEG_SERVICE_URL");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  
  if (!ffmpegServiceUrl) {
    console.warn("[chain-continue] FFMPEG_SERVICE_URL not configured, cannot resize");
    return null;
  }
  
  const outputPath = `stories/${storyJobId}/resized_frame_${sceneIndex}_${Date.now()}.jpg`;
  
  try {
    console.log(`[chain-continue] Resizing starting frame to ${targetWidth}x${targetHeight}`);
    
    const response = await fetch(`${ffmpegServiceUrl}/resize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job_id: `${storyJobId}_s${sceneIndex}`,
        image_url: imageUrl,
        target_width: targetWidth,
        target_height: targetHeight,
        mode: "cover", // Crop to fill
        upload: {
          bucket: "videos",
          output_path: outputPath,
          supabase_url: supabaseUrl,
          supabase_service_key: supabaseServiceKey,
        },
      }),
    });
    
    const data = await response.json();
    
    if (response.ok && data.resized_url) {
      console.log(`[chain-continue] ✓ Resized frame: ${data.resized_url}`);
      return data.resized_url;
    } else {
      console.error(`[chain-continue] Resize failed: ${data.error || response.status}`);
      return null;
    }
  } catch (err) {
    console.error("[chain-continue] Resize error:", err);
    return null;
  }
}

/**
 * Snap duration to valid values per provider
 * IMPORTANT: Call clampDurationToRole() FIRST, then this function
 */
function snapDurationForProvider(seconds: number, provider: VideoProvider): number {
  switch (provider) {
    case "sora":
      if (seconds <= 6) return 4;
      if (seconds <= 10) return 8;
      return 12;
    case "runway":
      if (seconds <= 5) return 4;
      if (seconds <= 7) return 6;
      return 8;
    case "luma":
      return 5; // Luma Ray-2 is fixed at 5s
    default:
      return 4;
  }
}

/**
 * Combined duration processing: clamp to role range, then snap to provider
 */
function processDuration(rawDuration: number, role: SceneRole, provider: VideoProvider): number {
  // Step 1: Clamp to role's valid range (preserves narrative pacing)
  const roleClampedDuration = clampDurationToRole(rawDuration, role);
  // Step 2: Snap to provider's supported durations
  return snapDurationForProvider(roleClampedDuration, provider);
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
      const storyboardData = story.storyboard_json as { 
        scenes?: Array<{ 
          id: string; 
          prompt: string; 
          enriched_prompt?: string; 
          duration_target: number; 
          role?: SceneRole;
          is_hero_shot?: boolean;
          change_type?: string;
          // Phase 2: Explicit action summary
          action_summary?: string;
          // Phase 3: Cut type for I2V vs T2V
          cut_type?: "hard" | "continuity";
        }>;
        tier?: "volume" | "hero";
        motif_anchors?: string[];
        // Phase 1: Story Spine from Director Brain
        story_spine?: string;
        // Character Continuity Mode (NEW)
        character_continuity_mode?: boolean;
        locked_provider?: "sora" | "runway" | "luma";
      };
      const scenes = storyboardData?.scenes || [];
      const storyTier = storyboardData?.tier || "volume"; // Read tier from storyboard
      const motifAnchors = storyboardData?.motif_anchors || []; // Read motifs for injection
      const storySpine = storyboardData?.story_spine || ""; // Phase 1: Read story spine
      // Character Continuity Mode (NEW)
      const characterContinuityMode = storyboardData?.character_continuity_mode || false;
      const lockedProviderName = storyboardData?.locked_provider as VideoProvider | null;
      const totalScenes = scenes.length;

      if (totalScenes === 0) {
        console.log(`[chain-continue] Story ${story.id} has no scenes, skipping`);
        continue;
      }
      
      // Phase 3: Log story spine for debugging narrative flow (once per story)
      if (storySpine) {
        console.log(`[chain-continue] Story ${story.id} spine: "${storySpine.slice(0, 100)}..."`);
      }
      // Log Character Continuity Mode if enabled
      if (characterContinuityMode && lockedProviderName) {
        console.log(`[chain-continue] Story ${story.id} Character Continuity Mode → ${lockedProviderName}`);
      }

      // Get all clips for this story (include thumbnail dimensions for resize logic)
      const { data: clips, error: clipsError } = await supabase
        .from("video_jobs")
        .select("id, sequence_index, status, thumbnail_url, thumbnail_width, thumbnail_height, script_run_id, provider")
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
      let latestThumbnailWidth: number | null = null;
      let latestThumbnailHeight: number | null = null;
      let latestScriptRunId: string | null = null;
      let hasRunningJob = false;

      for (let i = 0; i < totalScenes; i++) {
        const clip = clipsByIndex.get(i);
        if (clip?.status === "done" && clip.thumbnail_url) {
          highestDoneIndex = i;
          latestThumbnail = clip.thumbnail_url;
          latestThumbnailWidth = clip.thumbnail_width ?? null;
          latestThumbnailHeight = clip.thumbnail_height ?? null;
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
      const isFirstScene = nextSceneIndex === 0;
      
      // Get previous scene's RAW prompt for action extraction (not compiled)
      // Using raw prompts gives better verb phrase extraction
      const prevScene = nextSceneIndex > 0 ? scenes[nextSceneIndex - 1] : null;
      const prevRawPrompt = prevScene?.prompt || null;
      const nextRawPrompt = nextScene.prompt;
      
      // Use enriched prompt for the actual generation (has camera directions, etc.)
      const basePrompt = nextScene.enriched_prompt || nextScene.prompt;

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

      // Determine scene role - use explicit role or infer from position
      const sceneRole: SceneRole = (nextScene as { role?: SceneRole }).role || 
        inferRoleFromPosition(nextSceneIndex, totalScenes);
      
      // Extract all roles for template-aware routing
      const templateRoles: SceneRole[] = scenes.map((s: { role?: SceneRole }, i: number) => 
        (s.role as SceneRole) || inferRoleFromPosition(i, totalScenes)
      );
      
      // Count how many Sora scenes have been used before this one
      // (approximate: count completed Sora-routed scenes from the clips we fetched)
      const completedSoraCount = (clips || []).filter(c => c.status === "done" && c.provider === "sora").length;
      
      // === PROVIDER SELECTION ===
      // Check for Character Continuity Mode - override routing if enabled
      let selectedProvider: VideoProvider;
      let routingReason: string;
      
      if (characterContinuityMode && lockedProviderName) {
        // LOCKED: Use the specified provider for ALL scenes
        selectedProvider = lockedProviderName;
        routingReason = `Character Continuity Mode → locked to ${lockedProviderName}`;
      } else {
        // NORMAL: Use role-based routing with tier/chaining/template awareness
        const routingResult = routeBySceneRole(sceneRole, {
          tier: storyTier,
          isChained: !isFirstScene,
          soraUsedCount: completedSoraCount,
          templateRoles,
        });
        selectedProvider = routingResult.provider;
        routingReason = routingResult.routingReason;
      }
      
      // Process duration: clamp to role range first, then snap to provider
      const processedDuration = processDuration(nextScene.duration_target || 5, sceneRole, selectedProvider);
      
      console.log(`[chain-continue] Provider routing: ${sceneRole} → ${selectedProvider} (${routingReason})`);
      
      // Queue to the selected provider directly (not "smart" - we've already made the decision)
      const providerEndpoint = {
        sora: "queue-video",
        runway: "queue-video-runway",
        luma: "queue-video-luma",
      }[selectedProvider];
      
      // Build motif context for injection
      const allMotifScenes: MotifScene[] = scenes.map((s, i) => ({
        id: s.id,
        role: (s.role as SceneRole) || inferRoleFromPosition(i, totalScenes),
        is_hero_shot: s.is_hero_shot,
        change_type: s.change_type,
      }));
      
      const motifContext = motifAnchors.length > 0 ? {
        sceneId: nextScene.id,
        sceneIndex: nextSceneIndex,
        role: sceneRole,
        isHeroShot: nextScene.is_hero_shot,
        changeType: nextScene.change_type,
        motifs: motifAnchors,
        allScenes: allMotifScenes,
      } : undefined;
      
      // === CUT TYPE RESOLUTION ===
      // Read cut_type from storyboard, apply provider-switch override
      const prevClip = clipsByIndex.get(nextSceneIndex - 1);
      const prevProvider = prevClip?.provider as VideoProvider | null;
      const prevSceneData = nextSceneIndex > 0 ? scenes[nextSceneIndex - 1] : null;
      const prevRole = prevSceneData?.role as SceneRole | null;
      
      // Get cut_type from storyboard (already has deterministic defaults from generate-storyboard)
      let cutType: "hard" | "continuity" = nextScene.cut_type || "hard";
      let cutReason = nextScene.cut_type ? "from storyboard" : "default hard";
      
      // Provider switch forces hard cut ONLY if NOT in Character Continuity Mode
      // When locked to single provider, provider never switches, so I2V is always safe
      if (!characterContinuityMode && prevProvider && prevProvider !== selectedProvider) {
        cutType = "hard";
        cutReason = `provider switch ${prevProvider}→${selectedProvider}`;
      }
      
      // In Character Continuity Mode with scenes 2+, FORCE continuity cut for I2V chaining
      if (characterContinuityMode && !isFirstScene && latestThumbnail) {
        cutType = "continuity";
        cutReason = "Character Continuity Mode forces I2V";
      }
      
      // Log the cut type decision (this is the key diagnostic)
      console.log(`[chain-continue] Scene ${nextSceneIndex + 1} cut_type="${cutType}" (${cutReason}) → ${cutType === "continuity" ? "I2V" : "T2V"}`);
      
      // Determine the starting frame ONLY for continuity cuts
      let startingFrameUrl: string | undefined = undefined;
      const targetSize = parseSize("720x1280"); // Standard portrait
      
      // THE KEY CONDITIONAL: Only use I2V for continuity cuts
      if (cutType === "continuity" && !isFirstScene && latestThumbnail) {
        // ALWAYS RESIZE for Sora I2V - eliminates 100% of dimension uncertainty
        // This is cheap and guarantees the starting frame matches Sora's expected dimensions
        if (selectedProvider === "sora") {
          console.log(`[chain-continue] Sora I2V: always-resize for guaranteed ${targetSize.width}x${targetSize.height}`);
          
          const resizedUrl = await resizeStartingFrame(
            latestThumbnail,
            targetSize.width,
            targetSize.height,
            story.id,
            nextSceneIndex
          );
          
          if (resizedUrl) {
            startingFrameUrl = resizedUrl;
            console.log(`[chain-continue] ✓ Resized frame ready: ${resizedUrl}`);
          } else {
            // Resize failed - fall back to T2V for this scene to avoid blocking chain
            console.warn(`[chain-continue] Resize failed, falling back to T2V for scene ${nextSceneIndex + 1}`);
            startingFrameUrl = undefined;
          }
        } else {
          // Runway/Luma: use original thumbnail (they handle dimension mismatches)
          startingFrameUrl = latestThumbnail;
          console.log(`[chain-continue] ${selectedProvider} I2V: using original thumbnail`);
        }
      }
      // For hard cuts: startingFrameUrl stays undefined (T2V) - no resize calls needed
      
      // Apply progression injection for I2V scenes (prevents repeated actions)
      // Phase 2: Prefer action_summary over heuristic extraction
      const changeType = nextScene.change_type || "info"; // Default to "info" not "action"
      let finalPrompt = basePrompt;
      
      if (nextSceneIndex > 0 && prevScene) {
        // Phase 2: Use action_summary if available, else fall back to extraction
        const prevAction = prevScene.action_summary || null;
        const nextAction = nextScene.action_summary || null;
        
        if (prevAction && nextAction) {
          // Use explicit action summaries (much more reliable)
          console.log(`[progression] scene=${nextSceneIndex + 1} action_summary: prev="${prevAction}" next="${nextAction}" change_type="${changeType}"`);
          
          if (prevAction.toLowerCase() === nextAction.toLowerCase()) {
            console.warn(`[progression] ⚠️ action_summary identical - may cause repeated motion`);
          }
        } else {
          // Fall back to heuristic extraction from RAW prompts
          const progressionCtx = buildProgressionContext(prevRawPrompt || "", nextRawPrompt, changeType);
          console.log(`[progression] scene=${nextSceneIndex + 1} prev_action="${progressionCtx.prev_action}" next_action="${progressionCtx.next_action}" change_type="${progressionCtx.change_type}"`);
          
          if (progressionCtx.prev_action === progressionCtx.next_action) {
            console.warn(`[progression] ⚠️ prev_action == next_action - may cause repeated motion`);
          }
        }
        
        // Inject progression directive into the compiled prompt
        finalPrompt = applyProgressionInjection(
          basePrompt,
          prevRawPrompt,
          nextSceneIndex,
          changeType,
          selectedProvider as "sora" | "runway" | "luma",
          sceneRole
        );
      }
      
      const response = await fetch(`${supabaseUrl}/functions/v1/${providerEndpoint}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${supabaseServiceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          script_run_id: scriptRunId,
          prompt: finalPrompt,
          settings: {
            size: "720x1280",
            seconds: processedDuration,
          },
          starting_frame_url: startingFrameUrl,
          motif_context: motifContext,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        console.error(`[chain-continue] Failed to queue: ${data.error}`);
        results.push({ storyId: story.id, action: "queue_failed", nextScene: nextSceneIndex });
        continue;
      }

      // Link job to story with audit fields for cut_type debugging
      const jobId = data.job?.id;
      if (jobId) {
        const auditData = {
          ...(story.continuity_anchors || {}),
          resolved_cut_type: cutType,
          had_starting_frame: !!startingFrameUrl,
          provider_selected: selectedProvider,
          scene_role: sceneRole,
        };
        await supabase
          .from("video_jobs")
          .update({
            story_job_id: story.id,
            sequence_index: nextSceneIndex,
            original_prompt: nextScene.prompt,
            style_hints: JSON.stringify(auditData),
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
