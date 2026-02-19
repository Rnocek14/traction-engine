/**
 * Timing helpers for narration-aware duration adjustment.
 * Used by generate-storyboard (and potentially other functions).
 */

// Speech model constants
const SPEECH_WPS = 2.9; // ~175 WPM, typical TikTok/Reels VO pace
const COMMA_PAUSE = 0.15;
const SENTENCE_PAUSE = 0.25;

export const MIN_CLIP_DURATION = 3;
export const MAX_CLIP_DURATION = 12; // Sora max

// Provider snap buckets (mirrors queue-video-smart)
export const PROVIDER_BUCKETS: Record<string, number[]> = {
  sora: [4, 8, 12],
  runway: [4, 6, 8],
  luma: [5],
};

// Timing-light roles — roles where short/no narration is expected
export const TIMING_LIGHT_ROLES = new Set([
  "hook", "curiosity_hook", "trend_hook", "shock_hook", "symbolic_hook",
  "contrarian_hook", "hook_pain", "in_media_res",
  "reset", "atmosphere", "establish", "transition",
]);

/** Snap a duration to the nearest valid provider bucket (>=). */
export function snapToProvider(seconds: number, provider: string): number {
  const buckets = PROVIDER_BUCKETS[provider] || PROVIDER_BUCKETS.sora;
  const clamped = Math.max(MIN_CLIP_DURATION, Math.min(MAX_CLIP_DURATION, seconds));
  return buckets.find(b => b >= clamped) || buckets[buckets.length - 1];
}

/** Realistic speech duration estimator with punctuation pauses. */
export function estimateNarrationDuration(text: string): number {
  if (!text || text.trim().length === 0) return 0;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const commas = (text.match(/,/g) || []).length;
  const sentences = (text.match(/[.!?…]+/g) || []).length;
  return (words / SPEECH_WPS) + (commas * COMMA_PAUSE) + (sentences * SENTENCE_PAUSE);
}

/**
 * Bucket-aware redistribution.
 * Always takes the smallest valid step in the needed direction;
 * stops when close enough or no moves remain.
 */
export function bucketAwareRebalance(durations: number[], targetTotal: number, provider: string): number[] {
  const buckets = PROVIDER_BUCKETS[provider] || PROVIDER_BUCKETS.sora;
  const minBucketStep = buckets.length > 1
    ? Math.min(...buckets.slice(1).map((b, i) => b - buckets[i]))
    : 1;
  const result = [...durations];
  const MAX_ITERATIONS = 10;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const currentTotal = result.reduce((s, d) => s + d, 0);
    const delta = targetTotal - currentTotal;
    if (Math.abs(delta) < minBucketStep) break;

    if (delta > 0) {
      let bestIdx = -1;
      let bestCost = Infinity;
      for (let i = 0; i < result.length; i++) {
        const nextBucket = buckets.find(b => b > result[i]);
        if (nextBucket) {
          const cost = nextBucket - result[i];
          if (cost < bestCost) {
            bestCost = cost;
            bestIdx = i;
          }
        }
      }
      if (bestIdx === -1) break;
      const nextBucket = buckets.find(b => b > result[bestIdx]);
      if (nextBucket) result[bestIdx] = nextBucket;
    } else {
      let bestIdx = -1;
      let bestCost = Infinity;
      for (let i = 0; i < result.length; i++) {
        const prevBuckets = buckets.filter(b => b < result[i]);
        if (prevBuckets.length > 0) {
          const prevBucket = prevBuckets[prevBuckets.length - 1];
          const cost = result[i] - prevBucket;
          if (cost < bestCost) {
            bestCost = cost;
            bestIdx = i;
          }
        }
      }
      if (bestIdx === -1) break;
      const prevBuckets = buckets.filter(b => b < result[bestIdx]);
      result[bestIdx] = prevBuckets[prevBuckets.length - 1];
    }
  }
  return result;
}

/** Format provider_buckets string for audit (e.g. "sora:4,8,12"). */
export function formatProviderBuckets(provider: string): string {
  return `${provider}:${(PROVIDER_BUCKETS[provider] || []).join(",")}`;
}
