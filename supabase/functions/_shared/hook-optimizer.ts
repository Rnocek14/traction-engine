/**
 * Hook Optimizer v1.0
 * 
 * Multi-candidate hook generation with scoring.
 * Generates N hook variants, scores them on 5 dimensions,
 * and selects the strongest performer.
 * 
 * Scoring dimensions (from research framework):
 *   1. Novelty     — Is this surprising or unexpected?
 *   2. Specificity — Does it contain concrete details?
 *   3. Emotion     — Does it trigger an emotional response?
 *   4. Promise     — Does it clearly signal value ahead?
 *   5. Credibility — Does it feel authentic/trustworthy?
 */

import type { HookCategory } from "./story-types.ts";

// ─── Hook Pattern Library ───────────────────────────────────

export interface HookPattern {
  category: HookCategory;
  template: string;
  example: string;
  /** Which verticals this pattern works best for */
  best_for?: string[];
}

/**
 * Proven hook patterns organized by category.
 * These serve as inspiration/few-shot examples for GPT generation.
 */
export const HOOK_PATTERNS: Record<HookCategory, HookPattern[]> = {
  curiosity: [
    {
      category: "curiosity",
      template: "Most people don't know {this specific thing}…",
      example: "Most people don't know their resume gets rejected in 6 seconds by a robot.",
    },
    {
      category: "curiosity",
      template: "I found out why {common frustration}…",
      example: "I found out why 80% of job applications never get a response.",
    },
    {
      category: "curiosity",
      template: "The {thing} nobody talks about…",
      example: "The resume section nobody talks about that doubled my interviews.",
    },
    {
      category: "curiosity",
      template: "Here's what {authority} won't tell you about {topic}…",
      example: "Here's what recruiters won't tell you about your LinkedIn profile.",
    },
  ],
  novelty: [
    {
      category: "novelty",
      template: "I just discovered {something unexpected}…",
      example: "I just discovered you can get a free credit score boost in 5 minutes.",
    },
    {
      category: "novelty",
      template: "This {new thing} changes everything about {topic}…",
      example: "This AI resume builder changes everything about job hunting.",
    },
    {
      category: "novelty",
      template: "{Number} {noun} that didn't exist {time} ago…",
      example: "3 career paths that didn't exist 2 years ago.",
    },
  ],
  shock: [
    {
      category: "shock",
      template: "Stop {common action} — it's {surprising consequence}…",
      example: "Stop putting your address on your resume — it's getting you filtered out.",
    },
    {
      category: "shock",
      template: "{Surprising stat} and nobody is talking about it…",
      example: "75% of resumes are rejected before a human sees them and nobody is talking about it.",
    },
    {
      category: "shock",
      template: "This {common thing} is actually {opposite of expected}…",
      example: "This common interview answer is actually the reason you're not getting hired.",
    },
  ],
  fear: [
    {
      category: "fear",
      template: "If you're still {doing X}, you're {negative consequence}…",
      example: "If you're still using a one-page resume, you're losing to candidates who aren't.",
    },
    {
      category: "fear",
      template: "This is why you're not {desired outcome}…",
      example: "This is why you're not getting callbacks — and it's fixable in 10 minutes.",
    },
    {
      category: "fear",
      template: "{X}% of people make this {topic} mistake…",
      example: "92% of people make this investing mistake and lose thousands.",
    },
  ],
  authority: [
    {
      category: "authority",
      template: "After {experience}, here's what actually works for {topic}…",
      example: "After reviewing 10,000 resumes, here's what actually gets you hired.",
    },
    {
      category: "authority",
      template: "The {industry} secret that {outcome}…",
      example: "The HR secret that turns a rejection into an interview.",
    },
    {
      category: "authority",
      template: "{Contrarian statement} — here's why…",
      example: "Your degree doesn't matter anymore — here's why.",
    },
  ],
  promise: [
    {
      category: "promise",
      template: "Do this one thing and {specific outcome}…",
      example: "Do this one thing on your resume and get 3x more interviews.",
    },
    {
      category: "promise",
      template: "How to {achieve X} in {timeframe} using {method}…",
      example: "How to land a remote job in 30 days using the hidden job market.",
    },
    {
      category: "promise",
      template: "The exact {method} I used to {outcome}…",
      example: "The exact email template I used to get responses from 15 hiring managers.",
    },
  ],
  social_proof: [
    {
      category: "social_proof",
      template: "{Number} people already {doing X} — here's how…",
      example: "50,000 people already switched to this budgeting method — here's how.",
    },
    {
      category: "social_proof",
      template: "Everyone's talking about {topic} — here's what they know…",
      example: "Everyone's talking about this side hustle — here's what they know that you don't.",
    },
    {
      category: "social_proof",
      template: "This went viral because {reason}…",
      example: "This resume trick went viral because it actually works.",
    },
  ],
};

