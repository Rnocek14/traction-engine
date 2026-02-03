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

// Helper: retry with exponential backoff for transient network errors
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 500
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isTransient = lastError.message.includes("connection reset") ||
                          lastError.message.includes("connection error") ||
                          lastError.message.includes("network");
      if (!isTransient || attempt === maxRetries - 1) throw lastError;
      const delay = baseDelayMs * Math.pow(2, attempt);
      console.log(`[process-video] Retry ${attempt + 1}/${maxRetries} after ${delay}ms: ${lastError.message}`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastError;
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

    // Fetch jobs to process with retry for transient network errors
    const jobs = await withRetry(async () => {
      let query = supabase
        .from("video_jobs")
        .select("*")
        .eq("provider", "sora")
        .in("status", ["running", "queued"])
        .not("openai_video_id", "is", null);

      if (job_id) {
        query = query.eq("id", job_id);
      }

      const { data, error } = await query.limit(10);
      if (error) throw new Error(`DB query failed: ${error.message}`);
      return data;
    });

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

        // Check status with OpenAI (with retry for transient network errors)
        const statusResponse = await withRetry(async () => {
          const resp = await fetch(
            `https://api.openai.com/v1/videos/${videoId}`,
            { headers: { "Authorization": `Bearer ${openaiApiKey}` } }
          );
          return resp;
        });

        if (!statusResponse.ok) {
          const errorText = await statusResponse.text();
          console.error(`OpenAI status check failed for ${job.id}:`, errorText);
          
          // 500 errors are transient - OpenAI server issues, don't fail the job
          // Just skip this cycle and let the next poll retry
          if (statusResponse.status >= 500 && statusResponse.status < 600) {
            console.log(`Job ${job.id}: Transient 5xx error from OpenAI, will retry on next poll`);
            results.push({ id: job.id, status: "running", error: `Transient 5xx: ${statusResponse.status}` });
            continue;
          }
          
          // 4xx errors are permanent failures
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

          // Extract thumbnail dimensions from settings.size (Sora output matches request)
          // Format: "720x1280" → width=720, height=1280
          let thumbnailWidth: number | null = null;
          let thumbnailHeight: number | null = null;
          const size = settings?.size as string | undefined;
          if (size && size.includes("x")) {
            const [w, h] = size.split("x").map(Number);
            if (!isNaN(w) && !isNaN(h)) {
              thumbnailWidth = w;
              thumbnailHeight = h;
              console.log(`Sora job ${job.id}: parsed dimensions ${thumbnailWidth}x${thumbnailHeight} from settings.size`);
            }
          }

          // Update job as completed with all URLs + dimensions - use "done" to match DB constraint
          await supabase
            .from("video_jobs")
            .update({ 
              status: "done",  // Must match DB CHECK constraint
              progress: 100,
              output_url: outputUrl,
              thumbnail_url: thumbnailUrl,
              spritesheet_url: spritesheetUrl,
              thumbnail_width: thumbnailWidth,
              thumbnail_height: thumbnailHeight,
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