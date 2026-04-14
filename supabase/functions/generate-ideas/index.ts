import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "jsr:@supabase/supabase-js@2/cors";

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

    // 2. Load existing ideas to avoid duplicates
    const existingTitles = await loadExistingTitles(supabase);

    // 3. Load assigned products for context
    const productContext = await loadProductContext(supabase, vertical, accounts);

    // 4. Load cached trend signals (no live web research — uses existing scraped data)
    const trendContext = await loadTrendContext(supabase);

    // 5. Generate ideas per account (or single account if specified)
    const allInserted: unknown[] = [];

    for (const acct of accounts) {
      const perAccount = accountId ? count : Math.min(count, Math.ceil(count / accounts.length) || 2);
      
      const prompt = buildIdeaPrompt(acct, productContext, trendContext, existingTitles, perAccount);

      const ideas = await callOpenAI(prompt, perAccount);
      if (!ideas.length) continue;

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
      }));

      const { data: inserted, error } = await supabase
        .from("content_ideas")
        .insert(rows)
        .select();

      if (error) {
        console.error(`[generate-ideas] Insert error for ${acct.account_id}:`, error);
      } else {
        allInserted.push(...(inserted || []));
        // Add new titles to dedup set
        for (const r of rows) existingTitles.add(r.title.toLowerCase());
      }
    }

    console.log(`[generate-ideas] Generated ${allInserted.length} ideas (mode: ${mode})`);
    return jsonResponse({ ideas: allInserted, count: allInserted.length });

  } catch (err) {
    console.error("[generate-ideas] Unexpected error:", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});

// --- Helper functions ---

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function loadAccounts(supabase: any, accountId?: string, vertical?: string) {
  let query = supabase
    .from("account_configs")
    .select("account_id, vertical, account_name, content_pillars, persona, audience, promise, content_style, hook_style, monetization_mode")
    .eq("status", "active")
    .limit(10);

  if (accountId) query = query.eq("account_id", accountId);
  else if (vertical) query = query.eq("vertical", vertical);

  const { data } = await query;
  return data || [];
}

async function loadExistingTitles(supabase: any): Promise<Set<string>> {
  const { data } = await supabase
    .from("content_ideas")
    .select("title")
    .in("status", ["proposed", "approved"])
    .order("created_at", { ascending: false })
    .limit(80);
  return new Set((data || []).map((i: any) => i.title.toLowerCase()));
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

function buildIdeaPrompt(
  acct: any,
  products: any[],
  trends: any[],
  existingTitles: Set<string>,
  count: number,
) {
  const identity = {
    account: acct.account_name || acct.account_id,
    vertical: acct.vertical,
    pillars: acct.content_pillars,
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

${products.length > 0 ? `AVAILABLE PRODUCTS (for product_promo ideas):\n${JSON.stringify(products, null, 2)}` : "No products assigned yet — generate only growth ideas."}

${trends.length > 0 ? `RECENT TREND SIGNALS:\n${JSON.stringify(trends, null, 2)}` : "No recent trend data available — use your knowledge of current viral patterns."}

ALREADY PROPOSED (avoid duplicates):
${[...existingTitles].slice(0, 30).join(", ")}

Generate ${count} content ideas for THIS SPECIFIC account.
${products.length > 0 ? `Mix: ~60% growth ideas, ~40% product_promo ideas.` : `All ideas should be growth type.`}

Every idea MUST match the account's style, hook approach, and audience.

Return a JSON array with objects containing:
- title: catchy video title (max 60 chars, matches account hook_style)
- subject: core subject (2-5 words)
- angle: specific content angle (1 sentence)
- content_type: "growth" or "product_promo"
- suggested_hook_type: one of [curiosity, shock, value, fear, relatability, authority, contrarian, social_proof]
- suggested_format: one of [fast_explainer, myth_busting, story_confession, warning_mistake, comparison, numbered_list, what_nobody_tells_you, why_this_matters_now]
- emotional_triggers: array of 1-3 emotional angles
- reasoning: why this will perform for THIS account (1 sentence)
- opportunity_score: 0-100 viral potential

Return ONLY a valid JSON array, no markdown.`;
}

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
          { role: "system", content: "You are a viral content strategist. Return only valid JSON arrays." },
          { role: "user", content: prompt },
        ],
        temperature: 0.9,
        max_tokens: 2500,
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
