import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATER_VERSION = "vlm-v2.5-hardened";

// Thresholds
const CONFIDENCE_THRESHOLD = 0.75;

// ═══════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════

type AnyObj = Record<string, unknown>;
type DimensionKey = "temporal" | "motion" | "fidelity" | "adherence" | "cinematic";
type DimensionScores = Record<DimensionKey, number>;
type DefectSeverity = "minor" | "moderate" | "severe";

type DefectType =
  | "flicker" | "morphing" | "identity_drift" | "physics_violation" | "limb_anomaly"
  | "text_corruption" | "edge_bleeding" | "uncanny_face" | "unnatural_motion"
  | "inconsistent_lighting" | "over_smoothing" | "blur_artifact" | "texture_crawl"
  | "missing_element" | "wrong_subject" | "floaty_motion" | "jitter";

interface DefectDimensionMapping {
  dimensions: DimensionKey[];
  weights: Partial<Record<DimensionKey, number>>;
}

interface Defect {
  type: DefectType;
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
  motion_score: number;
  cinematic_score: number;
  artifact_flags: string[];
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
// JSON PARSING HELPER
// ═══════════════════════════════════════════════════════════════════

function safeJsonParse<T>(raw: string): T | null {
  const trimmed = raw.trim();
  // Try direct parse first
  try { return JSON.parse(trimmed) as T; } catch { /* ignore */ }
  // Try fenced block
  const m = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (m?.[1]) {
    try { return JSON.parse(m[1]) as T; } catch { /* ignore */ }
  }
  // Try first {...} object substring (last resort)
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(trimmed.slice(start, end + 1)) as T; } catch { /* ignore */ }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// ALLOWLISTS & TAG NORMALIZATION
// ═══════════════════════════════════════════════════════════════════

const ROUTING_TAG_ALLOWLIST = new Set<string>([
  // Core shot types
  "talking_head", "product_shot", "text_overlay", "character_closeup", 
  "establishing_shot", "action_sequence", "dialogue",
  
  // Environment
  "nature", "urban", "indoor", "outdoor", "underwater",
  
  // Motion characteristics
  "fast_motion", "slow_motion", "static_camera", "pan", "zoom", 
  "tracking_shot", "aerial", "handheld",
  
  // Lighting & atmosphere
  "low_light", "high_contrast", "golden_hour", "night_scene", "neon",
  "dramatic_lighting", "soft_lighting", "atmospheric",
  
  // Subject focus
  "human_focus", "object_focus", "landscape", "portrait", "macro",
  "animal", "vehicle", "food", "architecture",
  
  // Content style
  "cinematic", "documentary", "commercial", "abstract",
  "fantasy", "realistic", "futuristic", "vintage", "minimalist",
  "vibrant", "moody", "surreal",
  
  // Special content
  "vfx", "animation", "timelapse", "fire", "water", "smoke", 
  "explosion", "technology", "text_heavy"
]);

// Synonym mapping to normalize VLM output variations
const TAG_SYNONYMS: Record<string, string> = {
  // Camera/shot variations
  "closeup": "macro",
  "close_up": "macro",
  "close-up": "macro",
  "wide_shot": "establishing_shot",
  "wide": "establishing_shot",
  "overhead": "aerial",
  "drone": "aerial",
  "birds_eye": "aerial",
  "dolly": "tracking_shot",
  "follow": "tracking_shot",
  
  // Time of day / lighting
  "nighttime": "night_scene",
  "night": "night_scene",
  "dark": "low_light",
  "dim": "low_light",
  "sunset": "golden_hour",
  "sunrise": "golden_hour",
  "bright": "high_contrast",
  
  // Subject variations
  "person": "human_focus",
  "people": "human_focus",
  "face": "human_focus",
  "faces": "human_focus",
  "character": "human_focus",
  "man": "human_focus",
  "woman": "human_focus",
  "car": "vehicle",
  "automobile": "vehicle",
  "truck": "vehicle",
  "motorcycle": "vehicle",
  "building": "architecture",
  "buildings": "architecture",
  "city": "urban",
  "cityscape": "urban",
  "street": "urban",
  "forest": "nature",
  "trees": "nature",
  "mountain": "nature",
  "mountains": "nature",
  "ocean": "water",
  "sea": "water",
  "river": "water",
  "lake": "water",
  "rain": "water",
  
  // VFX / fantasy variations
  "dragon": "vfx",
  "creature": "vfx",
  "monster": "vfx",
  "magic": "vfx",
  "magical": "vfx",
  "fire_effect": "fire",
  "flames": "fire",
  "burning": "fire",
  "sci-fi": "futuristic",
  "scifi": "futuristic",
  "retro": "vintage",
  
  // Style variations
  "dark_mood": "moody",
  "gloomy": "moody",
  "colorful": "vibrant",
  "saturated": "vibrant",
  "dreamlike": "surreal",
  "trippy": "surreal",
  "simple": "minimalist",
  "clean": "minimalist"
};

/**
 * Normalizes a tag using synonym mapping
 */
function normalizeTag(tag: string): string {
  const cleaned = tag.toLowerCase().trim().replace(/[\s-]+/g, "_");
  return TAG_SYNONYMS[cleaned] || cleaned;
}

const DEFECT_TYPE_ALLOWLIST = new Set<string>([
  "flicker", "morphing", "identity_drift", "physics_violation", "limb_anomaly",
  "text_corruption", "edge_bleeding", "uncanny_face", "unnatural_motion",
  "inconsistent_lighting", "over_smoothing", "blur_artifact", "texture_crawl",
  "missing_element", "wrong_subject", "floaty_motion", "jitter"
]);

// Defect → dimension mapping with per-dimension weights
const DEFECT_DIMENSION_MAP: Record<DefectType, DefectDimensionMapping> = {
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

async function extractThumbnailOnDemand(
  jobId: string,
  videoUrl: string,
  provider: string,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<{ thumbnail_url?: string; spritesheet_url?: string }> {
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
        options: { thumbnail_time: 1.0, spritesheet_frames: 10, spritesheet_cols: 5 },
      }),
    });

    if (!response.ok) return {};
    const result = await response.json();
    return { thumbnail_url: result.thumbnail_url, spritesheet_url: result.spritesheet_url };
  } catch {
    return {};
  }
}

