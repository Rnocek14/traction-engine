/**
 * batch-supplier-pipeline
 * 
 * Runs top-scored products through the full supplier pipeline:
 *   1. product-research (find wholesale links)
 *   2. enrich-product-links (cheap-first waterfall)
 *   3. validate-product-links
 *   4. select-best-supplier (best-of-3 + economics)
 * 
 * Filters: only products with high virality scores and viable price points.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PipelineResult {
  product_id: string;
  product_name: string;
  stage_reached: string;
  supplier_selected: boolean;
  economics: any;
  error?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { 
      limit = 10, 
      min_score = 85,
      min_price_cents = 3000,
      max_price_cents = 8000,
      skip_existing_suppliers = true,
      dry_run = false,
    } = await req.json().catch(() => ({}));

    // Find top products that need supplier pipeline — enforcing $30-$80 price range
    let query = supabase
      .from("products")
      .select(`
        id, name, price_cents, status, category,
        product_analysis!inner(overall_score, wow_factor, demonstrability_score, impulse_buy_appeal, social_media_potential)
      `)
      .not("status", "in", '("dead","rejected")')
      .gte("product_analysis.overall_score", min_score)
      .gte("price_cents", min_price_cents)
      .lte("price_cents", max_price_cents)
      .order("product_analysis(overall_score)", { ascending: false })
      .limit(limit);

    if (skip_existing_suppliers) {
      query = query.is("preferred_supplier_id", null);
    }

    const { data: products, error: prodErr } = await query;
    if (prodErr) throw new Error(`Product query failed: ${prodErr.message}`);

    if (!products || products.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: "No eligible products found",
        filters: { min_score, min_price_cents, skip_existing_suppliers },
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (dry_run) {
      return new Response(JSON.stringify({
        success: true,
        dry_run: true,
        eligible_products: products.map((p: any) => ({
          id: p.id,
          name: p.name,
          price: p.price_cents ? `$${(p.price_cents / 100).toFixed(2)}` : null,
          score: p.product_analysis?.overall_score,
          wow: p.product_analysis?.wow_factor,
        })),
        count: products.length,
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: PipelineResult[] = [];

    for (const product of products) {
      const result: PipelineResult = {
        product_id: product.id,
        product_name: product.name,
        stage_reached: "start",
        supplier_selected: false,
        economics: null,
      };

      try {
        // Step 1: Check if wholesale links exist, if not run research
        const { count: wholesaleCount } = await supabase
          .from("product_links")
          .select("id", { count: "exact", head: true })
          .eq("product_id", product.id)
          .eq("link_type", "wholesale");

        if (!wholesaleCount || wholesaleCount === 0) {
          console.log(`[batch] ${product.name}: running product-research...`);
          const { error: resErr } = await supabase.functions.invoke("product-research", {
            body: { product_id: product.id },
          });
          if (resErr) {
            result.error = `research failed: ${resErr.message}`;
            result.stage_reached = "research_failed";
            results.push(result);
            continue;
          }
          result.stage_reached = "researched";
        } else {
          result.stage_reached = "has_wholesale_links";
        }

        // Step 2: Check enrichment status
        const { count: enrichedCount } = await supabase
          .from("product_links")
          .select("id", { count: "exact", head: true })
          .eq("product_id", product.id)
          .eq("link_type", "wholesale")
          .in("source_enrichment_status", ["done", "partial", "enriched"]);

        if (!enrichedCount || enrichedCount === 0) {
          console.log(`[batch] ${product.name}: running enrich-product-links...`);
          const { error: enrErr } = await supabase.functions.invoke("enrich-product-links", {
            body: { product_id: product.id },
          });
          if (enrErr) {
            result.error = `enrichment failed: ${enrErr.message}`;
            result.stage_reached = "enrichment_failed";
            results.push(result);
            continue;
          }
          result.stage_reached = "enriched";
        } else {
          result.stage_reached = "already_enriched";
        }

        // Step 3: Run validation
        console.log(`[batch] ${product.name}: running validate-product-links...`);
        await supabase.functions.invoke("validate-product-links", {
          body: { product_id: product.id },
        }).catch(() => { /* non-blocking */ });
        result.stage_reached = "validated";

        // Step 4: Select best supplier
        console.log(`[batch] ${product.name}: running select-best-supplier...`);
        const { data: selData, error: selErr } = await supabase.functions.invoke("select-best-supplier", {
          body: { product_id: product.id },
        });

        if (selErr) {
          result.error = `selection failed: ${selErr.message}`;
          result.stage_reached = "selection_failed";
        } else if (selData?.success && selData?.selected_supplier) {
          result.stage_reached = "supplier_selected";
          result.supplier_selected = true;
          result.economics = selData.economics;
          console.log(`[batch] ✅ ${product.name}: supplier=${selData.selected_supplier.platform} @ $${selData.selected_supplier.price_dollars}, grade=${selData.economics?.viability_grade}`);
        } else {
          result.stage_reached = "no_viable_supplier";
          result.error = selData?.reason || "no candidates";
        }
      } catch (e) {
        result.error = String(e);
        result.stage_reached = "error";
      }

      results.push(result);
    }

    const summary = {
      total: results.length,
      suppliers_found: results.filter(r => r.supplier_selected).length,
      grade_a: results.filter(r => r.economics?.viability_grade === "A").length,
      grade_b: results.filter(r => r.economics?.viability_grade === "B").length,
      failed: results.filter(r => r.error).length,
    };

    console.log(`[batch] Pipeline complete: ${summary.suppliers_found}/${summary.total} suppliers, ${summary.grade_a} Grade A, ${summary.grade_b} Grade B`);

    return new Response(JSON.stringify({
      success: true,
      summary,
      results: results.map(r => ({
        name: r.product_name,
        stage: r.stage_reached,
        supplier: r.supplier_selected,
        grade: r.economics?.viability_grade || null,
        margin: r.economics?.net_margin_pct || null,
        error: r.error || null,
      })),
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[batch] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
