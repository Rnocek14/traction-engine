import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const IDEA_REFILL_THRESHOLD = 3;

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
      return respond({ success: true, message: "No verticals configured", created: 0 });
    }

    // 2. Load accounts
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

    // 3. Load products
    const { data: products } = await supabase
      .from("products")
      .select("id, name, image_url, verticals, price_cents, estimated_margin_pct, status")
      .neq("status", "dead");

    // 4. Load today's existing story_jobs
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: todayJobs } = await supabase
      .from("story_jobs")
      .select("id, account_id, product_id, content_type")
      .gte("created_at", todayStart.toISOString());

    const todayJobsByAccount = new Map<string, number>();
    (todayJobs || []).forEach(j => {
      todayJobsByAccount.set(j.account_id, (todayJobsByAccount.get(j.account_id) || 0) + 1);
    });

    // 5. Load ALL proposed ideas (we'll check per-account counts)
    const { data: allIdeas } = await supabase
      .from("content_ideas")
      .select("id, title, subject, account_id, opportunity_score, angle, suggested_format, content_type, vertical")
      .eq("status", "proposed")
      .order("opportunity_score", { ascending: false })
      .limit(200);

    const ideasByAccount = new Map<string, typeof allIdeas>();
    (allIdeas || []).forEach(i => {
      const list = ideasByAccount.get(i.account_id) || [];
      list.push(i);
      ideasByAccount.set(i.account_id, list);
    });

    // 6. Process each vertical
    const results: Array<{ vertical: string; account_results: Array<{ account: string; growth: number; product: number; ideas_generated: number }>; skipped: string }> = [];

    for (const config of configs) {
      const vAccounts = accountsByVertical.get(config.vertical) || [];
      if (!vAccounts.length) {
        results.push({ vertical: config.vertical, account_results: [], skipped: "no accounts" });
        continue;
      }

      const vProducts = (products || []).filter(p => p.verticals?.includes(config.vertical) && p.image_url);
      let productIdx = 0;

      const accountResults: Array<{ account: string; growth: number; product: number; ideas_generated: number }> = [];

      for (const acct of vAccounts) {
        const existingToday = todayJobsByAccount.get(acct.account_id) || 0;
        const maxDaily = acct.max_daily_posts || 4;
        let accountIdeas = ideasByAccount.get(acct.account_id) || [];
        let ideasGenerated = 0;

        // AUTO-REFILL: if below threshold, generate more ideas
        if (accountIdeas.length < IDEA_REFILL_THRESHOLD) {
          try {
            console.log(`[daily-engine] Auto-refilling ideas for ${acct.account_id} (${accountIdeas.length} remaining)`);
            const { data: genResult } = await supabase.functions.invoke("generate-ideas", {
              body: { account_id: acct.account_id, vertical: config.vertical, count: 5, mode: "auto" },
            });
            ideasGenerated = genResult?.count || 0;

            // Reload ideas for this account
            if (ideasGenerated > 0) {
              const { data: refreshed } = await supabase
                .from("content_ideas")
                .select("id, title, subject, account_id, opportunity_score, angle, suggested_format, content_type, vertical")
                .eq("account_id", acct.account_id)
                .eq("status", "proposed")
                .order("opportunity_score", { ascending: false })
                .limit(20);
              accountIdeas = refreshed || [];
            }
          } catch (refillErr) {
            console.error(`[daily-engine] Refill failed for ${acct.account_id}:`, refillErr);
          }
        }

        // Per-account targets
        const growthForAccount = Math.max(0, Math.ceil(config.daily_growth_target / vAccounts.length) - Math.floor(existingToday * (config.growth_ratio / 100)));
        const productForAccount = Math.max(0, Math.ceil(config.daily_product_target / vAccounts.length));
        const totalForAccount = Math.min(growthForAccount + productForAccount, maxDaily - existingToday);

        if (totalForAccount <= 0) {
          accountResults.push({ account: acct.account_id, growth: 0, product: 0, ideas_generated: ideasGenerated });
          continue;
        }

        let growthCreated = 0;
        let productCreated = 0;
        let ideaIdx = 0;

        // Create growth posts from ideas
        const growthSlots = Math.min(growthForAccount, totalForAccount);
        for (let i = 0; i < growthSlots && ideaIdx < accountIdeas.length; i++) {
          const idea = accountIdeas[ideaIdx++];
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

        // Create product posts
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

        accountResults.push({ account: acct.account_id, growth: growthCreated, product: productCreated, ideas_generated: ideasGenerated });
      }

      // Update last run timestamp
      await supabase.from("vertical_configs")
        .update({ last_engine_run_at: new Date().toISOString() })
        .eq("id", config.id);

      results.push({ vertical: config.vertical, account_results: accountResults, skipped: "" });
    }

    const totalCreated = results.reduce((s, r) =>
      s + r.account_results.reduce((a, ar) => a + ar.growth + ar.product, 0), 0);

    return respond({ success: true, created: totalCreated, results });

  } catch (err) {
    return respond({ success: false, error: (err as Error).message }, 500);
  }
});

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildAccountTitle(acct: Record<string, unknown>, ideaTitle: string): string {
  const style = (acct.content_style as string) || "";
  if (style) return `[${style}] ${ideaTitle}`;
  return ideaTitle;
}

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