function getProviderCriteria(provider: string): string {
  const deductionRules = `
MANDATORY DEDUCTION RULES:
- Flicker/warping: -5 (minor), -12 (moderate), -20 (severe)
- Identity drift: -8 (minor), -15 (moderate), -25 (severe)
- Floaty physics: -5 (minor), -10 (moderate), -15 (severe)
- Jitter/teleport: -10 (minor), -18 (moderate), -25 (severe)
- Blur/compression: -3 (minor), -8 (moderate), -15 (severe)
- Texture crawl: -5 (minor), -12 (moderate), -20 (severe)
- Missing element: -5 to -40 depending on severity`;

  const criteria: Record<string, string> = {
    runway: `${deductionRules}\nRUNWAY: Over-smoothing -8 to -15, uncanny faces -15 to -25`,
    sora: `${deductionRules}\nSORA: Temporal drift -10 to -20, physics breaks -10 to -25`,
    luma: `${deductionRules}\nLUMA: Over-stylization -5 to -15, motion blur -10 to -20`,
  };
  return criteria[provider] || deductionRules;
}

function hasProperHighScoreEvidence(reasons: string[]): boolean {
  const evidenceReasons = reasons.filter(r => {
    const t = r.toLowerCase();
    return r.length >= 70 &&
      DIM_KWS.some(k => t.includes(k)) &&
      VISUAL_KWS.some(k => t.includes(k)) &&
      QUAL_KWS.some(k => t.includes(k));
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

function sanitizeRoutingTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  
  const originalTags = raw
    .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    .map(t => t.toLowerCase().trim());
  
  const normalized = originalTags.map(normalizeTag);
  const kept = normalized.filter(t => ROUTING_TAG_ALLOWLIST.has(t));
  const dropped = normalized.filter(t => !ROUTING_TAG_ALLOWLIST.has(t));
  
  // Log dropped tags for allowlist expansion diagnostics
  if (dropped.length > 0) {
    console.log(`[sanitizeRoutingTags] Dropped tags: ${dropped.join(", ")}`);
  }
  
  // Dedupe and limit to 5
  return [...new Set(kept)].slice(0, 5);
}

function sanitizeDefects(raw: unknown): Defect[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((d): d is AnyObj => typeof d === "object" && d !== null)
    .map((d) => {
      const rawType = String(d.type || "unnatural_motion").toLowerCase().trim();
      const type: DefectType = DEFECT_TYPE_ALLOWLIST.has(rawType) ? rawType as DefectType : "unnatural_motion";
      const rawSeverity = String(d.severity || "minor").toLowerCase();
      const severity: DefectSeverity = rawSeverity === "severe" ? "severe" : rawSeverity === "moderate" ? "moderate" : "minor";
      const deduction = Math.max(0, Math.min(60, Math.round(Number(d.deduction) || 5)));
      const evidence = String(d.evidence || "").slice(0, 200);
      return { type, severity, evidence, deduction };
    })
    .slice(0, 10);
}

function applyDefectDeductions(scores: DimensionScores, defects: Defect[]): DimensionScores {
  const deductions: DimensionScores = { temporal: 0, motion: 0, fidelity: 0, adherence: 0, cinematic: 0 };
  const maxDeduction = 35;

  for (const defect of defects) {
    const mapping = DEFECT_DIMENSION_MAP[defect.type];
    if (!mapping) continue;
    for (const dim of mapping.dimensions) {
      const weight = mapping.weights[dim] ?? 0.5;
      deductions[dim] += defect.deduction * weight;
    }
  }

  const cap = (v: number): number => Math.min(v, maxDeduction);
  return {
    temporal: Math.max(30, scores.temporal - cap(deductions.temporal)),
    motion: Math.max(30, scores.motion - cap(deductions.motion)),
    fidelity: Math.max(30, scores.fidelity - cap(deductions.fidelity)),
    adherence: Math.max(30, scores.adherence - cap(deductions.adherence)),
    cinematic: Math.max(30, scores.cinematic - cap(deductions.cinematic)),
  };
}

async function scoreVideoWithVLM(
  imageUrl: string,
  prompt: string,
  styleHints: string | null,
  openaiKey: string,
  provider: string = "sora"
): Promise<AutoRatingResult> {
  const providerCriteria = getProviderCriteria(provider);
  const isSpritesheetLikely = imageUrl.includes("spritesheet");

  const systemPrompt = `You are an expert AI video quality analyst with STRICT calibration. Evaluate ${isSpritesheetLikely ? "spritesheets (multiple frames)" : "a single thumbnail"} from AI videos.

SCORE DISTRIBUTION: 95-100=Reference (top 1-3%), 88-94=Exceptional (top 5-10%), 78-87=Strong (most good videos), 68-77=Okay (draft), 55-67=Weak, <55=Fail.
Most AI videos should land 65-85. 95+ is RARE.

DIMENSIONS (0-100): 1.PROMPT_ADHERENCE 2.TEMPORAL_CONSISTENCY${isSpritesheetLikely ? "" : "(infer conservatively)"} 3.MOTION_REALISM 4.VISUAL_FIDELITY 5.CINEMATIC_QUALITY

${providerCriteria}

HIGH SCORE RULE: Any dimension ≥90 needs 2+ detailed reasons (≥70 chars each) with visual element + dimension + qualifier. Cap at 89 otherwise.

OUTPUT (JSON only):
{"prompt_adherence":<0-100>,"temporal_consistency":<0-100>,"motion_realism":<0-100>,"visual_fidelity":<0-100>,"cinematic_quality":<0-100>,"confidence":<0-1>,"defects":[{"type":"...","severity":"minor|moderate|severe","evidence":"...","deduction":<5-60>}],"routing_tags":["..."],"hard_fail":<bool>,"regen_recommended":<bool>,"best_use":"final|usable_social|draft_only|reject","reasons":["..."]}`;

  const userMessage = `Analyze ${provider.toUpperCase()} video:\nPROMPT: ${prompt}${styleHints ? `\nSTYLE: ${styleHints}` : ""}\nIMAGE: ${isSpritesheetLikely ? "Spritesheet" : "Single thumbnail (conservative on temporal)"}`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: [{ type: "text", text: userMessage }, { type: "image_url", image_url: { url: imageUrl, detail: "high" } }] },
        ],
        max_tokens: 1500,
        temperature: 0.5,
      }),
    });

    if (!response.ok) throw new Error(`OpenAI API failed: ${response.status}`);

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const parsed = safeJsonParse<AnyObj>(content);
    if (!parsed) throw new Error("Model did not return valid JSON");

    // Parse scores
    let promptAdherence = Math.max(0, Math.min(100, Math.round(parsed.prompt_adherence || 70)));
    let temporalConsistency = Math.max(0, Math.min(100, Math.round(parsed.temporal_consistency || 70)));
    let motionRealism = Math.max(0, Math.min(100, Math.round(parsed.motion_realism || 70)));
    let visualFidelity = Math.max(0, Math.min(100, Math.round(parsed.visual_fidelity || 70)));
    let cinematicQuality = Math.max(0, Math.min(100, Math.round(parsed.cinematic_quality || 65)));
    let confidence = Math.max(0, Math.min(1, parsed.confidence || 0.5));

    const defects = sanitizeDefects(parsed.defects);
    const routingTags = sanitizeRoutingTags(parsed.routing_tags);
    let reasons = Array.isArray(parsed.reasons) ? parsed.reasons.slice(0, 8).map((r: unknown) => String(r).slice(0, 300)).filter((r: string) => r.trim().length > 0) : [];

    // Apply mechanical deductions
    const adjusted = applyDefectDeductions(
      { temporal: temporalConsistency, motion: motionRealism, fidelity: visualFidelity, adherence: promptAdherence, cinematic: cinematicQuality },
      defects
    );
    temporalConsistency = adjusted.temporal;
    motionRealism = adjusted.motion;
    visualFidelity = adjusted.fidelity;
    promptAdherence = adjusted.adherence;
    cinematicQuality = adjusted.cinematic;

    // Single thumbnail caps
    if (!isSpritesheetLikely) {
      temporalConsistency = Math.min(temporalConsistency, 82);
      confidence = Math.min(confidence, 0.75);
    }

    // High score evidence check
    if (!hasProperHighScoreEvidence(reasons)) {
      if (promptAdherence >= 90) promptAdherence = 89;
      if (temporalConsistency >= 90) temporalConsistency = 89;
      if (motionRealism >= 90) motionRealism = 89;
      if (visualFidelity >= 90) visualFidelity = 89;
      if (cinematicQuality >= 90) cinematicQuality = 89;
    }

    // Defect caps
    const severeDefects = defects.filter(d => d.severity === "severe");
    const moderateDefects = defects.filter(d => d.severity === "moderate");

    if (severeDefects.some(d => d.type === "flicker" || d.type === "identity_drift")) temporalConsistency = Math.min(temporalConsistency, 65);
    if (moderateDefects.some(d => d.type === "flicker" || d.type === "identity_drift")) temporalConsistency = Math.min(temporalConsistency, 75);
    if (defects.some(d => (d.type === "missing_element" || d.type === "wrong_subject") && d.severity === "severe")) promptAdherence = Math.min(promptAdherence, 50);
    if (severeDefects.some(d => d.type === "physics_violation" || d.type === "floaty_motion")) motionRealism = Math.min(motionRealism, 60);

    // Overall score
    let overallScore = Math.round(0.30 * promptAdherence + 0.20 * temporalConsistency + 0.20 * motionRealism + 0.20 * visualFidelity + 0.10 * cinematicQuality);
    if (confidence < 0.6) overallScore = Math.min(overallScore, 78);

    // Flags
    let hardFail = parsed.hard_fail === true || overallScore < 55 || severeDefects.length >= 2;
    const regenRecommended = parsed.regen_recommended === true || overallScore < 68 || moderateDefects.length >= 2 || severeDefects.length >= 1;
    if (hardFail) overallScore = Math.min(overallScore, 55);

    // Best use
    let bestUse: "final" | "usable_social" | "draft_only" | "reject" = "usable_social";
    if (hardFail) bestUse = "reject";
    else if (overallScore < 68 || regenRecommended) bestUse = "draft_only";
    else if (overallScore >= 88 && severeDefects.length === 0 && moderateDefects.length === 0) bestUse = "final";

    console.log(`VLM v2.5: adhere=${promptAdherence}, temporal=${temporalConsistency}, motion=${motionRealism}, fidelity=${visualFidelity}, cinematic=${cinematicQuality}, overall=${overallScore}`);

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
      artifact_flags: [...new Set(defects.map(d => d.type))],
    };
  } catch (error) {
    console.error("VLM scoring failed:", error);
    return {
      prompt_adherence: 50, temporal_consistency: 50, motion_realism: 50, visual_fidelity: 50, cinematic_quality: 50,
      overall_score: 50, confidence: 0.1, defects: [], routing_tags: [], hard_fail: false, regen_recommended: true,
      best_use: "draft_only", reasons: ["Auto-rating failed"], match_score: 50, quality_score: 50, motion_score: 50, cinematic_score: 50, artifact_flags: [],
    };
  }
}

