/**
 * Generate Reel Sequence for Runway Gen-3 Alpha
 * 
 * Chained clip generation with frame continuity using image-to-video.
 * Each clip uses the last frame of the previous clip as its starting frame.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildRunwayContinuityPrompt, type StyleGuideData } from "../_shared/cinematic-prompts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SequenceRequest {
  script_run_id: string;
  clip_ids: string[];
  settings: {
    size: string;
    seconds: number;
    model?: string;
    seed?: number;
  };
  resume_from_job_id?: string;
}

interface ClipData {
  id: string;
  prompt?: string;
  camera_direction?: string;
}

const RUNWAY_API_VERSION = "2024-11-06";

// Map Sora sizes to Runway format
function mapSizeToRunway(soraSize: string): string {
  const mapping: Record<string, string> = {
    "720x1280": "720:1280",
    "1280x720": "1280:720",
    "1024x1792": "768:1280",
    "1792x1024": "1280:768",
  };
  return mapping[soraSize] || "720:1280";
}

// Map Sora durations to Runway (5 or 10 seconds)
function mapDurationToRunway(soraDuration: number): 5 | 10 {
  if (soraDuration <= 5) return 5;
  return 10;
}

function getRunwayModel(model?: string): string {
  const validModels = ["gen3a_turbo", "gen3a", "gen4_turbo"];
  if (model && validModels.includes(model)) return model;
  return "gen3a_turbo";
}

/**
 * Poll a Runway task until completion
 */
async function pollTaskCompletion(
  taskId: string,
  runwayApiKey: string,
  maxAttempts: number = 60,
  intervalMs: number = 5000
): Promise<{ success: boolean; outputUrl?: string; error?: string }> {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(
      `https://api.dev.runwayml.com/v1/tasks/${taskId}`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${runwayApiKey}`,
          "X-Runway-Version": RUNWAY_API_VERSION,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Status check failed: ${errorText}` };
    }

    const data = await response.json();
    const status = data.status;

    if (status === "SUCCEEDED") {
      const outputs = data.output as string[];
      return { success: true, outputUrl: outputs?.[0] };
    }

    if (status === "FAILED" || status === "CANCELLED") {
      return { success: false, error: data.failure || `Task ${status}` };
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  return { success: false, error: "Timeout waiting for completion" };
}

/**
 * Extract last frame from a video URL
 * For Runway, we'll use the video URL directly as the reference image
 * since Runway supports video URLs as promptImage
 */
