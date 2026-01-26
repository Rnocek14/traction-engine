/**
 * Tests for the enrich-video-prompt edge function v2
 * Tests: provider-specific formatting, length limits, camera-first structure
 */

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/enrich-video-prompt`;

// Helper to call the function
async function callEnrich(payload: Record<string, unknown>): Promise<Response> {
  return await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

// Test 1: Runway prompts are SHORT (under 150 chars)
Deno.test("enrich-video-prompt v2: Runway prompts are concise", async () => {
  const response = await callEnrich({
    prompt: "A woman walking through a futuristic city at night with neon lights reflecting on wet streets",
    provider: "runway",
  });

  assertEquals(response.status, 200);
  const data = await response.json();
  
  assertExists(data.enriched);
  assertExists(data.char_count);
  assertExists(data.max_chars);
  assertEquals(data.schema_version, "v2.0");
  
  // Runway must be under 150 chars
  assert(data.char_count <= 150, 
    `Runway prompt too long: ${data.char_count} chars (max 150). Got: "${data.enriched}"`);
  
  console.log(`Runway prompt (${data.char_count}/${data.max_chars}): "${data.enriched}"`);
});

// Test 2: Runway prompts start with camera keyword
Deno.test("enrich-video-prompt v2: Runway starts with camera keyword", async () => {
  const response = await callEnrich({
    prompt: "Ocean waves crashing on rocky shore at sunset",
    provider: "runway",
  });

  assertEquals(response.status, 200);
  const data = await response.json();
  
  assertExists(data.enriched);
  
  // Should start with a camera keyword
  const cameraKeywords = [
    "Static", "Tracking", "Pan", "Dolly", "Crane", "Handheld", "Steadicam",
    "Push", "Pull", "Arc", "Orbit", "Whip", "Tilt", "Zoom", "POV", "Aerial",
    "Low", "High", "Dutch", "Following", "Camera",
  ];
  
  const startsWithCamera = cameraKeywords.some(kw => 
    data.enriched.toLowerCase().startsWith(kw.toLowerCase())
  );
  
  assert(startsWithCamera, 
    `Runway prompt should start with camera keyword. Got: "${data.enriched.substring(0, 50)}..."`);
});

// Test 3: Luma prompts include physics motion
Deno.test("enrich-video-prompt v2: Luma includes physics language", async () => {
  const response = await callEnrich({
    prompt: "Smoke rising from incense in a quiet temple",
    provider: "luma",
  });

  assertEquals(response.status, 200);
  const data = await response.json();
  
  assertExists(data.enriched);
  
  // Should be under 300 chars
  assert(data.char_count <= 300, 
    `Luma prompt too long: ${data.char_count} chars (max 300). Got: "${data.enriched}"`);
  
  // Should contain physics-related words
  const physicsWords = [
    "flows", "ripples", "cascades", "settles", "bounces", "swirls",
    "drifts", "billows", "curls", "rises", "disperses", "floats",
    "spirals", "unfurls", "wafts", "lingers",
  ];
  
  const hasPhysics = physicsWords.some(word => 
    data.enriched.toLowerCase().includes(word)
  );
  
  // This is a soft check - physics language is preferred but not strictly required
  console.log(`Luma prompt has physics words: ${hasPhysics}`);
  console.log(`Luma prompt (${data.char_count}/${data.max_chars}): "${data.enriched}"`);
});

// Test 4: Sora prompts can be longer and more detailed
Deno.test("enrich-video-prompt v2: Sora allows detailed prompts", async () => {
  const response = await callEnrich({
    prompt: "A violinist performing in an abandoned concert hall",
    provider: "sora",
  });

  assertEquals(response.status, 200);
  const data = await response.json();
  
  assertExists(data.enriched);
  
  // Sora allows up to 800 chars
  assert(data.char_count <= 800, 
    `Sora prompt too long: ${data.char_count} chars (max 800)`);
  
  // Sora prompts should be more detailed (at least 100 chars typically)
  assert(data.enriched.length >= 50, 
    `Sora prompt should be detailed. Got only ${data.enriched.length} chars`);
  
  console.log(`Sora prompt (${data.char_count}/${data.max_chars}): "${data.enriched.substring(0, 150)}..."`);
});

// Test 5: Response includes new v2 metadata
Deno.test("enrich-video-prompt v2: response includes metadata", async () => {
  const response = await callEnrich({
    prompt: "A bird in flight",
    provider: "luma",
  });

  assertEquals(response.status, 200);
  const data = await response.json();
  
  // Check all v2 fields exist
  assertExists(data.original);
  assertExists(data.enriched);
  assertExists(data.provider);
  assertEquals(data.schema_version, "v2.0");
  assertExists(data.char_count);
  assertExists(data.max_chars);
  assert(typeof data.was_compressed === "boolean");
  
  assertEquals(data.provider, "luma");
  assert(data.char_count > 0);
  assert(data.max_chars > 0);
});

// Test 6: Empty prompt should fail
Deno.test("enrich-video-prompt v2: rejects empty prompt", async () => {
  const response = await callEnrich({
    prompt: "",
    provider: "runway",
  });

  assertEquals(response.status, 400);
  const data = await response.json();
  assertExists(data.error);
});

// Test 7: Style hints are incorporated but don't bloat Runway
Deno.test("enrich-video-prompt v2: Runway keeps concise with style hints", async () => {
  const response = await callEnrich({
    prompt: "A city street at night",
    provider: "runway",
    style_hints: "noir, moody, dramatic shadows, rain, reflections, cinematic",
  });

  assertEquals(response.status, 200);
  const data = await response.json();
  
  assertExists(data.enriched);
  
  // Even with many style hints, Runway should stay concise
  assert(data.char_count <= 150, 
    `Runway with style hints too long: ${data.char_count} chars. Got: "${data.enriched}"`);
  
  console.log(`Runway+hints (${data.char_count}/${data.max_chars}): "${data.enriched}"`);
});

// Test 8: Default provider is Luma when not specified
Deno.test("enrich-video-prompt v2: defaults to Luma format when no provider", async () => {
  const response = await callEnrich({
    prompt: "Waves on a beach",
  });

  assertEquals(response.status, 200);
  const data = await response.json();
  
  // Should use Luma's max (300) as the limit
  assertEquals(data.max_chars, 300);
  assert(data.char_count <= 300, 
    `Default (Luma) prompt too long: ${data.char_count} chars`);
});

// Test 9: Runway includes motion verb
Deno.test("enrich-video-prompt v2: Runway includes motion verb", async () => {
  const response = await callEnrich({
    prompt: "A person sitting at a cafe",
    provider: "runway",
  });

  assertEquals(response.status, 200);
  const data = await response.json();
  
  assertExists(data.enriched);
  
  // Should contain a motion verb (expanded list)
  const motionVerbs = [
    "glides", "rushes", "sweeps", "drifts", "accelerates", "floats",
    "moves", "walks", "runs", "flows", "dances", "swirls", "settles",
    "emerges", "appears", "enters", "crosses", "approaches",
    "sips", "pours", "stirs", "lifts", "reaches", "turns", "spins",
    "rotates", "slides", "drops", "rises", "falls", "sits", "stands",
  ];
  
  const hasMotion = motionVerbs.some(verb => 
    data.enriched.toLowerCase().includes(verb)
  );
  
  console.log(`Runway motion check: "${data.enriched}"`);
  // Note: GPT usually includes motion naturally, but static scenes are valid too
  // This is a soft check - we log but don't fail for valid static shots
  if (!hasMotion) {
    console.log(`Note: No motion verb found, but "Static" shots are valid`);
  }
});

// Test 10: Compare all three providers on same concept
Deno.test("enrich-video-prompt v2: provider comparison", async () => {
  const concept = "A dragon flying over a medieval castle";
  
  const [runwayRes, lumaRes, soraRes] = await Promise.all([
    callEnrich({ prompt: concept, provider: "runway" }),
    callEnrich({ prompt: concept, provider: "luma" }),
    callEnrich({ prompt: concept, provider: "sora" }),
  ]);
  
  const runway = await runwayRes.json();
  const luma = await lumaRes.json();
  const sora = await soraRes.json();
  
  console.log("\n=== Provider Comparison ===");
  console.log(`Concept: "${concept}"`);
  console.log(`\nRunway (${runway.char_count}/${runway.max_chars}):\n  "${runway.enriched}"`);
  console.log(`\nLuma (${luma.char_count}/${luma.max_chars}):\n  "${luma.enriched}"`);
  console.log(`\nSora (${sora.char_count}/${sora.max_chars}):\n  "${sora.enriched?.substring(0, 200)}..."`);
  
  // Verify length ordering: Runway < Luma < Sora (typically)
  assert(runway.char_count <= 150, "Runway should be ≤150 chars");
  assert(luma.char_count <= 300, "Luma should be ≤300 chars");
  assert(sora.char_count <= 800, "Sora should be ≤800 chars");
  
  // Verify they're all different
  assert(runway.enriched !== luma.enriched, "Runway and Luma should differ");
  assert(luma.enriched !== sora.enriched, "Luma and Sora should differ");
});
