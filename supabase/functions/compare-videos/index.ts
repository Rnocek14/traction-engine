import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ComparisonResult {
  winner: "A" | "B" | "tie";
  confidence: number;
  deltas: {
    prompt_adherence: number;
    temporal_consistency: number;
    motion_realism: number;
    visual_fidelity: number;
    cinematic_quality: number;
  };
  reasons: string[];
  key_defects_a: string[];
  key_defects_b: string[];
}

interface VideoJob {
  id: string;
  output_url: string | null;
  thumbnail_url: string | null;
  spritesheet_url: string | null;
  enriched_prompt: string | null;
  original_prompt: string | null;
  provider: string;
}

/**
 * Simple hash for prompt comparison
 */
function hashPrompt(prompt: string): string {
  let hash = 0;
  for (let i = 0; i < prompt.length; i++) {
    const char = prompt.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

/**
 * Extract thumbnail on demand using FFmpeg service
 */
async function extractThumbnailOnDemand(
  jobId: string,
  videoUrl: string,
  provider: string,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<{ spritesheet_url?: string; thumbnail_url?: string }> {
  const ffmpegServiceUrl = Deno.env.get("FFMPEG_SERVICE_URL");
  if (!ffmpegServiceUrl) return {};

  try {
    const response = await fetch(`${ffmpegServiceUrl}/thumbnail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job_id: jobId,
        video_url: videoUrl,
        upload: {
          bucket: "videos",
          thumbnail_path: `${provider}/${jobId}/thumbnail.jpg`,
          spritesheet_path: `${provider}/${jobId}/spritesheet.jpg`,
          supabase_url: supabaseUrl,
          supabase_service_key: supabaseServiceKey,
        },
        options: {
          thumbnail_time: 1.0,
          spritesheet_frames: 10,
          spritesheet_cols: 5,
        },
      }),
    });

    if (!response.ok) return {};
    return await response.json();
  } catch {
    return {};
  }
}

/**
 * Run pairwise comparison using GPT-4o Vision
 */
async function compareVideosWithVLM(
  imageUrlA: string,
  imageUrlB: string,
  prompt: string,
  providerA: string,
  providerB: string,
  openaiKey: string
): Promise<ComparisonResult> {
  const systemPrompt = `You are an expert AI video quality analyst. You will compare two AI-generated videos (A and B) created from the same prompt.

COMPARISON TASK:
- Both videos were generated from the same prompt
- Video A is from ${providerA.toUpperCase()}
- Video B is from ${providerB.toUpperCase()}
- Compare them across 5 dimensions

DIMENSIONS TO COMPARE:
1. PROMPT ADHERENCE: Which better matches the prompt intent?
2. TEMPORAL CONSISTENCY: Which has more stable, flicker-free frames?
3. MOTION REALISM: Which has more natural, physics-correct motion?
4. VISUAL FIDELITY: Which has better sharpness, detail, fewer artifacts?
5. CINEMATIC QUALITY: Which has better composition, lighting, artistic merit?

OUTPUT (JSON only, no markdown):
{
  "winner": "A|B|tie",
  "confidence": <0.5-1.0>,
  "deltas": {
    "prompt_adherence": <-20 to 20, positive means A is better>,
    "temporal_consistency": <-20 to 20>,
    "motion_realism": <-20 to 20>,
    "visual_fidelity": <-20 to 20>,
    "cinematic_quality": <-20 to 20>
  },
  "reasons": ["Why winner is better (3-6 bullets)", "..."],
  "key_defects_a": ["Main issues with A if any"],
  "key_defects_b": ["Main issues with B if any"]
}

GUIDELINES:
- winner = the overall better video considering all dimensions
- confidence: 0.5-0.65 = very close, 0.65-0.8 = clear difference, 0.8-1.0 = obvious winner
- deltas: positive = A is better, negative = B is better, 0 = equal
- A delta of ±5 = slight edge, ±10 = notable difference, ±15-20 = significant gap
- Be objective. Provider names should not influence your judgment.
- If truly equal, use "tie" with confidence ~0.5`;

  const userMessage = `Compare these two videos generated from the same prompt:

PROMPT: ${prompt}

Video A (${providerA}): First image
Video B (${providerB}): Second image

Which is the better generation? Analyze all 5 dimensions.`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userMessage },
              { type: "image_url", image_url: { url: imageUrlA, detail: "high" } },
              { type: "image_url", image_url: { url: imageUrlB, detail: "high" } },
            ],
          },
        ],
        max_tokens: 1200,
        temperature: 0.4,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("OpenAI API error:", error);
      throw new Error(`OpenAI API failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) jsonStr = jsonMatch[1];
    
    const parsed = JSON.parse(jsonStr);
    
    // Validate and clamp values
    const winner = parsed.winner === "A" ? "A" : parsed.winner === "B" ? "B" : "tie";
    const confidence = Math.max(0.5, Math.min(1, parsed.confidence || 0.6));
    
    const clampDelta = (v: unknown): number => Math.max(-20, Math.min(20, Math.round(Number(v) || 0)));
    
    const deltas = {
      prompt_adherence: clampDelta(parsed.deltas?.prompt_adherence),
      temporal_consistency: clampDelta(parsed.deltas?.temporal_consistency),
      motion_realism: clampDelta(parsed.deltas?.motion_realism),
      visual_fidelity: clampDelta(parsed.deltas?.visual_fidelity),
      cinematic_quality: clampDelta(parsed.deltas?.cinematic_quality),
    };
    
    const reasons = Array.isArray(parsed.reasons) 
      ? parsed.reasons.slice(0, 6).map((r: unknown) => String(r).slice(0, 300))
      : [];
    
    const key_defects_a = Array.isArray(parsed.key_defects_a)
      ? parsed.key_defects_a.slice(0, 5).map((d: unknown) => String(d).slice(0, 100))
      : [];
    
    const key_defects_b = Array.isArray(parsed.key_defects_b)
      ? parsed.key_defects_b.slice(0, 5).map((d: unknown) => String(d).slice(0, 100))
      : [];

    return {
      winner,
      confidence,
      deltas,
      reasons,
      key_defects_a,
      key_defects_b,
    };
  } catch (error) {
    console.error("VLM comparison failed:", error);
    throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) throw new Error("OPENAI_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { jobIdA, jobIdB, promptOverride } = await req.json();

    if (!jobIdA || !jobIdB) {
      throw new Error("jobIdA and jobIdB are required");
    }

    if (jobIdA === jobIdB) {
      throw new Error("Cannot compare a video with itself");
    }

    // Fetch both jobs
    const { data: jobs, error: fetchError } = await supabase
      .from("video_jobs")
      .select("id, output_url, thumbnail_url, spritesheet_url, enriched_prompt, original_prompt, provider")
      .in("id", [jobIdA, jobIdB]);

    if (fetchError) throw fetchError;
    if (!jobs || jobs.length !== 2) throw new Error("Could not find both video jobs");

    const jobA = jobs.find(j => j.id === jobIdA) as VideoJob;
    const jobB = jobs.find(j => j.id === jobIdB) as VideoJob;

    if (!jobA || !jobB) throw new Error("Could not find both video jobs");

    // Get prompts
    const promptA = jobA.enriched_prompt || jobA.original_prompt;
    const promptB = jobB.enriched_prompt || jobB.original_prompt;
    
    // Use override or check prompts are similar enough
    const comparePrompt = promptOverride || promptA;
    if (!comparePrompt) throw new Error("No prompt available for comparison");

    // Warn if prompts differ significantly (but allow comparison)
    let promptHashA = promptA ? hashPrompt(promptA) : "";
    let promptHashB = promptB ? hashPrompt(promptB) : "";
    const promptsMatch = promptHashA === promptHashB;

    // Get images (prefer spritesheets)
    let imageUrlA = jobA.spritesheet_url || jobA.thumbnail_url;
    let imageUrlB = jobB.spritesheet_url || jobB.thumbnail_url;

    // Extract on demand if needed
    if (!imageUrlA && jobA.output_url) {
      const extracted = await extractThumbnailOnDemand(jobA.id, jobA.output_url, jobA.provider, supabaseUrl, serviceKey);
      if (extracted.spritesheet_url || extracted.thumbnail_url) {
        await supabase.from("video_jobs").update({
          thumbnail_url: extracted.thumbnail_url,
          spritesheet_url: extracted.spritesheet_url,
        }).eq("id", jobA.id);
        imageUrlA = extracted.spritesheet_url || extracted.thumbnail_url;
      }
    }

    if (!imageUrlB && jobB.output_url) {
      const extracted = await extractThumbnailOnDemand(jobB.id, jobB.output_url, jobB.provider, supabaseUrl, serviceKey);
      if (extracted.spritesheet_url || extracted.thumbnail_url) {
        await supabase.from("video_jobs").update({
          thumbnail_url: extracted.thumbnail_url,
          spritesheet_url: extracted.spritesheet_url,
        }).eq("id", jobB.id);
        imageUrlB = extracted.spritesheet_url || extracted.thumbnail_url;
      }
    }

    if (!imageUrlA || !imageUrlB) {
      throw new Error("Could not get images for both videos. Ensure thumbnails/spritesheets are available.");
    }

    // Run comparison
    const result = await compareVideosWithVLM(
      imageUrlA,
      imageUrlB,
      comparePrompt,
      jobA.provider,
      jobB.provider,
      openaiKey
    );

    // Store comparison result
    const { error: insertError } = await supabase
      .from("video_comparisons")
      .insert({
        job_a: jobIdA,
        job_b: jobIdB,
        prompt_hash: hashPrompt(comparePrompt),
        provider_a: jobA.provider,
        provider_b: jobB.provider,
        winner: result.winner,
        confidence: result.confidence,
        deltas: result.deltas,
        reasons: result.reasons,
        key_defects_a: result.key_defects_a,
        key_defects_b: result.key_defects_b,
      });

    if (insertError) {
      console.error("Failed to store comparison:", insertError);
      // Don't throw - still return the result
    }

    return new Response(JSON.stringify({
      jobIdA,
      jobIdB,
      providerA: jobA.provider,
      providerB: jobB.provider,
      promptsMatch,
      ...result,
      stored: !insertError,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Compare error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
