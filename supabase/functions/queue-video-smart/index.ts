/**
 * Smart Video Queue - Intelligent Provider Router
 * 
 * Routes video generation requests to the best available provider
 * with automatic fallback on rate limits or quota errors.
 * 
 * Now integrates with comparison-based routing intelligence:
 * 1. Calls get-provider-recommendation edge function for historical data
 * 2. Falls back to static routing if insufficient data
 * 3. Supports explicit provider override
 * 4. Persists routing audit data to video_jobs for analytics
 * 
 * Supports: Sora 2, Runway Gen-3/Gen-4, Luma Ray2
 */
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { deriveClusterKey } from "../_shared/cluster-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SmartVideoRequest {
  script_run_id: string;
  clip_id?: string;
  prompt?: string;
  settings: {
    size: string;
    seconds: number;
    model?: string;
    seed?: number;
  };
  starting_frame_url?: string;
  provider?: "sora" | "runway" | "luma" | "smart"; // Default: smart
  fallback_enabled?: boolean; // Default: true
  /** Routing hints from frontend */
  routing_hint?: {
    shot_type?: string;
    genre?: string;
    prefer_fast?: boolean;
    /** CRITICAL: When true, prioritize providers with best image-to-video continuity */
    is_chained?: boolean;
    /** Optional: routing tags to use for recommendation lookup */
    routing_tags?: string[];
  };
}

interface ProviderResult {
  success: boolean;
  provider: "sora" | "runway" | "luma";
  job?: Record<string, unknown>;
  jobId?: string;
  error?: string;
}

interface RecommendationResponse {
  recommended: "sora" | "runway" | "luma";
  confidence: number;
  reason: string;
  dataSource: "comparison_history" | "static_capabilities";
  clusterKey: string;
  totalComparisons: number;
}

const RATE_LIMIT_INDICATORS = [
  "rate limit",
  "rate_limit",
  "ratelimit",
  "too many requests",
  "429",
  "quota",
  "exceeded",
];

const QUOTA_INDICATORS = [
  "quota",
  "exceeded",
  "insufficient",
  "credits",
  "limit reached",
];

function isRateLimitError(errorMessage: string): boolean {
  const lower = errorMessage.toLowerCase();
  return RATE_LIMIT_INDICATORS.some(indicator => lower.includes(indicator));
}

function isQuotaError(errorMessage: string): boolean {
  const lower = errorMessage.toLowerCase();
  return QUOTA_INDICATORS.some(indicator => lower.includes(indicator));
}

function shouldFallback(errorMessage: string): boolean {
  return isRateLimitError(errorMessage) || isQuotaError(errorMessage);
}

/**
 * Snap duration to valid values per provider
 * - Sora: 4, 8, 12 seconds
 * - Runway T2V: 4, 6, 8 seconds
 * - Luma: 5 seconds (fixed)
 */
function snapDurationForProvider(seconds: number, provider: "sora" | "runway" | "luma"): number {
  switch (provider) {
    case "sora":
      if (seconds <= 6) return 4;
      if (seconds <= 10) return 8;
      return 12;
    case "runway":
      if (seconds <= 5) return 4;
      if (seconds <= 7) return 6;
      return 8;
    case "luma":
      return 5; // Luma Ray-2 is fixed at 5s
    default:
      return 4;
  }
}

/**
 * Determine the best provider based on shot type, genre, and chaining mode
 * 
 * Chained mode prioritizes:
 * - Runway for character continuity (close-ups, dialogue)
 * - Luma for environment continuity (wide, tracking, motion)
 */
