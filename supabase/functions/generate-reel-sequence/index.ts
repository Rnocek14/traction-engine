import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";
import { buildCinematicPrompt, type StyleGuideData } from "../_shared/cinematic-prompts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SequenceRequest {
  script_run_id: string;
  clip_ids: string[];
  settings: { 
    size: string; 
    seconds: number; 
    model?: string;
    seed?: number; // For reproducibility
  };
  resume_from_job_id?: string; // Resume from this job's last frame
}

interface ClipData {
  id: string;
  prompt?: string;
  camera_direction?: string; // Per-clip shot type
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;
    const { script_run_id, clip_ids, settings, resume_from_job_id } = (await req.json()) as SequenceRequest;

    if (!script_run_id || !clip_ids?.length) throw new Error("Missing script_run_id or clip_ids");

    // Fetch timeline with style guide
    const { data: timeline } = await supabase.from("studio_timelines").select("timeline_json")
      .eq("script_run_id", script_run_id).order("version", { ascending: false }).limit(1).single();

    const timelineData = timeline?.timeline_json as { clips?: ClipData[]; style_guide?: StyleGuideData } || {};
    const styleGuide = timelineData.style_guide || null;
    
    // Map clip_ids to clips with prompts
    const clipsToGen = clip_ids
      .map(id => timelineData.clips?.find(c => c.id === id))
      .filter((c): c is ClipData & { prompt: string } => !!c?.prompt);

    const model = settings.model || "sora-2";
    const size = settings.size || "720x1280";
    const [targetW, targetH] = size.split("x").map(Number);

    const results: { clip_id: string; job_id: string; status: string }[] = [];
    
    // If resuming, start with that job's frame; otherwise null
    let prevJobId: string | null = resume_from_job_id || null;
    
    // If resuming, validate the resume job exists and has a spritesheet
    if (resume_from_job_id) {
      const { data: resumeJob } = await supabase
        .from("video_jobs")
        .select("spritesheet_url, status")
        .eq("id", resume_from_job_id)
        .single();
      
      if (!resumeJob?.spritesheet_url) {
        console.warn(`Resume job ${resume_from_job_id} has no spritesheet, starting fresh`);
        prevJobId = null;
      } else {
        console.log(`Resuming from job ${resume_from_job_id}`);
      }
    }

    // Check if we should use reference image for first clip
    let useReferenceImage = false;
    if (!prevJobId && styleGuide?.reference_image_url) {
      useReferenceImage = true;
    }

