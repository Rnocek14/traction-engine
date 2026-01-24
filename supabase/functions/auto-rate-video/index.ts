import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATER_VERSION = "vlm-v2.3-calibrated";

// Thresholds for auto-learning
const LEARN_HIGH_THRESHOLD = 78;
const LEARN_LOW_THRESHOLD = 55;
const CONFIDENCE_THRESHOLD = 0.75;

// ═══════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════

type AnyObj = Record<string, unknown>;
type DefectSeverity = "minor" | "moderate" | "severe";

interface DefectDimensionMapping {
  dimensions: string[];
  weights: Record<string, number>; // per-dimension weights
}

interface Defect {
  type: string;
  severity: DefectSeverity;
  evidence: string;
  deduction: number;
}

interface AutoRatingResult {
  prompt_adherence: number;
  temporal_consistency: number;
  motion_realism: number;
  visual_fidelity: number;
  cinematic_quality: number;
  overall_score: number;
  confidence: number;
  defects: Defect[];
  reasons: string[];
  routing_tags: string[];
  hard_fail: boolean;
  regen_recommended: boolean;
  best_use: "final" | "usable_social" | "draft_only" | "reject";
  match_score: number;
  quality_score: number;
  motion_score?: number;
  cinematic_score?: number;
  artifact_flags?: string[];
}

interface VideoJob {
  id: string;
  output_url: string | null;
  thumbnail_url: string | null;
  spritesheet_url: string | null;
  enriched_prompt: string | null;
  original_prompt: string | null;
  provider: string;
  style_hints: string | null;
  settings: Record<string, unknown> | null;
}

// ═══════════════════════════════════════════════════════════════════
// ALLOWLISTS FOR HYGIENE
// ═══════════════════════════════════════════════════════════════════

const ROUTING_TAG_ALLOWLIST = new Set<string>([
  "low_light", "fast_motion", "character_closeup", "establishing_shot",
  "text_heavy", "action_sequence", "dialogue", "atmospheric",
  "product_shot", "nature", "urban", "fantasy", "realistic",
  "slow_motion", "aerial", "handheld", "static_camera", "portrait"
]);

const DEFECT_TYPE_ALLOWLIST = new Set<string>([
  "flicker", "morphing", "identity_drift", "physics_violation", "limb_anomaly",
  "text_corruption", "edge_bleeding", "uncanny_face", "unnatural_motion",
  "inconsistent_lighting", "over_smoothing", "blur_artifact", "texture_crawl",
  "missing_element", "wrong_subject", "floaty_motion", "jitter"
]);

// Defect → dimension mapping with per-dimension weights (sum to ~1.0 per defect)
const DEFECT_DIMENSION_MAP: Record<string, DefectDimensionMapping> = {
  flicker: { dimensions: ["temporal"], weights: { temporal: 1.0 } },
  identity_drift: { dimensions: ["temporal"], weights: { temporal: 1.0 } },
  morphing: { dimensions: ["temporal", "fidelity"], weights: { temporal: 0.6, fidelity: 0.4 } },
  physics_violation: { dimensions: ["motion"], weights: { motion: 1.0 } },
  floaty_motion: { dimensions: ["motion"], weights: { motion: 1.0 } },
  jitter: { dimensions: ["motion"], weights: { motion: 1.0 } },
  unnatural_motion: { dimensions: ["motion"], weights: { motion: 0.8 } },
  blur_artifact: { dimensions: ["fidelity"], weights: { fidelity: 1.0 } },
  texture_crawl: { dimensions: ["fidelity"], weights: { fidelity: 1.0 } },
  edge_bleeding: { dimensions: ["fidelity"], weights: { fidelity: 0.8 } },
  over_smoothing: { dimensions: ["fidelity"], weights: { fidelity: 0.7 } },
  uncanny_face: { dimensions: ["fidelity", "motion"], weights: { fidelity: 0.6, motion: 0.4 } },
  limb_anomaly: { dimensions: ["fidelity", "motion"], weights: { fidelity: 0.6, motion: 0.4 } },
  missing_element: { dimensions: ["adherence"], weights: { adherence: 1.0 } },
  wrong_subject: { dimensions: ["adherence"], weights: { adherence: 1.0 } },
  text_corruption: { dimensions: ["fidelity", "adherence"], weights: { fidelity: 0.5, adherence: 0.5 } },
  inconsistent_lighting: { dimensions: ["cinematic", "fidelity"], weights: { cinematic: 0.6, fidelity: 0.4 } },
};

