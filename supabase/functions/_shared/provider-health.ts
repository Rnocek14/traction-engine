/**
 * Provider Health / Circuit Breaker
 * 
 * Checks recent failure rates for video providers and disables
 * providers that are consistently failing (expired credits, API issues).
 * 
 * This prevents the system from wasting thousands of jobs on
 * providers that have a 0% success rate.
 */

export type VideoProvider = "sora" | "runway" | "luma";

export interface ProviderHealth {
  provider: VideoProvider;
  recentDone: number;
  recentFailed: number;
  failureRate: number;
  isHealthy: boolean;
}

/**
 * Failure rate threshold above which a provider is disabled.
 * 90% = if 90+ out of 100 recent jobs failed, stop using this provider.
 */
const FAILURE_THRESHOLD = 0.90;

/**
 * Minimum sample size before we make a judgment.
 * Don't disable a provider based on 2 failures.
 */
const MIN_SAMPLE_SIZE = 10;

/**
 * How far back to look for health data (hours).
 */
const LOOKBACK_HOURS = 24;

/**
 * Check health of all providers by querying recent job outcomes.
 * Returns a map of provider → health status.
 */
export async function checkProviderHealth(
  supabase: { from: (table: string) => unknown }
): Promise<Record<VideoProvider, ProviderHealth>> {
  // deno-lint-ignore no-explicit-any
  const sb = supabase as any;
  const cutoff = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();

  const providers: VideoProvider[] = ["sora", "runway", "luma"];
  const results: Record<string, ProviderHealth> = {};

  for (const provider of providers) {
    try {
      // Count done jobs
      const { count: doneCount } = await sb
        .from("video_jobs")
        .select("id", { count: "exact", head: true })
        .eq("provider", provider)
        .eq("status", "done")
        .gte("created_at", cutoff);

      // Count failed jobs
      const { count: failedCount } = await sb
        .from("video_jobs")
        .select("id", { count: "exact", head: true })
        .eq("provider", provider)
        .eq("status", "failed")
        .gte("created_at", cutoff);

      const done = doneCount || 0;
      const failed = failedCount || 0;
      const total = done + failed;

      let failureRate = 0;
      let isHealthy = true;

      if (total >= MIN_SAMPLE_SIZE) {
        failureRate = failed / total;
        isHealthy = failureRate < FAILURE_THRESHOLD;
      }

      results[provider] = {
        provider,
        recentDone: done,
        recentFailed: failed,
        failureRate,
        isHealthy,
      };
    } catch (err) {
      console.error(`[provider-health] Error checking ${provider}:`, err);
      // Default to healthy if we can't check (don't block on errors)
      results[provider] = {
        provider,
        recentDone: 0,
        recentFailed: 0,
        failureRate: 0,
        isHealthy: true,
      };
    }
  }

  return results as Record<VideoProvider, ProviderHealth>;
}

/**
 * Get list of healthy providers, ordered by preference.
 * If all providers are unhealthy, returns ["sora"] as last resort.
 */
export function getHealthyProviders(
  health: Record<VideoProvider, ProviderHealth>,
  preferredOrder: VideoProvider[] = ["sora", "runway", "luma"]
): VideoProvider[] {
  const healthy = preferredOrder.filter(p => health[p]?.isHealthy);

  if (healthy.length === 0) {
    // All providers unhealthy — fall back to the one with lowest failure rate
    const sorted = [...preferredOrder].sort(
      (a, b) => (health[a]?.failureRate || 1) - (health[b]?.failureRate || 1)
    );
    console.warn(`[provider-health] ALL providers unhealthy. Falling back to ${sorted[0]}`);
    return [sorted[0]];
  }

  return healthy;
}

/**
 * Log provider health status for debugging.
 */
export function logProviderHealth(health: Record<VideoProvider, ProviderHealth>): void {
  for (const [provider, h] of Object.entries(health)) {
    const status = h.isHealthy ? "✅ HEALTHY" : "🔴 DISABLED";
    console.log(
      `[provider-health] ${provider}: ${status} (${h.recentDone} done, ${h.recentFailed} failed, ${(h.failureRate * 100).toFixed(0)}% failure rate)`
    );
  }
}
