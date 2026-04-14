import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple keyword-based vertical matching
const VERTICAL_KEYWORDS: Record<string, string[]> = {
  privacy: ["vpn", "security", "privacy", "camera", "surveillance", "lock", "safe", "tracker", "gps", "alarm", "password", "encryption", "firewall"],
  health: ["health", "medical", "wellness", "recovery", "therapy", "massage", "brain", "sleep", "posture", "pain", "vitamin", "supplement", "fitness", "exercise"],
  education: ["book", "study", "learning", "career", "resume", "skill", "course", "training", "planner", "notebook", "pen", "desk"],
  gadgets: ["gadget", "tech", "electronic", "usb", "charger", "bluetooth", "wireless", "led", "smart", "phone", "tablet", "adapter", "cable", "speaker", "headphone", "lamp", "light", "tool", "multitool"],
  home: ["home", "kitchen", "decor", "furniture", "cleaning", "organizer", "storage", "bathroom", "bedroom", "shelf", "plant", "candle", "rug", "pillow", "mat"],
  toys: ["toy", "game", "puzzle", "fidget", "slime", "sand", "satisfying", "kid", "children", "baby", "fun", "play", "craft", "diy", "creative"],
};

function matchVerticals(product: { name: string; category?: string | null; short_description?: string | null; distinctive_attributes?: string[] | null }): string[] {
  const text = [
    product.name,
    product.category || "",
    product.short_description || "",
    ...(product.distinctive_attributes || []),
  ].join(" ").toLowerCase();

  const matches: Array<{ vertical: string; score: number }> = [];

  for (const [vertical, keywords] of Object.entries(VERTICAL_KEYWORDS)) {
    const score = keywords.reduce((s, kw) => s + (text.includes(kw) ? 1 : 0), 0);
    if (score > 0) matches.push({ vertical, score });
  }

  // Sort by score descending, return top matches
  matches.sort((a, b) => b.score - a.score);

  // Always include at least "gadgets" as fallback for physical products
  if (matches.length === 0) return ["gadgets"];

  return matches.slice(0, 3).map(m => m.vertical);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const productId = body.product_id as string | undefined;

    // Load products that need vertical assignment
    let query = supabase.from("products").select("id, name, category, short_description, distinctive_attributes, verticals").neq("status", "dead");
    if (productId) {
      query = query.eq("id", productId);
    } else {
      // Only products without vertical assignments
      query = query.eq("verticals", "{}");
    }

    const { data: products, error } = await query;
    if (error) throw error;

    let updated = 0;
    for (const product of products || []) {
      const verticals = matchVerticals(product);
      if (verticals.length > 0) {
        const { error: updateErr } = await supabase
          .from("products")
          .update({ verticals })
          .eq("id", product.id);
        if (!updateErr) updated++;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      processed: (products || []).length,
      updated,
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
