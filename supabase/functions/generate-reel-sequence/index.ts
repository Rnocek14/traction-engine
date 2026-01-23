import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SequenceRequest {
  script_run_id: string;
  clip_ids: string[];
  settings: { size: string; seconds: number; model?: string };
}

interface StyleGuideData {
  character?: string; location?: string; lighting?: string; camera_style?: string;
  color_grade?: string; mood?: string; custom_notes?: string; lens?: string;
  depth_of_field?: string; motion_style?: string; film_stock?: string;
  wardrobe?: string; props?: string; time_of_day?: string;
}

const CAMERA_SPECS: Record<string, string> = {
  documentary: "Handheld camera, intimate close-ups, natural breathing movement",
  cinematic: "Smooth dolly movements, shallow depth of field, dramatic reveals",
  vlog: "Wide 24mm POV, direct address, casual framing",
  static: "Locked-off tripod, minimal movement, tableau compositions",
  dynamic: "Steadicam tracking, fluid reveals, push-ins on emotion",
};

const LIGHTING_SPECS: Record<string, string> = {
  natural: "Soft diffused daylight, ambient bounce, 5600K",
  golden_hour: "Warm 3200K backlight, long shadows, magic hour glow",
  studio: "Three-point lighting, key at 45°, soft fill, 4500K",
  dramatic: "High contrast chiaroscuro, single hard source, deep shadows",
  soft: "Overcast skylight, minimal shadows, even exposure",
};

const COLOR_SPECS: Record<string, string> = {
  warm: "Warm amber grade, lifted shadows, protected skin tones",
  cool: "Cool teal shadows, clean highlights, modern look",
  neutral: "True-to-life colors, balanced white point, documentary grade",
  vintage: "Kodak Portra emulation, subtle grain, muted saturation",
  high_contrast: "S-curve contrast, crushed blacks, punchy colors",
};

