/**
 * link-job-to-story
 * 
 * Utility function to link an existing video_job to a story_job.
 * Useful for manually regenerated clips or fixing orphaned jobs.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LinkRequest {
  job_id: string;
  story_job_id: string;
  sequence_index: number;
  original_prompt?: string;
  style_hints?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: LinkRequest = await req.json();
    const { job_id, story_job_id, sequence_index, original_prompt, style_hints } = body;

    if (!job_id || !story_job_id || sequence_index === undefined) {
      return new Response(
        JSON.stringify({ success: false, error: "job_id, story_job_id, and sequence_index are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify job exists
    const { data: existingJob, error: fetchError } = await supabase
      .from("video_jobs")
      .select("id, story_job_id, sequence_index")
      .eq("id", job_id)
      .single();

    if (fetchError || !existingJob) {
      return new Response(
        JSON.stringify({ success: false, error: `Job not found: ${job_id}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update the job with story metadata
    const updatePayload: Record<string, unknown> = {
      story_job_id,
      sequence_index,
    };

    if (original_prompt) {
      updatePayload.original_prompt = original_prompt;
    }
    if (style_hints) {
      updatePayload.style_hints = style_hints;
    }

    const { error: updateError } = await supabase
      .from("video_jobs")
      .update(updatePayload)
      .eq("id", job_id);

    if (updateError) {
      return new Response(
        JSON.stringify({ success: false, error: `Failed to update job: ${updateError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[link-job] Linked job ${job_id} to story ${story_job_id} at index ${sequence_index}`);

    return new Response(
      JSON.stringify({
        success: true,
        job_id,
        story_job_id,
        sequence_index,
        previous_story_job_id: existingJob.story_job_id,
        previous_sequence_index: existingJob.sequence_index,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[link-job] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