function routeByHints(hints?: SmartVideoRequest["routing_hint"]): "sora" | "runway" | "luma" | null {
  if (!hints) return null;
  
  const { shot_type, genre, prefer_fast, is_chained } = hints;
  
  // Fast mode → Luma
  if (prefer_fast) return "luma";
  
  // Character shot types (prioritize consistency)
  const CHARACTER_SHOTS = ["close-up", "medium-close", "extreme-close", "medium", "over-shoulder"];
  // Environment/motion shot types (prioritize physics/motion)
  const ENVIRONMENT_SHOTS = ["wide", "extreme-wide", "tracking", "crane", "high-angle"];
  
  // CHAINED MODE: Prioritize providers with best image-to-video continuity
  if (is_chained) {
    if (shot_type && CHARACTER_SHOTS.includes(shot_type)) {
      // Runway has best character consistency for close-ups in chained mode
      return "runway";
    }
    if (shot_type && ENVIRONMENT_SHOTS.includes(shot_type)) {
      // Luma has best motion physics for environment shots
      return "luma";
    }
    // Default chained mode: Runway for consistency
    return "runway";
  }
  
  // Genre-based routing (non-chained)
  if (genre === "horror" || genre === "dark") {
    // Horror/dark → Runway for character, Luma for environment
    if (shot_type && CHARACTER_SHOTS.includes(shot_type)) {
      return "runway";
    }
    return "luma";
  }
  
  if (genre === "action") {
    // Action → Luma for motion, Sora for character
    if (shot_type && ENVIRONMENT_SHOTS.includes(shot_type)) {
      return "luma";
    }
    return "sora";
  }
  
  // Shot type routing (default genre)
  if (shot_type) {
    // Character shots → Runway (best consistency)
    if (CHARACTER_SHOTS.includes(shot_type)) {
      return "runway";
    }
    // Environment/motion shots → Luma
    if (ENVIRONMENT_SHOTS.includes(shot_type)) {
      return "luma";
    }
  }
  
  return null; // No strong preference
}

/**
 * Try Sora provider
 */
