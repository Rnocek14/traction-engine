/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RegenerateRequest {
  script_id: string;
  mode: 'ai' | 'template';
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

    // Check for admin or qa role
    const { data: hasAdminRole } = await supabaseAdmin.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    const { data: hasQaRole } = await supabaseAdmin.rpc('has_role', { _user_id: user.id, _role: 'qa' });

    if (!hasAdminRole && !hasQaRole) {
      console.warn({ requestId, event: "role_denied", user_id: user.id });
      return new Response(
        JSON.stringify({ success: false, error: "Insufficient permissions", request_id: requestId }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { script_id, mode }: RegenerateRequest = await req.json();

    if (!script_id || !mode) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: script_id, mode", request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log({ requestId, event: "regenerate_start", script_id, mode, user_id: user.id });

    // Fetch the original script to get account and topic info
    const { data: original, error: fetchError } = await supabaseAdmin
      .from('script_runs')
      .select('account_id, topic_id')
      .eq('id', script_id)
      .single();

    if (fetchError || !original) {
      return new Response(
        JSON.stringify({ success: false, error: "Original script not found", request_id: requestId }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch topic to get pillar for relevance
    let preferredPillar: string | undefined;
    if (original.topic_id) {
      const { data: topic } = await supabaseAdmin
        .from('topic_bank')
        .select('pillar')
        .eq('id', original.topic_id)
        .single();
      
      if (topic) {
        preferredPillar = topic.pillar;
      }
    }

    // Call generate-script internally (server-to-server)
    // We'll invoke the function directly using Supabase Functions
    const generateUrl = `${supabaseUrl}/functions/v1/generate-script`;
    
    const generateResponse = await fetch(generateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`, // Service role for internal call
      },
      body: JSON.stringify({
        account_id: original.account_id,
        preferred_pillar: preferredPillar,
        mode,
        regenerated_from_id: script_id, // Link to original
      }),
    });

    const generateResult = await generateResponse.json();

    if (!generateResult.success) {
      console.error({ requestId, event: "regenerate_failed", error: generateResult.error });
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: generateResult.error || "Regeneration failed",
          request_id: requestId,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log({ 
      requestId, 
      event: "regenerate_complete", 
      original_id: script_id,
      new_id: generateResult.script_run?.id,
    });

    return new Response(
      JSON.stringify({
        success: true,
        script_run: generateResult.script_run,
        original_script_id: script_id,
        request_id: requestId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error({ requestId, event: "regenerate_error", error: error instanceof Error ? error.message : "Unknown" });
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
