/**
 * Lab-specific video queue endpoint
 * Bypasses script_run validation for R&D testing
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LabVideoRequest {
  prompt: string;
  provider: "sora" | "runway" | "luma";
  settings: {
    size: string;
    duration: number;
    style?: string;
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: LabVideoRequest = await req.json();
    const { prompt, provider, settings } = body;

    if (!prompt || !provider) {
      return new Response(
        JSON.stringify({ success: false, error: "prompt and provider required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate a lab-specific script_run_id (not a real script, just for tracking)
    const labScriptId = crypto.randomUUID();

    // Create a minimal script_runs entry for lab testing
    const { error: scriptError } = await supabase.from("script_runs").insert({
      id: labScriptId,
      account_id: "lab-testing",
      status: "qa_passed", // Mark as passed so video can be generated
      script_content: {
        type: "lab_test",
        prompt: prompt,
        voiceover: prompt,
      },
    });

    if (scriptError) {
      console.error("Failed to create lab script:", scriptError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to create lab script entry" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Map size to provider-specific format
    const sizeMap: Record<string, Record<string, string>> = {
      sora: { "9:16": "720x1280", "16:9": "1280x720", "1:1": "1080x1080" },
      runway: { "9:16": "720:1280", "16:9": "1280:720", "1:1": "1080:1080" },
      luma: { "9:16": "9:16", "16:9": "16:9", "1:1": "1:1" },
    };

    const providerSize = sizeMap[provider]?.[settings.size] || settings.size;

    // Create video job
    const { data: job, error: jobError } = await supabase
      .from("video_jobs")
      .insert({
        script_run_id: labScriptId,
        provider,
        status: "queued",
        settings: {
          size: providerSize,
          requested_seconds: settings.duration,
          provider_seconds: settings.duration,
          style: settings.style,
          prompt: prompt.substring(0, 500), // Truncate for storage
          lab_mode: true,
        },
      })
      .select()
      .single();

    if (jobError) {
      console.error("Failed to create video job:", jobError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to create video job" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Now call the actual provider API based on provider type
    let providerJobId: string | null = null;
    let providerError: string | null = null;

    try {
      if (provider === "sora") {
        const openaiKey = Deno.env.get("OPENAI_API_KEY");
        if (!openaiKey) throw new Error("OPENAI_API_KEY not configured");

        // Use FormData for Sora API (required format)
        const form = new FormData();
        form.set("prompt", prompt);
        form.set("model", "sora-2");
        form.set("size", sizeMap.sora[settings.size] || "720x1280");
        form.set("seconds", String(settings.duration));

        const response = await fetch("https://api.openai.com/v1/videos", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            // No Content-Type - fetch sets it for FormData
          },
          body: form,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Sora API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        providerJobId = data.id;

      } else if (provider === "runway") {
        const runwayKey = Deno.env.get("RUNWAY_API_KEY");
        if (!runwayKey) throw new Error("RUNWAY_API_KEY not configured");

        // Runway text_to_video only supports veo3.1, veo3.1_fast, or veo3 models
        // Duration options: 4, 6, or 8 seconds
        // Ratio options: 1280:720, 720:1280, 1080:1920, 1920:1080
        const runwayDuration = settings.duration <= 4 ? 4 : settings.duration <= 6 ? 6 : 8;
        const runwayRatio = sizeMap.runway[settings.size] || "720:1280";

        const response = await fetch("https://api.dev.runwayml.com/v1/text_to_video", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${runwayKey}`,
            "Content-Type": "application/json",
            "X-Runway-Version": "2024-11-06",
          },
          body: JSON.stringify({
            model: "veo3.1_fast",
            promptText: prompt,
            duration: runwayDuration,
            ratio: runwayRatio,
            audio: false,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Runway API error:", errorText);
          throw new Error(`Runway API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        providerJobId = data.id;

      } else if (provider === "luma") {
        const lumaKey = Deno.env.get("LUMA_API_KEY");
        if (!lumaKey) throw new Error("LUMA_API_KEY not configured");

        const response = await fetch("https://api.lumalabs.ai/dream-machine/v1/generations", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lumaKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "ray-2",
            prompt,
            aspect_ratio: sizeMap.luma[settings.size] || "9:16",
            loop: false,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Luma API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        providerJobId = data.id;
      }

      // Update job with provider ID - set both openai_video_id (for legacy processor queries)
      // and settings.provider_job_id (for new code)
      if (providerJobId) {
        await supabase
          .from("video_jobs")
          .update({
            status: "running",
            openai_status: "PENDING",
            openai_video_id: providerJobId, // Required for process-video queries
            settings: {
              ...job.settings,
              provider_job_id: providerJobId,
            },
          })
          .eq("id", job.id);
      }

    } catch (apiError) {
      providerError = apiError instanceof Error ? apiError.message : String(apiError);
      console.error(`${provider} API error:`, providerError);

      // Update job to failed
      await supabase
        .from("video_jobs")
        .update({
          status: "failed",
          error: providerError,
        })
        .eq("id", job.id);
    }

    return new Response(
      JSON.stringify({
        success: !providerError,
        job: {
          id: job.id,
          script_run_id: labScriptId,
          provider,
          status: providerError ? "failed" : "running",
          provider_job_id: providerJobId,
        },
        error: providerError,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Lab queue video error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
