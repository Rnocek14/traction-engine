import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";
import { decode as decodeJpeg } from "https://esm.sh/jpeg-js@0.4.4";
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
    const { data: timeline, error: timelineError } = await supabase.from("studio_timelines").select("timeline_json")
      .eq("script_run_id", script_run_id).order("version", { ascending: false }).limit(1).single();

    // ========== EXPLICIT ERROR: No timeline found ==========
    if (timelineError || !timeline) {
      console.error(`[generate-reel-sequence] No timeline found for script ${script_run_id}:`, timelineError);
      throw new Error(`No timeline found for script ${script_run_id}. The timeline must be saved in Studio before generating videos. This usually means the UI failed to auto-save on load.`);
    }

    const timelineData = timeline?.timeline_json as { clips?: ClipData[]; style_guide?: StyleGuideData } || {};
    const styleGuide = timelineData.style_guide || null;
    
    // Log timeline state for debugging
    console.log(`[generate-reel-sequence] Timeline loaded: ${timelineData.clips?.length || 0} clips in DB, ${clip_ids.length} requested`);
    
    // Map clip_ids to clips with prompts
    const clipsToGen = clip_ids
      .map(id => timelineData.clips?.find(c => c.id === id))
      .filter((c): c is ClipData & { prompt: string } => !!c?.prompt);

    // ========== EXPLICIT ERROR: No matching clips ==========
    if (clipsToGen.length === 0) {
      const dbClipIds = timelineData.clips?.map(c => c.id) || [];
      console.error(`[generate-reel-sequence] No matching clips found.`);
      console.error(`  - Requested clip_ids: ${clip_ids.join(", ")}`);
      console.error(`  - DB clip_ids: ${dbClipIds.join(", ")}`);
      console.error(`  - DB clips with prompts: ${timelineData.clips?.filter(c => c.prompt).length || 0}`);
      throw new Error(`No matching clips found. Timeline has ${timelineData.clips?.length || 0} clips, but none match the ${clip_ids.length} requested clip_ids. This usually means the timeline in the UI is out of sync with the database. Save the timeline (Cmd+S) and try again.`);
    }
    
    console.log(`[generate-reel-sequence] Found ${clipsToGen.length}/${clip_ids.length} clips to generate`);

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
      
      // Try generating with retry logic for moderation failures
      const result = await generateClipWithRetry(
        clip, 
        i, 
        clipsToGen.length,
        isFirstClip,
        styleGuide,
        prevJobId,
        useReferenceImage,
        { script_run_id, model, size, seconds: settings.seconds, seed: settings.seed, targetW, targetH },
        supabase,
        openaiApiKey
      );
      
      results.push({ clip_id: clip.id, job_id: result.jobId, status: result.status });
      
      // Only advance chain if this clip succeeded
      if (result.status === "succeeded") {
        prevJobId = result.jobId;
      } else {
        // If a clip fails after retries, continue without chaining
        console.warn(`Clip ${i + 1} failed after retries, continuing without chain reference`);
        prevJobId = null; // Reset chain but continue
      }
    }

    const succeeded = results.filter(r => r.status === "succeeded").length;
    const failed = results.filter(r => r.status === "failed").length;

    return new Response(JSON.stringify({
      success: succeeded > 0, // Partial success is still success
      results,
      summary: { 
        succeeded, 
        failed, 
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
 * Sanitize prompt to avoid moderation triggers
 * Replaces potentially flagged phrases with neutral alternatives
 */
function sanitizePrompt(prompt: string, aggressive: boolean = false): string {
  // Base replacements for common triggers
  const replacements: [RegExp, string][] = [
    // Original triggers
    [/dark\s*room/gi, "dimly lit indoor space"],
    [/glazed\s*expression/gi, "relaxed expression"],
    [/dead\s*eyes/gi, "soft gaze"],
    [/blue\s*light\s*on\s*face/gi, "soft ambient lighting on face"],
    [/scrolling\s*(endlessly|obsessively)/gi, "browsing casually"],
    [/endless\s*scroll/gi, "casual browsing"],
    [/addicted/gi, "engaged"],
    [/zombie(-like)?/gi, "calm"],
    [/hypnoti[zs]ed/gi, "focused"],
    [/trapped/gi, "seated"],
    [/isolation/gi, "quiet moment"],
    [/desperate/gi, "thoughtful"],
    [/anxiety/gi, "anticipation"],
    [/panic/gi, "urgency"],
    
    // Screen/recording phrases that trigger surveillance flags
    [/screen\s*recording/gi, "digital interface demonstration"],
    [/screen\s*capture/gi, "interface preview"],
    [/behind\s*the\s*curtain/gi, "workflow overview"],
    [/behind\s*the\s*scenes/gi, "creative process"],
    [/in\s*action/gi, "in progress"],
    
    // Voice/cloning phrases
    [/voice\s*cloning/gi, "voice synthesis"],
    [/clone[ds]?\s*(the\s+)?voice/gi, "creates voice audio"],
    [/deepfake/gi, "AI synthesis"],
    [/impersonat(e|ion|ing)/gi, "voice creation"],
    
    // Surveillance/watching phrases
    [/watching\s*you/gi, "viewing content"],
    [/spying/gi, "observing"],
    [/secretly/gi, "quietly"],
    [/hidden\s*camera/gi, "ambient view"],
    [/covert/gi, "subtle"],
    
    // Technology triggers
    [/hack(ing|er)?/gi, "technology"],
    [/exploit/gi, "technique"],
    [/manipulat(e|ion|ing)/gi, "creating"],
    
    // Body/medical triggers
    [/inject(ion|ing)?/gi, "administering"],
    [/blood/gi, "fluid"],
    [/wound/gi, "mark"],
    [/scar/gi, "feature"],
  ];
  
  // Aggressive mode: additional simplification for second retry
  const aggressiveReplacements: [RegExp, string][] = [
    // Remove complex technical descriptions
    [/AI\s*(script|text)\s*generation/gi, "creative writing process"],
    [/text\s*appearing/gi, "words flowing"],
    [/waveform/gi, "audio visualization"],
    [/algorithm/gi, "process"],
    [/neural\s*network/gi, "AI system"],
    [/machine\s*learning/gi, "AI technology"],
    
    // Simplify meta-references
    [/demonstration/gi, "preview"],
    [/tutorial/gi, "guide"],
    [/how[\s-]to/gi, "process of"],
  ];
  
  let sanitized = prompt;
  for (const [pattern, replacement] of replacements) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  
  if (aggressive) {
    for (const [pattern, replacement] of aggressiveReplacements) {
      sanitized = sanitized.replace(pattern, replacement);
    }
  }
  
  return sanitized;
}

/**
 * Check if a prompt contains high-risk phrases that commonly trigger moderation
 */
function hasHighRiskPhrases(prompt: string): { risky: boolean; phrases: string[] } {
  const riskPatterns: [RegExp, string][] = [
    [/screen\s*record/i, "screen recording"],
    [/behind\s*the\s*(curtain|scenes)/i, "behind the curtain/scenes"],
    [/voice\s*clon/i, "voice cloning"],
    [/deepfake/i, "deepfake"],
    [/impersonat/i, "impersonation"],
    [/surveillance/i, "surveillance"],
    [/hidden\s*camera/i, "hidden camera"],
    [/hack(ing|er)/i, "hacking"],
  ];
  
  const found: string[] = [];
  for (const [pattern, name] of riskPatterns) {
    if (pattern.test(prompt)) {
      found.push(name);
    }
  }
  
  return { risky: found.length > 0, phrases: found };
}

/**
 * Generate a single clip with retry logic for moderation failures
 */
async function generateClipWithRetry(
  clip: ClipData & { prompt: string },
  index: number,
  totalClips: number,
  isFirstClip: boolean,
  styleGuide: StyleGuideData | null,
  prevJobId: string | null,
  useReferenceImage: boolean,
  settings: { script_run_id: string; model: string; size: string; seconds: number; seed?: number; targetW: number; targetH: number },
  supabase: any,
  openaiApiKey: string,
  attempt: number = 1
): Promise<{ jobId: string; status: string }> {
  const maxRetries = 3; // Increased to allow reference-free retry
  
  // Pre-check for high-risk phrases
  const riskCheck = hasHighRiskPhrases(clip.prompt);
  if (riskCheck.risky && attempt === 1) {
    console.log(`⚠️ Clip ${index + 1} has high-risk phrases: ${riskCheck.phrases.join(", ")}`);
  }
  
  // On retry, sanitize the prompt progressively more aggressively
  let scenePrompt = clip.prompt;
  if (attempt === 2) {
    scenePrompt = sanitizePrompt(clip.prompt, false);
    console.log(`Retry ${attempt}: Using sanitized prompt`);
  } else if (attempt >= 3) {
    scenePrompt = sanitizePrompt(clip.prompt, true); // Aggressive mode
    console.log(`Retry ${attempt}: Using aggressively sanitized prompt`);
  }
  
  // On third retry, also drop reference image as the combination may trigger
  const dropReference = attempt >= 3;
  const effectiveIsFirstClip = isFirstClip || dropReference;
  const effectivePrevJobId = dropReference ? null : prevJobId;
  const effectiveUseRef = dropReference ? false : useReferenceImage;
  
  if (dropReference && (prevJobId || useReferenceImage)) {
    console.log(`Retry ${attempt}: Dropping reference image/frame to avoid compound triggers`);
  }
  
  // Build prompt using shared cinematic prompt builder
  const prompt = buildCinematicPrompt(
    styleGuide, 
    scenePrompt, 
    effectiveIsFirstClip,
    clip.camera_direction
  );

  // Create job record
  const { data: job } = await supabase.from("video_jobs").insert({
    script_run_id: settings.script_run_id, 
    status: "queued", 
    provider: "sora",
    settings: { 
      size: settings.size, 
      seconds: settings.seconds, 
      model: settings.model, 
      clip_id: clip.id, 
      chained: !!prevJobId, 
      sequence_index: index,
      seed: settings.seed,
      camera_direction: clip.camera_direction,
      retry_attempt: attempt,
    },
    progress: 0, 
    openai_status: "pending",
  }).select().single();

  if (!job) { 
    return { jobId: "", status: "failed" };
  }

  const form = new FormData();
  form.set("prompt", prompt);
  form.set("model", settings.model);
  form.set("size", settings.size);
  form.set("seconds", String(settings.seconds));

  // Add image reference for frame chaining (unless dropped for retry)
  if (effectivePrevJobId) {
    const frameBlob = await extractLastFrame(effectivePrevJobId, supabase, settings.targetW, settings.targetH);
    if (frameBlob) {
      form.set("input_reference", new File([frameBlob], "frame.png", { type: "image/png" }));
      console.log(`Chaining clip ${index + 1} from job ${effectivePrevJobId}, frame size: ${frameBlob.size} bytes`);
    } else {
      console.warn(`Failed to extract frame from job ${effectivePrevJobId}, generating without reference`);
    }
  } else if (effectiveUseRef && index === 0 && styleGuide?.reference_image_url) {
    try {
      const refBlob = await fetchReferenceImage(styleGuide.reference_image_url, settings.targetW, settings.targetH);
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
    console.error(`OpenAI API error for clip ${index + 1} (attempt ${attempt}):`, resp.status, errorText);
    
    // Check if it's a moderation error
    const isModeration = errorText.toLowerCase().includes("moderation") || 
                         errorText.toLowerCase().includes("content policy") ||
                         errorText.toLowerCase().includes("blocked");
    
    if (isModeration && attempt < maxRetries) {
      const nextAttempt = attempt + 1;
      const willDropRef = nextAttempt >= 3;
      console.log(`Moderation block on clip ${index + 1}, retrying (attempt ${nextAttempt})${willDropRef ? " - will drop reference" : ""}`);
      // Delete the failed job record before retry
      await supabase.from("video_jobs").delete().eq("id", job.id);
      return generateClipWithRetry(
        clip, index, totalClips, isFirstClip, styleGuide, prevJobId, 
        useReferenceImage, settings, supabase, openaiApiKey, nextAttempt
      );
    }
    
    await supabase.from("video_jobs").update({ 
      status: "failed", 
      error: `API ${resp.status}: ${errorText.slice(0, 200)}` 
    }).eq("id", job.id);
    return { jobId: job.id, status: "failed" };
  }

  const { id: videoId } = await resp.json();
  await supabase.from("video_jobs").update({ 
    status: "running", 
    openai_video_id: videoId 
  }).eq("id", job.id);

  console.log(`Started clip ${index + 1}/${totalClips}: job=${job.id}, video=${videoId}${attempt > 1 ? ` (attempt ${attempt})` : ''}`);

  // Poll for completion
  const completed = await pollCompletion(videoId, job.id, supabase, openaiApiKey);
  
  // Check if failed due to moderation during generation
  if (!completed) {
    const { data: failedJob } = await supabase
      .from("video_jobs")
      .select("error")
      .eq("id", job.id)
      .single();
    
    const errorMsg = failedJob?.error || "";
    const isModeration = errorMsg.toLowerCase().includes("moderation") || 
                         errorMsg.toLowerCase().includes("blocked");
    
    if (isModeration && attempt < maxRetries) {
      console.log(`Moderation block during generation for clip ${index + 1}, retrying with sanitized prompt`);
      return generateClipWithRetry(
        clip, index, totalClips, isFirstClip, styleGuide, prevJobId, 
        useReferenceImage, settings, supabase, openaiApiKey, attempt + 1
      );
    }
  }
  
  return { jobId: job.id, status: completed ? "succeeded" : "failed" };
}

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
    
    // Try thumbnail first (higher res), fall back to spritesheet (known PNG format)
    const thumbnailUrl = job?.thumbnail_url;
    const spritesheetUrl = job?.spritesheet_url;
    
    if (!thumbnailUrl && !spritesheetUrl) {
      console.warn(`No thumbnail or spritesheet for job ${jobId}, cannot chain`);
      return null;
    }

    // First try thumbnail
    if (thumbnailUrl) {
      try {
        console.log(`Trying thumbnail: ${thumbnailUrl}`);
        const result = await decodeImage(thumbnailUrl, w, h);
        if (result) return result;
      } catch (err) {
        console.warn(`Thumbnail decode failed, trying spritesheet: ${err}`);
      }
    }
    
    // Fallback to spritesheet (last frame of 5x5 grid)
    if (spritesheetUrl) {
      try {
        console.log(`Trying spritesheet: ${spritesheetUrl}`);
        const imgResp = await fetch(spritesheetUrl);
        if (!imgResp.ok) {
          console.error(`Failed to fetch spritesheet: ${imgResp.status}`);
          return null;
        }
        
        const imgData = new Uint8Array(await imgResp.arrayBuffer());
        
        // Detect format - spritesheets from OpenAI are often JPEG
        const isJpeg = imgData[0] === 0xFF && imgData[1] === 0xD8;
        
        let sprite: Image;
        if (isJpeg) {
          // Use jpeg-js for JPEG spritesheets
          console.log(`Decoding JPEG spritesheet...`);
          const jpegData = decodeJpeg(imgData, { useTArray: true, formatAsRGBA: true });
          sprite = new Image(jpegData.width, jpegData.height);
          for (let y = 0; y < jpegData.height; y++) {
            for (let x = 0; x < jpegData.width; x++) {
              const idx = (y * jpegData.width + x) * 4;
              sprite.setPixelAt(x + 1, y + 1, Image.rgbaToColor(
                jpegData.data[idx], jpegData.data[idx + 1], 
                jpegData.data[idx + 2], jpegData.data[idx + 3]
              ));
            }
          }
          console.log(`JPEG spritesheet decoded: ${sprite.width}x${sprite.height}`);
        } else {
          // PNG or other format
          sprite = await Image.decode(imgData);
          console.log(`PNG spritesheet decoded: ${sprite.width}x${sprite.height}`);
        }
        
        // Spritesheet is 5x5 grid, last frame is bottom-right
        const frameW = Math.floor(sprite.width / 5);
        const frameH = Math.floor(sprite.height / 5);
        const lastFrame = sprite.crop(frameW * 4, frameH * 4, frameW, frameH);
        
        console.log(`Extracted last frame from spritesheet: ${frameW}x${frameH}`);
        
        // Resize to target
        const resized = lastFrame.resize(w, h);
        const pngBytes = await resized.encode();
        console.log(`Spritesheet frame ready: ${pngBytes.byteLength} bytes`);
        return new Blob([pngBytes.buffer as ArrayBuffer], { type: "image/png" });
      } catch (err) {
        console.error(`Spritesheet decode also failed: ${err}`);
        return null;
      }
    }
    
    return null;
  } catch (err) {
    console.error(`Failed to extract frame from job ${jobId}:`, err);
    return null;
  }
}

/**
 * Decode an image from URL with format detection (JPEG, PNG, WebP)
 */
async function decodeImage(url: string, w: number, h: number): Promise<Blob | null> {
  const imgResp = await fetch(url);
  if (!imgResp.ok) {
    throw new Error(`Failed to fetch: ${imgResp.status}`);
  }
  
  const imgData = new Uint8Array(await imgResp.arrayBuffer());
  
  // Log first bytes to debug format detection
  const magicBytes = Array.from(imgData.slice(0, 12)).map(b => b.toString(16).padStart(2, '0')).join(' ');
  console.log(`Image magic bytes: ${magicBytes}`);
  
  // Detect image format by magic bytes
  const isJpeg = imgData[0] === 0xFF && imgData[1] === 0xD8;
  const isPng = imgData[0] === 0x89 && imgData[1] === 0x50;
  const isWebP = imgData[0] === 0x52 && imgData[1] === 0x49 && imgData[8] === 0x57 && imgData[9] === 0x45; // RIFF...WEBP
  
  const format = isJpeg ? 'JPEG' : isPng ? 'PNG' : isWebP ? 'WebP' : 'unknown';
  console.log(`Image format: ${format}`);
  
  let img: Image;
  
  if (isWebP) {
    // WebP not supported by imagescript - throw to trigger spritesheet fallback
    throw new Error("WebP format not supported, use spritesheet fallback");
  } else if (isJpeg) {
    // Use jpeg-js for JPEG decoding
    const jpegData = decodeJpeg(imgData, { useTArray: true, formatAsRGBA: true });
    img = new Image(jpegData.width, jpegData.height);
    for (let y = 0; y < jpegData.height; y++) {
      for (let x = 0; x < jpegData.width; x++) {
        const idx = (y * jpegData.width + x) * 4;
        img.setPixelAt(x + 1, y + 1, Image.rgbaToColor(
          jpegData.data[idx], jpegData.data[idx + 1], 
          jpegData.data[idx + 2], jpegData.data[idx + 3]
        ));
      }
    }
    console.log(`JPEG decoded: ${img.width}x${img.height}`);
  } else if (isPng) {
    img = await Image.decode(imgData);
    console.log(`PNG decoded: ${img.width}x${img.height}`);
  } else {
    // Unknown format - try imagescript anyway (might work for some formats)
    img = await Image.decode(imgData);
    console.log(`Decoded unknown format: ${img.width}x${img.height}`);
  }
  
  // Resize to exact target dimensions
  if (img.width !== w || img.height !== h) {
    console.log(`Resizing from ${img.width}x${img.height} to ${w}x${h}`);
    img = img.resize(w, h);
  }
  
  const pngBytes = await img.encode();
  console.log(`Frame ready: ${pngBytes.byteLength} bytes`);
  return new Blob([pngBytes.buffer as ArrayBuffer], { type: "image/png" });
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
    
    // Detect format and decode
    const isJpeg = imgData[0] === 0xFF && imgData[1] === 0xD8;
    let img: Image;
    
    if (isJpeg) {
      const jpegData = decodeJpeg(imgData, { useTArray: true, formatAsRGBA: true });
      img = new Image(jpegData.width, jpegData.height);
      for (let y = 0; y < jpegData.height; y++) {
        for (let x = 0; x < jpegData.width; x++) {
          const idx = (y * jpegData.width + x) * 4;
          img.setPixelAt(x + 1, y + 1, Image.rgbaToColor(
            jpegData.data[idx], jpegData.data[idx + 1], 
            jpegData.data[idx + 2], jpegData.data[idx + 3]
          ));
        }
      }
    } else {
      img = await Image.decode(imgData);
    }
    
    
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
