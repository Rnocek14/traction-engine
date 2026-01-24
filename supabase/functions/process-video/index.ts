/**
 * Process Video for OpenAI Sora
 * 
 * Polls OpenAI video generation status and downloads completed videos.
 * Canonical DB status set: queued, running, done, failed
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ProcessRequest {
  job_id?: string; // Process specific job, or omit to process all pending
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function downloadAndUpload(
  supabase: any,
  openaiApiKey: string,
  openaiVideoId: string,
  variant: "mp4" | "thumbnail" | "spritesheet",
  storagePath: string
): Promise<string | null> {
  try {
    const url = variant === "mp4"
      ? `https://api.openai.com/v1/videos/${openaiVideoId}/content`
      : `https://api.openai.com/v1/videos/${openaiVideoId}/content?variant=${variant}`;

    const response = await fetch(url, {
      headers: { "Authorization": `Bearer ${openaiApiKey}` },
    });

    if (!response.ok) {
      console.error(`Failed to download ${variant}: ${response.status}`);
      return null;
    }

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Log the first few bytes to debug format issues
    const magicBytes = Array.from(bytes.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' ');
    console.log(`Downloaded ${variant}: ${bytes.length} bytes, magic: ${magicBytes}`);

    // Detect actual content type from magic bytes
    // JPEG: FF D8 FF | PNG: 89 50 4E 47 | WebP: 52 49 46 46 ... 57 45 42 50
    const isJpeg = bytes[0] === 0xFF && bytes[1] === 0xD8;
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
    const isWebP = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
    
    // Determine content type based on actual bytes, not assumption
    let contentType: string;
    if (variant === "mp4") {
      contentType = "video/mp4";
    } else if (isPng) {
      contentType = "image/png";
    } else if (isJpeg) {
      contentType = "image/jpeg";
    } else if (isWebP) {
      contentType = "image/webp";
    } else {
      // Default to PNG for images - most compatible
      console.warn(`Unknown image format for ${variant}, defaulting to PNG`);
      contentType = "image/png";
    }
    
    console.log(`Detected format: ${contentType} for ${variant}`);

    const { error: uploadError } = await supabase.storage
      .from("videos")
      .upload(storagePath, bytes, {
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

    return urlData.publicUrl;
  } catch (err) {
    console.error(`Error downloading/uploading ${variant}:`, err);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: ProcessRequest = await req.json().catch(() => ({}));
    const { job_id } = body;

    // Fetch jobs to process (only Sora/OpenAI jobs with openai_video_id)
    let query = supabase
      .from("video_jobs")
      .select("*")
      .eq("provider", "sora")  // Only process Sora jobs - Luma/Runway have their own processors
      .in("status", ["running", "queued"])
      .not("openai_video_id", "is", null);

    if (job_id) {
      query = query.eq("id", job_id);
    }

    const { data: jobs, error: jobsError } = await query.limit(10);

    if (jobsError) {
      throw new Error(`Failed to fetch jobs: ${jobsError.message}`);
    }

    if (!jobs || jobs.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No jobs to process", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: Array<{ id: string; status: string; error?: string }> = [];

    for (const job of jobs) {
      try {
        // Get task ID from settings.provider_job_id (preferred) or legacy openai_video_id
        const settings = job.settings as Record<string, unknown> | null;
        const videoId = (settings?.provider_job_id as string) || job.openai_video_id;

        if (!videoId) {
          console.error(`Job ${job.id} has no provider_job_id or openai_video_id`);
          results.push({ id: job.id, status: "failed", error: "No video ID found" });
          continue;
        }

        // Check status with OpenAI
        const statusResponse = await fetch(
          `https://api.openai.com/v1/videos/${videoId}`,
          {
            headers: { "Authorization": `Bearer ${openaiApiKey}` },
          }
        );

        if (!statusResponse.ok) {
          const errorText = await statusResponse.text();
          console.error(`OpenAI status check failed for ${job.id}:`, errorText);
          
          await supabase
            .from("video_jobs")
            .update({ 
              status: "failed",
              openai_status: "error",
              error: `Status check failed: ${statusResponse.status}`,
            })
            .eq("id", job.id);

          results.push({ id: job.id, status: "failed", error: "Status check failed" });
          continue;
        }

        const statusData = await statusResponse.json();
        const openaiStatus = statusData.status;
        const progress = statusData.progress || 0;

        console.log(`Job ${job.id}: OpenAI status=${openaiStatus}, progress=${progress}`);

        // Update progress and openai_status
        await supabase
          .from("video_jobs")
          .update({ progress, openai_status: openaiStatus })
          .eq("id", job.id);

        if (openaiStatus === "failed") {
          await supabase
            .from("video_jobs")
            .update({ 
              status: "failed",
              error: statusData.error?.message || "Video generation failed",
            })
            .eq("id", job.id);

          results.push({ id: job.id, status: "failed", error: statusData.error?.message });
          continue;
        }

        if (openaiStatus === "completed") {
          // Download and upload all variants in parallel
          const basePath = `${job.script_run_id}/${job.id}`;
          
          const [outputUrl, thumbnailUrl, spritesheetUrl] = await Promise.all([
            downloadAndUpload(supabase, openaiApiKey, job.openai_video_id, "mp4", `${basePath}.mp4`),
            downloadAndUpload(supabase, openaiApiKey, job.openai_video_id, "thumbnail", `${basePath}_thumb.jpg`),
            downloadAndUpload(supabase, openaiApiKey, job.openai_video_id, "spritesheet", `${basePath}_sprite.png`),
          ]);

          if (!outputUrl) {
            throw new Error("Failed to download/upload video");
          }

          // Update job as completed with all URLs - use "done" to match DB constraint
          await supabase
            .from("video_jobs")
            .update({ 
              status: "done",  // Must match DB CHECK constraint
              progress: 100,
              output_url: outputUrl,
              thumbnail_url: thumbnailUrl,
              spritesheet_url: spritesheetUrl,
            })
            .eq("id", job.id);

          console.log(`Job ${job.id} completed! Video: ${outputUrl}, Thumbnail: ${thumbnailUrl}`);
          results.push({ id: job.id, status: "done" });
        } else {
          // Still processing
          results.push({ id: job.id, status: "running" });
        }

      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error(`Error processing job ${job.id}:`, error);
        
        await supabase
          .from("video_jobs")
          .update({ status: "failed", error: error.message })
          .eq("id", job.id);

        results.push({ id: job.id, status: "failed", error: error.message });
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
    console.error("process-video error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});