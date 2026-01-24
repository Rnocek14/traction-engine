/**
 * Luma Video Processor
 * 
 * Polls Luma AI generations and updates video_jobs when complete.
 * Downloads completed videos and uploads to Supabase storage.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ProcessRequest {
  job_id?: string;
}

// Canonical DB status set: queued, running, done, failed
// All processors MUST use these exact values (DB CHECK constraint)
type DBStatus = "queued" | "running" | "done" | "failed";

/**
 * Map Luma status to our canonical DB status
 * DB constraint allows: queued, running, done, failed
 */
function mapLumaStatus(lumaState: string): DBStatus {
  switch (lumaState) {
    case "completed":
      return "done";  // DB constraint requires "done" not "succeeded"
    case "failed":
      return "failed";
    case "queued":
      return "queued";
    case "dreaming":
    case "processing":
      return "running";
    default:
      return "running";
  }
}

/**
 * Download video and upload to Supabase storage
 */
async function downloadAndUpload(
  supabase: ReturnType<typeof createClient>,
  videoUrl: string,
  storagePath: string
): Promise<string | null> {
  try {
    const response = await fetch(videoUrl);
    if (!response.ok) {
      console.error("Failed to download video:", response.status);
      return null;
    }

    const videoBuffer = await response.arrayBuffer();
    
    const { error: uploadError } = await supabase.storage
      .from("videos")
      .upload(storagePath, videoBuffer, {
        contentType: "video/mp4",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from("videos")
      .getPublicUrl(storagePath);

    return publicUrl;
  } catch (err) {
    console.error("Download/upload error:", err);
    return null;
  }
}

/**
 * Extract thumbnail and spritesheet from video using FFmpeg service
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
    console.log(`Extracting thumbnail for Luma job ${jobId}`);
    const response = await fetch(`${ffmpegServiceUrl}/thumbnail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job_id: jobId,
        video_url: videoUrl,
        upload: {
          bucket: "videos",
          thumbnail_path: `luma/${jobId}/thumbnail.jpg`,
          spritesheet_path: `luma/${jobId}/spritesheet.jpg`,
          supabase_url: supabaseUrl,
          supabase_service_key: supabaseServiceKey,
        },
        options: {
          thumbnail_time: 1.0,
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
    console.log(`Thumbnail extracted for Luma job ${jobId}:`, result);
    return {
      thumbnail_url: result.thumbnail_url,
      spritesheet_url: result.spritesheet_url,
    };
  } catch (err) {
    console.error(`Error extracting thumbnail for Luma job ${jobId}:`, err);
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
    const lumaApiKey = Deno.env.get("LUMA_API_KEY");

    if (!lumaApiKey) {
      throw new Error("LUMA_API_KEY not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    let body: ProcessRequest = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is fine
    }

    // Build query for jobs to process
    let query = supabase
      .from("video_jobs")
      .select("*")
      .eq("provider", "luma")
      .in("status", ["queued", "running"])
      .not("openai_video_id", "is", null)
      .order("created_at", { ascending: true })
      .limit(10);

    // Filter by specific job if provided
    if (body.job_id) {
      query = supabase
        .from("video_jobs")
        .select("*")
        .eq("id", body.job_id)
        .eq("provider", "luma");
    }

    const { data: jobs, error: jobsError } = await query;

    if (jobsError) {
      throw new Error(`Failed to fetch jobs: ${jobsError.message}`);
    }

    if (!jobs || jobs.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "No Luma jobs to process" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Array<{
      job_id: string;
      status: string;
      luma_state?: string;
      output_url?: string;
      error?: string;
    }> = [];

    for (const job of jobs) {
      // Get task ID from settings.provider_job_id (preferred) or legacy openai_video_id
      const settings = job.settings as Record<string, unknown> | null;
      const lumaTaskId = (settings?.provider_job_id as string) || job.openai_video_id;

      if (!lumaTaskId) {
        console.error(`Job ${job.id} has no provider_job_id or openai_video_id`);
        results.push({
          job_id: job.id,
          status: "failed",
          error: "No Luma task ID found",
        });
        continue;
      }

      try {
        // Poll Luma API for status
        const statusResponse = await fetch(
          `https://api.lumalabs.ai/dream-machine/v1/generations/${lumaTaskId}`,
          {
            headers: {
              "Authorization": `Bearer ${lumaApiKey}`,
            },
          }
        );

        if (!statusResponse.ok) {
          const errorText = await statusResponse.text();
          console.error(`Luma status check failed for ${lumaTaskId}:`, errorText);
          
          results.push({
            job_id: job.id,
            status: "error",
            error: `Luma API error: ${statusResponse.status}`,
          });
          continue;
        }

        const lumaData = await statusResponse.json();
        const lumaState = lumaData.state;
        const newStatus = mapLumaStatus(lumaState);

        // Log state transition and response keys (once per status change)
        if (job.openai_status !== lumaState) {
          console.log(`Luma job ${job.id} state changed:`, JSON.stringify({
            lumaTaskId,
            oldState: job.openai_status,
            newState: lumaState,
            responseKeys: Object.keys(lumaData),
            hasAssets: !!lumaData.assets,
            assetKeys: lumaData.assets ? Object.keys(lumaData.assets) : [],
          }));
        }

        console.log(`Luma job ${lumaTaskId} state: ${lumaState} -> ${newStatus}`);

        // newStatus is already DB-allowed: queued, running, done, failed
        const updates: Record<string, unknown> = {
          status: newStatus,
          openai_status: lumaState,
        };

        // Handle completion - status is already "done" from mapLumaStatus
        if (lumaState === "completed" && lumaData.assets?.video) {
          const videoUrl = lumaData.assets.video;
          
          // Download and upload to storage
          const storagePath = `luma/${job.script_run_id}/${job.id}.mp4`;
          const publicUrl = await downloadAndUpload(supabase, videoUrl, storagePath);

          if (publicUrl) {
            updates.output_url = publicUrl;
            updates.progress = 100;
            
            // Try Luma's native thumbnail first
            if (lumaData.assets?.thumbnail) {
              updates.thumbnail_url = lumaData.assets.thumbnail;
            }
            
            // Extract thumbnail/spritesheet via FFmpeg for consistent auto-rating support
            const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
            const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
            const thumbResult = await extractThumbnailFromVideo(
              job.id,
              publicUrl,
              supabaseUrl,
              supabaseServiceKey
            );
            if (thumbResult.thumbnail_url) {
              updates.thumbnail_url = thumbResult.thumbnail_url;
            }
            if (thumbResult.spritesheet_url) {
              updates.spritesheet_url = thumbResult.spritesheet_url;
            }
          } else {
            // Fallback to direct Luma URL (temporary)
            updates.output_url = videoUrl;
            updates.progress = 100;
          }

          results.push({
            job_id: job.id,
            status: "done",  // Use DB-allowed status
            luma_state: lumaState,
            output_url: updates.output_url as string,
          });
        } else if (lumaState === "failed") {
          updates.error = lumaData.failure_reason || "Generation failed";
          
          results.push({
            job_id: job.id,
            status: "failed",
            luma_state: lumaState,
            error: updates.error as string,
          });
        } else {
          // Still processing
          if (lumaData.progress !== undefined) {
            updates.progress = Math.round(lumaData.progress * 100);
          }

          results.push({
            job_id: job.id,
            status: newStatus,
            luma_state: lumaState,
          });
        }

        // Update job in database
        await supabase
          .from("video_jobs")
          .update(updates)
          .eq("id", job.id);

      } catch (err) {
        console.error(`Error processing Luma job ${job.id}:`, err);
        results.push({
          job_id: job.id,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
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
    console.error("process-video-luma error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
