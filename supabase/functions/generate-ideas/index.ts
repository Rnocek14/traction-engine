import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "jsr:@supabase/supabase-js@2/cors";

// ── Category definitions per vertical ──
const VERTICAL_CATEGORIES: Record<string, string[]> = {
  gadgets: [
    "desk_setup", "cable_management", "phone_accessories", "kitchen_gadgets",
    "car_gadgets", "travel_gadgets", "smart_home", "bathroom_gadgets",
    "edc_tools", "productivity_tools",
  ],
  privacy: [
    "local_history", "weird_facts", "hidden_places", "urban_legends",
    "before_after_locations", "privacy_tips", "data_protection", "app_reviews",
    "digital_safety", "safety_hacks",
  ],
  health: [
    "health_tips", "wellness", "prevention", "recovery", "habits",
    "motivation", "mythbusting", "caregiver_support",
  ],
  education: [
    "career_tips", "interview_prep", "resume_advice", "skill_building",
    "salary_negotiation", "remote_work",
  ],
  home: [
    "home_decor", "ambient_lighting", "room_transformation", "aesthetic_finds",
    "organization", "kitchen_upgrades",
  ],
  toys: [
    "educational_toys", "gift_ideas", "toy_reviews", "kids_activities",
    "stem_toys", "outdoor_play",
  ],
};

// ── Banned title patterns (AI slop) ──
const BANNED_TITLE_PATTERNS = [
  /transform your/i,
  /this will change your life/i,
  /unbelievable/i,
  /secret.*revealed/i,
  /you won't believe/i,
  /mind-?blowing/i,
  /game.?changer/i,
  /the ultimate guide/i,
  /everything you need to know/i,
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const accountId = body.account_id as string | undefined;
    const vertical = body.vertical as string | undefined;
    const count = Math.min(body.count || 5, 10);
    const mode = body.mode || "auto";

    // 1. Resolve target accounts
    const accounts = await loadAccounts(supabase, accountId, vertical);
    if (!accounts.length) {
      return jsonResponse({ ideas: [], message: "No accounts found" });
    }

    // 2. Load existing ideas (titles + categories for diversity check)
    const existingData = await loadExistingIdeas(supabase);

    // 3. Load assigned products for context
    const productContext = await loadProductContext(supabase, vertical, accounts);

    // 4. Load cached trend signals
    const trendContext = await loadTrendContext(supabase);

    // 5. Generate ideas per account
    const allInserted: unknown[] = [];

    for (const acct of accounts) {
      const perAccount = accountId ? count : Math.min(count, Math.ceil(count / accounts.length) || 2);

      // Calculate category distribution for this account
      const recentCategories = existingData.categoriesByAccount[acct.account_id] || [];
      const categoryBudget = buildCategoryBudget(acct, recentCategories);

      const prompt = buildIdeaPrompt(acct, productContext, trendContext, existingData.titles, perAccount, categoryBudget);

      let ideas = await callOpenAI(prompt, perAccount);
      if (!ideas.length) continue;

      // ── POST-GENERATION VALIDATION ──
      ideas = ideas.filter(idea => {
        // 1. Pillar enforcement: reject ideas outside account's content_pillars
        if (!matchesPillars(idea, acct)) {
          console.log(`[generate-ideas] REJECTED (off-pillar): "${idea.title}" for ${acct.account_id}`);
          return false;
        }

        // 2. Banned topic enforcement
        if (hitsBannedTopic(idea, acct)) {
          console.log(`[generate-ideas] REJECTED (banned topic): "${idea.title}" for ${acct.account_id}`);
          return false;
        }

        // 3. Title pattern ban (AI slop)
        if (BANNED_TITLE_PATTERNS.some(p => p.test(idea.title || ""))) {
          console.log(`[generate-ideas] REJECTED (banned pattern): "${idea.title}"`);
          return false;
        }

        // 4. Duplicate title check
        if (existingData.titles.has((idea.title || "").toLowerCase())) {
          console.log(`[generate-ideas] REJECTED (duplicate): "${idea.title}"`);
          return false;
        }

        return true;
      });

      const rows = ideas.slice(0, perAccount).map(idea => ({
        account_id: acct.account_id,
        title: String(idea.title || "Untitled").slice(0, 80),
        subject: String(idea.subject || ""),
        angle: idea.angle ? String(idea.angle) : null,
        vertical: acct.vertical || vertical || null,
        suggested_hook_type: idea.suggested_hook_type ? String(idea.suggested_hook_type) : acct.hook_style || null,
        suggested_format: idea.suggested_format ? String(idea.suggested_format) : null,
        emotional_triggers: Array.isArray(idea.emotional_triggers) ? idea.emotional_triggers.map(String) : [],
        trend_source_ids: [],
        reasoning: idea.reasoning ? String(idea.reasoning) : null,
        opportunity_score: typeof idea.opportunity_score === "number" ? Math.min(100, Math.max(0, idea.opportunity_score)) : 50,
        status: "proposed",
        generated_by: mode,
        content_type: idea.content_type === "product_promo" ? "product_promo" : "growth",
        content_category: idea.content_category ? String(idea.content_category) : null,
      }));

      const { data: inserted, error } = await supabase
        .from("content_ideas")
        .insert(rows)
        .select();

      if (error) {
        console.error(`[generate-ideas] Insert error for ${acct.account_id}:`, error);
      } else {
        allInserted.push(...(inserted || []));
        for (const r of rows) existingData.titles.add(r.title.toLowerCase());
      }
    }

    console.log(`[generate-ideas] Generated ${allInserted.length} ideas (mode: ${mode})`);
    return jsonResponse({ ideas: allInserted, count: allInserted.length });

  } catch (err) {
    console.error("[generate-ideas] Unexpected error:", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});

