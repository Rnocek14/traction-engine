/**
 * Smart Video Queue - Intelligent Provider Router
 * 
 * Routes video generation requests to the best available provider
 * with automatic fallback on rate limits or quota errors.
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
  provider?: "sora" | "runway" | "smart"; // Default: smart
  fallback_enabled?: boolean; // Default: true
}

interface ProviderResult {
  success: boolean;
  provider: "sora" | "runway";
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: SmartVideoRequest = await req.json();
    const { provider = "smart", fallback_enabled = true } = body;

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

    // Explicit provider selection (no fallback)
    if (provider === "sora") {
      result = await trySora(supabaseUrl, supabaseServiceKey, body);
      
      if (!result.success && fallback_enabled && shouldFallback(result.error || "")) {
        console.log(`Sora failed with ${result.error}, falling back to Runway`);
        result = await tryRunway(supabaseUrl, supabaseServiceKey, body);
      }
    } else if (provider === "runway") {
      result = await tryRunway(supabaseUrl, supabaseServiceKey, body);
      
      if (!result.success && fallback_enabled && shouldFallback(result.error || "")) {
        console.log(`Runway failed with ${result.error}, falling back to Sora`);
        result = await trySora(supabaseUrl, supabaseServiceKey, body);
      }
    } else {
      // Smart mode: try Sora first (typically higher quality), fallback to Runway
      result = await trySora(supabaseUrl, supabaseServiceKey, body);

      if (!result.success && fallback_enabled) {
        const shouldTryFallback = shouldFallback(result.error || "");
        
        if (shouldTryFallback) {
          console.log(`Smart mode: Sora unavailable (${result.error}), trying Runway`);
          result = await tryRunway(supabaseUrl, supabaseServiceKey, body);
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
