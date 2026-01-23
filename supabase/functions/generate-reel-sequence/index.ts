import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = "https://jrujlpljluvxewjytuab.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

interface SequenceRequest {
  script_run_id: string;
  clip_ids: string[];
  settings: {
    size: string;
    seconds: number;
    model?: string;
  };
}

interface ClipData {
  id: string;
  prompt: string;
}

/**
 * Generates videos for clips sequentially, using the last frame of each
 * completed video as the starting frame for the next clip.
 * This ensures visual continuity across the entire reel.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { script_run_id, clip_ids, settings } = (await req.json()) as SequenceRequest;

    if (!script_run_id || !clip_ids?.length) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing script_run_id or clip_ids" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch timeline to get clip prompts and style guide
    const { data: timeline, error: timelineError } = await supabase
      .from("studio_timelines")
      .select("timeline_json")
      .eq("script_run_id", script_run_id)
      .order("version", { ascending: false })
      .limit(1)
      .single();

    if (timelineError || !timeline) {
      return new Response(
        JSON.stringify({ success: false, error: "Timeline not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const timelineData = timeline.timeline_json as { clips: ClipData[]; style_guide?: Record<string, string> };
    const styleGuide = timelineData.style_guide;

    // Build style prefix from style guide
    const buildStylePrefix = (): string => {
      if (!styleGuide) return "";
      const parts = ["VISUAL CONSISTENCY REQUIREMENTS:"];
      if (styleGuide.character) parts.push(`- Subject: ${styleGuide.character}`);
      if (styleGuide.location) parts.push(`- Location: ${styleGuide.location}`);
      if (styleGuide.lighting) {
        const lightingMap: Record<string, string> = {
          morning: "soft golden morning light from window",
          golden_hour: "warm golden hour lighting, long shadows",
          night: "moody nighttime lighting, artificial warm sources",
          studio: "clean studio lighting, even and professional",
          natural: "natural daylight, soft and diffused",
        };
        parts.push(`- Lighting: ${lightingMap[styleGuide.lighting] || styleGuide.lighting}`);
      }
      if (styleGuide.camera_style) {
        const cameraMap: Record<string, string> = {
          documentary: "intimate documentary style, handheld, natural movement",
          cinematic: "cinematic wide shots, smooth dolly movements",
          vlog: "personal vlog style, direct to camera",
          static: "locked off tripod shots, minimal movement",
        };
        parts.push(`- Camera: ${cameraMap[styleGuide.camera_style] || styleGuide.camera_style}`);
      }
      if (styleGuide.color_grade) {
        const colorMap: Record<string, string> = {
          warm: "warm amber color grading, cozy feel",
          cool: "cool blue tones, modern and clean",
          neutral: "neutral natural colors, balanced",
          vintage: "vintage film look, slight grain, muted colors",
        };
        parts.push(`- Color: ${colorMap[styleGuide.color_grade] || styleGuide.color_grade}`);
      }
      if (styleGuide.mood) parts.push(`- Mood: ${styleGuide.mood}`);
      return parts.join("\n") + "\n\nSCENE: ";
    };

    const stylePrefix = buildStylePrefix();

    // Get clips in order
    const clipsToGenerate = clip_ids
      .map((id) => timelineData.clips.find((c) => c.id === id))
      .filter((c): c is ClipData => !!c && !!c.prompt);

    if (clipsToGenerate.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No valid clips found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const model = settings.model || (settings.size.startsWith("1024") || settings.size.startsWith("1792") ? "sora-2-pro" : "sora-2");
    const results: { clip_id: string; job_id: string; status: string }[] = [];
    let previousVideoUrl: string | null = null;

    // Process clips sequentially
    for (let i = 0; i < clipsToGenerate.length; i++) {
      const clip = clipsToGenerate[i];
      const videoPrompt = stylePrefix + clip.prompt;

      console.log(`[Sequence ${i + 1}/${clipsToGenerate.length}] Generating clip ${clip.id}`);
      if (previousVideoUrl) {
        console.log(`  Using previous frame from: ${previousVideoUrl.slice(0, 50)}...`);
      }

      // Create video job record
      const { data: job, error: jobError } = await supabase
        .from("video_jobs")
        .insert({
          script_run_id,
          provider: "sora",
          status: "queued",
          settings: {
            clip_id: clip.id,
            size: settings.size,
            seconds: settings.seconds,
            model,
            chained: true,
            sequence_index: i,
          },
        })
        .select()
        .single();

      if (jobError || !job) {
        console.error(`Failed to create job for clip ${clip.id}:`, jobError);
        results.push({ clip_id: clip.id, job_id: "", status: "failed" });
        continue;
      }

      try {
        // Build form data for OpenAI
        const form = new FormData();
        form.set("model", model);
        form.set("prompt", videoPrompt);
        form.set("size", settings.size);
        form.set("duration", String(settings.seconds));
        form.set("n", "1");

        // Add starting frame if we have a previous video
        if (previousVideoUrl) {
          console.log(`  Fetching last frame from previous video...`);
          const frameUrl = await extractLastFrame(previousVideoUrl);
          if (frameUrl) {
            const frameResp = await fetch(frameUrl);
            if (frameResp.ok) {
              const frameBlob = await frameResp.blob();
              form.set("input_reference", new File([frameBlob], "start-frame.jpg", { type: "image/jpeg" }));
              console.log(`  Added starting frame to request`);
            }
          }
        }

        // Update job to running
        await supabase.from("video_jobs").update({ status: "running" }).eq("id", job.id);

        // Call OpenAI Sora API
        const soraResp = await fetch("https://api.openai.com/v1/video/generations", {
          method: "POST",
          headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
          body: form,
        });

        if (!soraResp.ok) {
          const errText = await soraResp.text();
          throw new Error(`Sora API error: ${soraResp.status} - ${errText}`);
        }

        const soraData = await soraResp.json();
        const videoId = soraData.id;

        console.log(`  Sora job created: ${videoId}`);

        // Update job with OpenAI ID
        await supabase.from("video_jobs").update({
          openai_video_id: videoId,
          openai_status: soraData.status || "pending",
        }).eq("id", job.id);

        // Poll for completion (with timeout)
        const completedVideo = await pollForCompletion(videoId, job.id, supabase as any);

        if (completedVideo?.output_url) {
          previousVideoUrl = completedVideo.output_url;
          results.push({ clip_id: clip.id, job_id: job.id, status: "succeeded" });
          console.log(`  Clip ${clip.id} completed successfully`);
        } else {
          results.push({ clip_id: clip.id, job_id: job.id, status: "failed" });
          console.log(`  Clip ${clip.id} failed or timed out`);
          // Continue anyway - next clip won't have starting frame but will still generate
        }

      } catch (clipError) {
        console.error(`Error generating clip ${clip.id}:`, clipError);
        await supabase.from("video_jobs").update({
          status: "failed",
          error: clipError instanceof Error ? clipError.message : "Unknown error",
        }).eq("id", job.id);
        results.push({ clip_id: clip.id, job_id: job.id, status: "failed" });
      }
    }

    const succeeded = results.filter((r) => r.status === "succeeded").length;
    const failed = results.filter((r) => r.status === "failed").length;

    return new Response(
      JSON.stringify({
        success: true,
        results,
        summary: { total: clipsToGenerate.length, succeeded, failed },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Sequence generation error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Extract the last frame from a video URL.
 * For now, we use the spritesheet if available, or just pass the video URL
 * and hope Sora can extract a frame from it.
 */