async function trySora(
  supabaseUrl: string,
  supabaseKey: string,
  body: SmartVideoRequest
): Promise<ProviderResult> {
  try {
    // Snap duration to valid Sora values
    const snappedSettings = {
      ...body.settings,
      seconds: snapDurationForProvider(body.settings.seconds, "sora"),
    };
    
    const response = await fetch(`${supabaseUrl}/functions/v1/queue-video`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        script_run_id: body.script_run_id,
        clip_id: body.clip_id,
        prompt: body.prompt,
        settings: snappedSettings,
        starting_frame_url: body.starting_frame_url,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      return {
        success: false,
        provider: "sora",
        error: data.error || `HTTP ${response.status}`,
      };
    }

    return {
      success: true,
      provider: "sora",
      job: data.job,
    };
  } catch (err) {
    return {
      success: false,
      provider: "sora",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Try Runway provider
 */
async function tryRunway(
  supabaseUrl: string,
  supabaseKey: string,
  body: SmartVideoRequest
): Promise<ProviderResult> {
  try {
    // Snap duration to valid Runway values
    const snappedSettings = {
      ...body.settings,
      seconds: snapDurationForProvider(body.settings.seconds, "runway"),
    };
    
    const response = await fetch(`${supabaseUrl}/functions/v1/queue-video-runway`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        script_run_id: body.script_run_id,
        clip_id: body.clip_id,
        prompt: body.prompt,
        settings: snappedSettings,
        starting_frame_url: body.starting_frame_url,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      return {
        success: false,
        provider: "runway",
        error: data.error || `HTTP ${response.status}`,
      };
    }

    return {
      success: true,
      provider: "runway",
      job: data.job,
    };
  } catch (err) {
    return {
      success: false,
      provider: "runway",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Try Luma provider
 */
async function tryLuma(
  supabaseUrl: string,
  supabaseKey: string,
  body: SmartVideoRequest
): Promise<ProviderResult> {
  try {
    // Snap duration to valid Luma values (fixed 5s)
    const snappedSettings = {
      ...body.settings,
      seconds: snapDurationForProvider(body.settings.seconds, "luma"),
    };
    
    const response = await fetch(`${supabaseUrl}/functions/v1/queue-video-luma`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        script_run_id: body.script_run_id,
        clip_id: body.clip_id,
        prompt: body.prompt,
        settings: snappedSettings,
        starting_frame_url: body.starting_frame_url,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      return {
        success: false,
        provider: "luma",
        error: data.error || `HTTP ${response.status}`,
      };
    }

    return {
      success: true,
      provider: "luma",
      job: data.job,
    };
  } catch (err) {
    return {
      success: false,
      provider: "luma",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Get fallback order for a provider
 */
function getFallbackOrder(primary: "sora" | "runway" | "luma"): Array<"sora" | "runway" | "luma"> {
  switch (primary) {
    case "sora":
      return ["runway", "luma"];
    case "runway":
      return ["sora", "luma"];
    case "luma":
      return ["sora", "runway"];
    default:
      return ["runway", "luma"];
  }
}

/**
 * Get provider recommendation by calling the edge function
 * This ensures consistent logic with UI and analytics
 */
async function getComparisonBasedRecommendation(
  supabase: SupabaseClient,
  routingTags?: string[]
): Promise<{ 
  provider: "sora" | "runway" | "luma" | null; 
  source: string; 
  confidence: number | null; 
  clusterKey: string | null;
  reason: string | null;
}> {
  if (!routingTags || routingTags.length === 0) {
    return { provider: null, source: "no_tags", confidence: null, clusterKey: null, reason: null };
  }

  // Derive cluster key using shared utility
  const clusterKey = deriveClusterKey(routingTags);
  
  try {
    // Call the edge function for consistent recommendation logic
    const { data, error } = await supabase.functions.invoke("get-provider-recommendation", {
      body: { routingTags },
    });

    if (error) throw error;
    if (!data) {
      return { provider: null, source: "no_response", confidence: null, clusterKey, reason: null };
    }

    const response = data as RecommendationResponse;
    
    // Only use comparison history if confidence threshold is met
    const MIN_CONFIDENCE = 0.65;
    if (response.dataSource === "comparison_history" && response.confidence >= MIN_CONFIDENCE) {
      return { 
        provider: response.recommended, 
        source: response.dataSource, 
        confidence: response.confidence, 
        clusterKey: response.clusterKey,
        reason: response.reason,
      };
    }

    // Static capabilities are used as fallback info but not for routing override
    return { 
      provider: null, 
      source: response.dataSource, 
      confidence: response.confidence, 
      clusterKey: response.clusterKey,
      reason: response.reason,
    };
  } catch (err) {
    console.error("Error fetching comparison recommendation:", err);
    return { provider: null, source: "error", confidence: null, clusterKey, reason: null };
  }
}

/**
 * Persist routing audit data to the video job
 */
async function persistRoutingAudit(
  supabase: SupabaseClient,
  jobId: string,
  routedProvider: string,
  routingSource: string,
  routingConfidence: number | null,
  routingClusterKey: string | null,
  routingReason: string | null
): Promise<void> {
  try {
    await supabase
      .from("video_jobs")
      .update({
        routed_provider: routedProvider,
        routing_source: routingSource,
        routing_confidence: routingConfidence,
        routing_cluster_key: routingClusterKey,
        routing_reason: routingReason,
      })
      .eq("id", jobId);
  } catch (err) {
    console.error("Error persisting routing audit:", err);
    // Non-critical, don't throw
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: SmartVideoRequest = await req.json();
    const { provider = "smart", fallback_enabled = true, routing_hint } = body;

    // Validate script exists
    const { data: script, error: scriptError } = await supabase
      .from("script_runs")
      .select("id, status")
      .eq("id", body.script_run_id)
      .single();

    if (scriptError || !script) {
      throw new Error("Script not found");
    }

    if (script.status !== "qa_passed") {
      throw new Error("Script must pass QA before video generation");
    }

    let result: ProviderResult;
    const tryProvider = async (p: "sora" | "runway" | "luma"): Promise<ProviderResult> => {
      switch (p) {
        case "sora":
          return trySora(supabaseUrl, supabaseServiceKey, body);
        case "runway":
          return tryRunway(supabaseUrl, supabaseServiceKey, body);
        case "luma":
          return tryLuma(supabaseUrl, supabaseServiceKey, body);
      }
    };

    // Explicit provider selection
    if (provider !== "smart") {
      const explicitProvider = provider as "sora" | "runway" | "luma";
      result = await tryProvider(explicitProvider);
      
      if (!result.success && fallback_enabled && shouldFallback(result.error || "")) {
        const fallbacks = getFallbackOrder(explicitProvider);
        
        for (const fallback of fallbacks) {
          console.log(`${explicitProvider} failed with ${result.error}, trying ${fallback}`);
          result = await tryProvider(fallback);
          if (result.success || !shouldFallback(result.error || "")) {
            break;
          }
        }
      }
    } else {
      // Smart mode: determine best provider using layered routing
      // Priority: 1) Comparison history, 2) Static hints, 3) Default (Sora)
      
      let primaryProvider: "sora" | "runway" | "luma" = "sora";
      let routingSource = "default";
      let routingConfidence: number | null = null;
      let routingClusterKey: string | null = null;
      let routingReason: string | null = null;
      
      // First: Try comparison-based routing (if we have routing_tags)
      const comparisonRec = await getComparisonBasedRecommendation(
        supabase, 
        routing_hint?.routing_tags
      );
      
      if (comparisonRec.provider) {
        primaryProvider = comparisonRec.provider;
        routingSource = comparisonRec.source;
        routingConfidence = comparisonRec.confidence;
        routingClusterKey = comparisonRec.clusterKey;
        routingReason = comparisonRec.reason;
        console.log(`Smart mode: comparison history recommends ${primaryProvider}`, {
          clusterKey: routingClusterKey,
          confidence: routingConfidence,
        });
      } else {
        // Second: Fall back to static hint routing
        routingClusterKey = comparisonRec.clusterKey; // Keep cluster key for audit
        const hintedProvider = routeByHints(routing_hint);
        if (hintedProvider) {
          primaryProvider = hintedProvider;
          routingSource = "static_hints";
          routingReason = `shot_type=${routing_hint?.shot_type || "none"}, genre=${routing_hint?.genre || "none"}, chained=${routing_hint?.is_chained || false}`;
          console.log(`Smart mode: static hints recommend ${primaryProvider}`, {
            shot_type: routing_hint?.shot_type,
            genre: routing_hint?.genre,
            is_chained: routing_hint?.is_chained,
          });
        } else {
          routingReason = "No routing signal, using default";
          console.log("Smart mode: no routing signal, defaulting to sora");
        }
      }
      
      result = await tryProvider(primaryProvider);

      if (!result.success && fallback_enabled) {
        const shouldTryFallback = shouldFallback(result.error || "");
        
        if (shouldTryFallback) {
          const fallbacks = getFallbackOrder(primaryProvider);
          
          for (const fallback of fallbacks) {
            console.log(`Smart mode: ${result.provider} unavailable (${result.error}), trying ${fallback}`);
            result = await tryProvider(fallback);
            if (result.success || !shouldFallback(result.error || "")) {
              break;
            }
          }
        }
      }
      
      // Persist routing audit data if job was created
      if (result.success && result.job) {
        const jobId = (result.job as Record<string, unknown>).id as string;
        if (jobId) {
          await persistRoutingAudit(
            supabase,
            jobId,
            result.provider, // Actual provider used (may differ if fallback)
            result.provider !== primaryProvider ? `${routingSource}_fallback` : routingSource,
            routingConfidence,
            routingClusterKey,
            result.provider !== primaryProvider 
              ? `${routingReason} | Fallback from ${primaryProvider}` 
              : routingReason
          );
        }
      }
      
      // Include routing metadata in successful response
      if (result.success) {
        return new Response(
          JSON.stringify({
            success: true,
            provider: result.provider,
            job: result.job,
            fallback_used: result.provider !== primaryProvider,
            routing_hint_used: routing_hint !== undefined,
            routing_source: routingSource,
            routing_confidence: routingConfidence,
            routing_cluster_key: routingClusterKey,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (result.success) {
      return new Response(
        JSON.stringify({
          success: true,
          provider: result.provider,
          job: result.job,
          fallback_used: provider !== result.provider && provider !== "smart",
          routing_hint_used: routing_hint !== undefined,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: result.error,
          provider_attempted: result.provider,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("queue-video-smart error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