async function maybeLearn(supabase: SupabaseClient, job: VideoJob, rating: AutoRatingResult): Promise<boolean> {
  if (rating.confidence < CONFIDENCE_THRESHOLD) return false;

  const scoreToRating = (s: number): number => s >= 85 ? 5 : s >= 75 ? 4 : s >= 65 ? 3 : s >= 55 ? 2 : 1;
  const matchRating = scoreToRating(rating.prompt_adherence);
  const preferenceProxy = Math.round(0.45 * rating.visual_fidelity + 0.35 * rating.cinematic_quality + 0.20 * rating.motion_realism);
  const preferenceRating = scoreToRating(preferenceProxy);

  const bothHigh = matchRating >= 4 && preferenceRating >= 4;
  const bothLow = matchRating <= 2 && preferenceRating <= 2;
  if (!bothHigh && !bothLow) return false;

  if (bothHigh && (rating.routing_tags.length < 1 || rating.defects.length > 3)) return false;

  const { error } = await supabase.functions.invoke("analyze-prompt-success", {
    body: { jobId: job.id, provider: job.provider, originalPrompt: job.original_prompt, enrichedPrompt: job.enriched_prompt, styleHints: job.style_hints, match_rating: matchRating, preference_rating: preferenceRating, source: "auto" },
  });
  return !error;
}

