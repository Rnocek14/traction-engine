import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AssembleRequest {
  script_run_id: string;
  transition_type?: "cut" | "crossfade" | "push_left" | "zoom_in";
  transition_duration?: number; // 0.1 - 0.5 seconds
  include_captions?: boolean;
  include_watermark?: boolean;
}

/**
 * Assembles video clips with voiceover audio baked in and crossfade transitions.
 * Uses FFmpeg (via external service) for authoritative output.
 * 
 * This is the server-side bake that ensures:
 * - Audio/video sync is locked (not client-dependent)
 * - Transitions are baked into the final MP4
 * - Export quality matches preview quality
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: AssembleRequest = await req.json();
    const {
      script_run_id,
      transition_type = "crossfade",
      transition_duration = 0.2,
    } = body;

    if (!script_run_id) {
      throw new Error("script_run_id is required");
    }

    // Fetch script run with voiceover
    const { data: scriptRun, error: scriptError } = await supabase
      .from("script_runs")
      .select("*, voiceover_audio_url")
      .eq("id", script_run_id)
      .single();

    if (scriptError || !scriptRun) {
      throw new Error(`Script not found: ${scriptError?.message}`);
    }

    // Fetch completed video jobs
    const { data: videoJobs, error: jobsError } = await supabase
      .from("video_jobs")
      .select("*")
      .eq("script_run_id", script_run_id)
      .in("status", ["done", "succeeded"])
      .order("created_at", { ascending: true });

    if (jobsError) {
      throw new Error(`Failed to fetch video jobs: ${jobsError.message}`);
    }

    if (!videoJobs?.length) {
      throw new Error("No completed video clips to assemble");
    }

    // Collect clip URLs
    const clipUrls = videoJobs
      .filter(j => j.output_url)
      .map(j => j.output_url as string);

    const voiceoverUrl = scriptRun.voiceover_audio_url;

    console.log(`Assembling reel: ${clipUrls.length} clips, voiceover: ${!!voiceoverUrl}`);
    console.log(`Transition: ${transition_type} @ ${transition_duration}s`);

    // TODO: Call external FFmpeg service (Replicate, Cloudflare, or self-hosted)
    // Example FFmpeg command structure:
    // ffmpeg -i clip1.mp4 -i clip2.mp4 -i voiceover.mp3 \
    //   -filter_complex "[0:v][1:v]xfade=transition=fade:duration=0.2:offset=4[v]" \
    //   -map "[v]" -map 2:a -c:v libx264 -c:a aac output.mp4

    // For now, return placeholder response
    // Full implementation requires:
    // 1. External FFmpeg service integration (Replicate recommended)
    // 2. Upload assembled video to Supabase Storage
    // 3. Update script_runs with assembled_video_url

    return new Response(
      JSON.stringify({
        success: false,
        message: "FFmpeg assembly requires external service integration",
        planned_clips: clipUrls.length,
        voiceover_available: !!voiceoverUrl,
        transition_settings: {
          type: transition_type,
          duration: transition_duration,
        },
        // TODO: Return assembled_video_url after integration
      }),
      {
        status: 501, // Not Implemented
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("assemble-reel error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