// Evidence heuristic keywords
const DIM_KWS = ["prompt", "adherence", "temporal", "flicker", "motion", "physics", "fidelity", "sharp", "lighting", "composition", "depth", "consistency", "realism"];
const VISUAL_KWS = ["edges", "skin", "texture", "lighting", "shadows", "reflections", "motion blur", "camera", "background", "subject", "hands", "face", "eyes", "hair", "clothing", "environment", "sky", "ground", "water"];
const QUAL_KWS = ["consistent", "stable", "clean", "natural", "crisp", "artifact", "warping", "banding", "noise", "shimmer", "crawl", "smooth", "seamless", "accurate", "precise", "detailed"];

// ═══════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Extract thumbnail from video using FFmpeg service
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
    console.log("FFMPEG_SERVICE_URL not configured");
    return {};
  }

  try {
    console.log(`Extracting thumbnail for job ${jobId} (${provider})`);
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
 * Provider-specific scoring criteria
 */
function getProviderCriteria(provider: string): string {
  const deductionRules = `
MANDATORY DEDUCTION RULES:

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

RUNWAY-SPECIFIC:
- Over-smoothing/plastic skin: -8 to -15
- Unnatural camera stabilization: -5 to -12
- Choppy scene transitions: -10 to -20
- Uncanny valley faces: -15 to -25`,
    
    sora: `${deductionRules}

SORA-SPECIFIC:
- Temporal drift: -10 to -20
- Physics breaks (water/cloth/fire): -10 to -25
- Subject identity merge: -20 to -35
- Camera mismatch: -5 to -15`,
    
    luma: `${deductionRules}

LUMA-SPECIFIC (Ray-2):
- Over-stylization: -5 to -15
- Inconsistent lighting direction: -8 to -18
- Fast motion blur: -10 to -20
- Background shifting: -8 to -15`,
  };

  return criteria[provider] || deductionRules;
}

/**
 * Check if reasons contain proper high-score evidence
 */
function hasProperHighScoreEvidence(reasons: string[]): boolean {
  const evidenceReasons = reasons.filter(r => {
    const t = r.toLowerCase();
    const hasDim = DIM_KWS.some(k => t.includes(k));
    const hasVisual = VISUAL_KWS.some(k => t.includes(k));
    const hasQual = QUAL_KWS.some(k => t.includes(k));
    return r.length >= 70 && hasDim && hasVisual && hasQual;
  });

  if (evidenceReasons.length < 2) return false;

  const dimsHit = new Set<string>();
  for (const r of evidenceReasons) {
    const t = r.toLowerCase();
    if (t.includes("temporal") || t.includes("flicker") || t.includes("consistency")) dimsHit.add("temporal");
    if (t.includes("motion") || t.includes("physics") || t.includes("movement")) dimsHit.add("motion");
    if (t.includes("fidelity") || t.includes("sharp") || t.includes("artifact") || t.includes("texture")) dimsHit.add("fidelity");
    if (t.includes("prompt") || t.includes("adherence") || t.includes("subject") || t.includes("match")) dimsHit.add("adherence");
    if (t.includes("composition") || t.includes("cinematic") || t.includes("lighting") || t.includes("depth")) dimsHit.add("cinematic");
  }

  return dimsHit.size >= 2;
}

/**
 * Sanitize routing tags
 */
function sanitizeRoutingTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => String(t).toLowerCase().trim().replace(/\s+/g, "_"))
    .filter((t) => ROUTING_TAG_ALLOWLIST.has(t))
    .slice(0, 5);
}

/**
 * Sanitize defects
 */
function sanitizeDefects(raw: unknown): Defect[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((d): d is AnyObj => typeof d === "object" && d !== null)
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
 * Apply defect deductions mechanically using per-dimension weights
 */
function applyDefectDeductions(
  scores: { temporal: number; motion: number; fidelity: number; adherence: number; cinematic: number },
  defects: Defect[]
): { temporal: number; motion: number; fidelity: number; adherence: number; cinematic: number } {
  const deductions = { temporal: 0, motion: 0, fidelity: 0, adherence: 0, cinematic: 0 };
  const maxDeductionPerDim = 35;

  for (const defect of defects) {
    const mapping = DEFECT_DIMENSION_MAP[defect.type];
    if (!mapping) continue;

    for (const dim of mapping.dimensions) {
      const dimKey = dim as keyof typeof deductions;
      if (dimKey in deductions) {
        const weight = mapping.weights[dim] ?? 0.5;
        deductions[dimKey] += defect.deduction * weight;
      }
    }
  }

  return {
    temporal: Math.max(30, scores.temporal - Math.min(deductions.temporal, maxDeductionPerDim)),
    motion: Math.max(30, scores.motion - Math.min(deductions.motion, maxDeductionPerDim)),
    fidelity: Math.max(30, scores.fidelity - Math.min(deductions.fidelity, maxDeductionPerDim)),
    adherence: Math.max(30, scores.adherence - Math.min(deductions.adherence, maxDeductionPerDim)),
    cinematic: Math.max(30, scores.cinematic - Math.min(deductions.cinematic, maxDeductionPerDim)),
  };
}

/**
 * Use GPT-4o Vision to analyze video frames
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

  const systemPrompt = `You are an expert AI video quality analyst with STRICT calibration standards. You evaluate ${isSpritesheetLikely ? "spritesheets showing multiple frames from" : "a single thumbnail from"} AI-generated videos.

═══════════════════════════════════════════════════════════════════
CALIBRATION STANDARDS (CRITICAL)
═══════════════════════════════════════════════════════════════════

SCORE DISTRIBUTION:
- 95-100: REFERENCE QUALITY - Indistinguishable from pro VFX. Top 1-3% only.
- 88-94: EXCEPTIONAL - Broadcast quality; tiny tells. Top 5-10%.
- 78-87: STRONG - Good social media quality; some artifacts. Most GOOD videos land here.
- 68-77: OKAY - Usable draft; noticeable issues; benefits from regen.
- 55-67: WEAK - Multiple issues; regen recommended.
- <55: FAIL - Major mismatch or severe defects.

HARD RULE: 95+ is RARE (top 1-3%). Most AI videos should land 65-85.

═══════════════════════════════════════════════════════════════════
DIMENSIONS (0-100 each)
═══════════════════════════════════════════════════════════════════

1. PROMPT ADHERENCE: Subject, action, camera, lighting, setting match
2. TEMPORAL CONSISTENCY: Frame stability, lighting consistency, no flicker${isSpritesheetLikely ? "" : " (infer conservatively from single frame)"}
3. MOTION REALISM: Physics, acceleration, movement quality
4. VISUAL FIDELITY: Sharpness, color, detail, artifacts
5. CINEMATIC QUALITY: Composition, depth, artistic merit

${providerCriteria}

═══════════════════════════════════════════════════════════════════
HIGH SCORE EVIDENCE REQUIREMENT
═══════════════════════════════════════════════════════════════════

If any dimension ≥90, you MUST provide 2+ detailed reasons (≥70 chars each) with:
- Specific visual element (texture, lighting, edges, etc.)
- Dimension reference (temporal, motion, fidelity, etc.)
- Quality descriptor (seamless, precise, crisp, etc.)

Cap at 89 if you cannot provide this evidence.

═══════════════════════════════════════════════════════════════════
OUTPUT (JSON only, no markdown)
═══════════════════════════════════════════════════════════════════

{
  "prompt_adherence": <0-100>,
  "temporal_consistency": <0-100>,
  "motion_realism": <0-100>,
  "visual_fidelity": <0-100>,
  "cinematic_quality": <0-100>,
  "confidence": <0.0-1.0>,
  "defects": [
    {"type": "flicker|morphing|identity_drift|physics_violation|limb_anomaly|text_corruption|edge_bleeding|uncanny_face|unnatural_motion|inconsistent_lighting|over_smoothing|blur_artifact|texture_crawl|missing_element|wrong_subject|floaty_motion|jitter", "severity": "minor|moderate|severe", "evidence": "description (max 200 chars)", "deduction": <5-60>}
  ],
  "routing_tags": ["low_light","fast_motion","character_closeup","establishing_shot","text_heavy","action_sequence","dialogue","atmospheric","product_shot","nature","urban","fantasy","realistic","slow_motion","aerial","handheld","static_camera","portrait"],
  "hard_fail": <true if severe/broken>,
  "regen_recommended": <true if <68 or moderate+ defects>,
  "best_use": "final|usable_social|draft_only|reject",
  "reasons": ["detailed observation 1 (≥70 chars)", "detailed observation 2", ...]
}

Include 2-5 routing_tags. List ALL detected defects with deductions.`;

  const userMessage = `Analyze this ${provider.toUpperCase()} AI-generated video:

PROMPT: ${prompt}
${styleHints ? `STYLE: ${styleHints}` : ""}
PROVIDER: ${provider}
IMAGE: ${isSpritesheetLikely ? "Spritesheet (multiple frames)" : "Single thumbnail (be CONSERVATIVE on temporal)"}

Apply strict calibration. Most videos score 65-85. Detect ALL defects.`;

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
              { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
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
    
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) jsonStr = jsonMatch[1];
    
    const parsed = JSON.parse(jsonStr);
    
    // Parse raw scores
    let promptAdherence = Math.max(0, Math.min(100, Math.round(parsed.prompt_adherence || 70)));
    let temporalConsistency = Math.max(0, Math.min(100, Math.round(parsed.temporal_consistency || 70)));
    let motionRealism = Math.max(0, Math.min(100, Math.round(parsed.motion_realism || 70)));
    let visualFidelity = Math.max(0, Math.min(100, Math.round(parsed.visual_fidelity || 70)));
    let cinematicQuality = Math.max(0, Math.min(100, Math.round(parsed.cinematic_quality || 65)));
    let confidence = Math.max(0, Math.min(1, parsed.confidence || 0.5));
    
    const defects = sanitizeDefects(parsed.defects);
    const routingTags = sanitizeRoutingTags(parsed.routing_tags);
    const reasons = Array.isArray(parsed.reasons) 
      ? parsed.reasons.slice(0, 8).map((r: unknown) => String(r).slice(0, 300)) 
      : [];
    
    // Apply mechanical deductions
    const adjusted = applyDefectDeductions(
      {
        temporal: temporalConsistency,
        motion: motionRealism,
        fidelity: visualFidelity,
        adherence: promptAdherence,
        cinematic: cinematicQuality,
      },
      defects
    );
    
    temporalConsistency = adjusted.temporal;
    motionRealism = adjusted.motion;
    visualFidelity = adjusted.fidelity;
    promptAdherence = adjusted.adherence;
    cinematicQuality = adjusted.cinematic;
    
    // Single thumbnail → cap temporal and reduce confidence
    if (!isSpritesheetLikely) {
      temporalConsistency = Math.min(temporalConsistency, 82);
      confidence = Math.min(confidence, 0.75);
    }
    
    // High score evidence check
    const hasEvidence = hasProperHighScoreEvidence(reasons);
    if (!hasEvidence) {
      if (promptAdherence >= 90) promptAdherence = 89;
      if (temporalConsistency >= 90) temporalConsistency = 89;
      if (motionRealism >= 90) motionRealism = 89;
      if (visualFidelity >= 90) visualFidelity = 89;
      if (cinematicQuality >= 90) cinematicQuality = 89;
    }
    
    // Defect-based hard caps
    const severeDefects = defects.filter(d => d.severity === "severe");
    const moderateDefects = defects.filter(d => d.severity === "moderate");
    
    if (severeDefects.some(d => d.type === "flicker" || d.type === "identity_drift")) {
      temporalConsistency = Math.min(temporalConsistency, 65);
    }
    if (moderateDefects.some(d => d.type === "flicker" || d.type === "identity_drift")) {
      temporalConsistency = Math.min(temporalConsistency, 75);
    }
    if (defects.some(d => (d.type === "missing_element" || d.type === "wrong_subject") && d.severity === "severe")) {
      promptAdherence = Math.min(promptAdherence, 50);
    }
    if (severeDefects.some(d => d.type === "physics_violation" || d.type === "floaty_motion")) {
      motionRealism = Math.min(motionRealism, 60);
    }
    
    // Calculate overall
    let overallScore = Math.round(
      0.30 * promptAdherence +
      0.20 * temporalConsistency +
      0.20 * motionRealism +
      0.20 * visualFidelity +
      0.10 * cinematicQuality
    );
    
    // Low confidence → cap overall
    if (confidence < 0.6) {
      overallScore = Math.min(overallScore, 78);
    }
    
    // Determine flags
    let hardFail = parsed.hard_fail === true || overallScore < 55 || severeDefects.length >= 2;
    let regenRecommended = parsed.regen_recommended === true || overallScore < 68 || moderateDefects.length >= 2 || severeDefects.length >= 1;
    
    if (hardFail) overallScore = Math.min(overallScore, 55);
    
    // Determine best_use
    let bestUse: "final" | "usable_social" | "draft_only" | "reject" = "usable_social";
    if (hardFail) {
      bestUse = "reject";
    } else if (overallScore < 68 || regenRecommended) {
      bestUse = "draft_only";
    } else if (overallScore >= 88 && severeDefects.length === 0 && moderateDefects.length === 0) {
      bestUse = "final";
    }
    
    const artifactFlags = [...new Set(defects.map(d => d.type))];
    
    console.log(`VLM v2.3: adhere=${promptAdherence}, temporal=${temporalConsistency}, motion=${motionRealism}, fidelity=${visualFidelity}, cinematic=${cinematicQuality}, overall=${overallScore}, defects=${defects.length}, hard_fail=${hardFail}`);

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
 * Trigger learning with quality guards
 */
async function maybeLearn(
  supabase: ReturnType<typeof createClient>,
  job: VideoJob,
  rating: AutoRatingResult
): Promise<boolean> {
  if (rating.confidence < CONFIDENCE_THRESHOLD) {
    console.log(`Skipping learning: confidence ${rating.confidence} < ${CONFIDENCE_THRESHOLD}`);
    return false;
  }

  const scoreToRating = (score: number): number => {
    if (score >= 85) return 5;
    if (score >= 75) return 4;
    if (score >= 65) return 3;
    if (score >= 55) return 2;
    return 1;
  };

  const matchRating = scoreToRating(rating.prompt_adherence);
  const preferenceProxy = Math.round(
    0.45 * rating.visual_fidelity +
    0.35 * rating.cinematic_quality +
    0.20 * rating.motion_realism
  );
  const preferenceRating = scoreToRating(preferenceProxy);

  const bothHigh = matchRating >= 4 && preferenceRating >= 4;
  const bothLow = matchRating <= 2 && preferenceRating <= 2;

  if (!bothHigh && !bothLow) {
    console.log(`Skipping learning: ratings not aligned (match=${matchRating}, pref=${preferenceRating})`);
    return false;
  }

  // Quality guards
  if (bothHigh) {
    if (rating.routing_tags.length < 1) {
      console.log(`Skipping positive learning: no routing tags`);
      return false;
    }
    if (rating.defects.length > 3) {
      console.log(`Skipping positive learning: too many defects (${rating.defects.length})`);
      return false;
    }
  }

  console.log(`Auto-learning: match=${matchRating}, pref=${preferenceRating}, tags=${rating.routing_tags.join(",")}`);

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
 * Persist rating to database
 */
async function persistRating(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  rating: AutoRatingResult
): Promise<void> {
  const { error } = await supabase
    .from("video_jobs")
    .update({
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
      auto_defects: rating.defects,
      auto_routing_tags: rating.routing_tags,
      auto_hard_fail: rating.hard_fail,
      auto_regen_recommended: rating.regen_recommended,
      auto_best_use: rating.best_use,
    })
    .eq("id", jobId);

  if (error) throw new Error(`Failed to persist rating: ${error.message}`);
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

    const { jobId, batchMode } = await req.json();

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
          const extracted = await extractThumbnailOnDemand(job.id, job.output_url, job.provider, supabaseUrl, serviceKey);
          if (extracted.thumbnail_url || extracted.spritesheet_url) {
            await supabase.from("video_jobs").update({
              thumbnail_url: extracted.thumbnail_url,
              spritesheet_url: extracted.spritesheet_url,
            }).eq("id", job.id);
            imageUrl = extracted.spritesheet_url || extracted.thumbnail_url;
          }
        }
        
        if (!imageUrl) continue;

        const rating = await scoreVideoWithVLM(imageUrl, prompt, job.style_hints, openaiKey, job.provider);
        await persistRating(supabase, job.id, rating);
        await maybeLearn(supabase, job as VideoJob, rating);

        results.push({ jobId: job.id, ...rating });
      }

      return new Response(JSON.stringify({ processed: results.length, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!jobId) throw new Error("jobId required (or set batchMode: true)");

    const { data: job, error: jobError } = await supabase
      .from("video_jobs")
      .select("id, output_url, thumbnail_url, spritesheet_url, enriched_prompt, original_prompt, provider, style_hints, settings")
      .eq("id", jobId)
      .single();

    if (jobError || !job) throw new Error(`Job not found: ${jobId}`);
    if (!job.output_url) throw new Error("Job has no output URL");

    let imageUrl = job.spritesheet_url || job.thumbnail_url;
    
    if (!imageUrl && job.output_url) {
      const extracted = await extractThumbnailOnDemand(job.id, job.output_url, job.provider, supabaseUrl, serviceKey);
      if (extracted.thumbnail_url || extracted.spritesheet_url) {
        await supabase.from("video_jobs").update({
          thumbnail_url: extracted.thumbnail_url,
          spritesheet_url: extracted.spritesheet_url,
        }).eq("id", job.id);
        imageUrl = extracted.spritesheet_url || extracted.thumbnail_url;
      }
    }
    
    if (!imageUrl) {
      return new Response(JSON.stringify({
        error: `No thumbnail for ${job.provider} video`,
        suggestion: Deno.env.get("FFMPEG_SERVICE_URL") ? "Thumbnail extraction failed" : "FFMPEG_SERVICE_URL not configured",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const prompt = job.enriched_prompt || job.original_prompt;
    if (!prompt) {
      return new Response(JSON.stringify({
        error: "No prompt stored for this video",
        suggestion: "Use human rating instead",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const rating = await scoreVideoWithVLM(imageUrl, prompt, job.style_hints, openaiKey, job.provider);
    await persistRating(supabase, job.id, rating);
    const learned = await maybeLearn(supabase, job as VideoJob, rating);

    return new Response(JSON.stringify({ jobId, ...rating, learned }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Auto-rate error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
