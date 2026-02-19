/**
 * Research Engine v1.1
 * 
 * Provides real web-retrieval-backed research for factual content.
 * Uses Perplexity API for grounded search with citations.
 * 
 * Pipeline: detectIntent → generateQueries → fetchSources → extractClaims → buildBrief
 * 
 * v1.1 changes:
 * - Per-claim source_url from model (not positional citation mapping)
 * - AbortController timeout on Perplexity fetch
 * - perplexityKey always read from env (never accepted from caller)
 * - Param renamed to `items` in checkClaimCoverage
 * - validateClaimIds() for strict enforcement
 * - narration/overlay scanning via scanTextForBannedLanguage()
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
  supporting_excerpt?: string;
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

export interface ResearchIntentResult {
  needs_research: boolean;
  intent: string;
  reason: string;
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
  // Finance/money patterns — catch even in non-finance verticals
  /\b(finance|financial|money|debt|invest|stock|credit|loan|mortgage|budget|savings?|retirement|wealth)\b/i,
  // Factual framing patterns — "scary facts", "truths about X"
  /\b(scary|insane|crazy|wild|unbelievable|mind.?blowing)\s*(facts?|things?|truths?|stats?)\b/i,
  // Explicit factual-intent phrasing
  /\b(facts?\s+about|truths?\s+about|things?\s+about|what\s+you\s+need\s+to\s+know)\b/i,
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
): ResearchIntentResult {
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

const PERPLEXITY_TIMEOUT_MS = 25_000;

export async function buildResearchBrief(params: {
  concept: string;
  vertical: string;
  mode: ResearchMode;
}): Promise<ResearchBrief> {
  const { concept, vertical, mode } = params;
  // SECURITY: Always read key from server env, never accept from caller
  const perplexityKey = Deno.env.get("PERPLEXITY_API_KEY") || "";

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
3. For each claim, provide the evidence level, source URL, source title, and a short supporting excerpt (≤25 words)
4. Provide 3 punchy "angles" (hook-ready story bullets) derived from the claims
5. List phrases that should NEVER be used (do_not_say)

CRITICAL: Every claim must be tied to a real source. Do NOT invent sources or statistics.
CRITICAL: Each claim MUST include its own source_url and source_title — do NOT rely on positional mapping.

Respond in this exact JSON format:
{
  "claims": [
    {
      "claim_id": "claim_001",
      "statement": "Safe, hedged phrasing of the claim",
      "evidence_level": "strong|moderate|mixed|insufficient",
      "source_title": "Name of source document/page",
      "source_url": "https://actual-source-url.com/page",
      "supporting_excerpt": "Short quote or paraphrase (≤25 words)",
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PERPLEXITY_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${perplexityKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "sonar",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Research this topic for a short-form video: "${concept}"\n\nVertical: ${vertical}\nProvide verified claims with per-claim source URLs.` },
          ],
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[research-engine] Perplexity API error ${response.status}: ${errText.slice(0, 200)}`);
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
        source_url?: string;
        supporting_excerpt?: string;
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

    // Build sources from Perplexity top-level citations (global list)
    const sources: ResearchSource[] = citations.map((url, i) => ({
      title: `Source ${i + 1}`,
      url,
      retrieved_at: new Date().toISOString(),
    }));

    // Map claims — prefer per-claim source_url from model, fallback to global citations
    const claims: ResearchClaim[] = (parsed.claims || []).map((c, i) => ({
      claim_id: c.claim_id || `claim_${String(i + 1).padStart(3, "0")}`,
      statement: c.statement,
      evidence_level: (c.evidence_level as EvidenceLevel) || "moderate",
      source_url: c.source_url || citations[i] || undefined,
      source_title: c.source_title,
      supporting_excerpt: c.supporting_excerpt,
      do_not_say: c.do_not_say,
    }));

    const brief: ResearchBrief = {
      mode,
      activated: true,
      grounded: sources.length > 0 || claims.some(c => !!c.source_url),
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
    const isTimeout = err instanceof DOMException && err.name === "AbortError";
    const errorMsg = isTimeout ? "Perplexity request timed out" : (err instanceof Error ? err.message : "Unknown error");
    console.error(`[research-engine] ${isTimeout ? "Timeout" : "Unexpected error"}:`, errorMsg);

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
    `- Claim ${i + 1} (${c.claim_id}): "${c.statement}"${c.source_title ? ` [source: ${c.source_title}]` : ""}${c.evidence_level ? ` [evidence: ${c.evidence_level}]` : ""}${c.supporting_excerpt ? ` [excerpt: "${c.supporting_excerpt}"]` : ""}`
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

// ─── Claim ID Validator (post-GPT parse boundary) ───────────

export interface ClaimIdValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate claim_ids returned by GPT against the actual research brief.
 * Call this immediately after parsing GPT's scene JSON.
 */
