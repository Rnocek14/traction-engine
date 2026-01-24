import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATER_VERSION = "vlm-v2.1-calibrated";

// Thresholds for auto-learning (calibrated for stricter scoring)
const LEARN_HIGH_THRESHOLD = 78;
const LEARN_LOW_THRESHOLD = 55;
const CONFIDENCE_THRESHOLD = 0.75;

// ═══════════════════════════════════════════════════════════════════
// ALLOWLISTS FOR HYGIENE
// ═══════════════════════════════════════════════════════════════════

const ROUTING_TAG_ALLOWLIST = new Set([
  "low_light", "fast_motion", "character_closeup", "establishing_shot",
  "text_heavy", "action_sequence", "dialogue", "atmospheric",
  "product_shot", "nature", "urban", "fantasy", "realistic",
  "slow_motion", "aerial", "handheld", "static_camera", "portrait"
]);

const DEFECT_TYPE_ALLOWLIST = new Set([
  "flicker", "morphing", "identity_drift", "physics_violation", "limb_anomaly",
  "text_corruption", "edge_bleeding", "uncanny_face", "unnatural_motion",
  "inconsistent_lighting", "over_smoothing", "blur_artifact", "texture_crawl",
  "missing_element", "wrong_subject", "floaty_motion", "jitter"
]);

// Evidence heuristic keywords
const DIM_KWS = ["prompt", "adherence", "temporal", "flicker", "motion", "physics", "fidelity", "sharp", "lighting", "composition", "depth", "consistency", "realism"];
const VISUAL_KWS = ["edges", "skin", "texture", "lighting", "shadows", "reflections", "motion blur", "camera", "background", "subject", "hands", "face", "eyes", "hair", "clothing", "environment", "sky", "ground", "water"];
const QUAL_KWS = ["consistent", "stable", "clean", "natural", "crisp", "artifact", "warping", "banding", "noise", "shimmer", "crawl", "smooth", "seamless", "accurate", "precise", "detailed"];

type DefectSeverity = "minor" | "moderate" | "severe";

interface Defect {
  type: string;
  severity: DefectSeverity;
  evidence: string;
  deduction: number;
}

interface AutoRatingResult {
  // Core subscores (0-100)
  prompt_adherence: number;
  temporal_consistency: number;
  motion_realism: number;
  visual_fidelity: number;
  cinematic_quality: number;
  // Computed
  overall_score: number;
  confidence: number;
  // Structured outputs
  defects: Defect[];
  reasons: string[];
  routing_tags: string[];
  // Actionable flags
  hard_fail: boolean;
  regen_recommended: boolean;
  best_use: "final" | "usable_social" | "draft_only" | "reject";
  // Legacy compatibility
  match_score: number;
  quality_score: number;
  motion_score?: number;
  cinematic_score?: number;
  artifact_flags?: string[];
}

interface VideoJob {
  id: string;
  output_url: string;
  thumbnail_url: string | null;
  spritesheet_url: string | null;
  enriched_prompt: string | null;
  original_prompt: string | null;
  provider: string;
  style_hints: string | null;
  settings: Record<string, unknown> | null;
}

/**
 * Extract thumbnail from video using FFmpeg service (on-demand fallback)
 */
