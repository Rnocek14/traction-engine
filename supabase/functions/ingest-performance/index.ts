/**
 * ingest-performance
 * 
 * Accepts post-publish performance metrics and writes them to prompt_outcomes.
 * Links back to the experiment via story_jobs.script_experiment_id.
 * 
 * NEW: Also traces back to scraped_insights that influenced this content,
 * updating insight performance data for the feedback loop.
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

    // Look up story_job to get experiment_id + continuity_anchors (for trend tracing)
    const { data: job, error: jobErr } = await supabase
      .from("story_jobs")
      .select("id, script_experiment_id, account_id, continuity_anchors")
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

    // Compute outcome_score (0-100)
    let outcomeScore: number | null = null;
    if (views != null && views > 0) {
      const engagementRate = ((likes || 0) + (shares || 0) + (saves || 0) + (comments || 0)) / views;
      const retentionBonus = watch3sRate != null ? watch3sRate * 30 : 0;
      const engagementPoints = Math.min(engagementRate * 500, 50);
      outcomeScore = Math.round(Math.min(engagementPoints + retentionBonus + (views > 1000 ? 20 : views > 100 ? 10 : 0), 100));
    }

    // Upsert into prompt_outcomes
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
      const { data: inserted, error: insertErr } = await supabase
        .from("prompt_outcomes")
        .insert({
          experiment_id: job.script_experiment_id,
          story_job_id: storyJobId,
          platform,
          external_post_id: externalPostId,
          views, impressions, likes, shares, saves, comments,
          avg_watch_time: avgWatchTime,
          watch_3s_rate: watch3sRate,
          watch_15s_rate: watch15sRate,
          ctr, revenue, conversions,
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

      // Still try feedback loop even on fallback insert
      await updateInsightPerformance(supabase, job, outcomeScore);

      return new Response(
        JSON.stringify({ success: true, outcome_id: inserted?.id, outcome_score: outcomeScore }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── FEEDBACK LOOP: trace back to scraped insights ──
    await updateInsightPerformance(supabase, job, outcomeScore);

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

/**
 * Traces the story back to the scraped insights that influenced it,
 * and updates the insight_performance table so the system learns
 * which trends actually produce winners.
 */
// deno-lint-ignore no-explicit-any
async function updateInsightPerformance(supabase: any, job: any, outcomeScore: number | null) {
  try {
    // Extract insight IDs from continuity_anchors._trend_enrichment
    const anchors = job.continuity_anchors as Record<string, unknown> | null;
    const trendData = anchors?._trend_enrichment as { insight_ids?: string[] } | undefined;
    const insightIds = trendData?.insight_ids;

    if (!insightIds || insightIds.length === 0) {
      // Also check content_ideas for trend_source_ids
      const { data: idea } = await supabase
        .from("content_ideas")
        .select("trend_source_ids")
        .eq("story_job_id", job.id)
        .maybeSingle();

      const ideaInsightIds = idea?.trend_source_ids as string[] | undefined;
      if (!ideaInsightIds || ideaInsightIds.length === 0) {
        console.log("[ingest-performance] No trend insight IDs to trace back");
        return;
      }

      // Use idea's insight IDs
      await writeInsightPerformance(supabase, ideaInsightIds, job.id, outcomeScore);
      return;
    }

    await writeInsightPerformance(supabase, insightIds, job.id, outcomeScore);
  } catch (err) {
    // Non-blocking: don't fail the main response
    console.warn("[ingest-performance] Feedback loop error (non-blocking):", err);
  }
}

// deno-lint-ignore no-explicit-any
async function writeInsightPerformance(supabase: any, insightIds: string[], storyJobId: string, outcomeScore: number | null) {
  const rows = insightIds.map(insightId => ({
    scraped_insight_id: insightId,
    story_job_id: storyJobId,
    outcome_score: outcomeScore,
  }));

  const { error } = await supabase
    .from("insight_performance")
    .upsert(rows, { onConflict: "scraped_insight_id,story_job_id" });

  if (error) {
    console.warn("[ingest-performance] insight_performance upsert error:", error.message);
  } else {
    console.log(`[ingest-performance] Linked ${insightIds.length} insights to outcome score ${outcomeScore}`);
  }
}
