/**
 * cost-guard.ts
 *
 * Single shared utility every paid-API call site uses to:
 *  1. Check the global kill switch (system_settings.automation_enabled)
 *  2. Enforce daily / per-story / per-product spend caps
 *  3. Log every call to api_call_log for the dashboard
 *
 * Usage:
 *   const guard = await checkCostGuard(supabase, {
 *     functionName: "continue-story-chain",
 *     storyJobId,
 *     scope: "automation", // 'automation' calls respect the kill switch; 'manual' skips it
 *   });
 *   if (!guard.allowed) {
 *     await logApiCall(supabase, { ...meta, status: "blocked", costCents: 0, errorMessage: guard.reason });
 *     return new Response(JSON.stringify({ blocked: true, reason: guard.reason }), { status: 200, headers: cors });
 *   }
 *   // ...make the paid call...
 *   await logApiCall(supabase, { ...meta, status: "success", costCents: estimateCost(...) });
 */

// deno-lint-ignore no-explicit-any
type SupabaseLike = { rpc: (fn: string, args?: any) => any; from: (t: string) => any };

export type CostScope = "automation" | "manual";

export interface CostGuardInput {
  functionName: string;
  scope?: CostScope;            // default: "automation"
  storyJobId?: string | null;
  productId?: string | null;
  appId?: string | null;
  estimatedCostCents?: number;  // optional; if provided, checked against caps before the call
}

export interface CostGuardResult {
  allowed: boolean;
  reason?: string;
  settings?: {
    automation_enabled: boolean;
    daily_spend_cap_cents: number;
    per_story_cap_cents: number;
    per_product_cap_cents: number;
  };
  spentTodayCents?: number;
  spentOnStoryCents?: number;
  spentOnProductCents?: number;
}

export async function checkCostGuard(
  supabase: SupabaseLike,
  input: CostGuardInput,
): Promise<CostGuardResult> {
  const scope = input.scope ?? "automation";

  // 1. Read system settings
  const { data: settings, error: sErr } = await supabase
    .from("system_settings")
    .select("automation_enabled, daily_spend_cap_cents, per_story_cap_cents, per_product_cap_cents")
    .limit(1)
    .maybeSingle();

  if (sErr) {
    // Fail OPEN on read error so a transient DB blip doesn't break production —
    // but still log a warning. (Most callers wrap in try/catch already.)
    console.warn(`[cost-guard] settings read failed: ${sErr.message}; allowing call`);
    return { allowed: true };
  }

  const s = settings ?? {
    automation_enabled: true,
    daily_spend_cap_cents: 2000,
    per_story_cap_cents: 500,
    per_product_cap_cents: 1000,
  };

  // 2. Kill switch (only blocks automation)
  if (scope === "automation" && !s.automation_enabled) {
    return { allowed: false, reason: "automation_paused", settings: s };
  }

  // 3. Cap checks (only meaningful if we have an estimate)
  const est = Math.max(0, input.estimatedCostCents ?? 0);

  // Daily cap
  const { data: dayRow } = await supabase
    .from("api_call_log")
    .select("cost_cents")
    .gte("created_at", new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString());
  const spentTodayCents = (dayRow ?? []).reduce(
    (a: number, r: { cost_cents: number }) => a + (r.cost_cents ?? 0),
    0,
  );
  if (spentTodayCents + est > s.daily_spend_cap_cents) {
    return {
      allowed: false,
      reason: `daily_cap_exceeded ($${(spentTodayCents / 100).toFixed(2)} of $${(s.daily_spend_cap_cents / 100).toFixed(2)})`,
      settings: s,
      spentTodayCents,
    };
  }

  // Per-story cap
  let spentOnStoryCents = 0;
  if (input.storyJobId) {
    const { data: rows } = await supabase
      .from("api_call_log")
      .select("cost_cents")
      .eq("story_job_id", input.storyJobId);
    spentOnStoryCents = (rows ?? []).reduce(
      (a: number, r: { cost_cents: number }) => a + (r.cost_cents ?? 0),
      0,
    );
    if (spentOnStoryCents + est > s.per_story_cap_cents) {
      return {
        allowed: false,
        reason: `story_cap_exceeded ($${(spentOnStoryCents / 100).toFixed(2)} of $${(s.per_story_cap_cents / 100).toFixed(2)})`,
        settings: s,
        spentOnStoryCents,
      };
    }
  }

  // Per-product cap
  let spentOnProductCents = 0;
  if (input.productId) {
    const { data: rows } = await supabase
      .from("api_call_log")
      .select("cost_cents")
      .eq("product_id", input.productId);
    spentOnProductCents = (rows ?? []).reduce(
      (a: number, r: { cost_cents: number }) => a + (r.cost_cents ?? 0),
      0,
    );
    if (spentOnProductCents + est > s.per_product_cap_cents) {
      return {
        allowed: false,
        reason: `product_cap_exceeded ($${(spentOnProductCents / 100).toFixed(2)} of $${(s.per_product_cap_cents / 100).toFixed(2)})`,
        settings: s,
        spentOnProductCents,
      };
    }
  }

  return {
    allowed: true,
    settings: s,
    spentTodayCents,
    spentOnStoryCents,
    spentOnProductCents,
  };
}

export interface ApiCallLogInput {
  provider: string;
  model?: string | null;
  functionName: string;
  operation?: string | null;
  storyJobId?: string | null;
  productId?: string | null;
  appId?: string | null;
  accountId?: string | null;
  status?: "success" | "failed" | "blocked";
  costCents?: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  latencyMs?: number | null;
  errorMessage?: string | null;
  // deno-lint-ignore no-explicit-any
  metadata?: Record<string, any>;
}

export async function logApiCall(supabase: SupabaseLike, input: ApiCallLogInput): Promise<void> {
  try {
    await supabase.from("api_call_log").insert({
      provider: input.provider,
      model: input.model ?? null,
      function_name: input.functionName,
      operation: input.operation ?? null,
      story_job_id: input.storyJobId ?? null,
      product_id: input.productId ?? null,
      app_id: input.appId ?? null,
      account_id: input.accountId ?? null,
      status: input.status ?? "success",
      cost_cents: Math.max(0, Math.round(input.costCents ?? 0)),
      input_tokens: input.inputTokens ?? null,
      output_tokens: input.outputTokens ?? null,
      latency_ms: input.latencyMs ?? null,
      error_message: input.errorMessage ?? null,
      metadata: input.metadata ?? {},
    });
  } catch (e) {
    console.warn(`[cost-guard] log insert failed: ${(e as Error).message}`);
  }
}

/**
 * Rough cost estimates (cents per call). Real usage should be replaced by
 * provider responses when available — this is the fallback for monitoring.
 */
export const ESTIMATED_COST_CENTS = {
  sora_video: 60,           // ~$0.60 per Sora clip
  runway_video: 50,         // ~$0.50 per Runway gen
  luma_video: 40,           // ~$0.40 per Luma gen
  openai_completion: 2,     // ~$0.02 typical script call
  openai_rate: 1,           // ~$0.01 video rating
  elevenlabs_voiceover: 5,  // ~$0.05 per VO
  perplexity_query: 1,      // ~$0.01 per Perplexity call
  serpapi_query: 1,         // ~$0.01 per SerpAPI call
  firecrawl_query: 1,       // ~$0.01 per Firecrawl call
} as const;
