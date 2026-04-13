import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AssembledMeta {
  ffmpeg_job_id?: string;
  ffmpeg_instance_id?: string;
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
  script_run_id?: string;
  story_job_id?: string;
}

async function updateTable(
  supabase: ReturnType<typeof createClient>,
  table: string,
  id: string,
  update: Record<string, unknown>,
) {
  await supabase.from(table).update(update).eq("id", id);
}

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
    const { script_run_id, story_job_id } = body;

    const isStoryMode = !!story_job_id;
    const primaryId = story_job_id || script_run_id;
    const table = isStoryMode ? "story_jobs" : "script_runs";

    if (!primaryId) {
      throw new Error("script_run_id or story_job_id is required");
    }

    const { data: record, error: fetchError } = await supabase
      .from(table)
      .select("assembled_status, assembled_meta, assembled_video_url")
      .eq("id", primaryId)
      .single();

    if (fetchError || !record) {
      throw new Error(`Record not found: ${fetchError?.message}`);
    }

    const meta = record.assembled_meta as AssembledMeta | null;
    const currentStatus = record.assembled_status as string;

    if (currentStatus === "succeeded" || currentStatus === "failed" || currentStatus === "none") {
      return new Response(
        JSON.stringify({
          success: true,
          status: currentStatus,
          output_url: record.assembled_video_url,
          duration: meta?.duration,
          error: meta?.error,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const jobId = meta?.ffmpeg_job_id;
    if (!jobId) throw new Error("No FFmpeg job ID found");
    if (!ffmpegServiceUrl) throw new Error("FFmpeg service not configured");

    const ffmpegHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (meta?.ffmpeg_instance_id) {
      ffmpegHeaders["fly-force-instance-id"] = meta.ffmpeg_instance_id;
    }

    console.log(`Polling FFmpeg job: ${jobId}`);
    
    const pollResponse = await fetch(`${ffmpegServiceUrl}/jobs/${jobId}`, {
      method: "GET",
      headers: ffmpegHeaders,
    });

    if (!pollResponse.ok) {
      if (pollResponse.status === 404) {
        await updateTable(supabase, table, primaryId, {
          assembled_status: "failed",
          assembled_meta: { ...meta, error: "Job not found or expired", failed_at: new Date().toISOString() },
        });
        return new Response(
          JSON.stringify({ success: false, status: "failed", error: "Job not found or expired" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await pollResponse.text();
      throw new Error(`FFmpeg poll error: ${pollResponse.status} - ${errorText}`);
    }

    const pollResult = await pollResponse.json();
    const ffmpegInstanceId = pollResult?.instance_id || pollResponse.headers.get("x-ffmpeg-instance-id") || meta?.ffmpeg_instance_id;
    console.log("FFmpeg poll result:", pollResult);

    if (pollResult.status === "succeeded") {
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/videos/assembled/${primaryId}.mp4`;
      await updateTable(supabase, table, primaryId, {
        assembled_video_url: pollResult.output_url || publicUrl,
        assembled_status: "succeeded",
        assembled_at: new Date().toISOString(),
        assembled_meta: { ...meta, completed_at: new Date().toISOString(), duration: pollResult.duration || meta?.expected_duration, ffmpeg_status: "succeeded", ffmpeg_instance_id: ffmpegInstanceId },
      });
      return new Response(
        JSON.stringify({ success: true, status: "succeeded", output_url: pollResult.output_url || publicUrl, duration: pollResult.duration }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (pollResult.status === "failed") {
      await updateTable(supabase, table, primaryId, {
        assembled_status: "failed",
        assembled_meta: { ...meta, error: pollResult.error || "FFmpeg render failed", failed_at: new Date().toISOString(), ffmpeg_status: "failed", ffmpeg_instance_id: ffmpegInstanceId },
      });
      return new Response(
        JSON.stringify({ success: false, status: "failed", error: pollResult.error || "FFmpeg render failed" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Still processing
    await updateTable(supabase, table, primaryId, {
      assembled_meta: { ...meta, ffmpeg_status: pollResult.status || "rendering", progress: pollResult.progress, eta_seconds: pollResult.eta_seconds, ffmpeg_instance_id: ffmpegInstanceId },
    });

    return new Response(
      JSON.stringify({ success: true, status: pollResult.status || "rendering", progress: pollResult.progress, eta_seconds: pollResult.eta_seconds }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("poll-assembly-status error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
