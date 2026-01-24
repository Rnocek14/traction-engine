import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Configuration
const MIN_COMPARISONS_FOR_RECOMMENDATION = 5;
const CONFIDENCE_WEIGHT = 0.3; // How much confidence affects the score

interface ClusterStats {
  provider: string;
  wins: number;
  losses: number;
  ties: number;
  total_comparisons: number;
  avg_confidence: number | null;
  avg_win_delta: number | null;
}

interface ProviderCapabilities {
  provider: string;
  strengths: string[];
  weaknesses: string[];
  defaultScore: number;
}

// Static fallback provider capabilities (used when not enough data)
const PROVIDER_DEFAULTS: ProviderCapabilities[] = [
  {
    provider: "sora",
    strengths: ["aesthetic", "atmospheric", "b-roll", "cinematic", "high_fidelity"],
    weaknesses: ["fast_motion", "action_sequence"],
    defaultScore: 75,
  },
  {
    provider: "runway",
    strengths: ["portrait", "character", "identity", "dialogue", "close_up"],
    weaknesses: ["establishing_shot", "aerial"],
    defaultScore: 72,
  },
  {
    provider: "luma",
    strengths: ["motion", "physics", "action_sequence", "fast_motion", "establishing_shot"],
    weaknesses: ["portrait", "close_up"],
    defaultScore: 70,
  },
];

/**
 * Derives cluster key from routing tags
 */
function deriveClusterKey(tags: string[]): string {
  if (!tags || tags.length === 0) return "general";
  return [...tags].sort().slice(0, 3).join("|");
}

/**
 * Calculates win rate with confidence weighting
 */
function calculateWeightedScore(stats: ClusterStats): number {
  if (stats.total_comparisons === 0) return 0;
  
  const winRate = stats.wins / stats.total_comparisons;
  const confidence = stats.avg_confidence || 0.5;
  
  // Weighted score: base win rate + confidence bonus
  return winRate * (1 - CONFIDENCE_WEIGHT) + winRate * confidence * CONFIDENCE_WEIGHT;
}

/**
 * Gets fallback recommendation based on static capabilities
 */
function getFallbackRecommendation(tags: string[]): {
  provider: string;
  score: number;
  reason: string;
} {
  const tagSet = new Set(tags.map(t => t.toLowerCase()));
  
  let bestProvider = PROVIDER_DEFAULTS[0];
  let bestScore = 0;
  
  for (const provider of PROVIDER_DEFAULTS) {
    let score = provider.defaultScore;
    
    // Boost for matching strengths
    const matchingStrengths = provider.strengths.filter(s => tagSet.has(s));
    score += matchingStrengths.length * 5;
    
    // Penalty for matching weaknesses
    const matchingWeaknesses = provider.weaknesses.filter(w => tagSet.has(w));
    score -= matchingWeaknesses.length * 8;
    
    if (score > bestScore) {
      bestScore = score;
      bestProvider = provider;
    }
  }
  
  return {
    provider: bestProvider.provider,
    score: bestScore / 100,
    reason: `Static capability match (${bestProvider.strengths.filter(s => tagSet.has(s)).join(", ") || "general"})`,
  };
}

/**
 * Main handler: Get provider recommendation for given routing tags
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { routingTags } = await req.json() as { routingTags: string[] };
    
    if (!routingTags || !Array.isArray(routingTags)) {
      return new Response(JSON.stringify({ 
        error: "routingTags array is required" 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const clusterKey = deriveClusterKey(routingTags);

    // Fetch stats for this cluster
    const { data: clusterStats, error: fetchError } = await supabase
      .from("provider_cluster_stats")
      .select("*")
      .eq("cluster_key", clusterKey);

    if (fetchError) throw fetchError;

    // Check if we have enough data
    // Use max() instead of sum() since total_comparisons is per-provider involvement
    const totalComparisons = clusterStats && clusterStats.length > 0
      ? Math.max(...clusterStats.map(s => s.total_comparisons || 0))
      : 0;

    if (!clusterStats || clusterStats.length === 0 || totalComparisons < MIN_COMPARISONS_FOR_RECOMMENDATION) {
      // Fall back to static capabilities
      const fallback = getFallbackRecommendation(routingTags);
      
      return new Response(JSON.stringify({
        recommended: fallback.provider,
        confidence: fallback.score,
        reason: fallback.reason,
        dataSource: "static_capabilities",
        clusterKey,
        totalComparisons,
        stats: null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Calculate weighted scores for each provider
    const providerScores = (clusterStats as ClusterStats[]).map(stats => ({
      provider: stats.provider,
      score: calculateWeightedScore(stats),
      wins: stats.wins,
      losses: stats.losses,
      ties: stats.ties,
      total: stats.total_comparisons,
      winRate: stats.total_comparisons > 0 ? stats.wins / stats.total_comparisons : 0,
      avgConfidence: stats.avg_confidence,
    }));

    // Sort by score
    providerScores.sort((a, b) => b.score - a.score);

    const best = providerScores[0];
    const runnerUp = providerScores[1];

    // Calculate confidence in recommendation
    let recommendationConfidence = best.score;
    if (runnerUp) {
      // Reduce confidence if close race
      const margin = best.score - runnerUp.score;
      recommendationConfidence = Math.min(best.score, 0.5 + margin * 2);
    }

    return new Response(JSON.stringify({
      recommended: best.provider,
      confidence: Math.round(recommendationConfidence * 100) / 100,
      reason: `${Math.round(best.winRate * 100)}% win rate from ${best.total} comparisons`,
      dataSource: "comparison_history",
      clusterKey,
      totalComparisons,
      stats: providerScores,
      runnerUp: runnerUp ? {
        provider: runnerUp.provider,
        score: runnerUp.score,
        winRate: runnerUp.winRate,
      } : null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error getting provider recommendation:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
