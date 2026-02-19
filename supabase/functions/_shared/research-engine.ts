/**
 * Research Engine v1.0
 * 
 * Provides real web-retrieval-backed research for factual content.
 * Uses Perplexity API for grounded search with citations.
 * 
 * Pipeline: detectIntent → generateQueries → fetchSources → extractClaims → buildBrief
 */

// ─── Types ──────────────────────────────────────────────────

export type ResearchMode = "auto" | "on" | "off";
export type RetrievalMethod = "web" | "provided_sources" | "none";
export type EvidenceLevel = "strong" | "moderate" | "mixed" | "insufficient";

export interface ResearchClaim {
  claim_id: string;
  statement: string;
  evidence_level: EvidenceLevel;
  source_url?: string;
  source_title?: string;
  do_not_say?: string[];
}

export interface ResearchSource {
  title: string;
  url: string;
  publisher?: string;
  excerpt?: string;
  retrieved_at: string;
}

export interface ResearchBrief {
  mode: ResearchMode;
  activated: boolean;
  grounded: boolean;
  retrieval: RetrievalMethod;
  failure_reason?: string;
  concept_intent: string;
  queries: string[];
  sources: ResearchSource[];
  claims: ResearchClaim[];
  angles: string[];
  do_not_say_global: string[];
}

// ─── Vertical-specific research prompts ─────────────────────

const VERTICAL_RESEARCH_GUIDANCE: Record<string, string> = {
  health: "Cite NIH ODS, USPSTF, CDC, WHO, major medical journals. Use hedged language: 'may', 'evidence suggests', 'research indicates'. NEVER say 'cures', 'guarantees', 'proven to prevent'. Include evidence levels.",
  finance: "Cite SEC, FINRA, Federal Reserve, major financial institutions. No ROI promises, no guaranteed returns. Use 'historically', 'past performance', 'may vary'.",
  news: "Cite primary sources only: AP, Reuters, official statements, court documents. Note if claims are unconfirmed. Distinguish fact from analysis.",
  education: "Cite peer-reviewed studies, educational institutions, government data. Be precise about sample sizes and methodology limitations.",
  entertainment: "Cite Wikipedia, academic papers, reputable journalism, Guinness records. Fun facts are OK but must be verifiable.",
  saas: "Cite industry reports (Gartner, Forrester), company filings, published benchmarks. Avoid unverifiable performance claims.",
  ecommerce: "Cite consumer reports, FDA (for products), published reviews. No fabricated testimonials.",
  lifestyle: "Cite published research, expert opinions, reputable publications. Distinguish trends from evidence-backed claims.",
};

// ─── Intent Detection ───────────────────────────────────────

