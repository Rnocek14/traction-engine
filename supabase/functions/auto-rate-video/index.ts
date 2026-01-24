import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATER_VERSION = "vlm-v1";

// Thresholds for auto-learning
const LEARN_HIGH_THRESHOLD = 80;  // Auto-learn as positive (5-star equivalent)
const LEARN_LOW_THRESHOLD = 35;   // Auto-learn as negative (1-star equivalent)
const CONFIDENCE_THRESHOLD = 0.75;

interface AutoRatingResult {
  match_score: number;
  quality_score: number;
  overall_score: number;
  confidence: number;
  reasons: string[];
}

interface VideoJob {
  id: string;
  output_url: string;
  enriched_prompt: string | null;
  original_prompt: string | null;
  provider: string;
  style_hints: string | null;
  settings: Record<string, unknown> | null;
}

/**
 * Extract evenly spaced frame timestamps for analysis
 */
function getFrameTimestamps(durationSeconds: number, frameCount = 8): number[] {
  const timestamps: number[] = [];
  const interval = durationSeconds / (frameCount + 1);
  for (let i = 1; i <= frameCount; i++) {
    timestamps.push(Number((interval * i).toFixed(2)));
  }
  return timestamps;
}

/**
 * Use GPT-4o Vision to analyze video frames and score
 * GPT-4o doesn't support video URLs directly, so we use thumbnail/spritesheet images
 */
