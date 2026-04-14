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
 * - Compliance hard-block enforcement for strict verticals
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
import { applyProgressionInjection, buildProgressionContext, extractActionFromPrompt } from "../_shared/progression-injection.ts";
import { buildCinematographyDirective, getRoleCinematography } from "../_shared/cinematic-prompts.ts";
import { applyMotionAmplification, summarizeMotionIntent } from "../_shared/motion-amplification.ts";
import { 
  buildNarrativeContextBlock, 
  shouldForceNarrativeT2V,
  countHardCutsUsed,
  inferCoverageFromPrompt,
  getCutTypeFromCoverage,
  buildCoverageDirective,
  buildSpectacleDirective,
  isSpectacleScene,
  getSpectacleHandling,
  type NarrativeScene,
  type NarrativeStoryContext,
  type CoverageType,
  type AlternateSubject,
} from "../_shared/narrative-context.ts";
import {
  autoScoreDifficulty,
  buildCaptureContract,
  describeCaptureContract,
  type SceneDifficulty,
} from "../_shared/capture-contract.ts";
import {
  buildForceEscalationBlock,
  logForceEscalationInjection,
  getProviderSanitizationLevel,
  shouldSkipSanitization,
  type ForceType,
  type EscalationLevel,
  type SanitizationLevel,
  type VideoProvider as ForceVideoProvider,
} from "../_shared/force-escalation.ts";
import {
  sanitizeForModeration,
  logModerationSanitization,
  getRetryPrompt,
  isModerationError,
  type RetryContext,
} from "../_shared/moderation-safety.ts";
import {
  processModerationLadder,
  sanitizeForMythMode,
  injectMythStyleAnchors,
  logModerationLadderDecision,
  isModerationRelatedError,
  buildModerationTelemetryForDb,
  mergeStyleHints,
  type StoryMode,
  type LadderStage,
  type ModerationLadderContext,
} from "../_shared/moderation-ladder.ts";
import { sanitizePromptText } from "../_shared/prompt-compliance.ts";
import { sanitizePromptForProvider } from "../_shared/prompt-sanitizer.ts";
import { checkProviderHealth, getHealthyProviders, logProviderHealth } from "../_shared/provider-health.ts";
import type { ContentVertical } from "../_shared/vertical-profiles.ts";

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

/**
 * Insert narrative context block AFTER motion amplification block
 * 
 * For I2V, the prompt structure should be:
 * 1. MOTION AMPLIFICATION (at very top - breaks hold)
 * 2. NARRATIVE CONTEXT (cause/effect glue)
 * 3. PROGRESSION INJECTION (if present)
 * 4. VISUAL PROMPT
 * 
 * This function finds the end of the motion block and inserts narrative there.
 */
function insertNarrativeAfterMotion(prompt: string, narrativeBlock: string): string {
  if (!narrativeBlock) return prompt;
  
  // Look for the end of motion amplification block markers
  // Sora uses: ═══════════════════════════════════════════════════════════════
  // Runway uses: ---
  // Luma uses just a newline after the bracket
  
  // Try Sora format first (most common for I2V)
  const soraEndMarker = "═══════════════════════════════════════════════════════════════\n\n";
  const soraEndIndex = prompt.lastIndexOf(soraEndMarker);
  if (soraEndIndex !== -1) {
    const insertPoint = soraEndIndex + soraEndMarker.length;
    return prompt.slice(0, insertPoint) + narrativeBlock + prompt.slice(insertPoint);
  }
  
  // Try Runway format
  const runwayEndMarker = "---\n\n";
  const runwayEndIndex = prompt.indexOf(runwayEndMarker);
  if (runwayEndIndex !== -1) {
    const insertPoint = runwayEndIndex + runwayEndMarker.length;
    return prompt.slice(0, insertPoint) + narrativeBlock + prompt.slice(insertPoint);
  }
  
  // Try Luma format (ends with ]\n\n)
  const lumaEndMarker = "]\n\n";
  const lumaEndIndex = prompt.indexOf(lumaEndMarker);
  if (lumaEndIndex !== -1 && lumaEndIndex < 200) { // Only if near start
    const insertPoint = lumaEndIndex + lumaEndMarker.length;
    return prompt.slice(0, insertPoint) + narrativeBlock + prompt.slice(insertPoint);
  }
  
  // Fallback: prepend if we can't find motion block
  return narrativeBlock + prompt;
}

/**
 * Request body interface for manual retry
 */
interface RetryRequest {
  story_job_id?: string;
  scene_index?: number;
  replace_job_id?: string;
  /** Optional AI-sanitized prompt override */
  prompt_override?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse optional request body for targeted retry
    let retryRequest: RetryRequest = {};
    try {
      const body = await req.json();
      retryRequest = body || {};
    } catch {
      // No body or invalid JSON - that's fine, run normal cron mode
    }

    const { story_job_id, scene_index, replace_job_id, prompt_override } = retryRequest;
    const isManualRetry = story_job_id !== undefined && scene_index !== undefined;
    // Direct invoke: story_job_id passed without scene_index (e.g. "Generate All" button)
    const isDirectInvoke = story_job_id !== undefined && scene_index === undefined;

