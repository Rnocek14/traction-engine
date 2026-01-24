/**
 * Tests for the enrich-video-prompt edge function
 * Tests: basic enrichment, provider optimization, learned pattern injection
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

// Test 1: Basic enrichment without provider
Deno.test("enrich-video-prompt: basic enrichment works", async () => {
  const response = await callEnrich({
    prompt: "A cat sitting on a windowsill",
  });

  assertEquals(response.status, 200);
  const data = await response.json();
  
  assertExists(data.original);
  assertExists(data.enriched);
  assertEquals(data.original, "A cat sitting on a windowsill");
  
  // Enriched should be longer and more detailed
  assert(data.enriched.length > data.original.length, 
    "Enriched prompt should be longer than original");
  
  // Should not contain forbidden words
  const forbidden = ["animated", "3D render", "cartoon", "CGI", "illustration"];
  for (const word of forbidden) {
    assert(!data.enriched.toLowerCase().includes(word.toLowerCase()),
      `Enriched prompt should not contain "${word}"`);
  }
});

// Test 2: Provider-specific enrichment (Sora)
Deno.test("enrich-video-prompt: Sora optimization", async () => {
  const response = await callEnrich({
    prompt: "A person running through rain",
    provider: "sora",
  });

  assertEquals(response.status, 200);
  const data = await response.json();
  
  assertEquals(data.provider, "sora");
  assertExists(data.enriched);
  
  // Sora prompts tend to be more detailed and cinematic
  assert(data.enriched.length > 50, "Sora enriched prompt should be substantial");
});

// Test 3: Provider-specific enrichment (Runway)
Deno.test("enrich-video-prompt: Runway optimization", async () => {
  const response = await callEnrich({
    prompt: "Waves crashing on rocks",
    provider: "runway",
  });

  assertEquals(response.status, 200);
  const data = await response.json();
  
  assertEquals(data.provider, "runway");
  assertExists(data.enriched);
});

// Test 4: Provider-specific enrichment (Luma)
Deno.test("enrich-video-prompt: Luma optimization", async () => {
  const response = await callEnrich({
    prompt: "Smoke rising from incense",
    provider: "luma",
  });

  assertEquals(response.status, 200);
  const data = await response.json();
  
  assertEquals(data.provider, "luma");
  assertExists(data.enriched);
});

// Test 5: Style hints are incorporated
Deno.test("enrich-video-prompt: style hints are incorporated", async () => {
  const response = await callEnrich({
    prompt: "A city street at night",
    provider: "luma",
    style_hints: "noir, neon, moody, dramatic shadows",
  });

  assertEquals(response.status, 200);
  const data = await response.json();
  
  assertExists(data.enriched);
  
  // The enriched prompt should reflect the style hints
  const enrichedLower = data.enriched.toLowerCase();
  const hasNoir = enrichedLower.includes("noir") || enrichedLower.includes("dark") || enrichedLower.includes("shadow");
  const hasNeon = enrichedLower.includes("neon") || enrichedLower.includes("light");
  
  assert(hasNoir || hasNeon, 
    "Enriched prompt should incorporate style hints");
});

// Test 6: Empty prompt should fail
Deno.test("enrich-video-prompt: rejects empty prompt", async () => {
  const response = await callEnrich({
    prompt: "",
    provider: "luma",
  });

  assertEquals(response.status, 400);
  const data = await response.json();
  assertExists(data.error);
});

// Test 7: Whitespace-only prompt should fail
Deno.test("enrich-video-prompt: rejects whitespace-only prompt", async () => {
  const response = await callEnrich({
    prompt: "   \n\t  ",
    provider: "runway",
  });

  assertEquals(response.status, 400);
  const data = await response.json();
  assertExists(data.error);
});

// Test 8: Enrichment includes motion verbs
Deno.test("enrich-video-prompt: enrichment includes motion language", async () => {
  const response = await callEnrich({
    prompt: "A bird in flight",
    provider: "sora",
  });

  assertEquals(response.status, 200);
  const data = await response.json();
  
  const enrichedLower = data.enriched.toLowerCase();
  
  // Should contain motion-related words
  const motionWords = ["glide", "soar", "sweep", "drift", "flow", "move", "wing", "fly", "arc"];
  const hasMotion = motionWords.some(word => enrichedLower.includes(word));
  
  assert(hasMotion, 
    `Enriched prompt should contain motion language. Got: "${data.enriched}"`);
});

// Test 9: Response includes provider field
Deno.test("enrich-video-prompt: response includes provider when specified", async () => {
  const response = await callEnrich({
    prompt: "A simple scene",
    provider: "runway",
  });

  assertEquals(response.status, 200);
  const data = await response.json();
  
  assertEquals(data.provider, "runway");
});

// Test 10: Response has null provider when not specified
Deno.test("enrich-video-prompt: provider is null when not specified", async () => {
  const response = await callEnrich({
    prompt: "A simple scene",
  });

  assertEquals(response.status, 200);
  const data = await response.json();
  
  assertEquals(data.provider, null);
});
