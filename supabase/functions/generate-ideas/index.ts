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
    const mode = body.mode || "auto"; // "auto" or "manual"

    // 1. Fetch recent high-scoring scraped insights
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: insights } = await supabase
      .from("scraped_insights")
      .select("id, title, topics, hook_patterns, emotional_triggers, content_format, viral_score")
      .gte("created_at", sevenDaysAgo)
      .gte("viral_score", 50)
      .order("viral_score", { ascending: false })
      .limit(20);

    // 2. Fetch account configs for context
    let accountQuery = supabase
      .from("account_configs")
      .select("account_id, vertical, content_pillars, persona, audience, promise")
      .limit(10);
    
    if (accountId) {
      accountQuery = accountQuery.eq("account_id", accountId);
    }
    if (vertical) {
      accountQuery = accountQuery.eq("vertical", vertical);
    }
    
    const { data: accounts } = await accountQuery;

    // 3. Fetch existing ideas to avoid duplicates
    const { data: existingIdeas } = await supabase
      .from("content_ideas")
      .select("title, subject")
      .in("status", ["proposed", "approved"])
      .order("created_at", { ascending: false })
      .limit(50);

    const existingTitles = (existingIdeas || []).map(i => i.title.toLowerCase());

    // 4. Build AI prompt
    const trendContext = (insights || []).slice(0, 10).map(i => ({
      title: i.title,
      topics: i.topics?.slice(0, 3),
      hooks: i.hook_patterns?.slice(0, 2),
      emotions: i.emotional_triggers?.slice(0, 2),
      format: i.content_format,
      viral_score: i.viral_score,
    }));

    const accountContext = (accounts || []).map(a => ({
      account: a.account_id,
      vertical: a.vertical,
      pillars: a.content_pillars,
      persona_tone: (a.persona as Record<string, string>)?.tone,
      audience: (a.audience as Record<string, string>)?.who,
      promise: a.promise,
    }));

    const prompt = `You are a viral content strategist. Based on current trends and account profiles, propose ${count} content ideas.

CURRENT TRENDS:
${JSON.stringify(trendContext, null, 2)}

ACCOUNTS:
${JSON.stringify(accountContext, null, 2)}

ALREADY PROPOSED (avoid duplicates):
${existingTitles.slice(0, 20).join(", ")}

For each idea, return a JSON array with objects containing:
- title: catchy video title (max 60 chars)
- subject: core subject in 2-5 words
- angle: specific content angle (1 sentence)
- account_id: which account this fits (from the accounts list)
- vertical: content vertical
- suggested_hook_type: one of [curiosity, shock, value, fear, relatability, authority, contrarian, social_proof]
- suggested_format: one of [fast_explainer, myth_busting, story_confession, warning_mistake, comparison, numbered_list, what_nobody_tells_you, why_this_matters_now]
- emotional_triggers: array of 1-3 emotional angles
- reasoning: why this idea will perform well (1-2 sentences)
- opportunity_score: 0-100 estimated viral potential

Focus on ideas that:
1. Leverage current trending topics/hooks
2. Match the account's vertical and audience
3. Have strong hook potential
4. Are NOT duplicates of existing ideas

Return ONLY a valid JSON array, no markdown.`;

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
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
        max_tokens: 3000,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("[generate-ideas] OpenAI error:", errText);
      return new Response(
        JSON.stringify({ error: "AI generation failed" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiRes.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "[]";
    
    // Parse JSON (strip markdown fences if present)
    const cleaned = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    let ideas: Array<Record<string, unknown>>;
    try {
      ideas = JSON.parse(cleaned);
    } catch {
      console.error("[generate-ideas] Failed to parse AI response:", cleaned.slice(0, 200));
      return new Response(
        JSON.stringify({ error: "Failed to parse AI response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!Array.isArray(ideas) || ideas.length === 0) {
      return new Response(
        JSON.stringify({ ideas: [], message: "No ideas generated" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Map trend source IDs
    const insightIds = (insights || []).map(i => i.id);

    // 6. Insert ideas
    const rows = ideas.slice(0, count).map(idea => ({
      account_id: String(idea.account_id || accountId || "default"),
      title: String(idea.title || "Untitled"),
      subject: String(idea.subject || ""),
      angle: idea.angle ? String(idea.angle) : null,
      vertical: idea.vertical ? String(idea.vertical) : vertical || null,
      suggested_hook_type: idea.suggested_hook_type ? String(idea.suggested_hook_type) : null,
      suggested_format: idea.suggested_format ? String(idea.suggested_format) : null,
      emotional_triggers: Array.isArray(idea.emotional_triggers) ? idea.emotional_triggers.map(String) : [],
      trend_source_ids: insightIds.slice(0, 5),
      reasoning: idea.reasoning ? String(idea.reasoning) : null,
      opportunity_score: typeof idea.opportunity_score === "number" ? Math.min(100, Math.max(0, idea.opportunity_score)) : 50,
      status: "proposed",
      generated_by: mode,
    }));

    const { data: inserted, error: insertErr } = await supabase
      .from("content_ideas")
      .insert(rows)
      .select();

    if (insertErr) {
      console.error("[generate-ideas] Insert error:", insertErr);
      return new Response(
        JSON.stringify({ error: "Failed to save ideas" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[generate-ideas] Generated ${inserted?.length || 0} ideas for ${accountId || "all accounts"} (mode: ${mode})`);

    return new Response(
      JSON.stringify({ ideas: inserted, count: inserted?.length || 0 }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[generate-ideas] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