    if (isManualRetry) {
      console.log(`[chain-continue] Manual retry: story=${story_job_id} scene=${scene_index} replace=${replace_job_id || "none"} ai_sanitized=${!!prompt_override}`);
    } else if (isDirectInvoke) {
      console.log(`[chain-continue] Direct invoke: story=${story_job_id}`);
      
      // Fire-and-forget: trigger voiceover pipeline (compile → generate) immediately
      // This decouples VO from video generation — VO is ready even if video providers fail
      void (async () => {
        try {
          // Check if VO already exists
          const { data: existingVo } = await supabase
            .from("story_voiceovers")
            .select("id")
            .eq("story_job_id", story_job_id)
            .limit(1);
          
          if (existingVo?.length) {
            console.log(`[chain-continue] VO already exists for ${story_job_id}, skipping early trigger`);
            return;
          }
          
          // Check if narration exists in storyboard
          const { data: storyData } = await supabase
            .from("story_jobs")
            .select("storyboard_json")
            .eq("id", story_job_id)
            .single();
          
          const storyboardScenes = (storyData?.storyboard_json as { scenes?: Array<{ narration_line?: string }> })?.scenes || [];
          const hasNarration = storyboardScenes.some(s => s.narration_line && s.narration_line.trim().length > 0);
          
          if (!hasNarration) {
            console.log(`[chain-continue] No narration in storyboard for ${story_job_id}, skipping VO`);
            return;
          }
          
          // Step 1: Compile script (creates voiceover record with compiled_script)
          console.log(`[chain-continue] Compiling VO script for ${story_job_id}`);
          const compileResp = await fetch(`${supabaseUrl}/functions/v1/compile-story-script`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${supabaseServiceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ story_job_id }),
          });
          const compileData = await compileResp.json();
          
          if (!compileResp.ok || !compileData.success || !compileData.voiceover_id) {
            console.error(`[chain-continue] VO compile failed for ${story_job_id}:`, compileData.error || compileResp.status);
            return;
          }
          
          console.log(`[chain-continue] VO compiled, voiceover_id=${compileData.voiceover_id}`);
          
          // Step 2: Generate audio from compiled script
          const genResp = await fetch(`${supabaseUrl}/functions/v1/generate-story-voiceover`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${supabaseServiceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ voiceover_id: compileData.voiceover_id }),
          });
          console.log(`[chain-continue] VO generate response: ${genResp.status}`);
        } catch (e) {
          console.error(`[chain-continue] Early VO trigger failed:`, e);
        }
      })();
    }

    // Find stories that are generating (or specific story for retry/direct invoke)
    let query = supabase
      .from("story_jobs")
      .select("id, storyboard_json, continuity_anchors, total_clips, completed_clips, story_type");
    
    if (isManualRetry || isDirectInvoke) {
      // For manual retry or direct invoke, get the specific story (regardless of status)
      query = query.eq("id", story_job_id);
    } else {
      // Normal cron mode: only get actively generating stories
      query = query.eq("status", "generating");
    }
    
    const { data: activeStories, error: storiesError } = await query.limit(5);

    if (storiesError) {
      throw new Error(`Failed to fetch stories: ${storiesError.message}`);
    }

    if (!activeStories?.length) {
      const message = isManualRetry 
        ? `Story ${story_job_id} not found` 
        : "No active stories";
      return new Response(
        JSON.stringify({ success: true, message }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // For manual retry or direct invoke, ensure story is in "generating" status
    if ((isManualRetry || isDirectInvoke) && activeStories[0].id === story_job_id) {
      await supabase
        .from("story_jobs")
        .update({ status: "generating" })
        .eq("id", story_job_id);
      console.log(`[chain-continue] Set story ${story_job_id} to generating status`);
      
      // Mark the old failed job as replaced (if provided)
      if (replace_job_id) {
        await supabase
          .from("video_jobs")
          .update({ 
            status: "failed",
            error: "Replaced by retry" 
          })
          .eq("id", replace_job_id);
        console.log(`[chain-continue] Marked job ${replace_job_id} as replaced`);
      }
    }

    console.log(`[chain-continue] Found ${activeStories.length} active stories`);

    const results: Array<{ storyId: string; action: string; nextScene?: number }> = [];

    for (const story of activeStories) {
      const storyboardData = story.storyboard_json as { 
        scenes?: Array<{ 
          id: string; 
          prompt: string;
          subject_action?: string; // Film mode alternative to prompt
          enriched_prompt?: string; 
          duration_target: number; 
          role?: SceneRole;
          is_hero_shot?: boolean;
          change_type?: string;
          // Phase 2: Explicit action summary
          action_summary?: string;
          // Phase 3: Cut type for I2V vs T2V
          cut_type?: "hard" | "continuity";
          // Phase 4: Narrative context fields
          narration_line?: string;
          state_from?: string;
          state_to?: string;
          end_state?: string;
          // Phase 6: Coverage type for action vs identity
          coverage_type?: CoverageType;
          // Phase 7: Spectacle scene system (subject freedom)
          subject_required?: boolean;
          alternate_subject?: AlternateSubject;
          // Phase 8: Story Forces (force/escalation injection)
          force_present?: boolean;
          force_type?: ForceType;
          escalation_delta?: EscalationLevel;
          setpiece_delta?: string;
        }>;
        tier?: "volume" | "hero";
        motif_anchors?: string[];
        // Phase 1: Story Spine from Director Brain
        story_spine?: string;
        // Character Continuity Mode (NEW)
        character_continuity_mode?: boolean;
        locked_provider?: "sora" | "runway" | "luma";
        // Soft Continuity Mode: allow T2V for specific roles even in Character Continuity Mode
        soft_continuity?: boolean;
        // Phase 8: Story-level settings
        brutality_mode?: boolean;
        sanitization_level?: SanitizationLevel;
        // Story Engine metadata (from router)
        story_engine?: {
          vertical?: string;
          goal?: string;
          resolved_story_type?: string;
          compiler?: string;
          selection_reason?: string;
        };
      };
      const scenes = storyboardData?.scenes || [];
      // Film Mode stories automatically get "hero" tier (unlimited Sora)
      const isFilmMode = (story as { story_type?: string }).story_type === "film_continuity";
      const storyTier = isFilmMode ? "hero" : (storyboardData?.tier || "volume");
      const motifAnchors = storyboardData?.motif_anchors || []; // Read motifs for injection
      const storySpine = storyboardData?.story_spine || ""; // Phase 1: Read story spine
      // Character Continuity Mode (NEW)
      const characterContinuityMode = storyboardData?.character_continuity_mode || false;
      const lockedProviderName = storyboardData?.locked_provider as VideoProvider | null;
      // Soft Continuity Mode: allow strategic T2V cuts for energy while keeping locked provider
      const softContinuityMode = storyboardData?.soft_continuity || false;
      // Phase 8: Story-level settings (brutality mode, sanitization)
      const brutalityMode = storyboardData?.brutality_mode || false;
      const storySanitizationLevel = storyboardData?.sanitization_level;
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
        .select("id, sequence_index, status, thumbnail_url, thumbnail_width, thumbnail_height, script_run_id, provider, output_url")
        .eq("story_job_id", story.id)
        .order("sequence_index", { ascending: true })
        .order("created_at", { ascending: false });

      // Load voiceover actual_timing if available — use real segment durations instead of estimates
      let voiceoverSceneDurations: Record<number, number> | null = null;
      {
        const { data: activeVo } = await supabase
          .from("story_voiceovers")
          .select("actual_timing, status")
          .eq("story_job_id", story.id)
          .eq("is_active", true)
          .limit(1)
          .single();
        
        if (activeVo?.status === "done" && activeVo.actual_timing) {
          const timing = activeVo.actual_timing as Array<{ start_ms: number; end_ms: number }>;
          if (Array.isArray(timing) && timing.length > 0) {
            voiceoverSceneDurations = {};
            for (let i = 0; i < timing.length; i++) {
              const segDur = (timing[i].end_ms - timing[i].start_ms) / 1000;
              if (segDur > 0) {
                voiceoverSceneDurations[i] = segDur;
              }
            }
            console.log(`[chain-continue] VO actual_timing loaded: ${timing.length} segments, durations=[${Object.values(voiceoverSceneDurations).map(d => d.toFixed(1)).join(",")}]`);
          }
        }
      }

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
      // IMPORTANT: Accept "done" clips even without thumbnail_url — thumbnail extraction
      // can fail (e.g., ffmpeg TLS errors) but the video is still valid.
      // When thumbnail is missing, we fall back to T2V for the next scene.
      let highestDoneIndex = -1;
      let latestThumbnail: string | null = null;
      let latestThumbnailWidth: number | null = null;
      let latestThumbnailHeight: number | null = null;
      let latestScriptRunId: string | null = null;
      let hasRunningJob = false;

      for (let i = 0; i < totalScenes; i++) {
        const clip = clipsByIndex.get(i);
        if (clip?.status === "done") {
          highestDoneIndex = i;
          latestScriptRunId = clip.script_run_id;
          if (clip.thumbnail_url) {
            latestThumbnail = clip.thumbnail_url;
            latestThumbnailWidth = clip.thumbnail_width ?? null;
            latestThumbnailHeight = clip.thumbnail_height ?? null;
          } else {
            // No thumbnail — clear reference so next scene uses T2V
            latestThumbnail = null;
            latestThumbnailWidth = null;
            latestThumbnailHeight = null;
            console.warn(`[chain-continue] Scene ${i + 1} done but no thumbnail — next scene will use T2V`);
          }
        } else if (clip?.status === "running" || clip?.status === "queued") {
          hasRunningJob = true;
        }
      }

      // If there's a running job, wait for it (unless manual retry targeting a specific scene)
      const isTargetedRetry = isManualRetry && story.id === story_job_id && scene_index !== undefined;
      
      if (hasRunningJob && !isTargetedRetry) {
        console.log(`[chain-continue] Story ${story.id} has running job, waiting`);
        results.push({ storyId: story.id, action: "waiting" });
        continue;
      }
      
      // For manual retry, use the specified scene_index; otherwise use next scene after highest done
      let nextSceneIndex: number;
      let useReferenceFromPrevious = true;
      
      if (isTargetedRetry) {
        nextSceneIndex = scene_index;
        console.log(`[chain-continue] Manual retry targeting scene ${nextSceneIndex}`);
        
        // For retry of scene 0, no reference needed (T2V)
        // For retry of later scenes, find the best reference from the scene BEFORE the target
        if (nextSceneIndex > 0) {
          // Look for a completed clip at scene_index - 1 to use as reference
          const prevClip = clipsByIndex.get(nextSceneIndex - 1);
          if (prevClip?.status === "done" && prevClip.thumbnail_url) {
            latestThumbnail = prevClip.thumbnail_url;
            latestThumbnailWidth = prevClip.thumbnail_width ?? null;
            latestThumbnailHeight = prevClip.thumbnail_height ?? null;
            latestScriptRunId = prevClip.script_run_id;
            console.log(`[chain-continue] Using scene ${nextSceneIndex - 1} as reference for retry`);
          } else {
            // No valid reference - force T2V for this scene
            useReferenceFromPrevious = false;
            console.warn(`[chain-continue] No reference available for scene ${nextSceneIndex}, will use T2V`);
          }
        }
      } else {
        nextSceneIndex = highestDoneIndex + 1;
      }

      // Check if all scenes are done (skip for targeted retry - we're explicitly re-generating a scene)
      if (nextSceneIndex >= totalScenes && !isTargetedRetry) {
        console.log(`[chain-continue] Story ${story.id} complete! ${totalScenes} scenes done`);
        await supabase
          .from("story_jobs")
          .update({ status: "done", completed_clips: totalScenes })
          .eq("id", story.id);
        
        // Fire-and-forget: request analysis without blocking story completion
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
        
        // Fire-and-forget: trigger voiceover generation if narration exists and no VO yet
        const hasNarration = scenes.some((s: { narration_line?: string }) => s.narration_line && s.narration_line.trim().length > 0);
        if (hasNarration) {
          // Check if VO already exists
          const { data: existingVo } = await supabase
            .from("story_voiceovers")
            .select("id")
            .eq("story_job_id", story.id)
            .limit(1);
          
          if (!existingVo?.length) {
            console.log(`[chain-continue] Triggering VO pipeline for ${story.id} (compile → generate)`);
            void (async () => {
              try {
                const compileResp = await fetch(`${supabaseUrl}/functions/v1/compile-story-script`, {
                  method: "POST",
                  headers: {
                    "Authorization": `Bearer ${supabaseServiceKey}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ story_job_id: story.id }),
                });
                const compileData = await compileResp.json();
                if (!compileResp.ok || !compileData.success || !compileData.voiceover_id) {
                  console.error(`[chain-continue] VO compile failed for ${story.id}:`, compileData.error);
                  return;
                }
                const genResp = await fetch(`${supabaseUrl}/functions/v1/generate-story-voiceover`, {
                  method: "POST",
                  headers: {
                    "Authorization": `Bearer ${supabaseServiceKey}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ voiceover_id: compileData.voiceover_id }),
                });
                console.log(`[chain-continue] VO generate for ${story.id}: ${genResp.status}`);
              } catch (e) {
                console.error(`[chain-continue] VO pipeline failed for ${story.id}:`, e);
              }
            })();
          } else {
            console.log(`[chain-continue] VO already exists for ${story.id}, skipping`);
          }
        }
        
        results.push({ storyId: story.id, action: "completed" });
        continue;
      }

      // Need to queue next scene
      const nextScene = scenes[nextSceneIndex];
      const isFirstScene = nextSceneIndex === 0;
      
      // Get previous scene's RAW prompt for action extraction (not compiled)
      // Using raw prompts gives better verb phrase extraction
      // NOTE: Film Mode stories use subject_action instead of prompt
      const prevScene = nextSceneIndex > 0 ? scenes[nextSceneIndex - 1] : null;
      const prevRawPrompt = prevScene?.prompt || prevScene?.subject_action || null;
      const nextRawPrompt = nextScene.prompt || nextScene.subject_action;
      
      // Use enriched prompt for the actual generation (has camera directions, etc.)
      // Fall back to subject_action for Film Mode stories
      // AI prompt_override takes priority if provided (from AI sanitization)
      const basePrompt = (isManualRetry && prompt_override) 
        ? prompt_override 
        : (nextScene.enriched_prompt || nextScene.prompt || nextScene.subject_action || "");
      
      if (isManualRetry && prompt_override) {
        console.log(`[chain-continue] Using AI-sanitized prompt override (${prompt_override.length} chars)`);
      }

      // For I2V scenes, if no reference image, fall back to T2V instead of blocking the chain
      if (!isFirstScene && !latestThumbnail && useReferenceFromPrevious) {
        console.warn(`[chain-continue] Story ${story.id} scene ${nextSceneIndex + 1}: no reference frame available, falling back to T2V`);
        // Don't block — just force T2V for this scene
      }
      
      // If we're retrying without a reference, clear the thumbnail to force T2V
      if (!useReferenceFromPrevious) {
        latestThumbnail = null;
        console.log(`[chain-continue] Forcing T2V for scene ${nextSceneIndex} (no reference available)`);
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

      // === DUPLICATE PREVENTION ===
      // Check if a job already exists for this scene_index that's queued/running
      // This prevents the cron from creating duplicate jobs on every tick
      if (!isTargetedRetry) {
        const existingJob = (clips || []).find(
          c => c.sequence_index === nextSceneIndex && (c.status === "queued" || c.status === "running")
        );
        if (existingJob) {
          console.log(`[chain-continue] Scene ${nextSceneIndex + 1} already has ${existingJob.status} job ${existingJob.id}, skipping`);
          results.push({ storyId: story.id, action: "already_queued", nextScene: nextSceneIndex });
          continue;
        }
      }

      // === EARLY VO TRIGGER (cron path) ===
      // Trigger voiceover generation on the FIRST scene queue attempt for any story
      // This ensures VO is generated regardless of which entry point created the story
      if (nextSceneIndex === 0 && !isTargetedRetry) {
        const hasNarration = scenes.some((s: { narration_line?: string }) => s.narration_line && s.narration_line.trim().length > 0);
        if (hasNarration) {
          const { data: existingVo } = await supabase
            .from("story_voiceovers")
            .select("id")
            .eq("story_job_id", story.id)
            .limit(1);
          
          if (!existingVo?.length) {
            console.log(`[chain-continue] Triggering early VO for ${story.id} (first scene, cron path)`);
            void (async () => {
              try {
                const compileResp = await fetch(`${supabaseUrl}/functions/v1/compile-story-script`, {
                  method: "POST",
                  headers: {
                    "Authorization": `Bearer ${supabaseServiceKey}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ story_job_id: story.id }),
                });
                const compileData = await compileResp.json();
                if (!compileResp.ok || !compileData.success || !compileData.voiceover_id) {
                  console.error(`[chain-continue] Early VO compile failed for ${story.id}:`, compileData.error);
                  return;
                }
                console.log(`[chain-continue] VO compiled for ${story.id}, voiceover_id=${compileData.voiceover_id}`);
                const genResp = await fetch(`${supabaseUrl}/functions/v1/generate-story-voiceover`, {
                  method: "POST",
                  headers: {
                    "Authorization": `Bearer ${supabaseServiceKey}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ voiceover_id: compileData.voiceover_id }),
                });
                console.log(`[chain-continue] VO generate for ${story.id}: ${genResp.status}`);
              } catch (e) {
                console.error(`[chain-continue] Early VO trigger failed for ${story.id}:`, e);
              }
            })();
          }
        }
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
      
      // === PROVIDER SELECTION (with P0 circuit breaker) ===
      const providerHealth = await checkProviderHealth(supabase);
      const healthyProviders = getHealthyProviders(providerHealth);
      
      let selectedProvider: VideoProvider;
      let routingReason: string;
      
      if (characterContinuityMode && lockedProviderName) {
        if (healthyProviders.includes(lockedProviderName)) {
          selectedProvider = lockedProviderName;
          routingReason = `Character Continuity Mode → locked to ${lockedProviderName}`;
        } else {
          selectedProvider = healthyProviders[0];
          routingReason = `CCM → ${lockedProviderName} UNHEALTHY, circuit breaker → ${selectedProvider}`;
          console.warn(`[chain-continue] Circuit breaker: ${lockedProviderName} disabled, using ${selectedProvider}`);
        }
      } else {
        const routingResult = routeBySceneRole(sceneRole, {
          tier: storyTier,
          isChained: !isFirstScene,
          soraUsedCount: completedSoraCount,
          templateRoles,
        });
        selectedProvider = routingResult.provider;
        routingReason = routingResult.routingReason;
        
        // P0: Check if routed provider is healthy
        if (!healthyProviders.includes(selectedProvider)) {
          const fallback = healthyProviders[0];
          console.warn(`[chain-continue] Circuit breaker: ${selectedProvider} unhealthy → ${fallback}`);
          routingReason += ` | CIRCUIT BREAKER → ${fallback}`;
          selectedProvider = fallback;
        }
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
      // NEW PRIORITY ORDER (spectacle → coverage → I2V):
      // 1. First scene always T2V
      // 2. Spectacle scenes (subject_required=false) always T2V + strip identity
      // 3. Resolve coverage_type (explicit → inferred from prompt → default by role)
      // 4. Coverage determines cut type (face→I2V, back/wide/pov/obscured/none→T2V)
      // 5. Provider switch forces T2V (only matters if coverage allowed I2V)
      
      const prevClip = clipsByIndex.get(nextSceneIndex - 1);
      const prevProvider = prevClip?.provider as VideoProvider | null;
      
      // === SPECTACLE SCENE CHECK (highest priority) ===
      const spectacleHandling = getSpectacleHandling({
        subject_required: (nextScene as { subject_required?: boolean }).subject_required,
        alternate_subject: (nextScene as { alternate_subject?: AlternateSubject }).alternate_subject,
        coverage_type: (nextScene as { coverage_type?: CoverageType }).coverage_type,
      });
      
      // === COVERAGE RESOLUTION ===
      // SPECTACLE OVERRIDE: If subject_required=false, force coverage to "none"
      // This prevents contradictions like subject_required=false + coverage_type=face
      let resolvedCoverage: CoverageType;
      const rawCoverage = (nextScene as { coverage_type?: CoverageType }).coverage_type;
      
      if (spectacleHandling.isSpectacle) {
        // Force "none" for spectacle scenes (final authority)
        resolvedCoverage = "none";
        console.log(`[chain-continue] Scene ${nextSceneIndex + 1} is SPECTACLE (${
          (nextScene as { alternate_subject?: AlternateSubject }).alternate_subject || "no protagonist"
        }) → forcing coverage="none", stripping identity`);
        if (rawCoverage && rawCoverage !== "none" && rawCoverage !== "wide") {
          console.log(`[chain-continue] ⚠️ Overriding contradictory coverage="${rawCoverage}" to "none"`);
        }
      } else {
        // Normal: 3-tier fallback (explicit → inferred from prompt → default by role)
        resolvedCoverage = inferCoverageFromPrompt(
          nextScene.prompt || basePrompt,
          sceneRole,
          rawCoverage
        );
        console.log(`[chain-continue] Scene ${nextSceneIndex + 1} coverage_type="${resolvedCoverage}" (${
          rawCoverage ? "explicit" : "inferred"
        })`);
      }
      // === CUT TYPE FROM SPECTACLE/COVERAGE (final authority) ===
      let cutType: "hard" | "continuity" = "hard";
      let cutReason = "default hard";
      
      if (isFirstScene) {
        cutType = "hard";
        cutReason = "first scene always T2V";
      } else if (spectacleHandling.forceT2V) {
        // SPECTACLE SCENES: Always T2V (highest priority after first scene)
        cutType = "hard";
        cutReason = `spectacle scene (${(nextScene as { alternate_subject?: AlternateSubject }).alternate_subject || "no subject"}) → forced T2V`;
      } else {
        // Coverage is the FINAL AUTHORITY on I2V vs T2V
        const coverageResult = getCutTypeFromCoverage(
          resolvedCoverage,
          !!latestThumbnail, // hasGoodReference
          characterContinuityMode
        );
        cutType = coverageResult.cutType;
        cutReason = coverageResult.reason;
      }
      
      // Provider switch forces T2V (only if coverage allowed I2V)
      // When locked to single provider, provider never switches
      if (!characterContinuityMode && cutType === "continuity" && prevProvider && prevProvider !== selectedProvider) {
        cutType = "hard";
        cutReason = `coverage wanted I2V but provider switch ${prevProvider}→${selectedProvider}`;
      }
      
      // Log the cut type decision (this is the key diagnostic)
      console.log(`[chain-continue] Scene ${nextSceneIndex + 1} cut_type="${cutType}" (${cutReason}) → ${cutType === "continuity" ? "I2V" : "T2V"}`);
      
      // === ROLE-BASED CINEMATOGRAPHY (anti-"video game" variety) ===
      const cinematographyDirective = buildCinematographyDirective(
        nextSceneIndex,
        sceneRole,
        true // includeRealism for action scenes
      );
      const roleCine = getRoleCinematography(sceneRole);
      console.log(`[cinematography] Scene ${nextSceneIndex + 1} role=${sceneRole} → ${roleCine.lens} lens, ${roleCine.motion} motion, ${roleCine.lighting} lighting`);
      
      // === CHARACTER BIBLE T2V MODE ===
      // For T2V hero scenes (not spectacle), identity comes from Character Bible in prompt, not pixels
      // This is the key insight: "cinematic continuity" vs "pixel continuity"
      const isCharacterBibleT2V = cutType === "hard" && 
        !spectacleHandling.isSpectacle && 
        characterContinuityMode &&
        !isFirstScene;
      
      if (isCharacterBibleT2V) {
        console.log(`[chain-continue] 🎬 Character Bible T2V: identity via prompt anchors, not frame reference`);
        // The Character Bible (wardrobe, props, palette, environment) will be in the prompt
        // But startingFrameUrl stays undefined (T2V) for motion freedom
      }
      
      // Log transformation fields if available for debugging
      if (nextScene.state_from || nextScene.state_to) {
        console.log(`[narrative] Transformation: "${nextScene.state_from || '?'}" → "${nextScene.state_to || '?'}"`);
      }
      if (nextScene.end_state) {
        console.log(`[narrative] Expected end_state: "${nextScene.end_state}"`);
      }
      
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
      
      // === PROMPT ENHANCEMENT ===
      // Layer order is CRITICAL and differs for I2V vs T2V:
      // 
      // I2V ORDER (motion first to break hold):
      //   1. MOTION AMPLIFICATION (breaks Sora's "hold" behavior)
      //   2. STORY CONTEXT (narrative arc, prev/current beat)
      //   3. PROGRESSION INJECTION (action completion)
      //   4. VISUAL PROMPT + CONTINUITY ANCHORS
      //
      // T2V ORDER (story context first to establish intent):
      //   1. STORY CONTEXT (narrative arc, intent)
      //   2. VISUAL PROMPT + CONTINUITY ANCHORS
      //   3. Light motion note (optional)
      
      const changeType = nextScene.change_type || "info";
      let finalPrompt = basePrompt;
      const isI2V = cutType === "continuity" && !!startingFrameUrl;
      
      // Build NarrativeScene objects for context injection
      const narrativeScenes: NarrativeScene[] = scenes.map((s, i) => ({
        id: s.id,
        prompt: s.prompt,
        role: (s.role as SceneRole) || inferRoleFromPosition(i, totalScenes),
        change_type: s.change_type || "info",
        narration_line: s.narration_line,
        action_summary: s.action_summary,
        state_from: s.state_from,
        state_to: s.state_to,
        end_state: s.end_state,
        coverage_type: (s as { coverage_type?: CoverageType }).coverage_type,
        // Spectacle scene fields
        subject_required: (s as { subject_required?: boolean }).subject_required,
        alternate_subject: (s as { alternate_subject?: AlternateSubject }).alternate_subject,
      }));
      
      const storyContext: NarrativeStoryContext = {
        storySpine: storySpine,
        totalScenes: totalScenes,
        allScenes: narrativeScenes,
        motifAnchors: motifAnchors,
      };
      
      const prevNarrativeScene = nextSceneIndex > 0 ? narrativeScenes[nextSceneIndex - 1] : null;
      
      // Extract previous action for "finished" constraint
      let prevActionForMotion: string | null = null;
      
      if (nextSceneIndex > 0 && prevScene) {
        // Phase 2: Use action_summary if available, else fall back to extraction
        const prevAction = prevScene.action_summary || extractActionFromPrompt(prevRawPrompt || "");
        const nextAction = nextScene.action_summary || extractActionFromPrompt(nextRawPrompt);
        prevActionForMotion = prevAction;
        
        console.log(`[progression] scene=${nextSceneIndex + 1} prev="${prevAction}" next="${nextAction}" change="${changeType}" isI2V=${isI2V}`);
        
        if (prevAction.toLowerCase() === nextAction.toLowerCase()) {
          console.warn(`[progression] ⚠️ prev_action == next_action - may cause repeated motion`);
        }
        
        // Apply progression injection
        finalPrompt = applyProgressionInjection(
          basePrompt,
          prevRawPrompt,
          nextSceneIndex,
          changeType,
          selectedProvider as "sora" | "runway" | "luma",
          sceneRole
        );
      }
      
      // Build narrative context block (compact, token-efficient)
      const narrativeBlock = buildNarrativeContextBlock(
        storyContext,
        nextSceneIndex,
        prevNarrativeScene
      );
      
      // === CAPTURE CONTRACT (Film Realism Prior) ===
      // Score scene difficulty and build appropriate capture contract
      // This shifts the model from "render this scene" to "this was captured on-location"
      // FIX: Myth Mode should NOT get realistic capture contracts - they conflict with silhouette style
      const isMythModeStory = (story as { story_type?: string }).story_type === "myth";
      const { difficulty, isInterior, hasMetalArmor } = autoScoreDifficulty(basePrompt, resolvedCoverage);
      const captureContract = isMythModeStory ? "" : buildCaptureContract(difficulty);
      
      if (isMythModeStory) {
        console.log(`[capture] Scene ${nextSceneIndex + 1} SKIPPED for Myth Mode (no realistic cinematography)`);
      } else {
        console.log(`[capture] Scene ${nextSceneIndex + 1} difficulty=${difficulty} (interior=${isInterior}, metal=${hasMetalArmor}) → ${describeCaptureContract(difficulty)}`);
      }
      
      // === FORCE/ESCALATION INJECTION (Phase 8) ===
      // Transform abstract metadata (force_type, escalation_delta) into concrete visual directives
      // PROVIDER-AWARE: Runway gets short form, Sora/Luma get long form
      const forceSceneData = {
        force_present: (nextScene as { force_present?: boolean }).force_present,
        force_type: (nextScene as { force_type?: ForceType }).force_type,
        escalation_delta: (nextScene as { escalation_delta?: EscalationLevel }).escalation_delta,
        setpiece_delta: (nextScene as { setpiece_delta?: string }).setpiece_delta,
      };
      
      const forceEscalationBlock = buildForceEscalationBlock(
        forceSceneData,
        nextSceneIndex,
        brutalityMode,
        selectedProvider as "sora" | "runway" | "luma"
      );
      
      // Log force/escalation for debugging (with provider context)
      logForceEscalationInjection(
        nextSceneIndex, 
        forceSceneData, 
        selectedProvider as "sora" | "runway" | "luma"
      );
      
      if (isI2V) {
        // I2V ORDER: Motion first (breaks hold), then capture→force→cinematography→narrative
        const motionSummary = summarizeMotionIntent(basePrompt);
        console.log(`[motion-amp] I2V scene ${nextSceneIndex + 1}: "${motionSummary}"`);
        
        // Step 1: Apply motion amplification FIRST (goes to TOP)
        finalPrompt = applyMotionAmplification(
          finalPrompt,
          selectedProvider as "sora" | "runway" | "luma",
          prevActionForMotion,
          true, // isI2V
          sceneRole
        );
        
        // Step 2: Insert capture + force/escalation + cinematography + narrative AFTER motion block
        // Order: motion → capture → FORCE/ESC → cinematography → narrative → visual
        finalPrompt = insertNarrativeAfterMotion(finalPrompt, captureContract + forceEscalationBlock + cinematographyDirective + narrativeBlock);
        
        console.log(`[narrative] ✓ I2V order: motion→capture→force/esc→cinematography→narrative→visual for ${selectedProvider}`);
      } else {
        // T2V ORDER: 
        // RUNWAY: Force/Escalation FIRST (survives truncation) → capture → rest
        // SORA/LUMA: Capture → Force/Escalation → rest (more tokens available)
        
        const isRunway = selectedProvider === "runway";
        
        if (spectacleHandling.isSpectacle) {
          // Spectacle scene
          const spectacleDirective = spectacleHandling.directive;
          if (isRunway) {
            // Runway: force/esc FIRST to survive truncation
            finalPrompt = forceEscalationBlock + captureContract + spectacleDirective + cinematographyDirective + narrativeBlock + finalPrompt;
            console.log(`[narrative] ✓ Runway T2V spectacle: FORCE→capture→spectacle→cinematography→visual`);
          } else {
            finalPrompt = captureContract + forceEscalationBlock + spectacleDirective + cinematographyDirective + narrativeBlock + finalPrompt;
            console.log(`[narrative] ✓ T2V spectacle: capture→force/esc→spectacle→cinematography→visual`);
          }
        } else {
          // Regular T2V
          const coverageDirective = buildCoverageDirective(resolvedCoverage);
          if (isRunway) {
            // Runway: force/esc FIRST to survive truncation
            finalPrompt = forceEscalationBlock + captureContract + coverageDirective + cinematographyDirective + narrativeBlock + finalPrompt;
            console.log(`[narrative] ✓ Runway T2V: FORCE→capture→coverage=${resolvedCoverage}→cinematography→visual`);
          } else {
            finalPrompt = captureContract + forceEscalationBlock + coverageDirective + cinematographyDirective + narrativeBlock + finalPrompt;
            console.log(`[narrative] ✓ T2V: capture→force/esc→coverage=${resolvedCoverage}→cinematography→visual`);
          }
        }
      }
      
      // === COMPLIANCE HARD-BLOCK ENFORCEMENT ===
      // Run compliance check BEFORE generation. Hard-blocks in strict verticals → fail immediately.
      const storyVertical = storyboardData?.story_engine?.vertical as ContentVertical | undefined;
      let complianceResult: { hard_blocks: string[]; was_modified: boolean; replacements: string[] } | null = null;
      
      if (storyVertical) {
        complianceResult = sanitizePromptText(finalPrompt, storyVertical);
        
        if (complianceResult.was_modified) {
          console.log(`[compliance] Scene ${nextSceneIndex + 1}: ${complianceResult.replacements.length} replacements applied`);
          finalPrompt = complianceResult.text;
        }
        
        if (complianceResult.hard_blocks.length > 0) {
          console.error(`[compliance] ❌ Scene ${nextSceneIndex + 1} HARD-BLOCKED: ${complianceResult.hard_blocks.join("; ")}`);
          
          // Mark story as partial with compliance failure
          await supabase
            .from("story_jobs")
            .update({ status: "partial" })
            .eq("id", story.id);
          
          results.push({ 
            storyId: story.id, 
            action: "compliance_blocked", 
            nextScene: nextSceneIndex,
          });
          continue;
        }
      }
      
      // === P0 FIX: SANITIZE PROMPT (strip routing metadata) ===
      // This is the LAST PASS before the prompt reaches the video model.
      // Strips all [LABEL:...], KEY=VALUE, and structural markers.
      const { cleanPrompt: sanitizedPrompt, strippedChars, wasTrimmed } = sanitizePromptForProvider(
        finalPrompt,
        selectedProvider
      );
      if (strippedChars > 0 || wasTrimmed) {
        console.log(`[chain-continue] P0 Sanitized scene ${nextSceneIndex + 1}: stripped ${strippedChars} chars, trimmed=${wasTrimmed}, final=${sanitizedPrompt.length} chars for ${selectedProvider}`);
      }
      
      // === PROVIDER FALLBACK ORDER ===
      // When a provider fails with credits/quota, try the next one
      const PROVIDER_FALLBACK_ORDER: VideoProvider[] = ["runway", "luma", "sora"];
      
      function isProviderCreditsError(errorMsg: string): boolean {
        const msg = (errorMsg || "").toLowerCase();
        return (
          msg.includes("no credits") ||
          msg.includes("insufficient credits") ||
          msg.includes("payment required") ||
          msg.includes("credits") ||
          msg.includes("quota") ||
          msg.includes("rate limit")
        );
      }
      
      function getNextFallbackProvider(current: VideoProvider, attempted: Set<string>): VideoProvider | null {
        for (const p of PROVIDER_FALLBACK_ORDER) {
          if (p !== current && !attempted.has(p)) return p;
        }
        return null;
      }

      // === MODERATION LADDER RETRY LOOP (v3 - WITH PROVIDER FALLBACK) ===
      // Implements "AI sanitize first, then fallback" strategy for story-aware recovery
      // NEW: Also handles credits/quota errors by falling back to next provider
      
      const storyMode: StoryMode = (story as { story_type?: string }).story_type === "myth" ? "myth" : 
        isFilmMode ? "film" : "short_story";
      
      const storyLockedProvider = lockedProviderName;
      
      let queueSuccess = false;
      let data: { success: boolean; job?: { id: string }; error?: string } = { success: false };
      let currentPrompt = sanitizedPrompt; // P0: Use sanitized prompt
      let currentProvider = selectedProvider;
      let currentProviderEndpoint = providerEndpoint;
      let currentStartingFrame = startingFrameUrl;
      let moderationTelemetry: Record<string, unknown> | null = null;
      let currentStage: LadderStage = 0;
      const attemptedProviders = new Set<string>([selectedProvider]);
      const providerAttemptLog: string[] = [selectedProvider];
      let providerFailReason: string | null = null;
      
      const MAX_LADDER_ITERATIONS = 4;
      // Outer loop: provider fallback; Inner loop: moderation ladder per provider
      let providerExhausted = false;
      
      while (!queueSuccess && !providerExhausted) {
        // Reset moderation stage for each new provider attempt
        currentStage = 0;
        
        for (let iteration = 0; iteration < MAX_LADDER_ITERATIONS && !queueSuccess; iteration++) {
          if (currentStage > 0) {
            const ladderCtx: ModerationLadderContext = {
              storyMode,
              lockedProvider: storyLockedProvider,
              currentProvider,
              originalProvider: selectedProvider,
              stage: currentStage,
              originalPrompt: finalPrompt,
              lastError: data.error,
              sceneRole,
              brutalityMode,
            };
            
            const ladderResult = processModerationLadder(ladderCtx);
            logModerationLadderDecision(nextSceneIndex, story.id, ladderResult);
            
            if (ladderResult.action === "fail") {
              console.log(`[chain-continue] Moderation ladder exhausted for scene ${nextSceneIndex + 1} on ${currentProvider}`);
              moderationTelemetry = buildModerationTelemetryForDb(ladderResult.telemetry);
              break; // Break inner loop, try next provider
            }
            
            currentPrompt = ladderResult.prompt;
            // Don't let moderation ladder switch provider - we handle that in outer loop
            
            if (ladderResult.dropReference) {
              currentStartingFrame = undefined;
              console.log(`[chain-continue] Moderation ladder: dropping reference frame for scene ${nextSceneIndex + 1}`);
            }
            
            moderationTelemetry = buildModerationTelemetryForDb(ladderResult.telemetry);
            console.log(`[chain-continue] Moderation stage ${currentStage}: ${ladderResult.action} on ${currentProvider}`);
          }
          
          // Use voiceover actual_timing if available, otherwise fall back to storyboard estimate
          const rawNarrationDuration = voiceoverSceneDurations?.[nextSceneIndex] ?? (nextScene.duration_target || 5);
          const attemptDuration = processDuration(rawNarrationDuration, sceneRole, currentProvider);
          // requested_seconds = exact narration segment duration (for trim/assembly)
          // provider_seconds = provider-bucketed duration (for API request)
          const requestedSeconds = voiceoverSceneDurations?.[nextSceneIndex] ?? (nextScene.duration_target || attemptDuration);
          
          const response = await fetch(`${supabaseUrl}/functions/v1/${currentProviderEndpoint}`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${supabaseServiceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              script_run_id: scriptRunId,
              prompt: currentPrompt,
              settings: {
                size: "720x1280",
                provider_seconds: attemptDuration,
                requested_seconds: requestedSeconds,
              },
              starting_frame_url: currentStartingFrame,
              motif_context: motifContext,
              skip_internal_retry: storyMode !== "default",
            }),
          });

          data = await response.json();

          if (response.ok && data.success) {
            queueSuccess = true;
            console.log(`[chain-continue] ✓ Queue success at stage ${currentStage} on ${currentProvider}`);
          } else {
            const errorMsg = data.error || `HTTP ${response.status}`;
            console.error(`[chain-continue] Queue stage ${currentStage} failed on ${currentProvider}: ${errorMsg}`);
            
            // Credits/quota error → try next provider (skip moderation ladder)
            if (isProviderCreditsError(errorMsg)) {
              providerFailReason = errorMsg;
              console.warn(`[chain-continue] Credits/quota error on ${currentProvider} — attempting provider fallback`);
              break; // Break inner moderation loop, try next provider
            }
            
            // Non-moderation error → stop
            if (!isModerationRelatedError(errorMsg)) {
              console.log(`[chain-continue] Non-moderation error, not retrying via ladder: ${errorMsg}`);
              providerExhausted = true;
              break;
            }
            
            currentStage = (currentStage + 1) as LadderStage;
            console.log(`[chain-continue] Advancing to moderation stage ${currentStage}`);
          }
        }
        
        // If success or non-retryable failure, stop
        if (queueSuccess || providerExhausted) break;
        
        // Try next provider fallback (only for credits/quota errors)
        if (providerFailReason && !storyLockedProvider) {
          const nextProvider = getNextFallbackProvider(currentProvider, attemptedProviders);
          if (nextProvider) {
            console.log(`[chain-continue] Provider fallback: ${currentProvider} → ${nextProvider}`);
            currentProvider = nextProvider;
            currentProviderEndpoint = {
              sora: "queue-video",
              runway: "queue-video-runway",
              luma: "queue-video-luma",
            }[currentProvider];
            attemptedProviders.add(currentProvider);
            providerAttemptLog.push(currentProvider);
            currentPrompt = finalPrompt; // Reset prompt for new provider
            currentStartingFrame = startingFrameUrl; // Reset frame
            providerFailReason = null;
            // Continue outer while loop with new provider
          } else {
            console.error(`[chain-continue] All providers exhausted for scene ${nextSceneIndex + 1}`);
            providerExhausted = true;
          }
        } else if (providerFailReason && storyLockedProvider) {
          console.error(`[chain-continue] Credits error on locked provider ${currentProvider} — cannot fallback`);
          providerExhausted = true;
        } else {
          // Moderation exhausted on this provider, no credits error → stop
          providerExhausted = true;
        }
      }
      
      // Handle final failure — DON'T mark story as partial, just skip this scene
      // The chain will retry on next cron tick if provider recovers
      if (!queueSuccess) {
        console.error(`[chain-continue] Failed to queue scene ${nextSceneIndex + 1} (providers attempted: ${providerAttemptLog.join("→")})`);
        
        // Only mark partial if ALL providers are exhausted (credits on all)
        if (providerExhausted && providerFailReason) {
          await supabase
            .from("story_jobs")
            .update({ status: "partial" })
            .eq("id", story.id);
        }
        
        results.push({ 
          storyId: story.id, 
          action: "queue_failed", 
          nextScene: nextSceneIndex,
        });
        continue;
      }

      // Link job to story with audit fields for cut_type debugging
      const jobId = data.job?.id;
      if (jobId) {
        const auditData = {
          ...(story.continuity_anchors || {}),
          resolved_cut_type: cutType,
          had_starting_frame: !!currentStartingFrame,
          provider_selected: currentProvider,
          provider_original: selectedProvider,
          provider_attempts: providerAttemptLog, // NEW: track fallback chain
          scene_role: sceneRole,
          // Spectacle and coverage audit fields
          is_spectacle: spectacleHandling.isSpectacle,
          alternate_subject: (nextScene as { alternate_subject?: AlternateSubject }).alternate_subject || null,
          coverage_raw: rawCoverage || null,
          coverage_resolved: resolvedCoverage,
          // Character Bible T2V mode flag
          is_character_bible_t2v: isCharacterBibleT2V,
          // Role-based cinematography (anti-"video game" variety)
          cinematography: roleCine,
          // Capture contract (film realism prior)
          capture_difficulty: difficulty,
          capture_is_interior: isInterior,
          capture_has_metal: hasMetalArmor,
          // Moderation ladder telemetry
          ...(moderationTelemetry || {}),
          // Compliance telemetry
          compliance_modified: complianceResult?.was_modified || false,
          compliance_replacements: complianceResult?.replacements?.length || 0,
        };
        await supabase
          .from("video_jobs")
          .update({
            story_job_id: story.id,
            sequence_index: nextSceneIndex,
            scene_id: nextScene.id, // Critical: UI matches clips to scenes by scene_id
            original_prompt: nextRawPrompt,
            style_hints: JSON.stringify(auditData),
            is_primary: true,
            // Track final provider used (may differ from selected if fallback occurred)
            provider: currentProvider,
          })
          .eq("id", jobId);
      }

      // Update progress — count all done clips (including the one we just queued)
      const doneCount = (clips || []).filter(c => c.status === "done").length;
      await supabase
        .from("story_jobs")
        .update({ completed_clips: doneCount })
        .eq("id", story.id);

      console.log(`[chain-continue] ✓ Queued scene ${nextSceneIndex + 1} as job ${jobId} (provider: ${currentProvider}${providerAttemptLog.length > 1 ? ` after fallback from ${providerAttemptLog.slice(0, -1).join("→")}` : ""})`);
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
