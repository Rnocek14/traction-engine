/**
 * ingest-performance
 * 
 * Accepts post-publish performance metrics and writes them to prompt_outcomes.
 * Links back to the experiment via story_jobs.script_experiment_id.
 * 
 * Input: { story_job_id, platform?, external_post_id?, views?, impressions?,
 *          likes?, shares?, saves?, comments?, avg_watch_time?, watch_3s_rate?,
 *          watch_15s_rate?, ctr?, revenue?, conversions? }
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const storyJobId = body.story_job_id;

    if (!storyJobId || typeof storyJobId !== "string") {
      return new Response(
        JSON.stringify({ error: "story_job_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Look up story_job to get experiment_id
    const { data: job, error: jobErr } = await supabase
      .from("story_jobs")
      .select("id, script_experiment_id, account_id")
      .eq("id", storyJobId)
      .single();

    if (jobErr || !job) {
      return new Response(
        JSON.stringify({ error: "Story job not found", detail: jobErr?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!job.script_experiment_id) {
      return new Response(
        JSON.stringify({ error: "Story job has no linked experiment — cannot store outcome" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse numeric fields safely
    const num = (v: unknown): number | null => {
      if (v == null) return null;
      const n = Number(v);
      return isNaN(n) ? null : n;
    };

    const platform = body.platform || null;
    const externalPostId = body.external_post_id || null;

    const views = num(body.views);
    const impressions = num(body.impressions);
    const likes = num(body.likes);
    const shares = num(body.shares);
    const saves = num(body.saves);
    const comments = num(body.comments);
    const avgWatchTime = num(body.avg_watch_time);
    const watch3sRate = num(body.watch_3s_rate);
    const watch15sRate = num(body.watch_15s_rate);
    const ctr = num(body.ctr);
    const revenue = num(body.revenue);
    const conversions = num(body.conversions);

    // Compute a simple outcome_score (0-100) based on available metrics
    let outcomeScore: number | null = null;
    if (views != null && views > 0) {
      const engagementRate = ((likes || 0) + (shares || 0) + (saves || 0) + (comments || 0)) / views;
      const retentionBonus = watch3sRate != null ? watch3sRate * 30 : 0;
      const engagementPoints = Math.min(engagementRate * 500, 50); // cap at 50
      outcomeScore = Math.round(Math.min(engagementPoints + retentionBonus + (views > 1000 ? 20 : views > 100 ? 10 : 0), 100));
    }

    // Upsert into prompt_outcomes (one outcome per experiment+platform)
    const { data: outcome, error: outcomeErr } = await supabase
      .from("prompt_outcomes")
      .upsert(
        {
          experiment_id: job.script_experiment_id,
          story_job_id: storyJobId,
          platform,
          external_post_id: externalPostId,
          views,
          impressions,
          likes,
          shares,
          saves,
          comments,
          avg_watch_time: avgWatchTime,
          watch_3s_rate: watch3sRate,
          watch_15s_rate: watch15sRate,
          ctr,
          revenue,
          conversions,
          outcome_score: outcomeScore,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "experiment_id", ignoreDuplicates: false }
      )
      .select("id")
      .single();

    if (outcomeErr) {
      console.error("[ingest-performance] Upsert error:", outcomeErr);
      // Fallback to insert if upsert fails (no unique constraint on experiment_id)
      const { data: inserted, error: insertErr } = await supabase
        .from("prompt_outcomes")
        .insert({
          experiment_id: job.script_experiment_id,
          story_job_id: storyJobId,
          platform,
          external_post_id: externalPostId,
          views,
          impressions,
          likes,
          shares,
          saves,
          comments,
          avg_watch_time: avgWatchTime,
          watch_3s_rate: watch3sRate,
          watch_15s_rate: watch15sRate,
          ctr,
          revenue,
          conversions,
          outcome_score: outcomeScore,
        })
        .select("id")
        .single();

      if (insertErr) {
        return new Response(
          JSON.stringify({ error: "Failed to store outcome", detail: insertErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, outcome_id: inserted?.id, outcome_score: outcomeScore }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[ingest-performance] Stored outcome for job=${storyJobId} score=${outcomeScore}`);

    return new Response(
      JSON.stringify({ success: true, outcome_id: outcome?.id, outcome_score: outcomeScore }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[ingest-performance] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