async function scoreVideoWithVLM(
  imageUrl: string, // Must be an image URL (thumbnail or spritesheet), NOT video
  prompt: string,
  styleHints: string | null,
  openaiKey: string
): Promise<AutoRatingResult> {
  // Build the analysis prompt
  const systemPrompt = `You are a video quality analyst. You will receive a frame/thumbnail from an AI-generated video and the prompt used to generate it.

Score the video on two dimensions:
1. PROMPT MATCH (0-100): How well does the visible content match the described scene, objects, camera angle, lighting, and mood?
2. VISUAL QUALITY (0-100): How realistic, sharp, and artifact-free does it look?

Be objective and critical. Consider:
- Are all requested elements present?
- Does the composition match the prompt?
- Are there any warping, morphing, or distortion artifacts?
- Does the lighting match the prompt?
- Is the overall quality professional?

Respond ONLY with valid JSON:
{
  "match_score": <0-100>,
  "quality_score": <0-100>,
  "confidence": <0.0-1.0>,
  "reasons": ["reason1", "reason2", "reason3"]
}`;

  const userMessage = `Analyze this AI-generated video frame:

GENERATION PROMPT: ${prompt}
${styleHints ? `\nSTYLE HINTS: ${styleHints}` : ""}

Score the video's prompt match and visual quality. Be specific about what works and what doesn't.`;

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
              {
                type: "image_url",
                image_url: {
                  url: imageUrl,
                  detail: "high", // Use high detail for better analysis
                },
              },
            ],
          },
        ],
        max_tokens: 500,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("OpenAI API error:", error);
      throw new Error(`OpenAI API failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    
    const parsed = JSON.parse(jsonStr);
    
    // Validate and clamp scores
    const matchScore = Math.max(0, Math.min(100, Math.round(parsed.match_score || 50)));
    const qualityScore = Math.max(0, Math.min(100, Math.round(parsed.quality_score || 50)));
    const confidence = Math.max(0, Math.min(1, parsed.confidence || 0.5));
    const reasons = Array.isArray(parsed.reasons) ? parsed.reasons.slice(0, 5) : [];

    // Calculate overall score (weighted)
    const overallScore = Math.round(0.6 * matchScore + 0.4 * qualityScore);

    return {
      match_score: matchScore,
      quality_score: qualityScore,
      overall_score: overallScore,
      confidence,
      reasons,
    };
  } catch (error) {
    console.error("VLM scoring failed:", error);
    // Return uncertain mid-scores on failure
    return {
      match_score: 50,
      quality_score: 50,
      overall_score: 50,
      confidence: 0.1,
      reasons: ["Auto-rating failed, requires human review"],
    };
  }
}

/**
 * Trigger learning analysis if auto-rating is high-confidence extreme
 */
async function maybeLearn(
  supabase: ReturnType<typeof createClient>,
  job: VideoJob,
  rating: AutoRatingResult
): Promise<boolean> {
  // Only learn from high-confidence extremes
  if (rating.confidence < CONFIDENCE_THRESHOLD) {
    console.log(`Skipping learning: confidence ${rating.confidence} < ${CONFIDENCE_THRESHOLD}`);
    return false;
  }

  // Convert 0-100 scores to 1-5 ratings for dual-axis learning
  const scoreToRating = (score: number): number => {
    if (score >= 80) return 5;
    if (score >= 60) return 4;
    if (score >= 40) return 3;
    if (score >= 20) return 2;
    return 1;
  };

  const matchRating = scoreToRating(rating.match_score);
  const preferenceRating = scoreToRating(rating.quality_score);

  // Only learn from extremes (both high or both low)
  const bothHigh = matchRating >= 4 && preferenceRating >= 4;
  const bothLow = matchRating <= 2 && preferenceRating <= 2;

  if (!bothHigh && !bothLow) {
    console.log(`Skipping learning: ratings not aligned (match=${matchRating}, pref=${preferenceRating})`);
    return false;
  }

  console.log(`Auto-learning: match=${matchRating}, pref=${preferenceRating}, source=auto`);

  // Invoke analyze-prompt-success with dual-axis ratings
  const { error } = await supabase.functions.invoke("analyze-prompt-success", {
    body: {
      jobId: job.id,
      provider: job.provider,
      originalPrompt: job.original_prompt,
      enrichedPrompt: job.enriched_prompt,
      styleHints: job.style_hints,
      match_rating: matchRating,
      preference_rating: preferenceRating,
      source: "auto",
    },
  });

  if (error) {
    console.error("Learning invocation failed:", error);
    return false;
  }

  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { jobId, batchMode } = await req.json();

    // Batch mode: find unrated completed jobs
    if (batchMode) {
      const { data: unratedJobs, error: fetchError } = await supabase
        .from("video_jobs")
        .select("id, output_url, thumbnail_url, spritesheet_url, enriched_prompt, original_prompt, provider, style_hints, settings")
        .eq("status", "done")
        .is("auto_rated_at", null)
        .not("output_url", "is", null)
        .limit(10);

      if (fetchError) throw fetchError;

      const results = [];
      for (const job of unratedJobs || []) {
        const prompt = job.enriched_prompt || job.original_prompt;
        if (!prompt || !job.output_url) continue;

        // Use spritesheet or thumbnail for VLM analysis (GPT-4o doesn't support video URLs)
        const imageUrl = job.spritesheet_url || job.thumbnail_url;
        if (!imageUrl) {
          console.log(`Job ${job.id} has no thumbnail/spritesheet, skipping auto-rate`);
          continue;
        }

        const rating = await scoreVideoWithVLM(imageUrl, prompt, job.style_hints, openaiKey);
        
        // Update the job
        const { error: updateError } = await supabase
          .from("video_jobs")
          .update({
            auto_match_score: rating.match_score,
            auto_quality_score: rating.quality_score,
            auto_overall_score: rating.overall_score,
            auto_confidence: rating.confidence,
            auto_rated_at: new Date().toISOString(),
            auto_rater_version: RATER_VERSION,
            auto_reasons: rating.reasons,
          })
          .eq("id", job.id);

        if (updateError) {
          console.error(`Failed to update job ${job.id}:`, updateError);
          continue;
        }

        // Maybe trigger learning
        await maybeLearn(supabase, job, rating);

        results.push({
          jobId: job.id,
          ...rating,
        });
      }

      return new Response(JSON.stringify({ 
        processed: results.length,
        results 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Single job mode
    if (!jobId) {
      throw new Error("jobId required (or set batchMode: true)");
    }

    const { data: job, error: jobError } = await supabase
      .from("video_jobs")
      .select("id, output_url, thumbnail_url, spritesheet_url, enriched_prompt, original_prompt, provider, style_hints, settings")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    if (!job.output_url) {
      throw new Error("Job has no output URL");
    }

    // Use spritesheet or thumbnail for VLM analysis (GPT-4o doesn't support video URLs)
    const imageUrl = job.spritesheet_url || job.thumbnail_url;
    if (!imageUrl) {
      throw new Error("Job has no thumbnail or spritesheet for VLM analysis");
    }

    const prompt = job.enriched_prompt || job.original_prompt;
    if (!prompt) {
      throw new Error("Job has no prompt");
    }

    // Score the video using the thumbnail/spritesheet
    const rating = await scoreVideoWithVLM(imageUrl, prompt, job.style_hints, openaiKey);

    // Update the job
    const { error: updateError } = await supabase
      .from("video_jobs")
      .update({
        auto_match_score: rating.match_score,
        auto_quality_score: rating.quality_score,
        auto_overall_score: rating.overall_score,
        auto_confidence: rating.confidence,
        auto_rated_at: new Date().toISOString(),
        auto_rater_version: RATER_VERSION,
        auto_reasons: rating.reasons,
      })
      .eq("id", jobId);

    if (updateError) throw updateError;

    // Maybe trigger learning
    const learned = await maybeLearn(supabase, job, rating);

    return new Response(JSON.stringify({
      jobId,
      ...rating,
      learned,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Auto-rate error:", error);
    return new Response(JSON.stringify({ 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
