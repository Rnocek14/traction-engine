import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AssembledMeta {
  ffmpeg_job_id?: string;
  ffmpeg_status?: string;
  eta_seconds?: number;
  started_at?: string;
  completed_at?: string;
  failed_at?: string;
  error?: string;
  clips_count?: number;
  expected_duration?: number;
  duration?: number;
  [key: string]: unknown;
}

interface PollRequest {
  script_run_id: string;
}

/**
 * Polls the FFmpeg service for assembly job status.
 * Called by the client when assembled_status is "rendering" or "queued".
 * Updates script_runs with the latest status.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ffmpegServiceUrl = Deno.env.get("FFMPEG_SERVICE_URL");
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body: PollRequest = await req.json();
    const { script_run_id } = body;

    if (!script_run_id) {
      throw new Error("script_run_id is required");
    }

    // Fetch current status and meta
    const { data: scriptRun, error: fetchError } = await supabase
      .from("script_runs")
      .select("assembled_status, assembled_meta, assembled_video_url")
      .eq("id", script_run_id)
      .single();

    if (fetchError || !scriptRun) {
      throw new Error(`Script not found: ${fetchError?.message}`);
    }

    const meta = scriptRun.assembled_meta as AssembledMeta | null;
    const currentStatus = scriptRun.assembled_status as string;

    // If already completed or failed, return current status
    if (currentStatus === "succeeded" || currentStatus === "failed" || currentStatus === "none") {
      return new Response(
        JSON.stringify({
          success: true,
          status: currentStatus,
          output_url: scriptRun.assembled_video_url,
          duration: meta?.duration,
          error: meta?.error,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const jobId = meta?.ffmpeg_job_id;
    if (!jobId) {
      throw new Error("No FFmpeg job ID found");
    }

    if (!ffmpegServiceUrl) {
      throw new Error("FFmpeg service not configured");
    }

    // Poll FFmpeg service for job status
    console.log(`Polling FFmpeg job: ${jobId}`);
    
    const pollResponse = await fetch(`${ffmpegServiceUrl}/jobs/${jobId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!pollResponse.ok) {
      // If 404, job might have expired - mark as failed
      if (pollResponse.status === 404) {
        await supabase
          .from("script_runs")
          .update({
            assembled_status: "failed",
            assembled_meta: {
              ...meta,
              error: "Job not found or expired",
              failed_at: new Date().toISOString(),
            },
          })
          .eq("id", script_run_id);

        return new Response(
          JSON.stringify({
            success: false,
            status: "failed",
            error: "Job not found or expired",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const errorText = await pollResponse.text();
      throw new Error(`FFmpeg poll error: ${pollResponse.status} - ${errorText}`);
    }

    const pollResult = await pollResponse.json();
    console.log("FFmpeg poll result:", pollResult);

    // Update based on result
    if (pollResult.status === "succeeded") {
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/videos/assembled/${script_run_id}.mp4`;
      
      await supabase
        .from("script_runs")
        .update({
          assembled_video_url: pollResult.output_url || publicUrl,
          assembled_status: "succeeded",
          assembled_at: new Date().toISOString(),
          assembled_meta: {
            ...meta,
            completed_at: new Date().toISOString(),
            duration: pollResult.duration || meta?.expected_duration,
            ffmpeg_status: "succeeded",
          },
        })
        .eq("id", script_run_id);

      return new Response(
        JSON.stringify({
          success: true,
          status: "succeeded",
          output_url: pollResult.output_url || publicUrl,
          duration: pollResult.duration,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (pollResult.status === "failed") {
      await supabase
        .from("script_runs")
        .update({
          assembled_status: "failed",
          assembled_meta: {
            ...meta,
            error: pollResult.error || "FFmpeg render failed",
            failed_at: new Date().toISOString(),
            ffmpeg_status: "failed",
          },
        })
        .eq("id", script_run_id);

      return new Response(
        JSON.stringify({
          success: false,
          status: "failed",
          error: pollResult.error || "FFmpeg render failed",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Still processing - update progress
    await supabase
      .from("script_runs")
      .update({
        assembled_meta: {
          ...meta,
          ffmpeg_status: pollResult.status || "rendering",
          progress: pollResult.progress,
          eta_seconds: pollResult.eta_seconds,
        },
      })
      .eq("id", script_run_id);

    return new Response(
      JSON.stringify({
        success: true,
        status: pollResult.status || "rendering",
        progress: pollResult.progress,
        eta_seconds: pollResult.eta_seconds,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("poll-assembly-status error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
