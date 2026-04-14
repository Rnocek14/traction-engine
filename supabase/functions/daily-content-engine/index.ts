import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const targetVertical = body.vertical as string | undefined;

    // 1. Load vertical configs
    let query = supabase.from("vertical_configs").select("*");
    if (targetVertical) {
      query = query.eq("vertical", targetVertical);
    } else {
      query = query.eq("auto_generate", true);
    }
    const { data: configs, error: cfgErr } = await query;
    if (cfgErr) throw cfgErr;
    if (!configs?.length) {
      return new Response(JSON.stringify({ success: true, message: "No verticals configured", created: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Load accounts with FULL identity (grouped by vertical)
    const { data: accounts } = await supabase
      .from("account_configs")
      .select("account_id, vertical, account_name, platform, monetization_mode, content_pillars, promise, content_style, hook_style, persona, audience, cta_style, cta_phrases, max_daily_posts")
      .eq("status", "active");

    const accountsByVertical = new Map<string, typeof accounts>();
    (accounts || []).forEach(a => {
      const list = accountsByVertical.get(a.vertical) || [];
      list.push(a);
      accountsByVertical.set(a.vertical, list);
    });

    // 3. Load products assigned to verticals
    const { data: products } = await supabase
      .from("products")
      .select("id, name, image_url, verticals, price_cents, estimated_margin_pct, status")
      .neq("status", "dead");

    // 4. Load today's existing story_jobs to avoid duplicates
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: todayJobs } = await supabase
      .from("story_jobs")
      .select("id, account_id, product_id, content_type")
      .gte("created_at", todayStart.toISOString());

    // Count today's jobs PER ACCOUNT (not just per vertical)
    const todayJobsByAccount = new Map<string, number>();
    (todayJobs || []).forEach(j => {
      todayJobsByAccount.set(j.account_id, (todayJobsByAccount.get(j.account_id) || 0) + 1);
    });

    // 5. Load top content ideas per vertical
    const { data: ideas } = await supabase
      .from("content_ideas")
      .select("id, title, subject, account_id, opportunity_score, angle, suggested_format, content_type, vertical")
      .eq("status", "proposed")
      .order("opportunity_score", { ascending: false })
      .limit(100);

    const ideasByVertical = new Map<string, typeof ideas>();
    (ideas || []).forEach(i => {
      const v = i.vertical || ((accounts || []).find(a => a.account_id === i.account_id)?.vertical);
      if (v) {
        const list = ideasByVertical.get(v) || [];
        list.push(i);
        ideasByVertical.set(v, list);
      }
    });

    // 6. Process each vertical — generate content PER ACCOUNT
    const results: Array<{ vertical: string; account_results: Array<{ account: string; growth: number; product: number }>; skipped: string }> = [];

    for (const config of configs) {
      const vAccounts = accountsByVertical.get(config.vertical) || [];
      if (!vAccounts.length) {
        results.push({ vertical: config.vertical, account_results: [], skipped: "no accounts" });
        continue;
      }

      const vIdeas = ideasByVertical.get(config.vertical) || [];
      const vProducts = (products || []).filter(p => p.verticals?.includes(config.vertical) && p.image_url);
      let ideaIdx = 0;
      let productIdx = 0;

      const accountResults: Array<{ account: string; growth: number; product: number }> = [];

      for (const acct of vAccounts) {
        const existingToday = todayJobsByAccount.get(acct.account_id) || 0;
        const maxDaily = acct.max_daily_posts || 4;

        // Per-account targets based on vertical config ratio
        const growthForAccount = Math.max(0, Math.ceil(config.daily_growth_target / vAccounts.length) - Math.floor(existingToday * (config.growth_ratio / 100)));
        const productForAccount = Math.max(0, Math.ceil(config.daily_product_target / vAccounts.length));
        const totalForAccount = Math.min(growthForAccount + productForAccount, maxDaily - existingToday);

        if (totalForAccount <= 0) {
          accountResults.push({ account: acct.account_id, growth: 0, product: 0 });
          continue;
        }

        let growthCreated = 0;
        let productCreated = 0;

        // Create growth posts from ideas — tailored to this account
        const growthSlots = Math.min(growthForAccount, totalForAccount);
        for (let i = 0; i < growthSlots && ideaIdx < vIdeas.length; i++) {
          const idea = vIdeas[ideaIdx++];
          const title = buildAccountTitle(acct, idea.title);

          const { error } = await supabase.from("story_jobs").insert({
            title,
            account_id: acct.account_id,
            status: "draft",
            content_type: "growth",
            source_idea_id: idea.id,
            auto_generated: true,
          });

          if (!error) {
            growthCreated++;
            await supabase.from("content_ideas").update({ status: "in_production" }).eq("id", idea.id);
          }
        }

        // Create product posts — tailored to this account
        const productSlots = Math.min(productForAccount, totalForAccount - growthCreated);
        for (let i = 0; i < productSlots && productIdx < vProducts.length; i++) {
          const product = vProducts[productIdx++];
          const title = buildProductTitle(acct, product.name);

          const { error } = await supabase.from("story_jobs").insert({
            title,
            account_id: acct.account_id,
            product_id: product.id,
            status: "draft",
            content_type: "product_promo",
            auto_generated: true,
          });

          if (!error) productCreated++;
        }

        accountResults.push({ account: acct.account_id, growth: growthCreated, product: productCreated });
      }

      // Update last run timestamp
      await supabase.from("vertical_configs")
        .update({ last_engine_run_at: new Date().toISOString() })
        .eq("id", config.id);

      results.push({ vertical: config.vertical, account_results: accountResults, skipped: "" });
    }

    const totalCreated = results.reduce((s, r) =>
      s + r.account_results.reduce((a, ar) => a + ar.growth + ar.product, 0), 0);

    return new Response(JSON.stringify({ success: true, created: totalCreated, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/** Build a growth title reflecting the account's style */
function buildAccountTitle(acct: Record<string, unknown>, ideaTitle: string): string {
  const style = (acct.content_style as string) || "";
  if (style) return `[${style}] ${ideaTitle}`;
  return ideaTitle;
}

/** Build a product title reflecting the account's hook style */
function buildProductTitle(acct: Record<string, unknown>, productName: string): string {
  const hookStyle = (acct.hook_style as string) || "curiosity";
  const prefixes: Record<string, string> = {
    curiosity: "You won't believe what",
    shock: "STOP — look at",
    problem: "This fixes your",
    aesthetic: "",
    demo: "Watch this:",
    listicle: "Top pick:",
  };
  const prefix = prefixes[hookStyle] || "";
  return prefix ? `${prefix} ${productName}` : `${productName} — Product Video`;
}
