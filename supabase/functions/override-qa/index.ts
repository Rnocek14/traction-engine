/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface OverrideRequest {
  script_id: string;
  reason: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      throw new Error("Missing Supabase configuration");
    }

    // ============================================
    // Auth: Verify JWT and check role
    // ============================================
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header", request_id: requestId }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    
    if (authError || !user) {
      console.warn({ requestId, event: "auth_failed", error: authError?.message });
      return new Response(
        JSON.stringify({ success: false, error: "Invalid or expired token", request_id: requestId }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    });

    // Single RPC call to check for admin OR qa role
    const { data: hasRole } = await supabaseAdmin.rpc('has_any_role', { 
      _user_id: user.id, 
      _roles: ['admin', 'qa']
    });

    if (!hasRole) {
      console.warn({ requestId, event: "role_denied", user_id: user.id });
      return new Response(
        JSON.stringify({ success: false, error: "Insufficient permissions. Requires admin or qa role.", request_id: requestId }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { script_id, reason }: OverrideRequest = await req.json();

    if (!script_id || !reason) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: script_id, reason", request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log({ requestId, event: "override_start", script_id, user_id: user.id });

    // Fetch script and check constraints
    const { data: script, error: fetchError } = await supabaseAdmin
      .from('script_runs')
      .select('hard_block_flags, status')
      .eq('id', script_id)
      .single();

    if (fetchError || !script) {
      return new Response(
        JSON.stringify({ success: false, error: "Script not found", request_id: requestId }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Hard blocks cannot be overridden
    if (script.hard_block_flags && script.hard_block_flags.length > 0) {
      console.log({ requestId, event: "override_blocked", reason: "hard_block_flags" });
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Cannot override: hard block flags present (${script.hard_block_flags.join(', ')})`,
          request_id: requestId,
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (script.status !== 'qa_failed') {
      return new Response(
        JSON.stringify({ success: false, error: "Script is not in qa_failed status", request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Perform the override - store user UUID as canonical ID
    const { error: updateError } = await supabaseAdmin
      .from('script_runs')
      .update({
        status: 'qa_passed',
        qa_override_at: new Date().toISOString(),
        qa_override_by: user.id, // UUID, not display name
        qa_override_reason: reason,
        qa_passed_at: new Date().toISOString(),
      })
      .eq('id', script_id);

    if (updateError) {
      console.error({ requestId, event: "override_error", error: updateError.message });
      return new Response(
        JSON.stringify({ success: false, error: updateError.message, request_id: requestId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log({ requestId, event: "override_complete", script_id, user_id: user.id });

    return new Response(
      JSON.stringify({ success: true, request_id: requestId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error({ requestId, event: "override_error", error: error instanceof Error ? error.message : "Unknown" });
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error",
        request_id: requestId,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