    for (let i = 0; i < clipsToGen.length; i++) {
      const clip = clipsToGen[i];
      const isFirstClip = i === 0 && !prevJobId;
      
      // Build prompt using shared cinematic prompt builder
      const prompt = buildCinematicPrompt(
        styleGuide, 
        clip.prompt, 
        isFirstClip,
        clip.camera_direction // Per-clip shot direction
      );

      // Create job record
      const { data: job } = await supabase.from("video_jobs").insert({
        script_run_id, 
        status: "queued", 
        provider: "sora",
        settings: { 
          size, 
          seconds: settings.seconds, 
          model, 
          clip_id: clip.id, 
          chained: true, 
          sequence_index: i,
          seed: settings.seed,
          camera_direction: clip.camera_direction,
        },
        progress: 0, 
        openai_status: "pending",
      }).select().single();

      if (!job) { 
        results.push({ clip_id: clip.id, job_id: "", status: "failed" }); 
        continue; 
      }

      const form = new FormData();
      form.set("prompt", prompt);
      form.set("model", model);
      form.set("size", size);
      form.set("seconds", String(settings.seconds));

      // Add image reference for frame chaining (Sora uses "input_reference" parameter)
      if (prevJobId) {
        // Chain from previous job's last frame
        const frameBlob = await extractLastFrame(prevJobId, supabase, targetW, targetH);
        if (frameBlob) {
          form.set("input_reference", new File([frameBlob], "frame.png", { type: "image/png" }));
          console.log(`Chaining clip ${i + 1} from job ${prevJobId}, frame size: ${frameBlob.size} bytes`);
        } else {
          console.warn(`Failed to extract frame from job ${prevJobId}, generating without reference`);
        }
      } else if (useReferenceImage && i === 0) {
        // Use reference image for first clip
        try {
          const refBlob = await fetchReferenceImage(styleGuide!.reference_image_url!, targetW, targetH);
          if (refBlob) {
            form.set("input_reference", new File([refBlob], "frame.png", { type: "image/png" }));
            console.log(`Using reference image for first clip, size: ${refBlob.size} bytes`);
          }
        } catch (err) {
          console.warn("Failed to fetch reference image:", err);
        }
      }

      // Submit to OpenAI
      const resp = await fetch("https://api.openai.com/v1/videos", {
        method: "POST", 
        headers: { Authorization: `Bearer ${openaiApiKey}` }, 
        body: form,
      });

      if (!resp.ok) {
        const errorText = await resp.text();
        console.error(`OpenAI API error for clip ${i + 1}:`, resp.status, errorText);
        await supabase.from("video_jobs").update({ 
          status: "failed", 
          error: `API ${resp.status}: ${errorText.slice(0, 200)}` 
        }).eq("id", job.id);
        results.push({ clip_id: clip.id, job_id: job.id, status: "failed" }); 
        continue;
      }

      const { id: videoId } = await resp.json();
      await supabase.from("video_jobs").update({ 
        status: "running", 
        openai_video_id: videoId 
      }).eq("id", job.id);

      console.log(`Started clip ${i + 1}/${clipsToGen.length}: job=${job.id}, video=${videoId}`);

      // Poll for completion
      const completed = await pollCompletion(videoId, job.id, supabase, openaiApiKey);
      results.push({ clip_id: clip.id, job_id: job.id, status: completed ? "succeeded" : "failed" });
      
      // Only advance chain if this clip succeeded
      if (completed) {
        prevJobId = job.id;
      } else {
        // If a clip fails, we can't chain further without breaking continuity
        console.warn(`Clip ${i + 1} failed, breaking chain. Remaining clips will not be generated.`);
        
        // Mark remaining clips as skipped
        for (let j = i + 1; j < clipsToGen.length; j++) {
          results.push({ 
            clip_id: clipsToGen[j].id, 
            job_id: "", 
            status: "skipped_chain_broken" 
          });
        }
        break;
      }
    }

    const succeeded = results.filter(r => r.status === "succeeded").length;
    const failed = results.filter(r => r.status === "failed").length;
    const skipped = results.filter(r => r.status === "skipped_chain_broken").length;

