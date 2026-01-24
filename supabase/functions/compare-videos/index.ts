import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ═══════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════

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
  status: string;
}

// ═══════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Async SHA-256 hash for prompt deduplication
 */
async function hashPrompt(prompt: string): Promise<string> {
  const data = new TextEncoder().encode(prompt.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
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
  openaiKey: string,
  isSpritesheetA: boolean,
  isSpritesheetB: boolean
): Promise<ComparisonResult> {
  // Confidence adjustment for image type mismatch
  const bothSpritesheets = isSpritesheetA && isSpritesheetB;
  const imageTypeNote = bothSpritesheets 
    ? "Both are spritesheets showing multiple frames."
    : `Image types differ: A=${isSpritesheetA ? "spritesheet" : "thumbnail"}, B=${isSpritesheetB ? "spritesheet" : "thumbnail"}. Be conservative on temporal comparison.`;

  const systemPrompt = `You are an expert AI video quality analyst. Compare two AI-generated videos (A and B) from the same prompt.

COMPARISON TASK:
- Video A: ${providerA.toUpperCase()}
- Video B: ${providerB.toUpperCase()}
- ${imageTypeNote}

DIMENSIONS TO COMPARE:
1. PROMPT ADHERENCE: Which better matches the prompt?
2. TEMPORAL CONSISTENCY: Which has more stable frames? (${bothSpritesheets ? "compare visible frames" : "be conservative if image types differ"})
3. MOTION REALISM: Which has more natural physics/motion?
4. VISUAL FIDELITY: Which has better detail, fewer artifacts?
5. CINEMATIC QUALITY: Which has better composition/lighting?

CONSISTENCY RULES:
- If winner = A, at least 3/5 deltas should be positive OR sum of deltas > 0
- If winner = B, at least 3/5 deltas should be negative OR sum of deltas < 0
- If winner = tie, sum of deltas should be near 0 and confidence 0.5-0.65

OUTPUT (JSON only, no markdown):
{
  "winner": "A|B|tie",
  "confidence": <0.5-1.0>,
  "deltas": {
    "prompt_adherence": <-20 to 20, positive = A better>,
    "temporal_consistency": <-20 to 20>,
    "motion_realism": <-20 to 20>,
    "visual_fidelity": <-20 to 20>,
    "cinematic_quality": <-20 to 20>
  },
  "reasons": ["Why winner is better (exactly 3-6 bullets)", "...", "..."],
  "key_defects_a": ["Main issues with A (0-3 items)"],
  "key_defects_b": ["Main issues with B (0-3 items)"]
}

DELTA GUIDE:
- ±1-5 = slight edge
- ±6-10 = notable difference  
- ±11-20 = significant gap

Be objective. Provider names should not influence judgment.`;

  const userMessage = `Compare these videos from the same prompt:

PROMPT: ${prompt}

Video A (${providerA}): First image
Video B (${providerB}): Second image

Which is better? Analyze all 5 dimensions.`;

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
    
    // Validate winner
    const winner: "A" | "B" | "tie" = 
      parsed.winner === "A" ? "A" : 
      parsed.winner === "B" ? "B" : "tie";
    
    let confidence = Math.max(0.5, Math.min(1, parsed.confidence || 0.6));
    
    // Reduce confidence if image types differ
    if (!bothSpritesheets) {
      confidence = Math.min(confidence, 0.75);
    }
    
    const clampDelta = (v: unknown): number => Math.max(-20, Math.min(20, Math.round(Number(v) || 0)));
    
    const deltas = {
      prompt_adherence: clampDelta(parsed.deltas?.prompt_adherence),
      temporal_consistency: clampDelta(parsed.deltas?.temporal_consistency),
      motion_realism: clampDelta(parsed.deltas?.motion_realism),
      visual_fidelity: clampDelta(parsed.deltas?.visual_fidelity),
      cinematic_quality: clampDelta(parsed.deltas?.cinematic_quality),
    };
    
    // Validate delta consistency with winner
    const deltaSum = Object.values(deltas).reduce((a, b) => a + b, 0);
    const positiveDeltas = Object.values(deltas).filter(d => d > 0).length;
    const negativeDeltas = Object.values(deltas).filter(d => d < 0).length;
    
    // Enforce consistency
    if (winner === "A" && (deltaSum <= 0 || positiveDeltas < 2)) {
      confidence = Math.min(confidence, 0.6);
    }
    if (winner === "B" && (deltaSum >= 0 || negativeDeltas < 2)) {
      confidence = Math.min(confidence, 0.6);
    }
    
    let reasons = Array.isArray(parsed.reasons) 
      ? parsed.reasons.slice(0, 6).map((r: unknown) => String(r).slice(0, 300))
      : [];
    
    // Ensure minimum 3 reasons
    if (reasons.length < 3) {
      reasons.push("Insufficient justification provided by model");
      confidence = Math.min(confidence, 0.6);
    }
    
    const key_defects_a = Array.isArray(parsed.key_defects_a)
      ? parsed.key_defects_a.slice(0, 3).map((d: unknown) => String(d).slice(0, 100))
      : [];
    
    const key_defects_b = Array.isArray(parsed.key_defects_b)
      ? parsed.key_defects_b.slice(0, 3).map((d: unknown) => String(d).slice(0, 100))
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

    const body = await req.json();
    const { jobIdA, jobIdB, promptOverride } = body;

    // Validate inputs
    if (!jobIdA || !jobIdB) {
      throw new Error("jobIdA and jobIdB are required");
    }
    if (jobIdA === jobIdB) {
      throw new Error("Cannot compare a video with itself");
    }
    if (promptOverride && promptOverride.length > 2000) {
      throw new Error("promptOverride too long (max 2000 chars)");
    }

    // Fetch both jobs with status check
    const { data: jobs, error: fetchError } = await supabase
      .from("video_jobs")
      .select("id, output_url, thumbnail_url, spritesheet_url, enriched_prompt, original_prompt, provider, status")
      .in("id", [jobIdA, jobIdB]);

    if (fetchError) throw fetchError;
    if (!jobs || jobs.length !== 2) throw new Error("Could not find both video jobs");

    const jobA = jobs.find(j => j.id === jobIdA) as VideoJob | undefined;
    const jobB = jobs.find(j => j.id === jobIdB) as VideoJob | undefined;

    if (!jobA || !jobB) throw new Error("Could not find both video jobs");

    // Verify both jobs are complete
    if (jobA.status !== "done" || jobB.status !== "done") {
      throw new Error("Both videos must be completed (status=done) for comparison");
    }

    // Get prompts
    const promptA = jobA.enriched_prompt || jobA.original_prompt;
    const promptB = jobB.enriched_prompt || jobB.original_prompt;
    const comparePrompt = promptOverride || promptA || promptB;
    
    if (!comparePrompt) throw new Error("No prompt available for comparison");

    // Hash prompts for comparison and storage
    const promptHashA = promptA ? await hashPrompt(promptA) : "";
    const promptHashB = promptB ? await hashPrompt(promptB) : "";
    const promptsMatch = promptHashA && promptHashB && promptHashA === promptHashB;
    const comparePromptHash = await hashPrompt(comparePrompt);

    // Get images (prefer spritesheets)
    let imageUrlA = jobA.spritesheet_url || jobA.thumbnail_url;
    let imageUrlB = jobB.spritesheet_url || jobB.thumbnail_url;
    const isSpritesheetA = !!jobA.spritesheet_url;
    const isSpritesheetB = !!jobB.spritesheet_url;

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
      openaiKey,
      isSpritesheetA || imageUrlA.includes("spritesheet"),
      isSpritesheetB || imageUrlB.includes("spritesheet")
    );

    // Compute canonical pair for deduplication
    const jobMin = jobIdA < jobIdB ? jobIdA : jobIdB;
    const jobMax = jobIdA < jobIdB ? jobIdB : jobIdA;
    
    // Determine winner_job UUID
    const winnerJob = result.winner === "A" ? jobIdA : 
                      result.winner === "B" ? jobIdB : null;

    // Upsert comparison result (idempotent)
    const { error: upsertError } = await supabase
      .from("video_comparisons")
      .upsert({
        job_a: jobIdA,
        job_b: jobIdB,
        job_min: jobMin,
        job_max: jobMax,
        prompt_hash: comparePromptHash,
        provider_a: jobA.provider,
        provider_b: jobB.provider,
        winner: result.winner,
        winner_job: winnerJob,
        confidence: result.confidence,
        deltas: result.deltas,
        reasons: result.reasons,
        key_defects_a: result.key_defects_a,
        key_defects_b: result.key_defects_b,
      }, {
        onConflict: "job_min,job_max,prompt_hash",
      });

    if (upsertError) {
      console.error("Failed to store comparison:", upsertError);
    }

    return new Response(JSON.stringify({
      jobIdA,
      jobIdB,
      providerA: jobA.provider,
      providerB: jobB.provider,
      promptsMatch,
      ...result,
      winner_job: winnerJob,
      stored: !upsertError,
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