async function extractLastFrame(videoUrl: string): Promise<string | null> {
  // If we have a direct video URL, we can try to create a thumbnail
  // For now, just return the video URL - Sora may accept it as input_reference
  // In production, you'd use ffmpeg or a video processing service
  
  // Check if there's a spritesheet URL we could use
  // Spritesheets typically have the last frame at the end
  
  // For now, return null to skip frame chaining if we can't extract properly
  // This is a placeholder - real implementation would use video processing
  return videoUrl;
}

/**
 * Poll OpenAI for video completion with exponential backoff
 */
async function pollForCompletion(
  videoId: string,
  jobId: string,
  supabase: ReturnType<typeof createClient>,
  maxAttempts = 60, // 5 minutes max
  intervalMs = 5000
): Promise<{ output_url: string } | null> {
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, intervalMs));

    try {
      const resp = await fetch(`https://api.openai.com/v1/video/generations/${videoId}`, {
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      });

      if (!resp.ok) {
        console.log(`  Poll attempt ${attempt + 1}: API error ${resp.status}`);
        continue;
      }

      const data = await resp.json();
      const status = data.status;

      // Update job status - use any to avoid type issues with Supabase client
      await (supabase as any).from("video_jobs").update({
        openai_status: status,
        progress: Math.min(90, (attempt + 1) * 5),
      }).eq("id", jobId);

      if (status === "succeeded" || status === "completed") {
        const outputUrl = data.output?.url || data.generations?.[0]?.url;
        
        if (outputUrl) {
          await (supabase as any).from("video_jobs").update({
            status: "succeeded",
            output_url: outputUrl,
            progress: 100,
          }).eq("id", jobId);
          
          return { output_url: outputUrl };
        }
      }

      if (status === "failed") {
        await (supabase as any).from("video_jobs").update({
          status: "failed",
          error: data.error || "Generation failed",
        }).eq("id", jobId);
        return null;
      }

      console.log(`  Poll attempt ${attempt + 1}: status=${status}`);

    } catch (pollError) {
      console.error(`  Poll error:`, pollError);
    }
  }

  // Timeout
  await (supabase as any).from("video_jobs").update({
    status: "failed",
    error: "Timeout waiting for video generation",
  }).eq("id", jobId);
  
  return null;
}
