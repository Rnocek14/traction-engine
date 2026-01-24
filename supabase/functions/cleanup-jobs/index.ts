/**
 * Cleanup failed/stuck video jobs
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

    // Delete failed, stuck running, and queued jobs
    const { data: deleted, error } = await supabase
      .from("video_jobs")
      .delete()
      .in("status", ["failed", "running", "queued"])
      .select("id, provider, status");

    if (error) {
      throw new Error(`Delete failed: ${error.message}`);
    }

    // Also clean up orphaned script_runs from lab testing
    const { data: deletedScripts, error: scriptsError } = await supabase
      .from("script_runs")
      .delete()
      .eq("account_id", "lab-testing")
      .select("id");

    return new Response(
      JSON.stringify({
        success: true,
        deleted_jobs: deleted?.length || 0,
        deleted_scripts: deletedScripts?.length || 0,
        jobs: deleted,
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