export function validateClaimIds(
  items: Array<{ claim_ids?: string[]; narration_line?: string; text_overlay?: string }>,
  brief: ResearchBrief,
  vertical: string,
): ClaimIdValidation {
  const isStrict = STRICT_VERTICALS.includes(vertical);
  const validIds = new Set(brief.claims.map(c => c.claim_id));
  const errors: string[] = [];
  const warnings: string[] = [];

  // Patterns that indicate factual assertions (numbers, percentages, study references)
  const FACTUAL_LANGUAGE = /\b(\d+%|\d+ out of|\d+ in \d+|studies? show|research (shows?|indicates?|suggests?)|according to|experts? say|proven|clinically)\b/i;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const ids = item.claim_ids || [];

    // Ensure claim_ids is array of strings
    if (!Array.isArray(ids)) {
      errors.push(`Item ${i}: claim_ids is not an array`);
      continue;
    }

    // Check each id is valid
    for (const id of ids) {
      if (typeof id !== "string") {
        errors.push(`Item ${i}: claim_id "${id}" is not a string`);
      } else if (!validIds.has(id)) {
        errors.push(`Item ${i}: claim_id "${id}" not found in research brief`);
      }
    }

    // Strict vertical: if narration/overlay has factual language, require claim_ids
    if (isStrict && ids.length === 0) {
      const narration = item.narration_line || "";
      const overlay = item.text_overlay || "";
      if (FACTUAL_LANGUAGE.test(narration) || FACTUAL_LANGUAGE.test(overlay)) {
        errors.push(`Item ${i}: strict vertical requires claim_ids for factual content — found factual language in narration/overlay`);
      }
    }
  }

  if (errors.length > 0 && !isStrict) {
    // Downgrade to warnings for non-strict verticals
    warnings.push(...errors.splice(0));
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ─── Narration/Overlay banned-language scanner ──────────────

// Hedge words that soften implicit certainty verbs — if present before the verb, don't flag
const HEDGE_PATTERN = /\b(may|might|can|could|helps?|may help|potentially|possibly)\b/i;

const BANNED_ABSOLUTES = [
  /\bguaranteed?\b/gi,
  /\bwill cure\b/gi,
  /\bcures?\b/gi,
  /\balways works?\b/gi,
  /\b100%\b/gi,
  /\bdouble your money\b/gi,
  /\brisk[- \u2010\u2011\u2012\u2013\u2014]free\b/gi,
  /\bno side effects?\b/gi,
  /\bclinically proven\b/gi,
  /\bproven to\b/gi,
  /\bworks every time\b/gi,
  /\bnever fails?\b/gi,
  /\bwill fix\b/gi,
  /\bwill prevent\b/gi,
  /\bwill stop\b/gi,
  /\bguaranteed results?\b/gi,
];

// Implicit certainty verbs — only flagged when NOT preceded by a hedge word
const HEDGE_AWARE_PATTERNS = [
  /\bprevents?\b/gi,
  /\bstops?\s+(heart|cancer|disease|illness|aging|diabetes)/gi,
  /\beliminates?\b/gi,
];

/**
 * Normalize unicode dashes and smart quotes in text before scanning.
 */
function normalizeText(text: string): string {
  return text
    .replace(/[\u2013\u2014\u2012\u2011\u2010]/g, "-")  // all dash variants → hyphen
    .replace(/[\u2018\u2019\u201A]/g, "'")               // smart single quotes
    .replace(/[\u201C\u201D\u201E]/g, '"')               // smart double quotes
    .replace(/\s+/g, " ");                                // collapse whitespace
}

/**
 * Check if a match position is preceded (within 4 words) by a hedge word.
 */
function isPrecededByHedge(text: string, matchIndex: number): boolean {
  // Grab up to 40 chars before the match
  const prefix = text.slice(Math.max(0, matchIndex - 40), matchIndex);
  return HEDGE_PATTERN.test(prefix);
}

/**
 * Scan narration_line and onscreen_text for banned absolute language.
 * Checks both static BANNED_ABSOLUTES, hedge-aware implicit certainty verbs,
 * and dynamic do_not_say from the research brief.
 * Returns list of issues found.
 */
export function scanTextForBannedLanguage(
  items: Array<{ narration_line?: string; text_overlay?: string; onscreen_text?: string }>,
  vertical: string,
  brief?: ResearchBrief | null,
): string[] {
  const isStrict = STRICT_VERTICALS.includes(vertical);
  if (!isStrict) return [];

  // Build dynamic patterns from brief do_not_say lists
  const dynamicPatterns: Array<{ pattern: RegExp; source: string }> = [];
  if (brief?.activated && brief.grounded) {
    const buildPattern = (phrase: string): RegExp => {
      const trimmed = phrase.trim();
      const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const hasNonWordChars = /[^a-zA-Z0-9_\s]/.test(trimmed);
      const isMultiWord = /\s/.test(trimmed);
      if (isMultiWord) {
        // Multi-word: replace spaces with \s+ for flexible whitespace matching
        const flexEscaped = escaped.replace(/\\\s/g, "\\s+");
        return new RegExp(flexEscaped, "gi");
      }
      if (hasNonWordChars) {
        return new RegExp(escaped, "gi");
      }
      return new RegExp(`\\b${escaped}\\b`, "gi");
    };

    for (const phrase of (brief.do_not_say_global || [])) {
      if (phrase.trim()) {
        try {
          dynamicPatterns.push({ pattern: buildPattern(phrase), source: "global" });
        } catch { /* skip invalid regex */ }
      }
    }
    for (const claim of (brief.claims || [])) {
      for (const phrase of (claim.do_not_say || [])) {
        if (phrase.trim()) {
          try {
            dynamicPatterns.push({ pattern: buildPattern(phrase), source: `claim:${claim.claim_id}` });
          } catch { /* skip invalid regex */ }
        }
      }
    }
  }

  const issues: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const rawTexts = [
      items[i].narration_line || "",
      items[i].text_overlay || items[i].onscreen_text || "",
    ].filter(Boolean);

    for (const rawText of rawTexts) {
      const text = normalizeText(rawText);

      // Static banned absolutes (always block, no hedge pass)
      for (const pattern of BANNED_ABSOLUTES) {
        pattern.lastIndex = 0;
        const match = pattern.exec(text);
        if (match) {
          issues.push(`Item ${i}: banned phrase "${match[0]}" found in text`);
        }
      }

      // Hedge-aware implicit certainty verbs (only flag if NOT preceded by hedge)
      for (const pattern of HEDGE_AWARE_PATTERNS) {
        pattern.lastIndex = 0;
        const match = pattern.exec(text);
        if (match && !isPrecededByHedge(text, match.index)) {
          issues.push(`Item ${i}: unhedged certainty phrase "${match[0]}" found in text (add 'may'/'can'/'helps' to soften)`);
        }
      }

      // Dynamic do_not_say from brief
      for (const { pattern, source } of dynamicPatterns) {
        pattern.lastIndex = 0;
        const match = pattern.exec(text);
        if (match) {
          issues.push(`Item ${i}: do_not_say phrase "${match[0]}" (from ${source}) found in text`);
        }
      }
    }
  }
  return issues;
}