async function persistRating(supabase: SupabaseClient, jobId: string, rating: AutoRatingResult): Promise<void> {
  const { error } = await supabase.from("video_jobs").update({
    auto_match_score: rating.prompt_adherence, auto_quality_score: rating.visual_fidelity, auto_motion_score: rating.motion_realism, auto_cinematic_score: rating.cinematic_quality,
    auto_overall_score: rating.overall_score, auto_confidence: rating.confidence, auto_rated_at: new Date().toISOString(), auto_rater_version: RATER_VERSION,
    auto_reasons: rating.reasons, auto_artifact_flags: rating.artifact_flags, auto_defects: rating.defects, auto_routing_tags: rating.routing_tags,
    auto_hard_fail: rating.hard_fail, auto_regen_recommended: rating.regen_recommended, auto_best_use: rating.best_use,
  }).eq("id", jobId);
  if (error) throw new Error(`Failed to persist: ${error.message}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) throw new Error("OPENAI_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);
    const { jobId, batchMode } = await req.json();

    if (batchMode) {
      const { data: unratedJobs, error: fetchError } = await supabase.from("video_jobs")
        .select("id, output_url, thumbnail_url, spritesheet_url, enriched_prompt, original_prompt, provider, style_hints, settings")
        .eq("status", "done").is("auto_rated_at", null).not("output_url", "is", null).limit(10);
      if (fetchError) throw fetchError;

      const results = [];
      for (const job of unratedJobs || []) {
        const prompt = job.enriched_prompt || job.original_prompt;
        if (!prompt || !job.output_url) continue;

        let imageUrl = job.spritesheet_url || job.thumbnail_url;
        if (!imageUrl && job.output_url) {
          const extracted = await extractThumbnailOnDemand(job.id, job.output_url, job.provider, supabaseUrl, serviceKey);
          if (extracted.thumbnail_url || extracted.spritesheet_url) {
            await supabase.from("video_jobs").update({ thumbnail_url: extracted.thumbnail_url, spritesheet_url: extracted.spritesheet_url }).eq("id", job.id);
            imageUrl = extracted.spritesheet_url || extracted.thumbnail_url;
          }
        }
        if (!imageUrl) continue;

        const rating = await scoreVideoWithVLM(imageUrl, prompt, job.style_hints, openaiKey, job.provider);
        await persistRating(supabase, job.id, rating);
        await maybeLearn(supabase, job as VideoJob, rating);
        results.push({ jobId: job.id, ...rating });
      }
      return new Response(JSON.stringify({ processed: results.length, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!jobId) throw new Error("jobId required");
    const { data: job, error: jobError } = await supabase.from("video_jobs")
      .select("id, output_url, thumbnail_url, spritesheet_url, enriched_prompt, original_prompt, provider, style_hints, settings")
      .eq("id", jobId).single();
    if (jobError || !job) throw new Error(`Job not found: ${jobId}`);
    if (!job.output_url) throw new Error("No output URL");

    let imageUrl = job.spritesheet_url || job.thumbnail_url;
    if (!imageUrl && job.output_url) {
      const extracted = await extractThumbnailOnDemand(job.id, job.output_url, job.provider, supabaseUrl, serviceKey);
      if (extracted.thumbnail_url || extracted.spritesheet_url) {
        await supabase.from("video_jobs").update({ thumbnail_url: extracted.thumbnail_url, spritesheet_url: extracted.spritesheet_url }).eq("id", job.id);
        imageUrl = extracted.spritesheet_url || extracted.thumbnail_url;
      }
    }
    if (!imageUrl) return new Response(JSON.stringify({ error: "No thumbnail" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const prompt = job.enriched_prompt || job.original_prompt;
    if (!prompt) return new Response(JSON.stringify({ error: "No prompt" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const rating = await scoreVideoWithVLM(imageUrl, prompt, job.style_hints, openaiKey, job.provider);
    await persistRating(supabase, job.id, rating);
    const learned = await maybeLearn(supabase, job as VideoJob, rating);

    return new Response(JSON.stringify({ jobId, ...rating, learned }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Auto-rate error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