async function getLastFrameUrl(videoUrl: string): Promise<string | null> {
  // Runway's image_to_video can accept video URLs
  // It will automatically use the last frame
  // So we can pass the video URL directly
  return videoUrl;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const runwayApiKey = Deno.env.get("RUNWAY_API_KEY");

    if (!runwayApiKey) {
      throw new Error("RUNWAY_API_KEY not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: SequenceRequest = await req.json();
    const { script_run_id, clip_ids, settings, resume_from_job_id } = body;

    if (!script_run_id || !clip_ids?.length) {
      throw new Error("script_run_id and clip_ids are required");
    }

    // Map settings
    const runwaySize = mapSizeToRunway(settings?.size || "720x1280");
    const runwayDuration = mapDurationToRunway(settings?.seconds || 5);
    const runwayModel = getRunwayModel(settings?.model);

    // Fetch script
    const { data: script, error: scriptError } = await supabase
      .from("script_runs")
      .select("*")
      .eq("id", script_run_id)
      .single();

    if (scriptError || !script) {
      throw new Error("Script not found");
    }

    if (script.status !== "qa_passed") {
      throw new Error("Script must pass QA before video generation");
    }

    // Fetch timeline for style guide and clips
    const { data: timeline } = await supabase
      .from("studio_timelines")
      .select("timeline_json")
      .eq("script_run_id", script_run_id)
      .order("version", { ascending: false })
      .limit(1)
      .single();

    let styleGuide: StyleGuideData | null = null;
    let allClips: ClipData[] = [];

    if (timeline?.timeline_json) {
      const timelineData = timeline.timeline_json as {
        clips?: ClipData[];
        style_guide?: StyleGuideData;
      };
      styleGuide = timelineData.style_guide || null;
      allClips = timelineData.clips || [];
    }

    // Get clips in order
    const orderedClips = clip_ids
      .map(id => allClips.find(c => c.id === id))
      .filter((c): c is ClipData => !!c);

    if (orderedClips.length === 0) {
      throw new Error("No valid clips found");
    }

    // Track results
    const results: { clipId: string; jobId: string; status: string; error?: string }[] = [];
    let previousVideoUrl: string | null = null;
    let startFromIndex = 0;

    // Handle resume from previous job
    if (resume_from_job_id) {
      const { data: resumeJob } = await supabase
        .from("video_jobs")
        .select("*")
        .eq("id", resume_from_job_id)
        .single();

      if (resumeJob?.output_url) {
        previousVideoUrl = resumeJob.output_url;
        // Find which clip this job was for and start from next
        const jobSettings = resumeJob.settings as Record<string, unknown> | null;
        const resumeClipId = jobSettings?.clip_id as string | undefined;
        if (resumeClipId) {
          const resumeIndex = orderedClips.findIndex(c => c.id === resumeClipId);
          if (resumeIndex >= 0) {
            startFromIndex = resumeIndex + 1;
          }
        }
      }
    } else if (styleGuide?.reference_image_url) {
      // Use style guide reference image for first clip
      previousVideoUrl = styleGuide.reference_image_url;
    }

    console.log(`Starting Runway sequence: ${orderedClips.length} clips, starting from index ${startFromIndex}`);

    // Process clips sequentially
    for (let i = startFromIndex; i < orderedClips.length; i++) {
      const clip = orderedClips[i];
      const isFirstClip = i === 0 && !previousVideoUrl;

      try {
        // Build prompt with continuity
        const prompt = clip.prompt 
          ? buildRunwayContinuityPrompt(styleGuide, clip.prompt, clip.camera_direction)
          : `cinematic video, ${styleGuide?.mood || "engaging"} mood, professional quality`;

        // Create job record
        const { data: job, error: jobError } = await supabase
          .from("video_jobs")
          .insert({
            script_run_id,
            status: "queued",
            provider: "runway",
            settings: {
              size: runwaySize,
              seconds: runwayDuration,
              model: runwayModel,
              clip_id: clip.id,
              prompt: prompt.slice(0, 500),
              seed: settings?.seed,
              camera_direction: clip.camera_direction,
              sequence_index: i,
              is_chained: !isFirstClip,
            },
            progress: 0,
            openai_status: "PENDING",
          })
          .select()
          .single();

        if (jobError) {
          results.push({ clipId: clip.id, jobId: "", status: "failed", error: jobError.message });
          continue;
        }

        // Build Runway request
        const isImageToVideo = !!previousVideoUrl;
        let runwayEndpoint: string;
        let runwayBody: Record<string, unknown>;

        if (isImageToVideo) {
          runwayEndpoint = "https://api.dev.runwayml.com/v1/image_to_video";
          runwayBody = {
            model: runwayModel,
            promptImage: previousVideoUrl,
            promptText: prompt,
            duration: runwayDuration,
            ratio: runwaySize,
            seed: settings?.seed,
          };
        } else {
          runwayEndpoint = "https://api.dev.runwayml.com/v1/text_to_video";
          runwayBody = {
            model: runwayModel,
            promptText: prompt,
            duration: runwayDuration,
            ratio: runwaySize,
            seed: settings?.seed,
          };
        }

        // Submit to Runway
        const runwayResponse = await fetch(runwayEndpoint, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${runwayApiKey}`,
            "X-Runway-Version": RUNWAY_API_VERSION,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(runwayBody),
        });

        if (!runwayResponse.ok) {
          const errorText = await runwayResponse.text();
          console.error(`Runway error for clip ${clip.id}:`, errorText);
          
          await supabase
            .from("video_jobs")
            .update({ status: "failed", error: errorText.slice(0, 200) })
            .eq("id", job.id);

          results.push({ clipId: clip.id, jobId: job.id, status: "failed", error: errorText });
          continue; // Try next clip
        }

        const runwayData = await runwayResponse.json();
        const taskId = runwayData.id;

        // Update job with task ID
        await supabase
          .from("video_jobs")
          .update({
            status: "running",
            openai_video_id: taskId,
            openai_status: "RUNNING",
          })
          .eq("id", job.id);

        console.log(`Clip ${i + 1}/${orderedClips.length}: Started task ${taskId}`);

        // Poll for completion
        const pollResult = await pollTaskCompletion(taskId, runwayApiKey);

        if (pollResult.success && pollResult.outputUrl) {
          // Update job as complete
          await supabase
            .from("video_jobs")
            .update({
              status: "done",
              output_url: pollResult.outputUrl,
              openai_status: "SUCCEEDED",
              progress: 100,
            })
            .eq("id", job.id);

          // Use this video as reference for next clip
          previousVideoUrl = pollResult.outputUrl;

          results.push({ clipId: clip.id, jobId: job.id, status: "done" });
          console.log(`Clip ${i + 1}/${orderedClips.length}: Completed`);
        } else {
          await supabase
            .from("video_jobs")
            .update({
              status: "failed",
              error: pollResult.error || "Unknown error",
              openai_status: "FAILED",
            })
            .eq("id", job.id);

          results.push({ clipId: clip.id, jobId: job.id, status: "failed", error: pollResult.error });
          console.error(`Clip ${i + 1}/${orderedClips.length}: Failed - ${pollResult.error}`);
          
          // Continue to next clip - don't break the chain
        }

      } catch (clipErr) {
        const error = clipErr instanceof Error ? clipErr.message : String(clipErr);
        console.error(`Error processing clip ${clip.id}:`, error);
        results.push({ clipId: clip.id, jobId: "", status: "failed", error });
      }
    }

    // Calculate summary
    const succeeded = results.filter(r => r.status === "done").length;
    const failed = results.filter(r => r.status === "failed").length;
    const skipped = startFromIndex;
    const lastSuccessfulJob = results.findLast(r => r.status === "done");

    return new Response(
      JSON.stringify({
        success: succeeded > 0,
        results,
        summary: {
          succeeded,
          failed,
          skipped,
          total: orderedClips.length,
          resume_job_id: lastSuccessfulJob?.jobId || null,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("generate-reel-sequence-runway error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
