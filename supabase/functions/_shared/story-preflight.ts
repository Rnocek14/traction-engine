/**
 * Story Preflight & Compliance Wiring v1.0
 *
 * Extracted from generate-storyboard to reduce bundle size.
 * Handles:
 * - Strict vertical compliance blocking (claim validation + banned language)
 * - Claim coverage preflight checks
 * - Overflow warning injection
 * - Debug persist gating + write
 */

import type { TimingDiagnostics, StoryEngineAudit } from "./story-engine-audit.ts";

// ─── Types ──────────────────────────────────────────────────

export interface ComplianceBlockResult {
  blocked: true;
  response: Response;
}

export interface CompliancePassResult {
  blocked: false;
}

export type ComplianceCheckResult = ComplianceBlockResult | CompliancePassResult;

export interface DebugPersistConfig {
  enabled: boolean;
  debug_tag?: string;
  account_id?: string;
  job_id?: string;
}

export interface DebugPersistPayload {
  vertical: string;
  goal?: string;
  tier?: string;
  audit: {
    version: string;
    compliance: {
      disclaimer?: string;
      total_replacements: number;
      sanitized_terms?: string[];
      has_hard_blocks: boolean;
      hard_blocks?: string[];
    };
    preflight: {
      valid: boolean;
      warnings: string[];
      errors: string[];
    };
    timing?: TimingDiagnostics;
  };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Strict Vertical Compliance Block ───────────────────────

/**
 * Check claim validation + banned language errors for strict verticals.
 * Returns a 422 Response if blocked, otherwise passes through.
 */
export function checkStrictComplianceBlock(
  vertical: string,
  claimValidationErrors: string[],
  bannedLanguageErrors: string[],
): ComplianceCheckResult {
  const isStrictVertical = ["health", "finance", "news"].includes(vertical);
  if (!isStrictVertical) return { blocked: false };

  const allErrors = [...claimValidationErrors, ...bannedLanguageErrors];
  if (allErrors.length === 0) return { blocked: false };

  console.error(`[story-preflight] STRICT VERTICAL BLOCK: ${allErrors.length} compliance errors`);

  return {
    blocked: true,
    response: new Response(
      JSON.stringify({
        error: "compliance_blocked",
        message: `Strict vertical (${vertical}) blocked due to ${allErrors.length} compliance violation(s)`,
        violations: allErrors,
        story_engine: {
          version: "v1.1",
          compliance: { has_hard_blocks: true, hard_blocks: allErrors },
        },
      }),
      { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    ),
  };
}

/**
 * Check hard blocks from compiled prompt compliance in strict verticals.
 */
export function checkCompiledHardBlocks(
  vertical: string,
  moderationLevel: string,
  compileHardBlocks: string[],
): ComplianceCheckResult {
  if (compileHardBlocks.length === 0 || moderationLevel !== "strict") {
    return { blocked: false };
  }

  console.error(`[story-preflight] STRICT HARD BLOCKS from compliance: ${compileHardBlocks.join("; ")}`);

  return {
    blocked: true,
    response: new Response(
      JSON.stringify({
        error: "compliance_blocked",
        message: `Strict vertical (${vertical}) blocked due to ${compileHardBlocks.length} hard-block violation(s) in compiled prompts`,
        violations: compileHardBlocks,
        story_engine: {
          version: "v1.1",
          compliance: { has_hard_blocks: true, hard_blocks: compileHardBlocks },
        },
      }),
      { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    ),
  };
}

/**
 * Check claim coverage and optionally block strict verticals.
 */
export function checkClaimCoverageBlock(
  vertical: string,
  claimCoverage: { errors: string[]; warnings: string[]; coverage_pct: number; unreferenced_claim_ids: string[] } | undefined,
): ComplianceCheckResult {
  if (!claimCoverage || claimCoverage.errors.length === 0) return { blocked: false };

  const isStrictVertical = ["health", "finance", "news"].includes(vertical);
  if (!isStrictVertical) return { blocked: false };

  return {
    blocked: true,
    response: new Response(
      JSON.stringify({
        error: "compliance_blocked",
        message: `Strict vertical (${vertical}) blocked: insufficient claim coverage`,
        violations: claimCoverage.errors,
        coverage: {
          pct: claimCoverage.coverage_pct,
          unreferenced: claimCoverage.unreferenced_claim_ids,
        },
        story_engine: {
          version: "v1.1",
          compliance: { has_hard_blocks: true, hard_blocks: claimCoverage.errors },
        },
      }),
      { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    ),
  };
}

// ─── Debug Persist ──────────────────────────────────────────

/**
 * Resolve debug_persist gating.
 * Requires BOTH debug_persist===true in request AND DEBUG_PERSIST_ENABLED env var.
 */
export function resolveDebugPersist(
  requestDebugPersist?: boolean,
  requestDebugTag?: string,
  accountId?: string,
  jobId?: string,
): DebugPersistConfig {
  const envEnabled = Deno.env.get("DEBUG_PERSIST_ENABLED") === "true";
  const enabled = !!(requestDebugPersist && envEnabled);

  return {
    enabled,
    debug_tag: requestDebugTag,
    account_id: accountId,
    job_id: jobId,
  };
}

/**
 * Build a capped debug persist payload from audit data.
 */
export function buildDebugPayload(
  audit: StoryEngineAudit,
  vertical: string,
  goal?: string,
  tier?: string,
): DebugPersistPayload {
  return {
    vertical,
    goal,
    tier,
    audit: {
      version: audit.version,
      compliance: {
        disclaimer: audit.compliance.disclaimer,
        total_replacements: audit.compliance.total_replacements,
        sanitized_terms: audit.compliance.sanitized_terms?.slice(0, 200),
        has_hard_blocks: audit.compliance.has_hard_blocks,
        hard_blocks: audit.compliance.hard_blocks?.slice(0, 200),
      },
      preflight: {
        valid: audit.preflight.valid,
        warnings: audit.preflight.warnings.slice(0, 200),
        errors: audit.preflight.errors.slice(0, 200),
      },
      timing: audit.timing,
    },
  };
}

/**
 * Write debug persist row to story_engine_debug_runs.
 * Fire-and-forget — never throws, never blocks response.
 */
export async function writeDebugPersist(
  config: DebugPersistConfig,
  payload: DebugPersistPayload,
): Promise<string | null> {
  if (!config.enabled) return null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      console.warn("[story-preflight] debug_persist: missing SUPABASE_URL or SERVICE_ROLE_KEY");
      return null;
    }

    const id = crypto.randomUUID();
    const res = await fetch(`${supabaseUrl}/rest/v1/story_engine_debug_runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        id,
        job_id: config.job_id || null,
        account_id: config.account_id || null,
        debug_tag: config.debug_tag || null,
        payload,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[story-preflight] debug_persist write failed (${res.status}): ${text}`);
      return null;
    }
    // Consume body
    await res.text();

    console.log(`[story-preflight] debug_persist written: id=${id} tag=${config.debug_tag || "none"}`);
    return id;
  } catch (err) {
    console.error("[story-preflight] debug_persist error:", err);
    return null;
  }
}
