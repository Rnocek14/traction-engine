import type { FFmpegServiceRequest } from "./ffmpeg.js";

// SECURITY: Pin to your exact Supabase project hostname
const ALLOWED_HOSTNAMES = new Set([
  "jrujlpljluvxewjytuab.supabase.co",
]);

// Allowed Storage API path prefixes
const ALLOWED_PATH_PREFIXES = [
  "/storage/v1/object/public/",
  "/storage/v1/object/sign/",
  "/storage/v1/object/",
];

// Allowed transition types for FFmpeg xfade (+ "cut" for no transition)
export const ALLOWED_TRANSITIONS = new Set([
  "cut",
  "fade", "wipe", "dissolve", "pixelize",
  "slideup", "slidedown", "slideleft", "slideright",
]);

// Block private/internal IPs
const BLOCKED_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
];

/**
 * Validate URL is from allowed Supabase storage domain + path
 */
export function validateUrl(url: string, context: string): { valid: boolean; error?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: `${context}: invalid URL format` };
  }

  if (parsed.protocol !== "https:") {
    return { valid: false, error: `${context}: must use HTTPS` };
  }

  for (const pattern of BLOCKED_HOSTNAME_PATTERNS) {
    if (pattern.test(parsed.hostname)) {
      return { valid: false, error: `${context}: blocked hostname pattern` };
    }
  }

  if (!ALLOWED_HOSTNAMES.has(parsed.hostname)) {
    return { valid: false, error: `${context}: hostname not in allowlist (${parsed.hostname})` };
  }

  const pathAllowed = ALLOWED_PATH_PREFIXES.some((prefix) =>
    parsed.pathname.startsWith(prefix)
  );
  if (!pathAllowed) {
    return { valid: false, error: `${context}: path not a Storage API endpoint (${parsed.pathname})` };
  }

  return { valid: true };
}

/**
 * Validate complete render request
 */
export function validateRenderRequest(req: FFmpegServiceRequest): string[] {
  const errors: string[] = [];

  if (!req.job_id) errors.push("job_id is required");
  if (!req.clips?.length || req.clips.length < 2) {
    errors.push("need >= 2 clips");
  }

  const minTrim = Math.min(...req.clips.map((c) => c.trim_seconds));

  for (let i = 0; i < req.clips.length; i++) {
    const clip = req.clips[i];

    const urlCheck = validateUrl(clip.url, `clips[${i}].url`);
    if (!urlCheck.valid) errors.push(urlCheck.error!);

    if (clip.trim_seconds < 0.3) {
      errors.push(`clips[${i}]: trim_seconds too short (${clip.trim_seconds}s, min 0.3s)`);
    }

    if (clip.trim_seconds > clip.generated_seconds + 0.01) {
      errors.push(
        `clips[${i}]: trim_seconds (${clip.trim_seconds}) > generated_seconds (${clip.generated_seconds})`
      );
    }
  }

  if (req.voiceover_url) {
    const voCheck = validateUrl(req.voiceover_url, "voiceover_url");
    if (!voCheck.valid) errors.push(voCheck.error!);
  }

  if (!ALLOWED_TRANSITIONS.has(req.transition.type)) {
    errors.push(
      `transition.type "${req.transition.type}" not allowed. ` +
        `Valid: ${[...ALLOWED_TRANSITIONS].join(", ")}`
    );
  }

  if (req.transition.type !== "cut") {
    const maxSafeTransition = Math.max(0.05, minTrim - 0.1);
    if (req.transition.duration > maxSafeTransition) {
      errors.push(
        `transition.duration (${req.transition.duration}s) too long for shortest clip ` +
          `(${minTrim}s, max safe: ${maxSafeTransition.toFixed(2)}s)`
      );
    }
  }

  if (req.clips.length > 50) {
    errors.push(`too many clips (${req.clips.length}, max 50)`);
  }

  const totalDuration = req.clips.reduce((sum, c) => sum + c.trim_seconds, 0);
  if (totalDuration > 180) {
    errors.push(`total duration too long (${totalDuration.toFixed(1)}s, max 180s)`);
  }

  return errors;
}
