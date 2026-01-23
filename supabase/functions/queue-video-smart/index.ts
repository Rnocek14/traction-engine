/**
 * Smart Video Queue - Intelligent Provider Router
 * 
 * Routes video generation requests to the best available provider
 * with automatic fallback on rate limits or quota errors.
 * 
 * Supports: Sora 2, Runway Gen-3/Gen-4, Luma Ray2
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  };
}

interface ProviderResult {
  success: boolean;
  provider: "sora" | "runway" | "luma";
  job?: Record<string, unknown>;
  error?: string;
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
 * Determine the best provider based on shot type and genre
 */
function routeByHints(hints?: SmartVideoRequest["routing_hint"]): "sora" | "runway" | "luma" | null {
  if (!hints) return null;
  
  const { shot_type, genre, prefer_fast } = hints;
  
  // Fast mode → Luma
  if (prefer_fast) return "luma";
  
  // Genre-based routing
  if (genre === "horror" || genre === "dark") {
    // Horror/dark → Runway for character, Luma for environment
    if (shot_type && ["close-up", "medium-close", "extreme-close", "medium"].includes(shot_type)) {
      return "runway";
    }
    return "luma";
  }
  
  if (genre === "action") {
    // Action → Luma for motion, Sora for character
    if (shot_type && ["tracking", "crane", "wide", "extreme-wide"].includes(shot_type)) {
      return "luma";
    }
    return "sora";
  }
  
  // Shot type routing (default genre)
  if (shot_type) {
    // Character shots → Runway (best consistency)
    if (["close-up", "medium-close", "extreme-close", "over-shoulder"].includes(shot_type)) {
      return "runway";
    }
    // Environment/motion shots → Luma
    if (["extreme-wide", "wide", "crane", "tracking", "high-angle"].includes(shot_type)) {
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
        settings: body.settings,
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
        settings: body.settings,
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
        settings: body.settings,
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
      // Smart mode: determine best provider
      const hintedProvider = routeByHints(routing_hint);
      const primaryProvider = hintedProvider || "sora"; // Default to Sora
      
      console.log(`Smart mode: routing to ${primaryProvider}`, {
        hintedProvider,
        routing_hint,
      });
      
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