function buildCinematicPrompt(style: StyleGuideData | null, scene: string, isFirst: boolean): string {
  const parts: string[] = ["=== DIRECTOR'S BRIEF ===\n"];
  if (style?.character) parts.push(`SUBJECT: ${style.character}. Maintain EXACT appearance throughout.`);
  if (style?.wardrobe) parts.push(`WARDROBE: ${style.wardrobe}`);
  if (style?.location) parts.push(`ENVIRONMENT: ${style.location}`);
  parts.push("\n--- CINEMATOGRAPHY ---");
  parts.push(`CAMERA: ${CAMERA_SPECS[style?.camera_style || "documentary"]}`);
  parts.push(`LENS: ${style?.lens || "50mm"} lens`);
  parts.push("\n--- LIGHTING ---");
  parts.push(LIGHTING_SPECS[style?.lighting || "natural"]);
  parts.push("\n--- COLOR ---");
  parts.push(COLOR_SPECS[style?.color_grade || "neutral"]);
  if (style?.mood) parts.push(`\nMOOD: ${style.mood}`);
  parts.push("\n--- QUALITY ---");
  parts.push("Natural motion blur. Lifelike physics. Photorealistic. No morphing artifacts.");
  if (!isFirst) {
    parts.push("\n--- CONTINUITY ---");
    parts.push("CRITICAL: Continue seamlessly from reference frame. Same person, wardrobe, environment.");
  }
  parts.push("\n=== SCENE ===");
  parts.push(scene);
  return parts.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;
    const { script_run_id, clip_ids, settings } = (await req.json()) as SequenceRequest;

    if (!script_run_id || !clip_ids?.length) throw new Error("Missing script_run_id or clip_ids");

    const { data: timeline } = await supabase.from("studio_timelines").select("timeline_json")
      .eq("script_run_id", script_run_id).order("version", { ascending: false }).limit(1).single();

    const timelineData = timeline?.timeline_json as { clips?: { id: string; prompt?: string }[]; style_guide?: StyleGuideData } || {};
    const styleGuide = timelineData.style_guide || null;
    const clipsToGen = clip_ids.map(id => timelineData.clips?.find(c => c.id === id)).filter((c): c is { id: string; prompt: string } => !!c?.prompt);

    const model = settings.model || "sora-2";
    const size = settings.size || "720x1280";
    const [targetW, targetH] = size.split("x").map(Number);

    const results: { clip_id: string; job_id: string; status: string }[] = [];
    let prevJobId: string | null = null;

    for (let i = 0; i < clipsToGen.length; i++) {
      const clip = clipsToGen[i];
      const prompt = buildCinematicPrompt(styleGuide, clip.prompt, i === 0);

      const { data: job } = await supabase.from("video_jobs").insert({
        script_run_id, status: "queued", provider: "sora",
        settings: { size, seconds: settings.seconds, model, clip_id: clip.id, chained: true, sequence_index: i },
        progress: 0, openai_status: "pending",
      }).select().single();

      if (!job) { results.push({ clip_id: clip.id, job_id: "", status: "failed" }); continue; }

      const form = new FormData();
      form.set("prompt", prompt);
      form.set("model", model);
      form.set("size", size);
      form.set("seconds", String(settings.seconds));

      if (prevJobId) {
        const frame = await extractLastFrame(prevJobId, supabase, targetW, targetH);
        if (frame) form.set("input_reference", new File([frame], "ref.jpg", { type: "image/jpeg" }));
      }

      const resp = await fetch("https://api.openai.com/v1/videos", {
        method: "POST", headers: { Authorization: `Bearer ${openaiApiKey}` }, body: form,
      });

      if (!resp.ok) {
        await supabase.from("video_jobs").update({ status: "failed", error: `API ${resp.status}` }).eq("id", job.id);
        results.push({ clip_id: clip.id, job_id: job.id, status: "failed" }); continue;
      }

      const { id: videoId } = await resp.json();
      await supabase.from("video_jobs").update({ status: "running", openai_video_id: videoId }).eq("id", job.id);

      const completed = await pollCompletion(videoId, job.id, supabase, openaiApiKey);
      results.push({ clip_id: clip.id, job_id: job.id, status: completed ? "succeeded" : "failed" });
      if (completed) prevJobId = job.id;
    }

    return new Response(JSON.stringify({
      success: true, results,
      summary: { succeeded: results.filter(r => r.status === "succeeded").length, failed: results.filter(r => r.status === "failed").length },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

async function extractLastFrame(jobId: string, supabase: any, w: number, h: number): Promise<Uint8Array | null> {
  try {
    const { data: job } = await supabase.from("video_jobs").select("spritesheet_url, thumbnail_url").eq("id", jobId).single();
    const url = job?.spritesheet_url || job?.thumbnail_url;
    if (!url) return null;
    const imgData = new Uint8Array(await (await fetch(url)).arrayBuffer());
    let img = await Image.decode(imgData);
    if (job.spritesheet_url) {
      const fw = Math.floor(img.width / 5), fh = Math.floor(img.height / 5);
      img = img.clone().crop(4 * fw, 4 * fh, fw, fh);
    }
    if (img.width !== w || img.height !== h) img = img.resize(w, h);
    return await img.encodeJPEG(90);
  } catch { return null; }
}

async function pollCompletion(videoId: string, jobId: string, supabase: any, apiKey: string): Promise<boolean> {
  for (let i = 0; i < 120; i++) {
    const resp = await fetch(`https://api.openai.com/v1/videos/${videoId}`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!resp.ok) { await new Promise(r => setTimeout(r, 5000)); continue; }
    const { status, output, outputs } = await resp.json();
    await supabase.from("video_jobs").update({ openai_status: status, progress: Math.min(i, 99) }).eq("id", jobId);
    if (status === "succeeded" || status === "completed") {
      await supabase.functions.invoke("process-video", { body: { job_ids: [jobId] } });
      for (let j = 0; j < 12; j++) {
        const { data } = await supabase.from("video_jobs").select("spritesheet_url").eq("id", jobId).single();
        if (data?.spritesheet_url) return true;
        await new Promise(r => setTimeout(r, 5000));
      }
      return true;
    }
    if (status === "failed") { await supabase.from("video_jobs").update({ status: "failed" }).eq("id", jobId); return false; }
    await new Promise(r => setTimeout(r, 5000));
  }
  return false;
}