// ── Validation helpers ──

function matchesPillars(idea: any, acct: any): boolean {
  const pillars: string[] = acct.content_pillars || [];
  if (!pillars.length) return true; // no pillars = no filter

  const text = `${idea.title} ${idea.subject} ${idea.angle} ${idea.content_category}`.toLowerCase();
  // Check if ANY pillar keyword appears in the idea text
  return pillars.some(p => {
    const keywords = p.toLowerCase().replace(/_/g, " ").split(/\s+/);
    return keywords.some(kw => kw.length > 2 && text.includes(kw));
  });
}

function hitsBannedTopic(idea: any, acct: any): boolean {
  const banned: string[] = acct.banned_topics || [];
  if (!banned.length) return false;

  const text = `${idea.title} ${idea.subject} ${idea.angle}`.toLowerCase();
  return banned.some(b => text.includes(b.toLowerCase()));
}

function buildCategoryBudget(acct: any, recentCategories: string[]): { preferred: string[]; avoid: string[] } {
  const vertCats = VERTICAL_CATEGORIES[acct.vertical] || [];
  const pillars: string[] = acct.content_pillars || [];

  // Allowed = intersection of vertical categories and account pillars (if pillars match category names)
  const allowed = vertCats.filter(c => {
    if (!pillars.length) return true;
    return pillars.some(p => {
      const pNorm = p.toLowerCase().replace(/\s+/g, "_");
      const cNorm = c.toLowerCase();
      return pNorm === cNorm || pNorm.includes(cNorm) || cNorm.includes(pNorm);
    });
  });

  // Count recent usage
  const counts: Record<string, number> = {};
  for (const c of recentCategories) {
    counts[c] = (counts[c] || 0) + 1;
  }
  const total = recentCategories.length || 1;

  // Avoid categories >20% of recent ideas
  const avoid = Object.entries(counts)
    .filter(([, n]) => n / total > 0.2)
    .map(([c]) => c);

  // Preferred = allowed minus overused
  const preferred = (allowed.length ? allowed : vertCats).filter(c => !avoid.includes(c));

  return { preferred: preferred.length ? preferred : allowed.length ? allowed : vertCats, avoid };
}

// ── Data loading ──

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function loadAccounts(supabase: any, accountId?: string, vertical?: string) {
  let query = supabase
    .from("account_configs")
    .select("account_id, vertical, account_name, content_pillars, banned_topics, persona, audience, promise, content_style, hook_style, monetization_mode")
    .eq("status", "active")
    .limit(10);

  if (accountId) query = query.eq("account_id", accountId);
  else if (vertical) query = query.eq("vertical", vertical);

  const { data } = await query;
  return data || [];
}

interface ExistingData {
  titles: Set<string>;
  categoriesByAccount: Record<string, string[]>;
}

async function loadExistingIdeas(supabase: any): Promise<ExistingData> {
  const { data } = await supabase
    .from("content_ideas")
    .select("title, account_id, content_category")
    .in("status", ["proposed", "approved", "produced"])
    .order("created_at", { ascending: false })
    .limit(200);

  const titles = new Set<string>();
  const categoriesByAccount: Record<string, string[]> = {};

  for (const row of data || []) {
    titles.add((row.title || "").toLowerCase());
    if (row.content_category) {
      if (!categoriesByAccount[row.account_id]) categoriesByAccount[row.account_id] = [];
      categoriesByAccount[row.account_id].push(row.content_category);
    }
  }

  return { titles, categoriesByAccount };
}

async function loadProductContext(supabase: any, vertical?: string, accounts?: any[]) {
  if (!vertical && !accounts?.length) return [];
  const v = vertical || accounts?.[0]?.vertical;
  if (!v) return [];

  const { data } = await supabase
    .from("products")
    .select("name, short_description, price_cents, category")
    .contains("verticals", [v])
    .neq("status", "dead")
    .limit(15);

  return (data || []).map((p: any) => ({
    name: p.name,
    desc: p.short_description?.slice(0, 80),
    price: p.price_cents ? `$${(p.price_cents / 100).toFixed(0)}` : null,
    category: p.category,
  }));
}

