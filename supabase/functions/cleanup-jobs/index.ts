/**
 * Cleanup failed/stuck video jobs — batch delete version
 * Deletes in batches of 5000 to avoid timeouts on large tables.
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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const statuses = ["failed", "running", "queued"];
    let totalDeleted = 0;
    const BATCH = 5000;
    const MAX_ROUNDS = 200; // safety cap: 1M rows max

    for (let round = 0; round < MAX_ROUNDS; round++) {
      // Find a batch of IDs
      const { data: batch, error: fetchErr } = await supabase
        .from("video_jobs")
        .select("id")
        .in("status", statuses)
        .limit(BATCH);

      if (fetchErr) throw new Error(`Fetch batch failed: ${fetchErr.message}`);
      if (!batch || batch.length === 0) break;

      const ids = batch.map((r: any) => r.id);

      const { error: delErr } = await supabase
        .from("video_jobs")
        .delete()
        .in("id", ids);

      if (delErr) throw new Error(`Delete batch failed: ${delErr.message}`);

      totalDeleted += ids.length;
      console.log(`[cleanup] Deleted batch ${round + 1}: ${ids.length} jobs (total: ${totalDeleted})`);

      if (ids.length < BATCH) break; // last batch
    }

    // Also clean up orphaned script_runs from lab testing
    const { data: deletedScripts } = await supabase
      .from("script_runs")
      .delete()
      .eq("account_id", "lab-testing")
      .select("id");

    return new Response(
      JSON.stringify({
        success: true,
        deleted_jobs: totalDeleted,
        deleted_scripts: deletedScripts?.length || 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Cleanup error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