const FACTUAL_PATTERNS = [
  /\b\d+\s*(things?|facts?|reasons?|mistakes?|ways?|tips?|secrets?|signs?|myths?|truths?|lies?)\b/i,
  /\b(did you know|you didn'?t know|most people don'?t|nobody tells you)\b/i,
  /\b(science behind|research shows?|studies? show|evidence|proven|debunk)\b/i,
  /\b(latest|new study|update|breaking|just released|2024|2025|2026)\b/i,
  /\b(horrific|terrifying|disturbing|shocking)\s*(facts?|things?|truths?)\b/i,
  /\b(medical|health|supplement|vitamin|drug|medication)\b/i,
  /\b(tech|technology|AI|artificial intelligence|software|app)\s*(update|news|release)\b/i,
  /\b(wasting|waste|don'?t work|useless|overrated|overhyped)\b/i,
  /\b(actually|really|truth about|reality of|honest)\b/i,
];

const NARRATIVE_PATTERNS = [
  /\b(story of|imagine|once upon|a character|fictional)\b/i,
  /\b(love story|adventure|quest|journey through|fantasy)\b/i,
  /\b(cinematic|dramatic scene|movie-style|trailer)\b/i,
];

const STRICT_VERTICALS = ["health", "finance", "news"];

export function detectResearchIntent(
  concept: string,
  vertical: string,
): { needs_research: boolean; intent: string; reason: string } {
  const conceptLower = concept.toLowerCase();

  // Check for explicit narrative patterns (skip research)
  const isNarrative = NARRATIVE_PATTERNS.some(p => p.test(conceptLower));
  if (isNarrative) {
    return { needs_research: false, intent: "narrative", reason: "Concept appears to be pure narrative/fiction" };
  }

  // Check factual patterns
  const matchedPatterns = FACTUAL_PATTERNS.filter(p => p.test(conceptLower));

  // Strict verticals lower the threshold
  const isStrict = STRICT_VERTICALS.includes(vertical);
  const threshold = isStrict ? 1 : 2;

  if (matchedPatterns.length >= threshold) {
    const intent = isStrict
      ? `factual_${vertical}`
      : matchedPatterns.length >= 3 ? "heavily_factual" : "factual_list";
    return {
      needs_research: true,
      intent,
      reason: `Matched ${matchedPatterns.length} factual pattern(s)${isStrict ? ` in strict vertical (${vertical})` : ""}`,
    };
  }

  // Strict verticals with any factual hint → research
  if (isStrict && matchedPatterns.length > 0) {
    return {
      needs_research: true,
      intent: `factual_${vertical}`,
      reason: `Strict vertical (${vertical}) with factual content detected`,
    };
  }

  return { needs_research: false, intent: "creative", reason: "No strong factual patterns detected" };
}

// ─── Research Brief Builder (Perplexity-backed) ─────────────

export async function buildResearchBrief(params: {
  concept: string;
  vertical: string;
  perplexityKey: string;
  mode: ResearchMode;
}): Promise<ResearchBrief> {
  const { concept, vertical, perplexityKey, mode } = params;

  // Detect intent
  const intent = detectResearchIntent(concept, vertical);
  const shouldActivate = mode === "on" || (mode === "auto" && intent.needs_research);

  if (!shouldActivate) {
    return {
      mode,
      activated: false,
      grounded: false,
      retrieval: "none",
      concept_intent: intent.intent,
      queries: [],
      sources: [],
      claims: [],
      angles: [],
      do_not_say_global: [],
    };
  }

  // If mode is "on" but no key → hard fail
  if (!perplexityKey) {
    if (mode === "on") {
      return {
        mode,
        activated: true,
        grounded: false,
        retrieval: "none",
        failure_reason: "Perplexity API key not configured. Cannot proceed with research_mode=on.",
        concept_intent: intent.intent,
        queries: [],
        sources: [],
        claims: [],
        angles: [],
        do_not_say_global: [],
      };
    }
    // auto mode with no key → degrade gracefully
    return {
      mode,
      activated: false,
      grounded: false,
      retrieval: "none",
      failure_reason: "No retrieval provider configured; skipping research.",
      concept_intent: intent.intent,
      queries: [],
      sources: [],
      claims: [],
      angles: [],
      do_not_say_global: [],
    };
  }

  // Build search query
  const verticalGuidance = VERTICAL_RESEARCH_GUIDANCE[vertical] || VERTICAL_RESEARCH_GUIDANCE.entertainment;

  const systemPrompt = `You are a research assistant that provides ONLY verified, source-backed information.

VERTICAL RULES: ${verticalGuidance}

Your job:
1. Research the given topic using real, verifiable sources
2. Extract 3-8 factual claims that can be safely used in short-form video content
3. For each claim, provide the evidence level and source
4. Provide 3 punchy "angles" (hook-ready story bullets) derived from the claims
5. List phrases that should NEVER be used (do_not_say)

CRITICAL: Every claim must be tied to a real source. Do NOT invent sources or statistics.

Respond in this exact JSON format:
{
  "claims": [
    {
      "claim_id": "claim_001",
      "statement": "Safe, hedged phrasing of the claim",
      "evidence_level": "strong|moderate|mixed|insufficient",
      "source_title": "Name of source document/page",
      "do_not_say": ["absolute phrases to avoid for this claim"]
    }
  ],
  "angles": [
    "Hook-ready angle 1 (punchy, under 15 words)",
    "Hook-ready angle 2",
    "Hook-ready angle 3"
  ],
  "do_not_say_global": ["cures", "guaranteed", "proven to", "will fix", "100%"]
}`;

  try {
    console.log(`[research-engine] Querying Perplexity for: "${concept.slice(0, 80)}..."`);

    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${perplexityKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Research this topic for a short-form video: "${concept}"\n\nVertical: ${vertical}\nProvide verified claims with sources.` },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[research-engine] Perplexity API error ${response.status}: ${errText}`);
      if (mode === "on") {
        return {
          mode,
          activated: true,
          grounded: false,
          retrieval: "none",
          failure_reason: `Perplexity API error: ${response.status}`,
          concept_intent: intent.intent,
          queries: [concept],
          sources: [],
          claims: [],
          angles: [],
          do_not_say_global: [],
        };
      }
      // auto mode → degrade
      return {
        mode,
        activated: false,
        grounded: false,
        retrieval: "none",
        failure_reason: `Retrieval failed (${response.status}); degraded to creative mode.`,
        concept_intent: intent.intent,
        queries: [concept],
        sources: [],
        claims: [],
        angles: [],
        do_not_say_global: [],
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const citations: string[] = data.citations || [];

    // Parse the structured response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    let parsed: {
      claims?: Array<{
        claim_id?: string;
        statement: string;
        evidence_level?: string;
        source_title?: string;
        do_not_say?: string[];
      }>;
      angles?: string[];
      do_not_say_global?: string[];
    } = { claims: [], angles: [], do_not_say_global: [] };

    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        console.warn("[research-engine] Failed to parse JSON from Perplexity response, extracting manually");
      }
    }

    // Build sources from Perplexity citations
    const sources: ResearchSource[] = citations.map((url, i) => ({
      title: `Source ${i + 1}`,
      url,
      retrieved_at: new Date().toISOString(),
    }));

    // Map claims with source URLs from citations
    const claims: ResearchClaim[] = (parsed.claims || []).map((c, i) => ({
      claim_id: c.claim_id || `claim_${String(i + 1).padStart(3, "0")}`,
      statement: c.statement,
      evidence_level: (c.evidence_level as EvidenceLevel) || "moderate",
      source_url: citations[i] || undefined,
      source_title: c.source_title,
      do_not_say: c.do_not_say,
    }));

    const brief: ResearchBrief = {
      mode,
      activated: true,
      grounded: sources.length > 0,
      retrieval: "web",
      concept_intent: intent.intent,
      queries: [concept],
      sources,
      claims,
      angles: parsed.angles || [],
      do_not_say_global: parsed.do_not_say_global || [],
    };

    console.log(`[research-engine] ✓ Brief built: ${claims.length} claims, ${sources.length} sources, grounded=${brief.grounded}`);
    return brief;

  } catch (err) {
    console.error("[research-engine] Unexpected error:", err);
    const errorMsg = err instanceof Error ? err.message : "Unknown error";

    if (mode === "on") {
      return {
        mode,
        activated: true,
        grounded: false,
        retrieval: "none",
        failure_reason: `Research failed: ${errorMsg}`,
        concept_intent: intent.intent,
        queries: [concept],
        sources: [],
        claims: [],
        angles: [],
        do_not_say_global: [],
      };
    }

    return {
      mode,
      activated: false,
      grounded: false,
      retrieval: "none",
      failure_reason: `Research failed: ${errorMsg}; degraded to creative mode.`,
      concept_intent: intent.intent,
      queries: [concept],
      sources: [],
      claims: [],
      angles: [],
      do_not_say_global: [],
    };
  }
}

