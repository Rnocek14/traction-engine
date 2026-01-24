import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { deriveClusterKey } from "../_shared/cluster-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Configuration
const MAX_PAIRS_PER_RUN = 10;
const MIN_CONFIDENCE_THRESHOLD = 0.65;
const MIN_OVERALL_SCORE = 70;

interface VideoJobCandidate {
  id: string;
  provider: string;
  auto_routing_tags: string[] | null;
  auto_overall_score: number | null;
  auto_confidence: number | null;
  auto_rated_at: string | null;
  thumbnail_url: string | null;
  spritesheet_url: string | null;
  enriched_prompt: string | null;
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
 * Groups jobs by cluster key
 */
function groupByCluster(jobs: VideoJobCandidate[]): Map<string, VideoJobCandidate[]> {
  const groups = new Map<string, VideoJobCandidate[]>();
  
  for (const job of jobs) {
    const clusterKey = deriveClusterKey(job.auto_routing_tags);
    const existing = groups.get(clusterKey) || [];
    existing.push(job);
    groups.set(clusterKey, existing);
  }
  
  return groups;
}

/**
 * Checks if a pair has already been compared or queued
 * Uses canonical ordering (job_min, job_max) for consistent lookups
 */
async function pairAlreadyExists(
  supabase: SupabaseClient,
  jobA: string,
  jobB: string
): Promise<boolean> {
  const jobMin = jobA < jobB ? jobA : jobB;
  const jobMax = jobA < jobB ? jobB : jobA;
  
  // Check video_comparisons table (pair-only)
  const { data: existingComparison, error: compErr } = await supabase
    .from("video_comparisons")
    .select("id")
    .eq("job_min", jobMin)
    .eq("job_max", jobMax)
    .maybeSingle();
  
  if (compErr) throw compErr;
  if (existingComparison) return true;
  
  // Check queue for this specific pair (either orientation), pending or running
  const { data: queueMatch, error: queueErr } = await supabase
    .from("video_compare_queue")
    .select("id")
    .or(`and(job_a.eq.${jobMin},job_b.eq.${jobMax}),and(job_a.eq.${jobMax},job_b.eq.${jobMin})`)
    .in("status", ["pending", "running"])
    .maybeSingle();
  
  if (queueErr) throw queueErr;
  return !!queueMatch;
}

/**
 * Selects valid pairs for comparison from a cluster
 */
function selectPairsFromCluster(jobs: VideoJobCandidate[], maxPairs: number): Array<[VideoJobCandidate, VideoJobCandidate]> {
  const pairs: Array<[VideoJobCandidate, VideoJobCandidate]> = [];
  
  // Filter to valid candidates
  const validJobs = jobs.filter(j => 
    j.auto_rated_at && 
    (j.thumbnail_url || j.spritesheet_url) &&
    j.auto_confidence !== null &&
    j.auto_overall_score !== null
  );
  
  if (validJobs.length < 2) return pairs;
  
  // Prioritize cross-provider comparisons
  const byProvider = new Map<string, VideoJobCandidate[]>();
  for (const job of validJobs) {
    const existing = byProvider.get(job.provider) || [];
    existing.push(job);
    byProvider.set(job.provider, existing);
  }
  
  const providers = Array.from(byProvider.keys());
  
  // Generate cross-provider pairs first
  for (let i = 0; i < providers.length && pairs.length < maxPairs; i++) {
    for (let j = i + 1; j < providers.length && pairs.length < maxPairs; j++) {
      const providerAJobs = byProvider.get(providers[i]) || [];
      const providerBJobs = byProvider.get(providers[j]) || [];
      
      // Pick best candidates from each provider
      const sortedA = providerAJobs.sort((a, b) => 
        (b.auto_overall_score || 0) - (a.auto_overall_score || 0)
      );
      const sortedB = providerBJobs.sort((a, b) => 
        (b.auto_overall_score || 0) - (a.auto_overall_score || 0)
      );
      
      for (const jobA of sortedA.slice(0, 3)) {
        for (const jobB of sortedB.slice(0, 3)) {
          if (pairs.length >= maxPairs) break;
          
          // Quality gates
          const hasHighConfidence = 
            (jobA.auto_confidence || 0) >= MIN_CONFIDENCE_THRESHOLD ||
            (jobB.auto_confidence || 0) >= MIN_CONFIDENCE_THRESHOLD;
          
          const hasGoodScore = 
            (jobA.auto_overall_score || 0) >= MIN_OVERALL_SCORE ||
            (jobB.auto_overall_score || 0) >= MIN_OVERALL_SCORE;
          
          if (hasHighConfidence && hasGoodScore) {
            pairs.push([jobA, jobB]);
          }
        }
      }
    }
  }
  
  return pairs;
}

/**
 * Main handler: Queue comparisons for auto-rated videos
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

    // Fetch recent auto-rated jobs (last 24h, with routing data)
    const { data: candidates, error: fetchError } = await supabase
      .from("video_jobs")
      .select("id, provider, auto_routing_tags, auto_overall_score, auto_confidence, auto_rated_at, thumbnail_url, spritesheet_url, enriched_prompt")
      .eq("status", "done")
      .not("auto_rated_at", "is", null)
      .not("auto_routing_tags", "is", null)
      .gte("auto_rated_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order("auto_rated_at", { ascending: false })
      .limit(200);

    if (fetchError) throw fetchError;
    if (!candidates || candidates.length < 2) {
      return new Response(JSON.stringify({ 
        queued: 0, 
        message: "Not enough candidates for comparison" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group by cluster
    const clusters = groupByCluster(candidates as VideoJobCandidate[]);
    
    let totalQueued = 0;
    const queuedPairs: Array<{ clusterKey: string; jobA: string; jobB: string }> = [];

    // Process each cluster
    for (const [clusterKey, jobs] of clusters) {
      if (jobs.length < 2) continue;
      
      const pairs = selectPairsFromCluster(jobs, Math.min(3, MAX_PAIRS_PER_RUN - totalQueued));
      
      for (const [jobA, jobB] of pairs) {
        // Check if already compared/queued (pair-only check)
        const exists = await pairAlreadyExists(supabase, jobA.id, jobB.id);
        if (exists) continue;
        
        // Calculate priority based on quality
        const avgScore = ((jobA.auto_overall_score || 0) + (jobB.auto_overall_score || 0)) / 2;
        const priority = Math.round(avgScore);
        
        // Queue the comparison
        const { error: insertError } = await supabase
          .from("video_compare_queue")
          .insert({
            job_a: jobA.id,
            job_b: jobB.id,
            cluster_key: clusterKey,
            priority,
            reason: `Cross-provider: ${jobA.provider} vs ${jobB.provider}`,
          });
        
        if (!insertError) {
          totalQueued++;
          queuedPairs.push({ clusterKey, jobA: jobA.id, jobB: jobB.id });
        }
        
        if (totalQueued >= MAX_PAIRS_PER_RUN) break;
      }
      
      if (totalQueued >= MAX_PAIRS_PER_RUN) break;
    }

    return new Response(JSON.stringify({
      queued: totalQueued,
      pairs: queuedPairs,
      clustersProcessed: clusters.size,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error queuing comparisons:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
