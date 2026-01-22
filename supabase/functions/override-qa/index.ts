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

  try {
    // ============================================
    // Pipeline Key Gate
    // ============================================
    const pipelineKey = Deno.env.get("PIPELINE_KEY");
    const clientKey = req.headers.get("x-pipeline-key");

    if (!pipelineKey || clientKey !== pipelineKey) {
      console.warn("[override-qa] Unauthorized request");
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
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
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch script and check constraints
    const { data: script, error: fetchError } = await supabaseAdmin
      .from('script_runs')
      .select('hard_block_flags, status')
      .eq('id', script_id)
      .single();

    if (fetchError || !script) {
      return new Response(
        JSON.stringify({ success: false, error: "Script not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Hard blocks cannot be overridden
    if (script.hard_block_flags && script.hard_block_flags.length > 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Cannot override: hard block flags present (${script.hard_block_flags.join(', ')})` 
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (script.status !== 'qa_failed') {
      return new Response(
        JSON.stringify({ success: false, error: "Script is not in qa_failed status" }),
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
      console.error("Update error:", updateError);
      return new Response(
        JSON.stringify({ success: false, error: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[override-qa] Script ${script_id} overridden by ${override_by}`);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});