// ─── Claim Constraint Block (for GPT beat generation prompt) ─

export function buildClaimConstraintBlock(brief: ResearchBrief, vertical: string): string {
  if (!brief.activated || !brief.grounded || brief.claims.length === 0) {
    return "";
  }

  const isStrict = STRICT_VERTICALS.includes(vertical);

  const claimsBlock = brief.claims.map((c, i) =>
    `- Claim ${i + 1} (${c.claim_id}): "${c.statement}"${c.source_title ? ` [source: ${c.source_title}]` : ""}${c.evidence_level ? ` [evidence: ${c.evidence_level}]` : ""}`
  ).join("\n");

  const doNotSay = [
    ...brief.do_not_say_global,
    ...brief.claims.flatMap(c => c.do_not_say || []),
  ];
  const uniqueDoNotSay = [...new Set(doNotSay)];

  return `
═══════════════════════════════════════════════════════════════
RESEARCH CONSTRAINTS (MANDATORY — DO NOT IGNORE)
═══════════════════════════════════════════════════════════════

You have these VERIFIED claims to work with:
${claimsBlock}

Story angles (use as beat inspiration):
${brief.angles.map((a, i) => `${i + 1}. ${a}`).join("\n")}

RULES:
${isStrict ? "- Each beat's narration_line and text_overlay MUST reference one of the claims above (output claim_ids per beat)" : "- Prefer referencing claims above for factual statements"}
- Do NOT invent statistics, percentages, or study results not listed above
- Use hedged language: "may", "evidence suggests", "research indicates"
- DO NOT SAY: ${uniqueDoNotSay.map(s => `"${s}"`).join(", ")}
${isStrict ? "- If a beat has no claims, it must be a pure transition/hook framing beat (no factual assertions)" : ""}
- Visual prompts should ILLUSTRATE the claim, not ASSERT new facts

For each beat, also output:
- claim_ids: string[] (which claims this beat references, e.g. ["claim_001"])

═══════════════════════════════════════════════════════════════
`;
}

