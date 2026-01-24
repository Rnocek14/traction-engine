import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Configuration
const BATCH_SIZE = 3;

interface QueueItem {
  id: string;
  job_a: string;
  job_b: string;
  cluster_key: string;
  priority: number;
  reason: string | null;
  started_at: string | null;
}

interface ComparisonResult {
  winner: "A" | "B" | "tie";
  confidence: number;
  deltas: {
    prompt_adherence: number;
    temporal_consistency: number;
    motion_realism: number;
    visual_fidelity: number;
    cinematic_quality: number;
  };
  reasons: string[];
  stored: boolean;
  provider_a?: string;
  provider_b?: string;
}

/**
 * Validates cron secret for scheduled invocations
 */
function validateCronAuth(req: Request): boolean {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret) return true; // No secret configured, allow all
  
  const providedSecret = req.headers.get("x-cron-secret");
  return providedSecret === cronSecret;
}

/**
 * Calls the compare-videos edge function
 */
async function runComparison(
  supabase: SupabaseClient,
  jobIdA: string,
  jobIdB: string
): Promise<ComparisonResult> {
  const { data, error } = await supabase.functions.invoke("compare-videos", {
    body: { jobIdA, jobIdB },
  });
  
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  
  return data as ComparisonResult;
}

/**
 * Updates provider cluster stats after a comparison
 */
async function updateClusterStats(
  supabase: SupabaseClient,
  clusterKey: string,
  providerA: string,
  providerB: string,
  winner: "A" | "B" | "tie",
  confidence: number,
  deltas: ComparisonResult["deltas"]
): Promise<void> {
  const deltaValues = Object.values(deltas);
  const avgDelta = deltaValues.reduce((sum, d) => sum + Math.abs(d), 0) / deltaValues.length;
  
  const { error } = await supabase.rpc("update_provider_stats", {
    p_cluster_key: clusterKey,
    p_provider_a: providerA,
    p_provider_b: providerB,
    p_winner: winner,
    p_confidence: confidence,
    p_delta: avgDelta,
  });
  
  if (error) {
    console.error("Error updating cluster stats:", error);
  }
}

/**
 * Stale runner reaper: Reset items stuck in "running" for > 15 minutes
 * Only reaps rows with started_at set, appends to error instead of overwriting
 */
async function reapStaleRunners(supabase: SupabaseClient): Promise<number> {
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  
  // First, fetch stale items to append error message properly
  const { data: staleItems, error: fetchErr } = await supabase
    .from("video_compare_queue")
    .select("id, error")
    .eq("status", "running")
    .not("started_at", "is", null)
    .lt("started_at", fifteenMinutesAgo);
  
  if (fetchErr || !staleItems || staleItems.length === 0) {
    return 0;
  }
  
  // Update each with appended error
  let reaped = 0;
  for (const item of staleItems) {
    const newError = item.error 
      ? `${item.error} | stale timeout reset` 
      : "stale timeout reset";
    
    const { error: updateErr } = await supabase
      .from("video_compare_queue")
      .update({ 
        status: "pending", 
        started_at: null,
        error: newError
      })
      .eq("id", item.id)
      .eq("status", "running"); // Double-check still running
    
    if (!updateErr) reaped++;
  }
  
  if (reaped > 0) {
    console.log(`Reaped ${reaped} stale running items`);
  }
  return reaped;
}

/**
 * Main handler: Process pending comparisons from the queue
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate cron auth if configured
  if (!validateCronAuth(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // First, reap any stale runners
    const reapedCount = await reapStaleRunners(supabase);

    // Use atomic claim RPC (FOR UPDATE SKIP LOCKED)
    const { data: queueItems, error: claimError } = await supabase
      .rpc("claim_compare_queue", { p_limit: BATCH_SIZE });

    if (claimError) throw claimError;
    if (!queueItems || queueItems.length === 0) {
      return new Response(JSON.stringify({ 
        processed: 0, 
        reaped: reapedCount,
        message: "No pending comparisons in queue" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<{
      id: string;
      status: "done" | "failed" | "skipped";
      winner?: string;
      error?: string;
    }> = [];

    for (const item of queueItems as QueueItem[]) {
      try {
        // Run the comparison
        const result = await runComparison(supabase, item.job_a, item.job_b);
        
        // Update cluster stats if we have provider info
        if (result.provider_a && result.provider_b) {
          await updateClusterStats(
            supabase,
            item.cluster_key,
            result.provider_a,
            result.provider_b,
            result.winner,
            result.confidence,
            result.deltas
          );
        } else {
          // Fetch provider info if not returned
          const { data: jobA } = await supabase
            .from("video_jobs")
            .select("provider")
            .eq("id", item.job_a)
            .single();
          const { data: jobB } = await supabase
            .from("video_jobs")
            .select("provider")
            .eq("id", item.job_b)
            .single();
          
          if (jobA && jobB) {
            await updateClusterStats(
              supabase,
              item.cluster_key,
              jobA.provider,
              jobB.provider,
              result.winner,
              result.confidence,
              result.deltas
            );
          }
        }
        
        // Mark as done
        await supabase
          .from("video_compare_queue")
          .update({ 
            status: result.stored ? "done" : "skipped",
            completed_at: new Date().toISOString(),
          })
          .eq("id", item.id);
        
        results.push({
          id: item.id,
          status: result.stored ? "done" : "skipped",
          winner: result.winner,
        });

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        console.error(`Error processing queue item ${item.id}:`, errorMsg);
        
        // Mark as failed
        await supabase
          .from("video_compare_queue")
          .update({ 
            status: "failed",
            error: errorMsg,
            completed_at: new Date().toISOString(),
          })
          .eq("id", item.id);
        
        results.push({
          id: item.id,
          status: "failed",
          error: errorMsg,
        });
      }
    }

    const summary = {
      processed: results.length,
      done: results.filter(r => r.status === "done").length,
      failed: results.filter(r => r.status === "failed").length,
      skipped: results.filter(r => r.status === "skipped").length,
      reaped: reapedCount,
      results,
    };

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error processing compare queue:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