async function extractThumbnailOnDemand(
  jobId: string,
  videoUrl: string,
  provider: string,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<{ thumbnail_url?: string; spritesheet_url?: string }> {
  const ffmpegServiceUrl = Deno.env.get("FFMPEG_SERVICE_URL");
  if (!ffmpegServiceUrl) {
    console.log("FFMPEG_SERVICE_URL not configured, cannot extract thumbnail");
    return {};
  }

  try {
    console.log(`Extracting thumbnail on-demand for job ${jobId} (${provider})`);
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

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Thumbnail extraction failed: ${response.status} ${errorText}`);
      return {};
    }

    const result = await response.json();
    console.log(`Thumbnail extracted for job ${jobId}:`, result);
    return {
      thumbnail_url: result.thumbnail_url,
      spritesheet_url: result.spritesheet_url,
    };
  } catch (err) {
    console.error(`Error extracting thumbnail for job ${jobId}:`, err);
    return {};
  }
}

/**
 * Provider-specific scoring criteria with explicit deduction rules
 */
function getProviderCriteria(provider: string): string {
  const deductionRules = `
MANDATORY DEDUCTION RULES (apply these strictly):

TEMPORAL CONSISTENCY:
- Flicker/warping: -5 (minor), -12 (moderate), -20 (severe)
- Object identity drift: -8 (minor), -15 (moderate), -25 (severe)

MOTION REALISM:
- Floaty/unrealistic physics: -5 (minor), -10 (moderate), -15 (severe)
- Jitter/teleport: -10 (minor), -18 (moderate), -25 (severe)

VISUAL FIDELITY:
- Blur/compression: -3 (minor), -8 (moderate), -15 (severe)
- Texture crawl/shimmer: -5 (minor), -12 (moderate), -20 (severe)

PROMPT ADHERENCE:
- Minor missing detail: -5 to -10
- Wrong element present: -15 to -25
- Missing required element: -20 to -40
- Wrong subject entirely: -40 to -60`;

  const criteria: Record<string, string> = {
    runway: `${deductionRules}

RUNWAY-SPECIFIC ISSUES (Gen-3/Gen-4):
- Over-smoothing and plastic skin textures: -8 to -15
- Unnatural camera stabilization ("floaty"): -5 to -12
- Choppy motion at scene transitions: -10 to -20
- Uncanny valley faces at close range: -15 to -25`,
    
    sora: `${deductionRules}

SORA-SPECIFIC ISSUES:
- Temporal inconsistency (frame-to-frame drift): -10 to -20
- Physics simulation breaks (water/cloth/fire): -10 to -25
- Subject identity merge/swap: -20 to -35
- Camera movement not matching prompt: -5 to -15`,
    
    luma: `${deductionRules}

LUMA-SPECIFIC ISSUES (Ray-2):
- Over-stylization beyond prompt intent: -5 to -15
- Inconsistent lighting direction: -8 to -18
- Fast motion blur artifacts: -10 to -20
- Background element shifting: -8 to -15`,
  };

  return criteria[provider] || deductionRules;
}

/**
 * Check if reasons array contains proper evidence for high scores
 * Requires: dimension keyword + visual keyword + qualifier + min length
 */
function hasProperHighScoreEvidence(reasons: string[]): boolean {
  const evidenceReasons = reasons.filter(r => {
    const t = r.toLowerCase();
    const hasDim = DIM_KWS.some(k => t.includes(k));
    const hasVisual = VISUAL_KWS.some(k => t.includes(k));
    const hasQual = QUAL_KWS.some(k => t.includes(k));
    return r.length >= 70 && hasDim && hasVisual && hasQual;
  });
  return evidenceReasons.length >= 2;
}

/**
 * Sanitize and validate routing tags against allowlist
 */
function sanitizeRoutingTags(rawTags: unknown[]): string[] {
  if (!Array.isArray(rawTags)) return [];
  return rawTags
    .map((t) => String(t).toLowerCase().trim().replace(/\s+/g, "_"))
    .filter((t) => ROUTING_TAG_ALLOWLIST.has(t))
    .slice(0, 5);
}

/**
 * Sanitize and validate defects against allowlist
 */
function sanitizeDefects(rawDefects: unknown[]): Defect[] {
  if (!Array.isArray(rawDefects)) return [];
  return rawDefects
    .filter((d): d is Record<string, unknown> => typeof d === "object" && d !== null)
    .map((d) => {
      const rawType = String(d.type || "unnatural_motion").toLowerCase().trim();
      const type = DEFECT_TYPE_ALLOWLIST.has(rawType) ? rawType : "unnatural_motion";
      const rawSeverity = String(d.severity || "minor").toLowerCase();
      const severity: DefectSeverity = 
        rawSeverity === "severe" ? "severe" : 
        rawSeverity === "moderate" ? "moderate" : "minor";
      const deduction = Math.max(0, Math.min(60, Math.round(Number(d.deduction) || 5)));
      const evidence = String(d.evidence || "").slice(0, 200);
      return { type, severity, evidence, deduction };
    })
    .slice(0, 10);
}

/**
 * Use GPT-4o Vision to analyze video frames with calibrated multi-dimensional scoring
 */
async function scoreVideoWithVLM(
  imageUrl: string,
  prompt: string,
  styleHints: string | null,
  openaiKey: string,
  provider: string = "sora"
): Promise<AutoRatingResult> {
  const providerCriteria = getProviderCriteria(provider);
  const isSpritesheetLikely = imageUrl.includes("spritesheet");

  const systemPrompt = `You are an expert AI video quality analyst with STRICT calibration standards. You evaluate ${isSpritesheetLikely ? "spritesheets showing multiple frames from" : "a single thumbnail frame from"} AI-generated videos.

═══════════════════════════════════════════════════════════════════
CALIBRATION STANDARDS (CRITICAL - READ CAREFULLY)
═══════════════════════════════════════════════════════════════════

SCORE DISTRIBUTION REQUIREMENTS:
- 95-100: REFERENCE QUALITY - Indistinguishable from high-end real footage or professional VFX. This is TOP 1-3% of all generations. Reserve only for truly exceptional outputs.
- 88-94: EXCEPTIONAL - Broadcast/cinema quality; tiny tells only on close inspection. Top 5-10%.
- 78-87: STRONG - Very usable for social media; some artifacts present but not distracting. This is where most GOOD generations land.
- 68-77: OKAY - Usable draft quality; noticeable issues that would benefit from regeneration.
- 55-67: WEAK - Multiple issues present; regeneration strongly recommended.
- <55: FAIL - Major mismatch, broken output, or severe defects.

HARD RULE: 95+ should be RARE (top ~1-3%). Most AI-generated videos should land 65-85. Compare against what a Hollywood VFX house would produce, not other AI videos.

═══════════════════════════════════════════════════════════════════
EVALUATION DIMENSIONS (0-100 each, apply deductions strictly)
═══════════════════════════════════════════════════════════════════

1. PROMPT ADHERENCE: Semantic alignment with generation prompt
   - Subject accuracy, action/motion match, camera work, lighting/mood, setting
   - Start at 80, deduct for each mismatch

2. TEMPORAL CONSISTENCY: Frame-to-frame stability ${isSpritesheetLikely ? "(analyze visible frames)" : "(infer from single frame cues - be conservative)"}
   - Object stability, lighting consistency, no flickering/warping
   - Start at 75, deduct for each detected issue

3. MOTION REALISM: Physics and movement quality
   - Natural acceleration, realistic physics, smooth motion
   - Start at 75, deduct for floaty/jittery/unnatural movement

4. VISUAL FIDELITY: Technical quality and detail
   - Sharpness, color grading, detail rendering, artifacts
   - Start at 75, deduct for blur, noise, texture issues

5. CINEMATIC QUALITY: Artistic and compositional merit
   - Composition, depth, lighting artistry, mood conveyance
   - Start at 70, add points only for exceptional artistic merit

${providerCriteria}

═══════════════════════════════════════════════════════════════════
HIGH SCORE JUSTIFICATION REQUIREMENT
═══════════════════════════════════════════════════════════════════

CRITICAL: If you give any dimension a score ≥90, you MUST provide at least 2 detailed reasons (each ≥70 characters) that include:
- A specific visual element (e.g., "skin texture", "shadow edges", "motion blur")
- A dimension reference (e.g., "temporal consistency", "prompt adherence")
- A quality descriptor (e.g., "seamlessly consistent", "precisely accurate")

Example of VALID high-score evidence:
"The subject's skin texture maintains seamlessly consistent detail across all visible frames with no temporal shimmer or crawl artifacts."

Example of INVALID evidence (too generic):
"The video looks great and matches the prompt well."

If you cannot provide 2 such detailed evidence points, you MUST cap that dimension at 89.

═══════════════════════════════════════════════════════════════════
OUTPUT FORMAT (JSON only, no markdown)
═══════════════════════════════════════════════════════════════════

{
  "prompt_adherence": <0-100>,
  "temporal_consistency": <0-100>,
  "motion_realism": <0-100>,
  "visual_fidelity": <0-100>,
  "cinematic_quality": <0-100>,
  "confidence": <0.0-1.0>,
  "defects": [
    {"type": "flicker|morphing|identity_drift|physics_violation|limb_anomaly|text_corruption|edge_bleeding|uncanny_face|unnatural_motion|inconsistent_lighting|over_smoothing|blur_artifact|texture_crawl|missing_element|wrong_subject|floaty_motion|jitter", "severity": "minor|moderate|severe", "evidence": "specific description (max 200 chars)", "deduction": <points deducted 0-60>}
  ],
  "routing_tags": ["low_light", "fast_motion", "character_closeup", "establishing_shot", "text_heavy", "action_sequence", "dialogue", "atmospheric", "product_shot", "nature", "urban", "fantasy", "realistic", "slow_motion", "aerial", "handheld", "static_camera", "portrait"],
  "hard_fail": <true if overall would be <55 or severe critical defects>,
  "regen_recommended": <true if overall <68 or moderate+ defects in key areas>,
  "best_use": "final|usable_social|draft_only|reject",
  "reasons": ["detailed evidence-backed observation 1 (≥70 chars)", "detailed evidence-backed observation 2", ...]
}

Include 2-5 routing_tags that describe this video's characteristics. Include ALL detected defects with severity and point deductions.

CONFIDENCE (0.0-1.0):
- 0.9-1.0: Very clear assessment, multiple frames visible, high certainty
- 0.7-0.89: Good assessment with some ambiguity
- 0.5-0.69: Moderate uncertainty${!isSpritesheetLikely ? " (single frame limits temporal assessment)" : ""}
- <0.5: Low confidence, human review strongly recommended`;

  const userMessage = `Analyze this ${provider.toUpperCase()} AI-generated video with STRICT calibration:

GENERATION PROMPT: ${prompt}
${styleHints ? `STYLE DIRECTION: ${styleHints}` : ""}
PROVIDER: ${provider}
IMAGE TYPE: ${isSpritesheetLikely ? "Spritesheet (multiple frames - analyze temporal consistency)" : "Single thumbnail (be CONSERVATIVE on temporal scoring - you cannot see motion)"}

Apply the calibration standards strictly. Most videos should score 65-85. Reserve 90+ for truly exceptional outputs with clear evidence. Detect and list ALL defects with specific deductions.`;

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
                  detail: "high",
                },
              },
            ],
          },
        ],
        max_tokens: 1500,
        temperature: 0.5,
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
    
    // Extract and validate subscores
    let promptAdherence = Math.max(0, Math.min(100, Math.round(parsed.prompt_adherence || 70)));
    let temporalConsistency = Math.max(0, Math.min(100, Math.round(parsed.temporal_consistency || 70)));
    let motionRealism = Math.max(0, Math.min(100, Math.round(parsed.motion_realism || 70)));
    let visualFidelity = Math.max(0, Math.min(100, Math.round(parsed.visual_fidelity || 70)));
    let cinematicQuality = Math.max(0, Math.min(100, Math.round(parsed.cinematic_quality || 65)));
    let confidence = Math.max(0, Math.min(1, parsed.confidence || 0.5));
    
    // Sanitize defects and routing tags against allowlists
    const defects = sanitizeDefects(parsed.defects || []);
    const routingTags = sanitizeRoutingTags(parsed.routing_tags || []);
    const reasons = Array.isArray(parsed.reasons) ? parsed.reasons.slice(0, 8).map((r: unknown) => String(r).slice(0, 300)) : [];
    
    // ═══════════════════════════════════════════════════════════
    // POST-PROCESSING CAPS (prevent model from inflating scores)
    // ═══════════════════════════════════════════════════════════
    
    // 1. Single thumbnail → cap temporal consistency (can't verify motion)
    if (!isSpritesheetLikely) {
      temporalConsistency = Math.min(temporalConsistency, 82);
      // Also reduce confidence for temporal assessment
      if (confidence > 0.75) {
        confidence = Math.min(confidence, 0.75);
      }
    }
    
    // 2. Check for proper high-score evidence
    const hasEvidence = hasProperHighScoreEvidence(reasons);
    
    if (!hasEvidence) {
      // Cap all dimensions at 89 if no proper evidence
      if (promptAdherence >= 90) promptAdherence = 89;
      if (temporalConsistency >= 90) temporalConsistency = 89;
      if (motionRealism >= 90) motionRealism = 89;
      if (visualFidelity >= 90) visualFidelity = 89;
      if (cinematicQuality >= 90) cinematicQuality = 89;
    }
    
    // 3. Hard caps based on defects
    const severeDefects = defects.filter(d => d.severity === "severe");
    const moderateDefects = defects.filter(d => d.severity === "moderate");
    
    // Severe flicker or identity drift → cap temporal at 70
    if (severeDefects.some(d => d.type === "flicker" || d.type === "identity_drift")) {
      temporalConsistency = Math.min(temporalConsistency, 70);
    }
    
    // Moderate flicker/drift → cap temporal at 78
    if (moderateDefects.some(d => d.type === "flicker" || d.type === "identity_drift")) {
      temporalConsistency = Math.min(temporalConsistency, 78);
    }
    
    // Missing required element or wrong subject → cap adherence
    if (defects.some(d => (d.type === "missing_element" || d.type === "wrong_subject") && d.severity === "severe")) {
      promptAdherence = Math.min(promptAdherence, 55);
    } else if (defects.some(d => (d.type === "missing_element" || d.type === "wrong_subject") && d.severity === "moderate")) {
      promptAdherence = Math.min(promptAdherence, 70);
    }
    
    // Physics/motion defects → cap motion realism
    if (severeDefects.some(d => d.type === "physics_violation" || d.type === "floaty_motion" || d.type === "jitter")) {
      motionRealism = Math.min(motionRealism, 65);
    }
    
    // Multiple moderate+ defects → cap fidelity and motion
    if (moderateDefects.length >= 2 || severeDefects.length >= 1) {
      visualFidelity = Math.min(visualFidelity, 78);
      motionRealism = Math.min(motionRealism, 78);
    }
    
    // Calculate overall score with weighted dimensions
    // Adherence: 30%, Temporal: 20%, Motion: 20%, Fidelity: 20%, Cinematic: 10%
    let overallScore = Math.round(
      0.30 * promptAdherence +
      0.20 * temporalConsistency +
      0.20 * motionRealism +
      0.20 * visualFidelity +
      0.10 * cinematicQuality
    );
    
    // 4. Low confidence → cap overall (prevents fake precision)
    if (confidence < 0.6) {
      overallScore = Math.min(overallScore, 78);
    }
    
    // Determine hard_fail and regen_recommended
    let hardFail = parsed.hard_fail === true || overallScore < 55 || severeDefects.length >= 2;
    let regenRecommended = parsed.regen_recommended === true || overallScore < 68 || moderateDefects.length >= 2 || severeDefects.length >= 1;
    
    // Force hard_fail overall cap
    if (hardFail) {
      overallScore = Math.min(overallScore, 55);
    }
    
    // Determine best_use
    let bestUse: "final" | "usable_social" | "draft_only" | "reject" = "usable_social";
    if (hardFail) {
      bestUse = "reject";
    } else if (overallScore < 68 || regenRecommended) {
      bestUse = "draft_only";
    } else if (overallScore >= 88 && severeDefects.length === 0 && moderateDefects.length === 0) {
      bestUse = "final";
    }
    
    // Extract artifact flags for legacy compatibility
    const artifactFlags = [...new Set(defects.map(d => d.type))];
    
    console.log(`VLM v2.1 scores: adhere=${promptAdherence}, temporal=${temporalConsistency}, motion=${motionRealism}, fidelity=${visualFidelity}, cinematic=${cinematicQuality}, overall=${overallScore}, defects=${defects.length}, hard_fail=${hardFail}, spritesheet=${isSpritesheetLikely}`);

    return {
      prompt_adherence: promptAdherence,
      temporal_consistency: temporalConsistency,
      motion_realism: motionRealism,
      visual_fidelity: visualFidelity,
      cinematic_quality: cinematicQuality,
      overall_score: overallScore,
      confidence,
      defects,
      routing_tags: routingTags,
      hard_fail: hardFail,
      regen_recommended: regenRecommended,
      best_use: bestUse,
      reasons,
      // Legacy compatibility mappings
      match_score: promptAdherence,
      quality_score: visualFidelity,
      motion_score: motionRealism,
      cinematic_score: cinematicQuality,
      artifact_flags: artifactFlags,
    };
  } catch (error) {
    console.error("VLM scoring failed:", error);
    return {
      prompt_adherence: 50,
      temporal_consistency: 50,
      motion_realism: 50,
      visual_fidelity: 50,
      cinematic_quality: 50,
      overall_score: 50,
      confidence: 0.1,
      defects: [],
      routing_tags: [],
      hard_fail: false,
      regen_recommended: true,
      best_use: "draft_only",
      reasons: ["Auto-rating failed, requires human review"],
      match_score: 50,
      quality_score: 50,
      motion_score: 50,
      cinematic_score: 50,
      artifact_flags: [],
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
  // Only learn from high-confidence results
  if (rating.confidence < CONFIDENCE_THRESHOLD) {
    console.log(`Skipping learning: confidence ${rating.confidence} < ${CONFIDENCE_THRESHOLD}`);
    return false;
  }

  // Convert calibrated 0-100 scores to 1-5 ratings for dual-axis learning
  const scoreToRating = (score: number): number => {
    if (score >= 85) return 5;  // Exceptional
    if (score >= 75) return 4;  // Strong
    if (score >= 65) return 3;  // Okay
    if (score >= 55) return 2;  // Weak
    return 1;                   // Fail
  };

  const matchRating = scoreToRating(rating.prompt_adherence);
  
  // Preference is a weighted composite (not just visual_fidelity)
  // This better reflects "do I like it" vs "is it technically good"
  const preferenceProxy = Math.round(
    0.45 * rating.visual_fidelity +
    0.35 * rating.cinematic_quality +
    0.20 * rating.motion_realism
  );
  const preferenceRating = scoreToRating(preferenceProxy);

  // Only learn from clear extremes (both high or both low)
  const bothHigh = matchRating >= 4 && preferenceRating >= 4;
  const bothLow = matchRating <= 2 && preferenceRating <= 2;

  if (!bothHigh && !bothLow) {
    console.log(`Skipping learning: ratings not aligned (match=${matchRating}, pref=${preferenceRating} from proxy=${preferenceProxy})`);
    return false;
  }

  console.log(`Auto-learning: match=${matchRating}, pref=${preferenceRating}, source=auto, routing_tags=${rating.routing_tags.join(",")}`);

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

/**
 * Persist rating to database with full schema
 */
async function persistRating(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  rating: AutoRatingResult
): Promise<void> {
  const { error } = await supabase
    .from("video_jobs")
    .update({
      // Legacy fields (mapped)
      auto_match_score: rating.prompt_adherence,
      auto_quality_score: rating.visual_fidelity,
      auto_motion_score: rating.motion_realism,
      auto_cinematic_score: rating.cinematic_quality,
      auto_overall_score: rating.overall_score,
      auto_confidence: rating.confidence,
      auto_rated_at: new Date().toISOString(),
      auto_rater_version: RATER_VERSION,
      auto_reasons: rating.reasons,
      auto_artifact_flags: rating.artifact_flags,
      // New routing-grade fields
      auto_defects: rating.defects,
      auto_routing_tags: rating.routing_tags,
      auto_hard_fail: rating.hard_fail,
      auto_regen_recommended: rating.regen_recommended,
      auto_best_use: rating.best_use,
    })
    .eq("id", jobId);

  if (error) {
    throw new Error(`Failed to persist rating for job ${jobId}: ${error.message}`);
  }
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

        let imageUrl = job.spritesheet_url || job.thumbnail_url;
        
        if (!imageUrl && job.output_url) {
          console.log(`Job ${job.id} has no thumbnail, extracting on-demand...`);
          const extracted = await extractThumbnailOnDemand(
            job.id,
            job.output_url,
            job.provider,
            supabaseUrl,
            serviceKey
          );
          if (extracted.thumbnail_url || extracted.spritesheet_url) {
            await supabase.from("video_jobs").update({
              thumbnail_url: extracted.thumbnail_url,
              spritesheet_url: extracted.spritesheet_url,
            }).eq("id", job.id);
            imageUrl = extracted.spritesheet_url || extracted.thumbnail_url;
          }
        }
        
        if (!imageUrl) {
          console.log(`Job ${job.id} has no thumbnail/spritesheet, skipping auto-rate`);
          continue;
        }

        const rating = await scoreVideoWithVLM(imageUrl, prompt, job.style_hints, openaiKey, job.provider);
        
        await persistRating(supabase, job.id, rating);
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

    let imageUrl = job.spritesheet_url || job.thumbnail_url;
    
    if (!imageUrl && job.output_url) {
      console.log(`Job ${jobId} has no thumbnail, extracting on-demand...`);
      const extracted = await extractThumbnailOnDemand(
        job.id,
        job.output_url,
        job.provider,
        supabaseUrl,
        serviceKey
      );
      if (extracted.thumbnail_url || extracted.spritesheet_url) {
        await supabase.from("video_jobs").update({
          thumbnail_url: extracted.thumbnail_url,
          spritesheet_url: extracted.spritesheet_url,
        }).eq("id", job.id);
        imageUrl = extracted.spritesheet_url || extracted.thumbnail_url;
      }
    }
    
    if (!imageUrl) {
      const ffmpegConfigured = !!Deno.env.get("FFMPEG_SERVICE_URL");
      return new Response(JSON.stringify({
        error: `No thumbnail available for ${job.provider} video. Auto-rating requires a thumbnail image.`,
        provider: job.provider,
        suggestion: ffmpegConfigured 
          ? "Thumbnail extraction failed. Check FFmpeg service logs." 
          : "FFMPEG_SERVICE_URL not configured. Set it in Supabase secrets.",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = job.enriched_prompt || job.original_prompt;
    if (!prompt) {
      return new Response(JSON.stringify({
        error: "This video has no prompt stored. Auto-rating requires a prompt to evaluate against.",
        suggestion: "This may be an older video created before prompt tracking was enabled. Use human rating instead.",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rating = await scoreVideoWithVLM(imageUrl, prompt, job.style_hints, openaiKey, job.provider);
    
    await persistRating(supabase, job.id, rating);
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