// ─── Claim Coverage Preflight ───────────────────────────────

export interface ClaimCoveragePreflight {
  total_beats: number;
  beats_with_claims: number;
  coverage_pct: number;
  unreferenced_claim_ids: string[];
  warnings: string[];
  errors: string[];
}

export function checkClaimCoverage(
  beats: Array<{ claim_ids?: string[] }>,
  brief: ResearchBrief,
  vertical: string,
): ClaimCoveragePreflight {
  const isStrict = STRICT_VERTICALS.includes(vertical);
  const allClaimIds = new Set(brief.claims.map(c => c.claim_id));
  const referencedClaimIds = new Set<string>();
  let beatsWithClaims = 0;

  for (const beat of beats) {
    if (beat.claim_ids && beat.claim_ids.length > 0) {
      beatsWithClaims++;
      for (const id of beat.claim_ids) {
        referencedClaimIds.add(id);
      }
    }
  }

  const unreferenced = [...allClaimIds].filter(id => !referencedClaimIds.has(id));
  const coveragePct = beats.length > 0 ? Math.round((beatsWithClaims / beats.length) * 100) : 0;

  const warnings: string[] = [];
  const errors: string[] = [];

  if (unreferenced.length > 0) {
    warnings.push(`${unreferenced.length} claim(s) not referenced by any beat: ${unreferenced.join(", ")}`);
  }

  if (isStrict && coveragePct < 50) {
    errors.push(`Strict vertical requires ≥50% of beats to reference claims; got ${coveragePct}%`);
  } else if (coveragePct < 30) {
    warnings.push(`Low claim coverage: only ${coveragePct}% of beats reference claims`);
  }

  return {
    total_beats: beats.length,
    beats_with_claims: beatsWithClaims,
    coverage_pct: coveragePct,
    unreferenced_claim_ids: unreferenced,
    warnings,
    errors,
  };
}
