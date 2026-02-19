import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  MIN_CLIP_DURATION, MAX_CLIP_DURATION, PROVIDER_BUCKETS, TIMING_LIGHT_ROLES,
  snapToProvider, estimateNarrationDuration, bucketAwareRebalance, formatProviderBuckets,
} from "../_shared/timing-helpers.ts";

// Helper: compute min bucket step for a provider
function minBucketStep(provider: string): number {
  const buckets = PROVIDER_BUCKETS[provider] || PROVIDER_BUCKETS.sora;
  if (buckets.length < 2) return 1;
  return Math.min(...buckets.slice(1).map((b, i) => b - buckets[i]));
}

// ─── formatProviderBuckets ──────────────────────────────────

Deno.test("formatProviderBuckets returns correct format", () => {
  assertEquals(formatProviderBuckets("sora"), "sora:4,8,12");
  assertEquals(formatProviderBuckets("runway"), "runway:4,6,8");
  assertEquals(formatProviderBuckets("luma"), "luma:5");
  assertEquals(formatProviderBuckets("unknown"), "unknown:");
});

// ─── snapToProvider ─────────────────────────────────────────

Deno.test("snapToProvider snaps up to nearest bucket", () => {
  assertEquals(snapToProvider(3, "sora"), 4);
  assertEquals(snapToProvider(4, "sora"), 4);
  assertEquals(snapToProvider(5, "sora"), 8);
  assertEquals(snapToProvider(8, "sora"), 8);
  assertEquals(snapToProvider(9, "sora"), 12);
  assertEquals(snapToProvider(12, "sora"), 12);
  assertEquals(snapToProvider(15, "sora"), 12); // above max → clamp to 12
});

Deno.test("snapToProvider works for runway buckets", () => {
  assertEquals(snapToProvider(3, "runway"), 4);
  assertEquals(snapToProvider(5, "runway"), 6);
  assertEquals(snapToProvider(7, "runway"), 8);
  assertEquals(snapToProvider(9, "runway"), 8); // clamp to MAX then snap
});

// ─── estimateNarrationDuration ──────────────────────────────

Deno.test("estimateNarrationDuration returns 0 for empty text", () => {
  assertEquals(estimateNarrationDuration(""), 0);
  assertEquals(estimateNarrationDuration("   "), 0);
});

Deno.test("estimateNarrationDuration estimates correctly for plain text", () => {
  const tenWords = "one two three four five six seven eight nine ten";
  const est = estimateNarrationDuration(tenWords);
  // 10 words / 2.9 wps ≈ 3.45s, no punctuation
  assert(est > 3 && est < 4, `Expected ~3.45, got ${est}`);
});

Deno.test("estimateNarrationDuration accounts for punctuation pauses", () => {
  const withPunct = "Wait, here's the catch. It gets worse.";
  const est = estimateNarrationDuration(withPunct);
  // 7 words / 2.9 + 1 comma * 0.15 + 2 sentences * 0.25 ≈ 3.06
  assert(est > 2.5 && est < 3.5, `Expected ~3.06, got ${est}`);
});

// ─── bucketAwareRebalance ───────────────────────────────────

Deno.test("bucketAwareRebalance converges within minBucketStep for Sora", () => {
  const target = 16;
  const result = bucketAwareRebalance([4, 4, 4], target, "sora");
  const total = result.reduce((s, d) => s + d, 0);
  const step = minBucketStep("sora"); // 4
  assert(Math.abs(total - target) < step, `Total ${total} not within ${step} of ${target}`);
  result.forEach(d => assert([4, 8, 12].includes(d), `${d} is not a valid Sora bucket`));
});

Deno.test("bucketAwareRebalance exits immediately when delta < minBucketStep", () => {
  // current=12, target=14, delta=2 < minStep=4 → no change
  const result = bucketAwareRebalance([4, 4, 4], 14, "sora");
  assertEquals(result.reduce((s, d) => s + d, 0), 12);
});

Deno.test("bucketAwareRebalance decreases total correctly", () => {
  const target = 20;
  const result = bucketAwareRebalance([12, 12, 12], target, "sora");
  const total = result.reduce((s, d) => s + d, 0);
  const step = minBucketStep("sora");
  assert(Math.abs(total - target) < step, `Total ${total} not within ${step} of ${target}`);
  result.forEach(d => assert([4, 8, 12].includes(d), `${d} is not a valid Sora bucket`));
});

Deno.test("bucketAwareRebalance chooses smallest cost bump (deterministic)", () => {
  // durations [4, 8, 8], target 24, current=20, delta=4
  // Two options: bump 4→8 (cost 4) or bump 8→12 (cost 4) — tie, but loop picks first (idx 0)
  const result = bucketAwareRebalance([4, 8, 8], 24, "sora");
  const total = result.reduce((s, d) => s + d, 0);
  // After one bump: total should be 24
  assertEquals(total, 24);
  // The 4 should have been bumped to 8 (cheapest or first-tie)
  assertEquals(result, [8, 8, 8]);
});

Deno.test("bucketAwareRebalance handles Runway buckets", () => {
  const target = 16;
  const result = bucketAwareRebalance([4, 4, 4], target, "runway");
  const total = result.reduce((s, d) => s + d, 0);
  const step = minBucketStep("runway"); // 2
  assert(Math.abs(total - target) < step, `Total ${total} not within ${step} of ${target}`);
  result.forEach(d => assert([4, 6, 8].includes(d), `${d} is not a valid Runway bucket`));
});

// ─── TIMING_LIGHT_ROLES ────────────────────────────────────

Deno.test("TIMING_LIGHT_ROLES contains expected roles", () => {
  assert(TIMING_LIGHT_ROLES.has("hook"));
  assert(TIMING_LIGHT_ROLES.has("reset"));
  assert(TIMING_LIGHT_ROLES.has("atmosphere"));
  assert(TIMING_LIGHT_ROLES.has("transition"));
  assert(TIMING_LIGHT_ROLES.has("curiosity_hook"));
  assert(!TIMING_LIGHT_ROLES.has("story_a"));
  assert(!TIMING_LIGHT_ROLES.has("cta"));
  assert(!TIMING_LIGHT_ROLES.has("problem"));
});

// ─── Constants ──────────────────────────────────────────────

Deno.test("constants are correct", () => {
  assertEquals(MIN_CLIP_DURATION, 3);
  assertEquals(MAX_CLIP_DURATION, 12);
  assertEquals(PROVIDER_BUCKETS.sora, [4, 8, 12]);
  assertEquals(PROVIDER_BUCKETS.runway, [4, 6, 8]);
  assertEquals(PROVIDER_BUCKETS.luma, [5]);
});
