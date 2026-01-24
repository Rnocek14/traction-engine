/**
 * Process Video for Runway Gen-3 Alpha
 * 
 * Polls Runway task status, downloads completed videos,
 * uploads to Supabase storage, and generates thumbnails/spritesheets.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ProcessRequest {
  job_id?: string;
}

const RUNWAY_API_VERSION = "2024-11-06";

/**
 * Map Runway status to our internal status
 */
// DB-allowed status set: queued, running, done, failed
type DBStatus = "queued" | "running" | "done" | "failed";

/**
 * Map Runway status to DB-allowed internal status
 * DB constraint allows: queued, running, done, failed
 */
function mapRunwayStatus(runwayStatus: string): DBStatus {
  switch (runwayStatus) {
    case "SUCCEEDED":
      return "done";  // Use "done" to match DB constraint
    case "FAILED":
    case "CANCELLED":
      return "failed";
    case "PENDING":
    case "THROTTLED":
      return "queued";
    case "RUNNING":
      return "running";
    default:
      return "running";
  }
}

/**
 * Calculate progress percentage from Runway status
 */
function getProgressFromStatus(runwayStatus: string, runwayProgress?: number): number {
  if (runwayProgress !== undefined) return Math.round(runwayProgress * 100);
  
  switch (runwayStatus) {
    case "PENDING":
    case "THROTTLED":
      return 10;
    case "RUNNING":
      return 50;
    case "SUCCEEDED":
      return 100;
    case "FAILED":
    case "CANCELLED":
      return 0;
    default:
      return 25;
  }
}

/**
 * Download video from URL and upload to Supabase storage
 */
