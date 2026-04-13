import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { product_id } = await req.json();
    if (!product_id) {
      return new Response(JSON.stringify({ error: "product_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch product + analysis
    const { data: product, error: pErr } = await supabase
      .from("products")
      .select("*, product_analysis(*)")
      .eq("id", product_id)
      .single();

    if (pErr || !product) {
      return new Response(JSON.stringify({ error: "Product not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all active/warmup accounts with strategy fields
    const { data: accounts, error: aErr } = await supabase
      .from("account_configs")
      .select("account_id, account_name, handle, platform, vertical, monetization_mode, status, allowed_product_categories, content_pillars, content_style, priority_score, persona, audience, posting_frequency_target")
      .in("status", ["active", "warmup"])
      .in("monetization_mode", ["product_first", "hybrid"]);

    if (aErr || !accounts?.length) {
      return new Response(JSON.stringify({ error: "No eligible accounts", assignments: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const productCategory = (product.category || "").toLowerCase();
    const productSubcategory = (product.subcategory || "").toLowerCase();
    const analysis = product.product_analysis?.[0];
    const plan = product.marketing_plan as any;
    const winningAngles = plan?.marketing_plan?.winning_angles || [];

    // Score each account for this product
    const scored = accounts.map((account) => {
      let score = 0;
      const reasons: string[] = [];

      // 1. Category match (strongest signal)
      const cats = (account.allowed_product_categories || []).map((c: string) => c.toLowerCase());
      const categoryMatch = cats.some((c: string) =>
        productCategory.includes(c) || c.includes(productCategory) ||
        productSubcategory.includes(c) || c.includes(productSubcategory)
      );
      if (categoryMatch) {
        score += 40;
        reasons.push("Category match");
      } else if (cats.length === 0) {
        // No category restriction but product_first — slight match
        score += 5;
      }

      // 2. Priority score contribution
      score += Math.round((account.priority_score || 50) / 5);
      
      // 3. Active > warmup
      if (account.status === "active") {
        score += 10;
        reasons.push("Active account");
      }

      // 4. Content pillar overlap
      const pillars = (account.content_pillars || []).map((p: string) => p.toLowerCase());
      const productTerms = [productCategory, productSubcategory, product.name.toLowerCase()].filter(Boolean);
      const pillarMatch = pillars.some((p: string) =>
        productTerms.some((t: string) => p.includes(t) || t.includes(p))
      );
      if (pillarMatch) {
        score += 15;
        reasons.push("Content pillar match");
      }

      // 5. Pick best angle from marketing plan
      let bestAngle = "product demo";
      if (winningAngles.length > 0) {
        // Try to match angle to account style
        const style = (account.content_style || "").toLowerCase();
        const matched = winningAngles.find((a: any) => {
          const angleName = (a.angle_name || "").toLowerCase();
          return style.includes("demo") && angleName.includes("demo") ||
                 style.includes("aesthetic") && angleName.includes("aesthetic") ||
                 style.includes("value") && angleName.includes("value") ||
                 style.includes("satisfying") && angleName.includes("visual");
        });
        bestAngle = matched?.angle_name || winningAngles[0]?.angle_name || "product demo";
      }

      // 6. Determine CTA type
      const ctaType = account.monetization_mode === "product_first" ? "product_link" : "app_download";

      return {
        account_id: account.account_id,
        account_name: account.account_name || account.account_id,
        platform: account.platform,
        vertical: account.vertical,
        score,
        reasons,
        angle: bestAngle,
        cta_type: ctaType,
        posting_frequency: account.posting_frequency_target,
      };
    });

    // Filter and sort
    const assignments = scored
      .filter((s) => s.score >= 15) // Minimum relevance threshold
      .sort((a, b) => b.score - a.score)
      .slice(0, 5); // Top 5 accounts max

    // Also create content ideas for top accounts if they don't exist
    const existingIdeas = await supabase
      .from("content_ideas")
      .select("account_id")
      .eq("product_id", product_id)
      .in("account_id", assignments.map((a) => a.account_id));

    const existingAccountIds = new Set((existingIdeas.data || []).map((i: any) => i.account_id));

    const newIdeas = assignments
      .filter((a) => !existingAccountIds.has(a.account_id))
      .map((a) => ({
        account_id: a.account_id,
        product_id: product_id,
        title: `${product.name} — ${a.angle}`,
        subject: product.name,
        angle: a.angle,
        vertical: a.vertical,
        status: "proposed",
        generated_by: "auto_assignment",
        cta_type: a.cta_type,
        cta_url: product.source_url || null,
        opportunity_score: a.score,
        emotional_triggers: analysis?.emotional_triggers || [],
      }));

    if (newIdeas.length > 0) {
      await supabase.from("content_ideas").insert(newIdeas);
    }

    return new Response(
      JSON.stringify({
        product_id,
        product_name: product.name,
        total_eligible: accounts.length,
        assignments,
        ideas_created: newIdeas.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
