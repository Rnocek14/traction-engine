import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
  // Calculate average delta for win magnitude
  const deltaValues = Object.values(deltas);
  const avgDelta = deltaValues.reduce((sum, d) => sum + Math.abs(d), 0) / deltaValues.length;
  
  // Call the database function to update stats
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
    // Don't throw - stats update is non-critical
  }
}

/**
 * Main handler: Process pending comparisons from the queue
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch pending items from queue (ordered by priority)
    const { data: queueItems, error: fetchError } = await supabase
      .from("video_compare_queue")
      .select("id, job_a, job_b, cluster_key, priority, reason")
      .eq("status", "pending")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) throw fetchError;
    if (!queueItems || queueItems.length === 0) {
      return new Response(JSON.stringify({ 
        processed: 0, 
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
      // Atomically claim this item (concurrency safety)
      const { data: claimed, error: claimErr } = await supabase
        .from("video_compare_queue")
        .update({ status: "running", started_at: new Date().toISOString() })
        .eq("id", item.id)
        .eq("status", "pending") // Only claim if still pending
        .select("id")
        .maybeSingle();

      if (claimErr) {
        console.error(`Error claiming queue item ${item.id}:`, claimErr);
        continue;
      }

      if (!claimed) {
        // Another process already claimed this item
        results.push({ id: item.id, status: "skipped", error: "Already claimed by another process" });
        continue;
      }

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