async function downloadAndUpload(
  supabase: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  videoUrl: string,
  storagePath: string,
  variant: "mp4" | "thumbnail"
): Promise<string | null> {
  try {
    const response = await fetch(videoUrl);
    if (!response.ok) {
      console.error(`Failed to download ${variant}: ${response.status}`);
      return null;
    }

    const contentType = variant === "mp4" ? "video/mp4" : "image/jpeg";
    const blob = await response.blob();

    const { error: uploadError } = await supabase.storage
      .from("videos")
      .upload(storagePath, blob, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      console.error(`Failed to upload ${variant}:`, uploadError);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from("videos")
      .getPublicUrl(storagePath);

    return urlData?.publicUrl || null;
  } catch (err) {
    console.error(`Error in downloadAndUpload for ${variant}:`, err);
    return null;
  }
}

/**
 * Call FFmpeg service to extract thumbnail from video
 */
async function extractThumbnailFromVideo(
  jobId: string,
  videoUrl: string,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<{ thumbnail_url?: string; spritesheet_url?: string }> {
  const ffmpegServiceUrl = Deno.env.get("FFMPEG_SERVICE_URL");
  if (!ffmpegServiceUrl) {
    console.log("FFMPEG_SERVICE_URL not configured, skipping thumbnail extraction");
    return {};
  }

  try {
    const response = await fetch(`${ffmpegServiceUrl}/thumbnail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job_id: jobId,
        video_url: videoUrl,
        upload: {
          bucket: "videos",
          thumbnail_path: `runway/${jobId}/thumbnail.jpg`,
          spritesheet_path: `runway/${jobId}/spritesheet.jpg`,
          supabase_url: supabaseUrl,
          supabase_service_key: supabaseServiceKey,
        },
        options: {
          thumbnail_time: 1.0, // 1 second in
          spritesheet_frames: 10,
          spritesheet_cols: 5,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Thumbnail extraction failed: ${response.status} ${errorText}`);
      return {};
    }

    const result = await response.json();
    console.log(`Thumbnail extracted for job ${jobId}:`, result);
    return {
      thumbnail_url: result.thumbnail_url,
      spritesheet_url: result.spritesheet_url,
    };
  } catch (err) {
    console.error(`Error extracting thumbnail for job ${jobId}:`, err);
    return {};
  }
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

    // Parse optional job_id filter
    let jobFilter: string | undefined;
    try {
      const body: ProcessRequest = await req.json();
      jobFilter = body.job_id;
    } catch {
      // No body or invalid JSON - process all pending
    }

    // Fetch pending Runway jobs - check both provider_job_id and legacy openai_video_id
    let query = supabase
      .from("video_jobs")
      .select("*")
      .eq("provider", "runway")
      .in("status", ["running", "queued"])
      .not("openai_video_id", "is", null); // Provider task ID (stored in openai_video_id or settings.provider_job_id)

    if (jobFilter) {
      query = query.eq("id", jobFilter);
    }

    const { data: jobs, error: jobsError } = await query.limit(10);

    if (jobsError) {
      throw new Error(`Failed to fetch jobs: ${jobsError.message}`);
    }

    if (!jobs || jobs.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No Runway jobs to process", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${jobs.length} Runway jobs`);

    const results: { jobId: string; status: string; error?: string }[] = [];

    for (const job of jobs) {
      // Get task ID from settings.provider_job_id (preferred) or legacy openai_video_id
      const settings = job.settings as Record<string, unknown> | null;
      const runwayTaskId = (settings?.provider_job_id as string) || job.openai_video_id;
      
      try {
        // Poll Runway task status
        const statusResponse = await fetch(
          `https://api.dev.runwayml.com/v1/tasks/${runwayTaskId}`,
          {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${runwayApiKey}`,
              "X-Runway-Version": RUNWAY_API_VERSION,
            },
          }
        );

        if (!statusResponse.ok) {
          const errorText = await statusResponse.text();
          console.error(`Runway status check failed for ${runwayTaskId}:`, errorText);
          
          // If 404, task may have been deleted
          if (statusResponse.status === 404) {
            await supabase
              .from("video_jobs")
              .update({
                status: "failed",
                openai_status: "NOT_FOUND",
                error: "Runway task not found",
              })
              .eq("id", job.id);
          }
          
          results.push({ jobId: job.id, status: "error", error: errorText });
          continue;
        }

        const taskData = await statusResponse.json();
        const runwayStatus = taskData.status || "UNKNOWN";
        const internalStatus = mapRunwayStatus(runwayStatus);
        const progress = getProgressFromStatus(runwayStatus, taskData.progress);

        // Update job status
        const updateData: Record<string, unknown> = {
          status: internalStatus,
          openai_status: runwayStatus,
          progress,
        };

        // Handle completed task
        if (runwayStatus === "SUCCEEDED" && taskData.output) {
          const outputUrls = taskData.output as string[];
          const primaryOutput = outputUrls[0];

          if (primaryOutput) {
            // Download and upload to our storage
            const storagePath = `runway/${job.id}/output.mp4`;
            const uploadedUrl = await downloadAndUpload(
              supabase,
              primaryOutput,
              storagePath,
              "mp4"
            );

            if (uploadedUrl) {
              updateData.output_url = uploadedUrl;
              console.log(`Uploaded Runway video for job ${job.id}: ${uploadedUrl}`);

              // Extract thumbnail and spritesheet via FFmpeg service
              const thumbResult = await extractThumbnailFromVideo(
                job.id,
                uploadedUrl,
                supabaseUrl,
                supabaseServiceKey
              );
              if (thumbResult.thumbnail_url) {
                updateData.thumbnail_url = thumbResult.thumbnail_url;
              }
              if (thumbResult.spritesheet_url) {
                updateData.spritesheet_url = thumbResult.spritesheet_url;
              }
            } else {
              // Fall back to direct Runway URL (may expire)
              updateData.output_url = primaryOutput;
              console.log(`Using direct Runway URL for job ${job.id}`);
            }
          }
        }

        // Handle failure
        if (runwayStatus === "FAILED" || runwayStatus === "CANCELLED") {
          updateData.error = taskData.failure || `Task ${runwayStatus.toLowerCase()}`;
          updateData.status = "failed";
        }

        // Perform update
        await supabase
          .from("video_jobs")
          .update(updateData)
          .eq("id", job.id);

        results.push({ jobId: job.id, status: internalStatus });
        console.log(`Updated job ${job.id}: ${runwayStatus} -> ${internalStatus}`);

      } catch (jobErr) {
        const error = jobErr instanceof Error ? jobErr.message : String(jobErr);
        console.error(`Error processing job ${job.id}:`, error);
        results.push({ jobId: job.id, status: "error", error });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("process-video-runway error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
