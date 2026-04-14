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

    // Optional: run for a specific vertical only
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
      return new Response(JSON.stringify({ success: true, message: "No verticals configured for auto-generation", created: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Load accounts grouped by vertical
    const { data: accounts } = await supabase
      .from("account_configs")
      .select("account_id, vertical, account_name, platform, monetization_mode, content_pillars, promise")
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

    const todayJobsByVertical = new Map<string, number>();
    (todayJobs || []).forEach(j => {
      const acct = (accounts || []).find(a => a.account_id === j.account_id);
      if (acct) {
        todayJobsByVertical.set(acct.vertical, (todayJobsByVertical.get(acct.vertical) || 0) + 1);
      }
    });

    // 5. Load top content ideas per vertical for growth content
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

    // 6. Process each vertical
    const results: Array<{ vertical: string; growth_created: number; product_created: number; skipped: string }> = [];

    for (const config of configs) {
      const vAccounts = accountsByVertical.get(config.vertical) || [];
      if (!vAccounts.length) {
        results.push({ vertical: config.vertical, growth_created: 0, product_created: 0, skipped: "no accounts" });
        continue;
      }

      const existingToday = todayJobsByVertical.get(config.vertical) || 0;
      const totalTarget = config.daily_growth_target + config.daily_product_target;
      if (existingToday >= totalTarget) {
        results.push({ vertical: config.vertical, growth_created: 0, product_created: 0, skipped: "daily target met" });
        continue;
      }

      let growthCreated = 0;
      let productCreated = 0;

      // Round-robin account selection
      let accountIdx = 0;
      const pickAccount = () => {
        const acct = vAccounts[accountIdx % vAccounts.length];
        accountIdx++;
        return acct;
      };

      // Create growth posts from top ideas
      const vIdeas = ideasByVertical.get(config.vertical) || [];
      const growthNeeded = Math.max(0, config.daily_growth_target - Math.floor(existingToday * (config.growth_ratio / 100)));

      for (let i = 0; i < Math.min(growthNeeded, vIdeas.length); i++) {
        const idea = vIdeas[i];
        const acct = pickAccount();

        const { error } = await supabase.from("story_jobs").insert({
          title: idea.title,
          account_id: acct.account_id,
          status: "draft",
          content_type: "growth",
          source_idea_id: idea.id,
          auto_generated: true,
        });

        if (!error) {
          growthCreated++;
          // Mark idea as in-progress
          await supabase.from("content_ideas").update({ status: "in_production" }).eq("id", idea.id);
        }
      }

      // Create product posts
      const vProducts = (products || []).filter(p =>
        p.verticals?.includes(config.vertical) && p.image_url
      );
      const productNeeded = Math.max(0, config.daily_product_target);

      for (let i = 0; i < Math.min(productNeeded, vProducts.length); i++) {
        const product = vProducts[i];
        const acct = pickAccount();

        const { error } = await supabase.from("story_jobs").insert({
          title: `${product.name} - Product Video`,
          account_id: acct.account_id,
          product_id: product.id,
          status: "draft",
          content_type: "product_promo",
          auto_generated: true,
        });

        if (!error) productCreated++;
      }

      // Update last run timestamp
      await supabase.from("vertical_configs")
        .update({ last_engine_run_at: new Date().toISOString() })
        .eq("id", config.id);

      results.push({ vertical: config.vertical, growth_created: growthCreated, product_created: productCreated, skipped: "" });
    }

    const totalCreated = results.reduce((s, r) => s + r.growth_created + r.product_created, 0);

    return new Response(JSON.stringify({
      success: true,
      created: totalCreated,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
