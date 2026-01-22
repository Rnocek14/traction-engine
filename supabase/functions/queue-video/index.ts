import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VideoRequest {
  script_run_id: string;
  settings: {
    size: string; // e.g., "720x1280"
    seconds: number; // 4, 8, or 12
    model?: string; // "sora-2" or "sora-2-pro"
  };
  starting_frame_url?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: VideoRequest = await req.json();
    const { script_run_id, settings, starting_frame_url } = body;

    if (!script_run_id) {
      throw new Error("script_run_id is required");
    }

    // Validate settings
    const allowedSizes = ["720x1280", "1280x720", "1024x1792", "1792x1024"];
    const allowedSeconds = [4, 8, 12];
    
    const size = settings?.size || "720x1280";
    const seconds = settings?.seconds || 8;
    const model = settings?.model || "sora-2";

    if (!allowedSizes.includes(size)) {
      throw new Error(`Invalid size. Allowed: ${allowedSizes.join(", ")}`);
    }
    if (!allowedSeconds.includes(seconds)) {
      throw new Error(`Invalid seconds. Allowed: ${allowedSeconds.join(", ")}`);
    }

    // Fetch the script to get the prompt
    const { data: script, error: scriptError } = await supabase
      .from("script_runs")
      .select("*")
      .eq("id", script_run_id)
      .single();

    if (scriptError || !script) {
      throw new Error("Script not found");
    }

    // Only allow video generation for qa_passed scripts
    if (script.status !== "qa_passed") {
      throw new Error("Script must pass QA before video generation");
    }

    // Build the video prompt from script content
    const content = script.script_content as Record<string, unknown>;
    const hook = (content?.hook as string) || "";
    const voiceover = (content?.voiceover as string) || "";
    const scenePrompts = (content?.scene_prompts as string[]) || [];

    // Combine into a cinematic prompt
    const videoPrompt = `
Create a cinematic short-form video for social media.

HOOK TEXT (opening): "${hook}"

VOICEOVER: "${voiceover}"

VISUAL SCENES:
${scenePrompts.map((p, i) => `Scene ${i + 1}: ${p}`).join("\n")}

Style: Professional, engaging, suitable for TikTok/Reels. Smooth transitions between scenes.
    `.trim();

    // Create the video job in database first
    const { data: job, error: jobError } = await supabase
      .from("video_jobs")
      .insert({
        script_run_id,
        status: "queued",
        provider: "sora",
        settings: { size, seconds, model },
        progress: 0,
      })
      .select()
      .single();

    if (jobError) {
      throw new Error(`Failed to create job: ${jobError.message}`);
    }

    // Build OpenAI request
    const openaiBody: Record<string, unknown> = {
      model,
      input: [{ type: "text", text: videoPrompt }],
      size,
      seconds,
    };

    // Add starting frame if provided
    if (starting_frame_url) {
      openaiBody.input = [
        { type: "image_url", image_url: starting_frame_url },
        { type: "text", text: videoPrompt },
      ];
    }

    // Call OpenAI Videos API
    const openaiResponse = await fetch("https://api.openai.com/v1/videos", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(openaiBody),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error("OpenAI API error:", errorText);
      
      // Update job with error
      await supabase
        .from("video_jobs")
        .update({ 
          status: "failed", 
          error: `OpenAI API error: ${openaiResponse.status}` 
        })
        .eq("id", job.id);

      throw new Error(`OpenAI API error: ${openaiResponse.status}`);
    }

    const openaiData = await openaiResponse.json();
    const openaiVideoId = openaiData.id;

    // Update job with OpenAI video ID
    await supabase
      .from("video_jobs")
      .update({ 
        status: "running",
        openai_video_id: openaiVideoId,
      })
      .eq("id", job.id);

    console.log(`Created OpenAI video job: ${openaiVideoId} for job: ${job.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        job: {
          id: job.id,
          status: "running",
          openai_video_id: openaiVideoId,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("queue-video error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});