// ─── Claim Coverage Preflight ───────────────────────────────

export interface ClaimCoveragePreflight {
  total_items: number;
  items_with_claims: number;
  coverage_pct: number;
  unreferenced_claim_ids: string[];
  warnings: string[];
  errors: string[];
}

/** Beat roles that MUST reference claims in strict verticals (non-transition, non-hook, non-CTA) */
const EVIDENCE_BEAT_ROLES = new Set([
  "evidence", "solution", "after_reveal", "takeaway", "agitate",
  "item_1", "item_2", "payoff", "conflict", "turning_point",
  "story_a", "story_b", "problem",
]);

/** Beat roles that are allowed to be claim-light (framing/action only) */
const CLAIM_LIGHT_ROLES = new Set([
  "hook", "curiosity_hook", "trend_hook", "shock_hook", "symbolic_hook",
  "contrarian_hook", "hook_pain", "in_media_res",
  "cta", "credibility_cta", "proof_cta", "value_cta", "how_cta", "item_3_cta",
  "reset", "transition", "atmosphere",
]);

export function checkClaimCoverage(
  items: Array<{ claim_ids?: string[]; beat_role?: string }>,
  brief: ResearchBrief,
  vertical: string,
): ClaimCoveragePreflight {
  const isStrict = STRICT_VERTICALS.includes(vertical);
  const allClaimIds = new Set(brief.claims.map(c => c.claim_id));
  const referencedClaimIds = new Set<string>();
  let itemsWithClaims = 0;

  for (const item of items) {
    if (item.claim_ids && item.claim_ids.length > 0) {
      itemsWithClaims++;
      for (const id of item.claim_ids) {
        referencedClaimIds.add(id);
      }
    }
  }

  const unreferenced = [...allClaimIds].filter(id => !referencedClaimIds.has(id));
  const coveragePct = items.length > 0 ? Math.round((itemsWithClaims / items.length) * 100) : 0;

  const warnings: string[] = [];
  const errors: string[] = [];

  if (unreferenced.length > 0) {
    warnings.push(`${unreferenced.length} claim(s) not referenced by any item: ${unreferenced.join(", ")}`);
  }

  // Overall coverage threshold
  if (isStrict && coveragePct < 50) {
    errors.push(`Strict vertical requires ≥50% of items to reference claims; got ${coveragePct}%`);
  } else if (coveragePct < 30) {
    warnings.push(`Low claim coverage: only ${coveragePct}% of items reference claims`);
  }

  // Beat-role-specific enforcement: evidence/solution/takeaway beats MUST have claims in strict verticals
  if (isStrict) {
    for (let i = 0; i < items.length; i++) {
      const role = items[i].beat_role || "";
      const hasClaims = (items[i].claim_ids || []).length > 0;
      if (!hasClaims && EVIDENCE_BEAT_ROLES.has(role) && !CLAIM_LIGHT_ROLES.has(role)) {
        errors.push(`Beat ${i} (role: ${role}) is an evidence/content beat and MUST reference claim_ids in strict vertical`);
      }
    }
  }

  return {
    total_items: items.length,
    items_with_claims: itemsWithClaims,
    coverage_pct: coveragePct,
    unreferenced_claim_ids: unreferenced,
    warnings,
    errors,
  };
}
