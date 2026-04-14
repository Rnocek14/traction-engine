/**
 * produce-product-video
 * 
 * Full end-to-end orchestrator: product → concepts → story_jobs → video_jobs → clips → assembly.
 * Returns immediately with a batch_id. Client polls story_jobs for progress.
 * 
 * Steps:
 * 1. Generate concepts via GPT
 * 2. Create story_jobs (auto-approved)
 * 3. For each story_job scene, create a video_job via queue-video
 * 4. Background: poll video_jobs until clips are done, then trigger assembly
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { product_id, account_id } = await req.json();
    if (!product_id) throw new Error("product_id required");
    if (!account_id) throw new Error("account_id required");

    // Step 1: Generate concepts by calling product-to-videos
    const genRes = await fetch(`${supabaseUrl}/functions/v1/product-to-videos`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ product_id, mode: "generate" }),
    });
    const genData = await genRes.json();
    if (!genData.success || !genData.concepts?.length) {
      throw new Error("Concept generation failed: " + (genData.error || "no concepts"));
    }

    // Step 2: Queue concepts as story_jobs
    const queueRes = await fetch(`${supabaseUrl}/functions/v1/product-to-videos`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        product_id,
        mode: "queue",
        approved_concepts: genData.concepts,
        account_id,
      }),
    });
    const queueData = await queueRes.json();
    if (!queueData.success) {
      throw new Error("Queue failed: " + (queueData.error || "unknown"));
    }

    const jobIds: string[] = queueData.job_ids;

    // Step 3: For each story_job, kick off clip generation for all scenes
    // We need a script_run_id for each story_job — create a lightweight one
    for (const storyJobId of jobIds) {
      // Fetch storyboard
      const { data: storyJob } = await supabase
        .from("story_jobs")
        .select("storyboard_json, account_id, total_clips")
        .eq("id", storyJobId)
        .single();

      if (!storyJob?.storyboard_json) continue;

      const storyboard = storyJob.storyboard_json as Record<string, unknown>;
      const scenes = (storyboard.scenes || []) as Array<Record<string, unknown>>;

      // Create a script_run record so queue-video has something to reference
      const { data: scriptRun, error: srErr } = await supabase
        .from("script_runs")
        .insert({
          account_id: storyJob.account_id,
          status: "qa_passed",
          script_content: {
            title: storyboard.hook || "Product Ad",
            scenes: scenes.map((s) => ({
              visual_prompt: s.prompt,
              on_screen_text: s.on_screen_text || "",
            })),
            voiceover: storyboard.voiceover_script || "",
          },
        })
        .select("id")
        .single();

      if (srErr || !scriptRun) {
        console.error("Failed to create script_run for story", storyJobId, srErr);
        // Update story_job to failed
        await supabase.from("story_jobs").update({ status: "failed" }).eq("id", storyJobId);
        continue;
      }

      // Update story_job status to "generating"
      await supabase.from("story_jobs").update({ status: "generating" }).eq("id", storyJobId);

      // Queue each scene as a video job
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const prompt = (scene.prompt as string) || "Product showcase";
        const durationSec = Number(scene.duration_sec) || 5;
        // Sora buckets: 4, 8, 12
        const providerSeconds = durationSec <= 4 ? 4 : durationSec <= 8 ? 8 : 12;

        try {
          const qvRes = await fetch(`${supabaseUrl}/functions/v1/queue-video`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${serviceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              script_run_id: scriptRun.id,
              story_job_id: storyJobId,
              sequence_index: i,
              prompt,
              settings: {
                size: "720x1280",
                provider_seconds: providerSeconds,
                requested_seconds: durationSec,
                model: "sora-2",
              },
              starting_frame_url: (scene.reference_image_url as string) || undefined,
              skip_enrichment: false,
              bypass_qa: true,
            }),
          });

          const qvData = await qvRes.json();
          if (qvData.id) {
            // Link video_job to story_job
            await supabase
              .from("video_jobs")
              .update({ story_job_id: storyJobId, sequence_index: i, is_primary: true })
              .eq("id", qvData.id);
          }
        } catch (e) {
          console.error(`Failed to queue scene ${i} for story ${storyJobId}:`, e);
        }
      }
    }

    // Return immediately — client polls story_jobs for progress
    return new Response(
      JSON.stringify({
        success: true,
        job_ids: jobIds,
        total: jobIds.length,
        message: "Pipeline started. Poll story_jobs for progress.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("produce-product-video error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