async function loadTrendContext(supabase: any) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("scraped_insights")
    .select("title, topics, hook_patterns, content_format, viral_score")
    .gte("created_at", sevenDaysAgo)
    .gte("viral_score", 50)
    .order("viral_score", { ascending: false })
    .limit(10);

  return (data || []).map((i: any) => ({
    title: i.title,
    topics: i.topics?.slice(0, 3),
    hooks: i.hook_patterns?.slice(0, 2),
    format: i.content_format,
    score: i.viral_score,
  }));
}

// ── Prompt builder ──

function buildIdeaPrompt(
  acct: any,
  products: any[],
  trends: any[],
  existingTitles: Set<string>,
  count: number,
  categoryBudget: { preferred: string[]; avoid: string[] },
) {
  const identity = {
    account: acct.account_name || acct.account_id,
    vertical: acct.vertical,
    pillars: acct.content_pillars,
    banned_topics: acct.banned_topics,
    style: acct.content_style,
    hook_style: acct.hook_style,
    tone: (acct.persona as any)?.tone,
    audience: (acct.audience as any)?.who,
    promise: acct.promise,
    monetization: acct.monetization_mode,
  };

  return `You are a viral content strategist for a specific social media account.

ACCOUNT IDENTITY:
${JSON.stringify(identity, null, 2)}

CATEGORY SYSTEM (MANDATORY):
Preferred categories to use: ${JSON.stringify(categoryBudget.preferred)}
Categories to AVOID (overused recently): ${JSON.stringify(categoryBudget.avoid)}
Each idea MUST include a "content_category" from the preferred list.
Do NOT repeat the same category more than once in this batch.

CONTENT PILLAR ENFORCEMENT (CRITICAL):
Every idea MUST relate to one of these pillars: ${JSON.stringify(acct.content_pillars || [])}
${(acct.banned_topics || []).length > 0 ? `BANNED TOPICS (never generate about these): ${JSON.stringify(acct.banned_topics)}` : ""}

BANNED TITLE PATTERNS (do NOT use):
- "Transform your X"
- "This will change your life"
- "Unbelievable X"
- "Secret to X revealed"
- "You won't believe"
- "Mind-blowing"
- "Game changer"
- "Ultimate guide"

GOOD TITLE PATTERNS (use these):
- "3 gadgets that actually save time"
- "$10 vs $50 — same thing?"
- "Stop doing this with your charger"
- "I tested 5 — only 1 worked"
- "This $8 fix replaced my $200 setup"
- "Why most people get this wrong"

${products.length > 0 ? `AVAILABLE PRODUCTS (for product_promo ideas):\n${JSON.stringify(products, null, 2)}` : "No products assigned yet — generate only growth ideas."}

${trends.length > 0 ? `RECENT TREND SIGNALS:\n${JSON.stringify(trends, null, 2)}` : "No recent trend data available — use your knowledge of current viral patterns."}

ALREADY PROPOSED (avoid duplicates):
${[...existingTitles].slice(0, 30).join(", ")}

Generate ${count} content ideas for THIS SPECIFIC account.
${products.length > 0 ? `Mix: ~60% growth ideas, ~40% product_promo ideas.` : `All ideas should be growth type.`}

Every idea MUST:
- Match the account's content pillars EXACTLY
- Use a specific, actionable angle (not generic)
- Include concrete details (numbers, prices, comparisons, or specific examples)
- Feel like something a REAL creator would post, not an AI

Return a JSON array with objects containing:
- title: catchy video title (max 60 chars, matches account hook_style)
- subject: core subject (2-5 words)
- content_category: category from the preferred list above
- angle: specific content angle (1 sentence with a concrete detail)
- content_type: "growth" or "product_promo"
- suggested_hook_type: one of [curiosity, shock, value, fear, relatability, authority, contrarian, social_proof]
- suggested_format: one of [fast_explainer, myth_busting, story_confession, warning_mistake, comparison, numbered_list, what_nobody_tells_you, why_this_matters_now]
- emotional_triggers: array of 1-3 emotional angles
- reasoning: why this will perform for THIS account (1 sentence)
- opportunity_score: 0-100 viral potential

Return ONLY a valid JSON array, no markdown.`;
}

// ── OpenAI caller ──

async function callOpenAI(prompt: string, count: number) {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) {
    console.error("[generate-ideas] OPENAI_API_KEY not configured");
    return [];
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50000);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a viral content strategist. Return only valid JSON arrays. Every idea must strictly match the account's content pillars. Never generate off-topic ideas." },
          { role: "user", content: prompt },
        ],
        temperature: 0.85,
        max_tokens: 3000,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const text = await res.text();
    if (!res.ok) {
      console.error("[generate-ideas] OpenAI error:", res.status, text.slice(0, 300));
      return [];
    }

    const data = JSON.parse(text);
    const raw = data.choices?.[0]?.message?.content || "[]";
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const ideas = JSON.parse(cleaned);
    return Array.isArray(ideas) ? ideas : [];
  } catch (err) {
    clearTimeout(timeout);
    console.error("[generate-ideas] AI call failed:", err);
    return [];
  }
}
