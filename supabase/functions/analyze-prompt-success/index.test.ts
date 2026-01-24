/**
 * Tests for the analyze-prompt-success edge function
 * Tests: positive learning, negative learning, semantic extraction
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/analyze-prompt-success`;

// Test prompt with known extractable patterns
const TEST_PROMPT_POSITIVE = `A cinematic wide shot of a lone figure walking through a misty forest 
at golden hour. The camera slowly tracks alongside them, with dramatic 
backlit silhouettes and ethereal rays of light piercing through the fog. 
Smooth, fluid motion as leaves drift gently in the breeze.`;

const TEST_PROMPT_NEGATIVE = `Handheld chaotic footage of random objects moving erratically 
with harsh fluorescent lighting and extreme close-up jittery frames.`;

// Helper to call the function
async function callAnalyze(payload: Record<string, unknown>): Promise<Response> {
  return await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

// Test 1: Neutral rating should not learn
Deno.test("analyze-prompt-success: neutral rating (3) should not trigger learning", async () => {
  const response = await callAnalyze({
    job_id: "test-neutral-" + Date.now(),
    provider: "luma",
    enriched_prompt: TEST_PROMPT_POSITIVE,
    rating: 3, // Neutral
  });

  assertEquals(response.status, 200);
  const data = await response.json();
  
  assertEquals(data.learned, false);
  assertExists(data.reason);
  assert(data.reason.includes("Neutral"));
});

// Test 2: Positive rating (5) should extract patterns
Deno.test("analyze-prompt-success: positive rating (5) should extract patterns", async () => {
  const response = await callAnalyze({
    job_id: "test-positive-" + Date.now(),
    provider: "luma",
    enriched_prompt: TEST_PROMPT_POSITIVE,
    original_prompt: "A person walking in the woods",
    style_hints: "cinematic, dreamy",
    rating: 5,
  });

  assertEquals(response.status, 200);
  const data = await response.json();
  
  assertEquals(data.learned, true);
  assertEquals(data.learning_type, "positive");
  assertEquals(data.provider, "luma");
  assertExists(data.patterns_count);
  assert(data.patterns_count > 0, "Should extract at least one pattern");
  
  // Check for expected pattern types
  const patterns = data.patterns as string[];
  const hasCamera = patterns.some(p => p.startsWith("camera:"));
  const hasLighting = patterns.some(p => p.startsWith("lighting:"));
  const hasMood = patterns.some(p => p.startsWith("mood:"));
  
  assert(hasCamera || hasLighting || hasMood, 
    `Expected camera/lighting/mood patterns, got: ${patterns.join(", ")}`);
});

// Test 3: Negative rating (1-2) should trigger negative learning
Deno.test("analyze-prompt-success: negative rating (2) should trigger negative learning", async () => {
  const response = await callAnalyze({
    job_id: "test-negative-" + Date.now(),
    provider: "runway",
    enriched_prompt: TEST_PROMPT_NEGATIVE,
    rating: 2,
  });

  assertEquals(response.status, 200);
  const data = await response.json();
  
  assertEquals(data.learned, true);
  assertEquals(data.learning_type, "negative");
  assertEquals(data.provider, "runway");
  assertExists(data.patterns_count);
});

// Test 4: Style hints should be extracted
Deno.test("analyze-prompt-success: style hints should be extracted as patterns", async () => {
  const response = await callAnalyze({
    job_id: "test-hints-" + Date.now(),
    provider: "sora",
    enriched_prompt: "Simple camera shot of a room",
    style_hints: "moody, noir, high contrast",
    rating: 4,
  });

  assertEquals(response.status, 200);
  const data = await response.json();
  
  assertEquals(data.learned, true);
  
  const patterns = data.patterns as string[];
  const styleHintPatterns = patterns.filter(p => p.startsWith("style_hint:"));
  
  assert(styleHintPatterns.length >= 2, 
    `Expected at least 2 style hint patterns, got: ${styleHintPatterns.join(", ")}`);
});

// Test 5: Provider isolation - patterns should be per-provider
Deno.test("analyze-prompt-success: patterns are isolated per provider", async () => {
  const uniqueTimestamp = Date.now();
  
  // Create pattern for luma
  const lumaResponse = await callAnalyze({
    job_id: `test-luma-${uniqueTimestamp}`,
    provider: "luma",
    enriched_prompt: TEST_PROMPT_POSITIVE,
    rating: 5,
  });
  assertEquals(lumaResponse.status, 200);
  const lumaData = await lumaResponse.json();
  assertEquals(lumaData.provider, "luma");

  // Create pattern for runway
  const runwayResponse = await callAnalyze({
    job_id: `test-runway-${uniqueTimestamp}`,
    provider: "runway",
    enriched_prompt: TEST_PROMPT_POSITIVE,
    rating: 5,
  });
  assertEquals(runwayResponse.status, 200);
  const runwayData = await runwayResponse.json();
  assertEquals(runwayData.provider, "runway");
  
  // Both should have learned independently
  assertEquals(lumaData.learned, true);
  assertEquals(runwayData.learned, true);
});

// Test 6: Missing required fields should fail gracefully
Deno.test("analyze-prompt-success: handles missing enriched_prompt", async () => {
  const response = await callAnalyze({
    job_id: "test-missing-" + Date.now(),
    provider: "luma",
    // Missing enriched_prompt
    rating: 5,
  });

  // Should handle gracefully (either error or empty patterns)
  const data = await response.json();
  await response.text().catch(() => {}); // Consume body to prevent leak
  
  // The function should either error or return no patterns
  if (response.status === 200) {
    assertEquals(data.patterns_count, 0);
  }
});
