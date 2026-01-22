/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-pipeline-key",
};

interface OverrideRequest {
  script_id: string;
  override_by: string;
  reason: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    // ============================================
    // Pipeline Key Gate
    // ============================================
    const pipelineKey = Deno.env.get("PIPELINE_KEY");
    const clientKey = req.headers.get("x-pipeline-key");

    if (!pipelineKey || clientKey !== pipelineKey) {
      console.warn({ requestId, event: "unauthorized" });
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized", request_id: requestId }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }
    
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    });

    const { script_id, override_by, reason }: OverrideRequest = await req.json();

    if (!script_id || !override_by || !reason) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields", request_id: requestId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log({ requestId, event: "override_start", script_id, override_by });

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

    // Perform the override
    const { error: updateError } = await supabaseAdmin
      .from('script_runs')
      .update({
        status: 'qa_passed',
        qa_override_at: new Date().toISOString(),
        qa_override_by: override_by,
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

    console.log({ requestId, event: "override_complete", script_id });

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