// ─── Hook Scoring ───────────────────────────────────────────

export interface HookCandidate {
  text: string;
  category: HookCategory;
  text_overlay: string;
}

export interface HookScore {
  novelty: number;      // 1-10
  specificity: number;  // 1-10
  emotion: number;      // 1-10
  promise: number;      // 1-10
  credibility: number;  // 1-10
  total: number;        // weighted sum
}

export interface ScoredHook {
  candidate: HookCandidate;
  score: HookScore;
  rank: number;
}

/** Dimension weights — specificity and promise are highest because they predict retention */
const SCORE_WEIGHTS = {
  novelty: 0.15,
  specificity: 0.25,
  emotion: 0.15,
  promise: 0.25,
  credibility: 0.20,
};

/**
 * Score a hook candidate using rule-based heuristics.
 * Fast, no LLM call needed.
 */
export function scoreHook(candidate: HookCandidate): HookScore {
  const text = candidate.text;
  const lower = text.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);

  // 1. Novelty — unexpected framing, contrarian, "actually", "turns out"
  let novelty = 5;
  if (/\b(actually|turns out|secret|hidden|nobody|most people don't)\b/i.test(lower)) novelty += 2;
  if (/\b(stop|don't|never|wrong|mistake)\b/i.test(lower)) novelty += 1.5;
  if (/\b(new|just discovered|just found|breakthrough)\b/i.test(lower)) novelty += 1;
  novelty = Math.min(10, novelty);

  // 2. Specificity — numbers, percentages, timeframes, proper nouns
  let specificity = 4;
  if (/\d+/.test(text)) specificity += 2;
  if (/\b(\d+%|\d+x|\$\d+)\b/.test(text)) specificity += 1.5;
  if (/\b(\d+\s*(minutes?|hours?|days?|seconds?|weeks?|months?))\b/i.test(text)) specificity += 1;
  if (/\b(resume|linkedin|interview|salary|job|portfolio|cover letter)\b/i.test(lower)) specificity += 0.5;
  if (words.length >= 10 && words.length <= 20) specificity += 0.5;
  specificity = Math.min(10, specificity);

  // 3. Emotion — emotional triggers, intensity words
  let emotion = 4;
  if (/\b(worried|scared|frustrated|excited|shocked|surprised|angry|annoyed)\b/i.test(lower)) emotion += 2;
  if (/\b(losing|missing|wasting|failing|struggling|killing)\b/i.test(lower)) emotion += 1.5;
  if (/[!?]{1,}$/.test(text.trim())) emotion += 0.5;
  if (/\b(you're|your|you)\b/i.test(lower)) emotion += 1; // direct address
  emotion = Math.min(10, emotion);

  // 4. Promise — clear value signal
  let promise = 4;
  if (/\b(how to|here's|the exact|do this|try this)\b/i.test(lower)) promise += 2;
  if (/\b(get|land|earn|save|boost|increase|double|triple)\b/i.test(lower)) promise += 1.5;
  if (/\b(in \d+|within \d+|under \d+)\b/i.test(lower)) promise += 1; // timeframe
  if (/\b(hack|tip|trick|method|technique|strategy|formula)\b/i.test(lower)) promise += 0.5;
  promise = Math.min(10, promise);

  // 5. Credibility — authenticity signals
  let credibility = 5;
  if (/\b(after \d+|reviewed \d+|tested|studied|research|data|study)\b/i.test(lower)) credibility += 2;
  if (/\b(recruiter|hiring manager|expert|professional|HR|industry)\b/i.test(lower)) credibility += 1;
  // Penalize clickbait signals
  if (/\b(you won't believe|mind.?blown|insane|crazy|unreal)\b/i.test(lower)) credibility -= 2;
  if (/\b(game.?changer|life.?changing)\b/i.test(lower)) credibility -= 1;
  credibility = Math.max(1, Math.min(10, credibility));

  const total =
    novelty * SCORE_WEIGHTS.novelty +
    specificity * SCORE_WEIGHTS.specificity +
    emotion * SCORE_WEIGHTS.emotion +
    promise * SCORE_WEIGHTS.promise +
    credibility * SCORE_WEIGHTS.credibility;

  return {
    novelty: Math.round(novelty * 10) / 10,
    specificity: Math.round(specificity * 10) / 10,
    emotion: Math.round(emotion * 10) / 10,
    promise: Math.round(promise * 10) / 10,
    credibility: Math.round(credibility * 10) / 10,
    total: Math.round(total * 100) / 100,
  };
}

// ─── Multi-Candidate Generation ─────────────────────────────

/**
 * Build the GPT prompt to generate N hook candidates.
 */
export function buildHookGenerationPrompt(
  concept: string,
  vertical: string,
  hookCategory: string,
  patternExamples: HookPattern[],
  candidateCount: number = 3,
): string {
  const exampleBlock = patternExamples
    .slice(0, 3)
    .map((p, i) => `  ${i + 1}. Template: "${p.template}"\n     Example: "${p.example}"`)
    .join("\n");

  return `You are an expert short-form video hook writer. Generate ${candidateCount} distinct hook variations for this concept.

CONCEPT: "${concept}"
VERTICAL: ${vertical}
HOOK CATEGORY: ${hookCategory}

PROVEN PATTERNS FOR THIS CATEGORY:
${exampleBlock}

RULES:
1. Each hook must be 8-18 words
2. Each hook must create IMMEDIATE curiosity or tension
3. Each hook must signal the specific value that follows
4. NO clickbait that doesn't connect to real content
5. Each variation must use a DIFFERENT approach/angle
6. Include at least one number or specific detail when possible
7. Start with an action or statement, NOT a question (unless "Did you know" style)
8. The hook must make someone STOP scrolling in 1.5 seconds

Return ONLY valid JSON:
{
  "hooks": [
    {"text": "Hook text here", "text_overlay": "3-5 word overlay", "angle": "brief description of approach"}
  ]
}`;
}

/**
 * Generate and score multiple hook candidates.
 * Returns sorted by score (best first).
 */
export async function generateAndScoreHooks(
  concept: string,
  vertical: string,
  hookCategory: HookCategory,
  openaiKey: string,
  candidateCount: number = 3,
): Promise<ScoredHook[]> {
  const patterns = HOOK_PATTERNS[hookCategory] || HOOK_PATTERNS.curiosity;

  const prompt = buildHookGenerationPrompt(
    concept, vertical, hookCategory, patterns, candidateCount,
  );

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You write viral short-form video hooks. Return ONLY valid JSON." },
          { role: "user", content: prompt },
        ],
        temperature: 0.9,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      console.error(`[hook-optimizer] GPT error: ${response.status}`);
      await response.text();
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    const hooks: Array<{ text: string; text_overlay: string }> = parsed.hooks || [];

    // Score each candidate
    const scored: ScoredHook[] = hooks.map(h => {
      const candidate: HookCandidate = {
        text: h.text,
        category: hookCategory,
        text_overlay: h.text_overlay || h.text.split(" ").slice(0, 4).join(" "),
      };
      return {
        candidate,
        score: scoreHook(candidate),
        rank: 0,
      };
    });

    // Sort by total score descending
    scored.sort((a, b) => b.score.total - a.score.total);
    scored.forEach((s, i) => { s.rank = i + 1; });

    return scored;
  } catch (err) {
    console.error("[hook-optimizer] Generation failed:", err);
    return [];
  }
}

/**
 * Get the best hook from candidates, with fallback to a pattern-based default.
 */
export function selectBestHook(
  scored: ScoredHook[],
  concept: string,
  hookCategory: HookCategory,
): { hook_text: string; hook_overlay: string; hook_score: HookScore; candidates_count: number } {
  if (scored.length > 0) {
    const winner = scored[0];
    return {
      hook_text: winner.candidate.text,
      hook_overlay: winner.candidate.text_overlay,
      hook_score: winner.score,
      candidates_count: scored.length,
    };
  }

  // Fallback: use first pattern template
  const patterns = HOOK_PATTERNS[hookCategory] || HOOK_PATTERNS.curiosity;
  const fallback = patterns[0];
  const fallbackCandidate: HookCandidate = {
    text: fallback.example,
    category: hookCategory,
    text_overlay: fallback.example.split(" ").slice(0, 4).join(" "),
  };

  return {
    hook_text: fallbackCandidate.text,
    hook_overlay: fallbackCandidate.text_overlay,
    hook_score: scoreHook(fallbackCandidate),
    candidates_count: 0,
  };
}
