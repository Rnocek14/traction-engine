import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  MIN_CLIP_DURATION, MAX_CLIP_DURATION, PROVIDER_BUCKETS, TIMING_LIGHT_ROLES,
  snapToProvider, estimateNarrationDuration, bucketAwareRebalance, formatProviderBuckets,
} from "../_shared/timing-helpers.ts";

Deno.test("formatProviderBuckets returns correct format", () => {
  assertEquals(formatProviderBuckets("sora"), "sora:4,8,12");
  assertEquals(formatProviderBuckets("runway"), "runway:4,6,8");
  assertEquals(formatProviderBuckets("luma"), "luma:5");
  // Unknown provider returns empty buckets
  assertEquals(formatProviderBuckets("unknown"), "unknown:");
});

Deno.test("snapToProvider snaps up to nearest bucket", () => {
  // Sora buckets: [4, 8, 12]
  assertEquals(snapToProvider(3, "sora"), 4);   // below min → clamp to 3 → snap to 4
  assertEquals(snapToProvider(4, "sora"), 4);
  assertEquals(snapToProvider(5, "sora"), 8);
  assertEquals(snapToProvider(8, "sora"), 8);
  assertEquals(snapToProvider(9, "sora"), 12);
  assertEquals(snapToProvider(12, "sora"), 12);
  assertEquals(snapToProvider(15, "sora"), 12);  // above max → clamp to 12

  // Runway buckets: [4, 6, 8]
  assertEquals(snapToProvider(3, "runway"), 4);
  assertEquals(snapToProvider(5, "runway"), 6);
  assertEquals(snapToProvider(7, "runway"), 8);
  assertEquals(snapToProvider(9, "runway"), 8);  // clamp to 8 (runway max in buckets)
});

Deno.test("estimateNarrationDuration returns 0 for empty text", () => {
  assertEquals(estimateNarrationDuration(""), 0);
  assertEquals(estimateNarrationDuration("   "), 0);
});

Deno.test("estimateNarrationDuration estimates correctly", () => {
  // 10 words at 2.9 wps = ~3.45s, no punctuation
  const tenWords = "one two three four five six seven eight nine ten";
  const est = estimateNarrationDuration(tenWords);
  assert(est > 3 && est < 4, `Expected ~3.45, got ${est}`);

  // With commas and sentence end
  const withPunct = "Wait, here's the catch. It gets worse.";
  const estP = estimateNarrationDuration(withPunct);
  // 7 words / 2.9 + 1 comma * 0.15 + 2 sentences * 0.25 = 2.41 + 0.15 + 0.50 = 3.06
  assert(estP > 2.5 && estP < 3.5, `Expected ~3.06, got ${estP}`);
});

Deno.test("bucketAwareRebalance converges for Sora", () => {
  // 3 scenes all at 4, target 16 → should bump one to 8 (total=16)
  const result = bucketAwareRebalance([4, 4, 4], 16, "sora");
  const total = result.reduce((s, d) => s + d, 0);
  // Should be close to 16 (within one bucket step = 4)
  assert(Math.abs(total - 16) < 4, `Total ${total} not close to 16`);
  // All values must be valid Sora buckets
  result.forEach(d => {
    assert([4, 8, 12].includes(d), `${d} is not a valid Sora bucket`);
  });
});

Deno.test("bucketAwareRebalance handles small delta without stalling", () => {
  // delta = 2, which is less than min bucket step (4) for Sora → should exit immediately
  const result = bucketAwareRebalance([4, 4, 4], 14, "sora");
  const total = result.reduce((s, d) => s + d, 0);
  // 12 is the current total, target 14, delta=2 < minStep=4 → no change
  assertEquals(total, 12);
});

Deno.test("bucketAwareRebalance decreases total", () => {
  // 3 scenes at 12, target 20 → should drop some to 8 or 4
  const result = bucketAwareRebalance([12, 12, 12], 20, "sora");
  const total = result.reduce((s, d) => s + d, 0);
  assert(Math.abs(total - 20) < 4, `Total ${total} not close to 20`);
  result.forEach(d => {
    assert([4, 8, 12].includes(d), `${d} is not a valid Sora bucket`);
  });
});

Deno.test("TIMING_LIGHT_ROLES contains expected roles", () => {
  assert(TIMING_LIGHT_ROLES.has("hook"));
  assert(TIMING_LIGHT_ROLES.has("reset"));
  assert(TIMING_LIGHT_ROLES.has("atmosphere"));
  assert(TIMING_LIGHT_ROLES.has("transition"));
  assert(!TIMING_LIGHT_ROLES.has("story_a"));
  assert(!TIMING_LIGHT_ROLES.has("cta"));
});

Deno.test("constants are correct", () => {
  assertEquals(MIN_CLIP_DURATION, 3);
  assertEquals(MAX_CLIP_DURATION, 12);
  assert(PROVIDER_BUCKETS.sora.length === 3);
  assert(PROVIDER_BUCKETS.runway.length === 3);
});
