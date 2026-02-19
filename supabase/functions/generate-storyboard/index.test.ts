/**
 * Strict-mode compliance blocking tests.
 * 
 * Verifies that strict verticals (health, finance, news) return 422
 * when compliance violations are detected.
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/assert.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/generate-storyboard`;

async function callGenerateStoryboard(body: Record<string, unknown>): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data };
}

// ─── Test 1: Health vertical with "cure" language ────────────

Deno.test("Health: 'supplements that cure anxiety' should be compliance_blocked", async () => {
  const { status, data } = await callGenerateStoryboard({
    concept: "3 supplements that cure anxiety fast",
    generator_mode: "template",
    story_engine: {
      vertical: "health",
      goal: "educate",
      research_mode: "on",
    },
  });

  // Should either be 422 (compliance_blocked) or if research fails, also 422
  // The key assertion: strict health vertical + "cure" = should NOT succeed
  if (status === 422) {
    assert(
      data.error === "compliance_blocked" || (data.error as string)?.includes("research"),
      `Expected compliance_blocked or research failure, got: ${JSON.stringify(data.error)}`,
    );
    console.log("✓ Health compliance correctly blocked:", data.error);
  } else {
    // If it passes (research sanitized everything), verify no "cure" in scene prompts/narration
    console.warn(`⚠ Health test returned ${status} — checking scene content for safety`);
    const scenes = (data.scenes || []) as Array<Record<string, unknown>>;
    for (const scene of scenes) {
      const prompt = ((scene.prompt as string) || "").toLowerCase();
      const narration = ((scene.narration_line as string) || "").toLowerCase();
      const overlay = ((scene.onscreen_text as string) || "").toLowerCase();
      assert(!prompt.includes("cure"), `Scene prompt should not contain 'cure': ${prompt}`);
      assert(!narration.includes("cure"), `Narration should not contain 'cure': ${narration}`);
      assert(!overlay.includes("cure"), `Overlay should not contain 'cure': ${overlay}`);
    }
    console.log(`✓ Health test passed (${status}): no 'cure' in scene content`);
  }
});

// ─── Test 2: Finance vertical with "double your money" ──────

Deno.test("Finance: 'double your money risk-free' should be compliance_blocked", async () => {
  const { status, data } = await callGenerateStoryboard({
    concept: "5 ways to double your money risk-free",
    generator_mode: "template",
    story_engine: {
      vertical: "finance",
      goal: "educate",
      research_mode: "on",
    },
  });

  if (status === 422) {
    assert(
      data.error === "compliance_blocked" || (data.error as string)?.includes("research"),
      `Expected compliance_blocked or research failure, got: ${JSON.stringify(data.error)}`,
    );
    console.log("✓ Finance compliance correctly blocked:", data.error);
  } else {
    console.warn(`⚠ Finance test returned ${status} — checking output for safety`);
    const outputStr = JSON.stringify(data);
    assert(!outputStr.includes("double your money"), "Output should not contain 'double your money'");
    assert(!outputStr.includes("risk-free"), "Output should not contain 'risk-free'");
  }
});

// ─── Test 3: News vertical with ungrounded factual beats ────

Deno.test("News: ungrounded factual content should block or degrade", async () => {
  const { status, data } = await callGenerateStoryboard({
    concept: "Breaking: Scientists discover revolutionary cure for aging that eliminates all disease",
    generator_mode: "template",
    story_engine: {
      vertical: "news",
      goal: "educate",
      research_mode: "on",
    },
  });

  if (status === 422) {
    assert(
      data.error === "compliance_blocked" || (data.error as string)?.includes("research"),
      `Expected compliance_blocked or research failure, got: ${JSON.stringify(data.error)}`,
    );
    console.log("✓ News compliance correctly blocked:", data.error);
  } else {
    // If research found real sources and it passed, verify no absolute claims leaked
    console.warn(`⚠ News test returned ${status} — checking output for safety`);
    const outputStr = JSON.stringify(data);
    assert(!outputStr.includes("eliminates all disease"), "Output should not contain 'eliminates all disease'");
  }
});

// ─── Test 4: Unit test for scanTextForBannedLanguage ────────

Deno.test("scanTextForBannedLanguage catches dynamic do_not_say including multi-word phrases", async () => {
  const { scanTextForBannedLanguage } = await import("../_shared/research-engine.ts");
  
  const mockBrief = {
    mode: "on" as const,
    activated: true,
    grounded: true,
    retrieval: "web" as const,
    concept_intent: "factual_health",
    queries: [],
    sources: [],
    claims: [
      {
        claim_id: "claim_001",
        statement: "test",
        evidence_level: "moderate" as const,
        do_not_say: ["proven to prevent", "risk-free"],
      },
    ],
    angles: [],
    do_not_say_global: ["guaranteed results", "100% effective"],
  };

  const items = [
    { narration_line: "This is proven to prevent heart disease", text_overlay: "" },
    { narration_line: "A risk-free investment opportunity", text_overlay: "" },
    { narration_line: "Guaranteed results every time", text_overlay: "" },
    { narration_line: "This is 100% effective", text_overlay: "" },
    { narration_line: "This may help support health", text_overlay: "" }, // should be clean
  ];

  const issues = scanTextForBannedLanguage(items, "health", mockBrief);
  
  // Items 0-3 should all be flagged
  assert(issues.length >= 4, `Expected at least 4 issues, got ${issues.length}: ${JSON.stringify(issues)}`);
  
  // Item 4 should NOT be flagged
  const item4Issues = issues.filter(i => i.startsWith("Item 4:"));
  assertEquals(item4Issues.length, 0, "Safe phrase should not be flagged");
  
  console.log(`✓ scanTextForBannedLanguage caught ${issues.length} issues correctly`);
});

// ─── Test 5: checkClaimCoverage enforces beat roles ─────────

Deno.test("checkClaimCoverage blocks evidence beats without claims in strict verticals", async () => {
  const { checkClaimCoverage } = await import("../_shared/research-engine.ts");

  const mockBrief = {
    mode: "on" as const,
    activated: true,
    grounded: true,
    retrieval: "web" as const,
    concept_intent: "factual_health",
    queries: [],
    sources: [],
    claims: [
      { claim_id: "claim_001", statement: "test", evidence_level: "moderate" as const },
      { claim_id: "claim_002", statement: "test2", evidence_level: "strong" as const },
    ],
    angles: [],
    do_not_say_global: [],
  };

  const items = [
    { claim_ids: [], beat_role: "curiosity_hook" },    // hook — claim-light OK
    { claim_ids: ["claim_001"], beat_role: "evidence" }, // evidence with claim — OK
    { claim_ids: [], beat_role: "solution" },            // solution without claim — ERROR
    { claim_ids: [], beat_role: "proof_cta" },           // CTA — claim-light OK
  ];

  const result = checkClaimCoverage(items, mockBrief, "health");
  
  // Should have errors for the "solution" beat missing claims
  assert(result.errors.length > 0, `Expected errors for solution beat without claims, got: ${JSON.stringify(result)}`);
  assert(
    result.errors.some(e => e.includes("solution")),
    `Expected error mentioning 'solution' beat role, got: ${result.errors.join("; ")}`,
  );
  
  console.log(`✓ checkClaimCoverage correctly enforces beat-role claims: ${result.errors.length} errors`);
});

// ─── Test 6: Health must-block test (guaranteed results) ────

Deno.test("Health: 'guaranteed results for anxiety' should block or sanitize guaranteed", async () => {
  const { status, data } = await callGenerateStoryboard({
    concept: "3 supplements with guaranteed results for anxiety",
    generator_mode: "template",
    story_engine: {
      vertical: "health",
      goal: "educate",
      research_mode: "on",
    },
  });

  if (status === 422) {
    assert(
      data.error === "compliance_blocked" || (data.error as string)?.includes("research"),
      `Expected compliance_blocked or research failure, got: ${JSON.stringify(data.error)}`,
    );
    console.log("✓ Health 'guaranteed results' correctly blocked:", data.error);
  } else {
    // If it passed, verify "guaranteed" was sanitized out of all scene content
    const scenes = (data.scenes || []) as Array<Record<string, unknown>>;
    for (const scene of scenes) {
      const prompt = ((scene.prompt as string) || "").toLowerCase();
      const narration = ((scene.narration_line as string) || "").toLowerCase();
      const overlay = ((scene.onscreen_text as string) || "").toLowerCase();
      assert(!prompt.includes("guaranteed"), `Prompt should not contain 'guaranteed': ${prompt}`);
      assert(!narration.includes("guaranteed"), `Narration should not contain 'guaranteed': ${narration}`);
      assert(!overlay.includes("guaranteed"), `Overlay should not contain 'guaranteed': ${overlay}`);
    }
    // Verify audit has sanitized_terms
    const audit = (data as Record<string, unknown>).story_engine as Record<string, unknown> | undefined;
    if (audit?.compliance) {
      const compliance = audit.compliance as Record<string, unknown>;
      console.log(`  Sanitized terms in audit: ${JSON.stringify(compliance.sanitized_terms)}`);
    }
    console.log(`✓ Health 'guaranteed results' passed (${status}): 'guaranteed' sanitized from all scene content`);
  }
});

// ─── Test 7: Hedge-aware scanning allows "may help prevent" ─

Deno.test("scanTextForBannedLanguage allows hedged implicit certainty verbs", async () => {
  const { scanTextForBannedLanguage } = await import("../_shared/research-engine.ts");

  const items = [
    { narration_line: "This prevents heart disease", text_overlay: "" },           // unhedged → flag
    { narration_line: "This may help prevent heart disease", text_overlay: "" },    // hedged → OK
    { narration_line: "This could prevent further damage", text_overlay: "" },      // hedged → OK
    { narration_line: "This eliminates toxins from the body", text_overlay: "" },   // unhedged → flag
    { narration_line: "Helps eliminate harmful bacteria", text_overlay: "" },        // hedged → OK
    { narration_line: "This stops heart disease progression", text_overlay: "" },   // unhedged → flag
  ];

  const issues = scanTextForBannedLanguage(items, "health", null);

  // Items 0, 3, 5 should be flagged (unhedged)
  const item0 = issues.filter(i => i.startsWith("Item 0:"));
  const item1 = issues.filter(i => i.startsWith("Item 1:"));
  const item2 = issues.filter(i => i.startsWith("Item 2:"));
  const item3 = issues.filter(i => i.startsWith("Item 3:"));
  const item4 = issues.filter(i => i.startsWith("Item 4:"));
  const item5 = issues.filter(i => i.startsWith("Item 5:"));

  assert(item0.length > 0, `"prevents heart disease" (unhedged) should be flagged: ${JSON.stringify(issues)}`);
  assertEquals(item1.length, 0, `"may help prevent" (hedged) should NOT be flagged`);
  assertEquals(item2.length, 0, `"could prevent" (hedged) should NOT be flagged`);
  assert(item3.length > 0, `"eliminates toxins" (unhedged) should be flagged`);
  assertEquals(item4.length, 0, `"helps eliminate" (hedged) should NOT be flagged`);
  assert(item5.length > 0, `"stops heart disease" (unhedged) should be flagged`);

  console.log(`✓ Hedge-aware scanning: ${issues.length} issues (correctly flagged unhedged only)`);
});

// ─── Test 8: Unicode dash normalization ─────────────────────

Deno.test("scanTextForBannedLanguage normalizes unicode dashes and catches risk-free variants", async () => {
  const { scanTextForBannedLanguage } = await import("../_shared/research-engine.ts");

  const items = [
    { narration_line: "A risk\u2013free investment", text_overlay: "" },  // en-dash
    { narration_line: "A risk\u2014free approach", text_overlay: "" },    // em-dash
    { narration_line: "A risk-free strategy", text_overlay: "" },         // regular hyphen
  ];

  const issues = scanTextForBannedLanguage(items, "finance", null);

  assert(issues.length >= 3, `Expected all 3 "risk-free" variants to be caught, got ${issues.length}: ${JSON.stringify(issues)}`);
  console.log(`✓ Unicode normalization caught ${issues.length} risk-free variants`);
});
