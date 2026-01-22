import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ProcessRequest {
  job_id?: string; // Process specific job, or omit to process all pending
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

    // Fetch jobs to process
    let query = supabase
      .from("video_jobs")
      .select("*")
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
        // Check status with OpenAI
        const statusResponse = await fetch(
          `https://api.openai.com/v1/videos/${job.openai_video_id}`,
          {
            headers: {
              "Authorization": `Bearer ${openaiApiKey}`,
            },
          }
        );

        if (!statusResponse.ok) {
          const errorText = await statusResponse.text();
          console.error(`OpenAI status check failed for ${job.id}:`, errorText);
          
          await supabase
            .from("video_jobs")
            .update({ status: "failed", error: `Status check failed: ${statusResponse.status}` })
            .eq("id", job.id);

          results.push({ id: job.id, status: "failed", error: `Status check failed` });
          continue;
        }

        const statusData = await statusResponse.json();
        const openaiStatus = statusData.status;
        const progress = statusData.progress || 0;

        console.log(`Job ${job.id}: OpenAI status=${openaiStatus}, progress=${progress}`);

        // Update progress
        await supabase
          .from("video_jobs")
          .update({ progress })
          .eq("id", job.id);

        if (openaiStatus === "failed") {
          await supabase
            .from("video_jobs")
            .update({ 
              status: "failed", 
              error: statusData.error?.message || "Video generation failed" 
            })
            .eq("id", job.id);

          results.push({ id: job.id, status: "failed", error: statusData.error?.message });
          continue;
        }

        if (openaiStatus === "completed" || openaiStatus === "succeeded") {
          // Download the video content
          const contentResponse = await fetch(
            `https://api.openai.com/v1/videos/${job.openai_video_id}/content`,
            {
              headers: {
                "Authorization": `Bearer ${openaiApiKey}`,
              },
            }
          );

          if (!contentResponse.ok) {
            throw new Error(`Failed to download video: ${contentResponse.status}`);
          }

          const videoBuffer = await contentResponse.arrayBuffer();
          const videoBytes = new Uint8Array(videoBuffer);

          // Upload to Supabase Storage
          const fileName = `${job.script_run_id}/${job.id}.mp4`;
          const { error: uploadError } = await supabase.storage
            .from("videos")
            .upload(fileName, videoBytes, {
              contentType: "video/mp4",
              upsert: true,
            });

          if (uploadError) {
            throw new Error(`Failed to upload video: ${uploadError.message}`);
          }

          // Get public URL
          const { data: urlData } = supabase.storage
            .from("videos")
            .getPublicUrl(fileName);

          const outputUrl = urlData.publicUrl;

          // Update job as completed
          await supabase
            .from("video_jobs")
            .update({ 
              status: "done", 
              progress: 100,
              output_url: outputUrl,
            })
            .eq("id", job.id);

          console.log(`Job ${job.id} completed! Video URL: ${outputUrl}`);
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