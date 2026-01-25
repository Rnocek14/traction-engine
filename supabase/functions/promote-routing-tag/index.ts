import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Blocklist of generic tags that should never be promoted
const PROMOTION_BLOCKLIST = new Set([
  "video", "scene", "shot", "camera", "person", "people", 
  "man", "woman", "thing", "object", "background", "foreground",
  "left", "right", "center", "top", "bottom", "frame"
]);

// Same normalization as frontend/backend shared utils
function normalizeRoutingTag(tag: string): string {
  return tag
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify user with anon client
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claims?.claims?.sub) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claims.claims.sub as string;

    // Role check: require admin or qa role
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: hasRole, error: roleError } = await serviceClient.rpc("has_any_role", {
      _user_id: userId,
      _roles: ["admin", "qa"],
    });

    if (roleError || !hasRole) {
      console.log(`[promote-routing-tag] User ${userId} lacks required role`);
      return new Response(
        JSON.stringify({ error: "Forbidden: requires admin or qa role" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse input
    const { tag, note } = await req.json() as { tag?: string; note?: string };
    if (!tag || typeof tag !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'tag' field" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize: strip x_ prefix and clean up
    const rawTag = tag.startsWith("x_") ? tag.slice(2) : tag;
    const normalized = normalizeRoutingTag(rawTag);

    // Validate
    if (!normalized || normalized.length < 2) {
      return new Response(
        JSON.stringify({ error: "Tag too short after normalization", raw: tag, normalized }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (PROMOTION_BLOCKLIST.has(normalized)) {
      return new Response(
        JSON.stringify({ error: "Tag is in blocklist", tag: normalized }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: insertError } = await serviceClient
      .from("routing_tag_allowlist")
      .upsert({
        tag: normalized,
        added_by: userId,
        added_at: new Date().toISOString(),
        source: "manual",
        note: note || `Promoted from x_${normalized} via UI`,
      }, { onConflict: "tag" });

    if (insertError) {
      console.error("[promote-routing-tag] Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to promote tag", detail: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[promote-routing-tag] Promoted tag: ${normalized} by user ${userId}`);

    return new Response(
      JSON.stringify({ ok: true, tag: normalized }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[promote-routing-tag] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