    return new Response(JSON.stringify({
      success: failed === 0 && skipped === 0,
      results,
      summary: { 
        succeeded, 
        failed, 
        skipped,
        total: clipsToGen.length,
        resume_job_id: results.find(r => r.status === "succeeded")?.job_id || null,
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("generate-reel-sequence error:", err);
    return new Response(JSON.stringify({ success: false, error: String(err) }), { 
      status: 400, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});

/**
 * Extract the last frame from a completed video job
 * IMPORTANT: Use thumbnail preferentially - it's full resolution
 * Spritesheets are often tiny preview thumbnails (154x100) that upscale poorly
 */
async function extractLastFrame(jobId: string, supabase: any, w: number, h: number): Promise<Blob | null> {
  try {
    const { data: job } = await supabase
      .from("video_jobs")
      .select("spritesheet_url, thumbnail_url")
      .eq("id", jobId)
      .single();
    
    // PREFER THUMBNAIL for frame chaining - it's much higher resolution than spritesheet
    // Spritesheet frames are often tiny (154x100) while thumbnails are full-res (720x1280)
    const thumbnailUrl = job?.thumbnail_url;
    
    if (!thumbnailUrl) {
      console.warn(`No thumbnail for job ${jobId}, cannot chain`);
      return null;
    }

    console.log(`Extracting frame from thumbnail: ${thumbnailUrl}`);
    const imgResp = await fetch(thumbnailUrl);
    if (!imgResp.ok) {
      console.error(`Failed to fetch thumbnail: ${imgResp.status}`);
      return null;
    }
    
    const imgData = new Uint8Array(await imgResp.arrayBuffer());
    let img = await Image.decode(imgData);
    
    console.log(`Thumbnail dimensions: ${img.width}x${img.height}`);
    
    // Resize to exact target dimensions (required by Sora API)
    if (img.width !== w || img.height !== h) {
      console.log(`Resizing from ${img.width}x${img.height} to ${w}x${h}`);
      img = img.resize(w, h);
    }
    
    // Encode as high-quality PNG
    const pngBytes = await img.encode();
    console.log(`Frame ready: ${pngBytes.byteLength} bytes`);
    return new Blob([pngBytes.buffer as ArrayBuffer], { type: "image/png" });
    
  } catch (err) {
    console.error(`Failed to extract frame from job ${jobId}:`, err);
    return null;
  }
}

/**
 * Fetch and resize a reference image for first-clip anchoring
 */
async function fetchReferenceImage(url: string, w: number, h: number): Promise<Blob | null> {
  try {
    console.log(`Fetching reference image from ${url}`);
    
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`Failed to fetch: ${resp.status}`);
    }
    
    const imgData = new Uint8Array(await resp.arrayBuffer());
    let img = await Image.decode(imgData);
    
    // Resize to target dimensions
    if (img.width !== w || img.height !== h) {
      img = img.resize(w, h);
    }
    
    // Encode as PNG for lossless quality
    const pngBytes = await img.encode();
    console.log(`Reference image: ${pngBytes.byteLength} bytes`);
    return new Blob([pngBytes.buffer as ArrayBuffer], { type: "image/png" });
  } catch (err) {
    console.error(`Failed to fetch reference image:`, err);
    return null;
  }
}

/**
 * Poll OpenAI for video completion
 */
async function pollCompletion(videoId: string, jobId: string, supabase: any, apiKey: string): Promise<boolean> {
  const maxAttempts = 120; // 10 minutes at 5s intervals
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const resp = await fetch(`https://api.openai.com/v1/videos/${videoId}`, { 
        headers: { Authorization: `Bearer ${apiKey}` } 
      });
      
      if (!resp.ok) { 
        console.warn(`Poll attempt ${i + 1} failed: ${resp.status}`);
        await new Promise(r => setTimeout(r, 5000)); 
        continue; 
      }
      
      const data = await resp.json();
      const status = data.status;
      const progress = Math.min(Math.round((i / maxAttempts) * 100), 99);
      
      await supabase.from("video_jobs").update({ 
        openai_status: status, 
        progress 
      }).eq("id", jobId);

      if (status === "succeeded" || status === "completed") {
        console.log(`Video ${videoId} completed`);
        
        // Trigger process-video to download and create spritesheet
        await supabase.functions.invoke("process-video", { body: { job_ids: [jobId] } });
        
        // Wait for spritesheet to be generated (needed for frame chaining)
        for (let j = 0; j < 24; j++) { // 2 minutes
          const { data } = await supabase
            .from("video_jobs")
            .select("spritesheet_url")
            .eq("id", jobId)
            .single();
          
          if (data?.spritesheet_url) {
            console.log(`Spritesheet ready for job ${jobId}`);
            return true;
          }
          await new Promise(r => setTimeout(r, 5000));
        }
        
        console.warn(`Spritesheet not ready after 2 minutes for job ${jobId}`);
        return true; // Still count as success even without spritesheet
      }
      
      if (status === "failed") { 
        const errorMessage = data.error?.message || data.failure_reason || "Video generation failed";
        console.error(`Video ${videoId} failed: ${errorMessage}`);
        await supabase.from("video_jobs").update({ 
          status: "failed",
          error: errorMessage 
        }).eq("id", jobId); 
        return false; 
      }
      
      await new Promise(r => setTimeout(r, 5000));
      
    } catch (err) {
      console.warn(`Poll error for ${videoId}:`, err);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  
  console.error(`Timeout waiting for video ${videoId}`);
  await supabase.from("video_jobs").update({ 
    status: "failed", 
    error: "Timeout waiting for video completion" 
  }).eq("id", jobId);
  
  return false;
}
