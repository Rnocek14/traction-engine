# FFmpeg Microservice Implementation (Fly.io)

Production-ready implementation for the FFmpeg assembly microservice that renders reels from clips + voiceover.

## API Contract

### `POST /render/reel`

**Request Body:** `FFmpegServiceRequest`

```typescript
interface FFmpegServiceRequest {
  job_id: string;
  idempotency_key: string;
  clips: Array<{
    url: string;
    requested_seconds: number;    // timeline duration (UI source of truth)
    generated_seconds: number;    // provider bucket (what API generated)
    trim_seconds: number;         // effective trim = min(requested, generated)
  }>;
  voiceover_url?: string;
  output: {
    width: number;      // 1080
    height: number;     // 1920
    fps: number;        // 30
    video_bitrate: string;  // "8M"
    audio_bitrate: string;  // "192k"
  };
  transition: {
    type: string;       // "cut" (no transition), "fade", "wipe", "dissolve", etc.
    duration: number;   // seconds, e.g. 0.2 (ignored for "cut")
  };
  mix: {
    duck_video_audio: boolean;      // sidechain compress video audio
    video_audio_gain_db: number;    // e.g. -18
    voiceover_gain_db: number;      // e.g. 0
  };
  upload: {
    provider: string;   // "supabase"
    bucket: string;     // "videos"
    path: string;       // "assembled/{script_run_id}.mp4"
    upsert: boolean;
    supabase_url: string;
    supabase_service_key: string;  // NEVER log this
  };
}
```

**Response (202 Accepted):**
```json
{
  "job_id": "uuid",
  "status": "queued",
  "eta_seconds": 45
}
```

**Idempotency:** If `idempotency_key` matches an existing job, returns current job status (including `progress`, `output_url` if succeeded) instead of starting a new render.

**Example Request (crossfade):**
```json
{
  "job_id": "abc123",
  "idempotency_key": "run_xyz:hash",
  "clips": [
    { "url": "https://proj.supabase.co/storage/v1/object/public/videos/clip1.mp4", "requested_seconds": 2.5, "generated_seconds": 4.0, "trim_seconds": 2.5 },
    { "url": "https://proj.supabase.co/storage/v1/object/public/videos/clip2.mp4", "requested_seconds": 3.0, "generated_seconds": 4.0, "trim_seconds": 3.0 }
  ],
  "voiceover_url": "https://proj.supabase.co/storage/v1/object/public/audio/vo.mp3",
  "output": { "width": 1080, "height": 1920, "fps": 30, "video_bitrate": "8M", "audio_bitrate": "192k" },
  "transition": { "type": "fade", "duration": 0.2 },
  "mix": { "duck_video_audio": true, "video_audio_gain_db": -18, "voiceover_gain_db": 0 },
  "upload": { "provider": "supabase", "bucket": "videos", "path": "assembled/abc123.mp4", "upsert": true, "supabase_url": "https://proj.supabase.co", "supabase_service_key": "..." }
}
```

**Example Request (hard cut - no transition):**
```json
{
  "job_id": "def456",
  "idempotency_key": "run_abc:hash",
  "clips": [
    { "url": "https://proj.supabase.co/storage/v1/object/public/videos/clip1.mp4", "requested_seconds": 2.0, "generated_seconds": 4.0, "trim_seconds": 2.0 },
    { "url": "https://proj.supabase.co/storage/v1/object/public/videos/clip2.mp4", "requested_seconds": 3.0, "generated_seconds": 4.0, "trim_seconds": 3.0 }
  ],
  "output": { "width": 1080, "height": 1920, "fps": 30, "video_bitrate": "8M", "audio_bitrate": "192k" },
  "transition": { "type": "cut", "duration": 0 },
  "mix": { "duck_video_audio": false, "video_audio_gain_db": 0, "voiceover_gain_db": 0 },
  "upload": { "provider": "supabase", "bucket": "videos", "path": "assembled/def456.mp4", "upsert": true, "supabase_url": "https://proj.supabase.co", "supabase_service_key": "..." }
}
```

### `GET /jobs/:job_id`

**Response:**
```typescript
interface JobStatus {
  job_id: string;
  status: "queued" | "rendering" | "succeeded" | "failed";
  progress?: number;        // 0..1 (parsed from ffmpeg stderr)
  eta_seconds?: number;
  output_url?: string;      // on succeeded
  duration?: number;        // final duration in seconds
  error?: string;           // on failed
  started_at?: string;
  completed_at?: string;
}
```

---

## File Structure

```
ffmpeg-service/
├── Dockerfile
├── fly.toml
├── package.json
├── tsconfig.json
└── src/
    ├── server.ts      # Express routes + validation
    ├── jobs.ts        # In-memory job store + idempotency
    ├── ffmpeg.ts      # Filtergraph builder + render runner
    └── validation.ts  # URL allowlist + input validation
```

---

## Core Implementation

### `src/validation.ts`

```typescript
import type { FFmpegServiceRequest } from "./ffmpeg.js";

// SECURITY: Pin to your exact Supabase project hostname
// This is more secure than regex patterns
const ALLOWED_HOSTNAMES = new Set([
  "jrujlpljluvxewjytuab.supabase.co",
  // Add other project refs if needed (e.g., staging)
]);

// Alternative: regex pattern for any valid Supabase project ref (allows hyphens)
// const ALLOWED_HOSTNAME_PATTERNS = [
//   /^[a-z0-9-]+\.supabase\.co$/i,
//   /^[a-z0-9-]+\.supabase\.in$/i,
// ];

// Allowed Storage API path prefixes
const ALLOWED_PATH_PREFIXES = [
  "/storage/v1/object/public/",   // public bucket objects
  "/storage/v1/object/sign/",     // signed URLs
  "/storage/v1/object/",          // authenticated access
];

// Allowed transition types for FFmpeg xfade (+ "cut" for no transition)
export const ALLOWED_TRANSITIONS = new Set([
  "cut",  // No xfade - hard cut between clips
  "fade", "wipe", "dissolve", "pixelize",
  "slideup", "slidedown", "slideleft", "slideright",
]);

// Block private/internal IPs (validate hostname, not full URL)
const BLOCKED_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,    // link-local
  /^::1$/,          // IPv6 localhost
  /^fc00:/i,        // IPv6 private
  /^fe80:/i,        // IPv6 link-local
];

/**
 * Validate URL is from allowed Supabase storage domain + path
 * Prevents SSRF attacks by validating hostname AND path prefix
 */
export function validateUrl(url: string, context: string): { valid: boolean; error?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: `${context}: invalid URL format` };
  }

  // Must be HTTPS
  if (parsed.protocol !== "https:") {
    return { valid: false, error: `${context}: must use HTTPS` };
  }

  // Block private/internal IPs (check hostname only, not full URL)
  for (const pattern of BLOCKED_HOSTNAME_PATTERNS) {
    if (pattern.test(parsed.hostname)) {
      return { valid: false, error: `${context}: blocked hostname pattern` };
    }
  }

  // Must match allowed Supabase hostnames (exact match)
  if (!ALLOWED_HOSTNAMES.has(parsed.hostname)) {
    return { valid: false, error: `${context}: hostname not in allowlist (${parsed.hostname})` };
  }

  // Must be a Storage API endpoint
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
 * Returns array of validation errors (empty = valid)
 */
export function validateRenderRequest(req: FFmpegServiceRequest): string[] {
  const errors: string[] = [];

  // Required fields
  if (!req.job_id) errors.push("job_id is required");
  if (!req.clips?.length || req.clips.length < 2) {
    errors.push("need >= 2 clips");
  }

  // Per-clip validation
  const minTrim = Math.min(...req.clips.map((c) => c.trim_seconds));

  for (let i = 0; i < req.clips.length; i++) {
    const clip = req.clips[i];

    // URL validation (SSRF prevention + path validation)
    const urlCheck = validateUrl(clip.url, `clips[${i}].url`);
    if (!urlCheck.valid) errors.push(urlCheck.error!);

    // Duration validation
    if (clip.trim_seconds < 0.3) {
      errors.push(`clips[${i}]: trim_seconds too short (${clip.trim_seconds}s, min 0.3s)`);
    }

    // Sanity check: trim should not exceed generated
    if (clip.trim_seconds > clip.generated_seconds + 0.01) {
      errors.push(
        `clips[${i}]: trim_seconds (${clip.trim_seconds}) > generated_seconds (${clip.generated_seconds})`
      );
    }
  }

  // Voiceover URL validation
  if (req.voiceover_url) {
    const voCheck = validateUrl(req.voiceover_url, "voiceover_url");
    if (!voCheck.valid) errors.push(voCheck.error!);
  }

  // Transition type allowlist
  if (!ALLOWED_TRANSITIONS.has(req.transition.type)) {
    errors.push(
      `transition.type "${req.transition.type}" not allowed. ` +
        `Valid: ${[...ALLOWED_TRANSITIONS].join(", ")}`
    );
  }

  // Transition safety: duration must be < min(trim_seconds) - buffer
  // Skip for "cut" since duration is irrelevant (no overlap)
  if (req.transition.type !== "cut") {
    const maxSafeTransition = Math.max(0.05, minTrim - 0.1);
    if (req.transition.duration > maxSafeTransition) {
      errors.push(
        `transition.duration (${req.transition.duration}s) too long for shortest clip ` +
          `(${minTrim}s, max safe: ${maxSafeTransition.toFixed(2)}s)`
      );
    }
  }

  // Hard limits
  if (req.clips.length > 50) {
    errors.push(`too many clips (${req.clips.length}, max 50)`);
  }

  const totalDuration = req.clips.reduce((sum, c) => sum + c.trim_seconds, 0);
  if (totalDuration > 180) {
    errors.push(`total duration too long (${totalDuration.toFixed(1)}s, max 180s)`);
  }

  return errors;
}
```

### `src/jobs.ts`

```typescript
export type JobStatus = "queued" | "rendering" | "succeeded" | "failed";

export interface Job {
  job_id: string;
  idempotency_key?: string;  // Store for O(1) cleanup
  status: JobStatus;
  progress?: number;
  eta_seconds?: number;
  output_url?: string;
  duration?: number;
  error?: string;
  started_at?: string;
  completed_at?: string;
}

const jobs = new Map<string, Job>();

// Idempotency: map idempotency_key -> job_id
const idempotencyIndex = new Map<string, string>();

export function getJob(job_id: string): Job | undefined {
  return jobs.get(job_id);
}

export function getJobByIdempotencyKey(key: string): Job | undefined {
  const jobId = idempotencyIndex.get(key);
  return jobId ? jobs.get(jobId) : undefined;
}

export function upsertJob(job: Job, idempotencyKey?: string): void {
  // Store the key on the job for O(1) cleanup later
  if (idempotencyKey) {
    job.idempotency_key = idempotencyKey;
    idempotencyIndex.set(idempotencyKey, job.job_id);
  }
  jobs.set(job.job_id, job);
}

export function setJobStatus(job_id: string, patch: Partial<Job>): void {
  const cur = jobs.get(job_id) || { job_id, status: "queued" as const };
  jobs.set(job_id, { ...cur, ...patch });
}

// TTL cleanup: remove jobs older than maxAgeMs
// O(1) per job using stored idempotency_key (no scan required)
export function cleanupOldJobs(maxAgeMs: number = 3600000): void {
  const now = Date.now();

  for (const [id, job] of jobs) {
    const completed = job.completed_at ? new Date(job.completed_at).getTime() : 0;
    if (completed && now - completed > maxAgeMs) {
      jobs.delete(id);
      // O(1) cleanup: use stored key instead of scanning
      if (job.idempotency_key) {
        idempotencyIndex.delete(job.idempotency_key);
      }
    }
  }
}
```

### `src/ffmpeg.ts`

```typescript
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { setJobStatus } from "./jobs.js";

export interface FFmpegServiceRequest {
  job_id: string;
  idempotency_key: string;
  clips: Array<{
    url: string;
    requested_seconds: number;
    generated_seconds: number;
    trim_seconds: number;
  }>;
  voiceover_url?: string;
  output: {
    width: number;
    height: number;
    fps: number;
    video_bitrate: string;
    audio_bitrate: string;
  };
  transition: { type: string; duration: number };
  mix: {
    duck_video_audio: boolean;
    video_audio_gain_db: number;
    voiceover_gain_db: number;
  };
  upload: {
    provider: string;
    bucket: string;
    path: string;
    upsert: boolean;
    supabase_url: string;
    supabase_service_key: string;
  };
}

/**
 * Probe if a media file has an audio stream
 * Returns true if audio exists, false otherwise
 */
async function hasAudioStream(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn("ffprobe", [
      "-v", "error",
      "-select_streams", "a:0",
      "-show_entries", "stream=codec_type",
      "-of", "csv=p=0",
      filePath,
    ]);

    let stdout = "";
    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.on("close", () => resolve(stdout.trim() === "audio"));
  });
}

/**
 * Build FFmpeg filtergraph using trim_seconds for all offset math.
 * Includes:
 * - Per-clip video normalization (scale/pad/fps/trim)
 * - xfade transitions with correct offsets
 * - Audio bed from all clips with timeline placement (with silence fallback)
 * - Voiceover with optional sidechain ducking
 */
export function buildFiltergraph(
  req: FFmpegServiceRequest,
  clipHasAudio: boolean[] // which clips have audio streams
) {
  const { width, height, fps } = req.output;
  const isCut = req.transition.type === "cut";
  const t = isCut ? 0 : req.transition.duration;  // "cut" = no overlap

  // Use trim_seconds as source of truth
  const trims = req.clips.map((c) => Math.max(0.05, Number(c.trim_seconds)));

  // Video xfade offsets: offset_i = sum(trims[0..i]) - (i+1)*t
  // For "cut", t=0 so offsets are simply cumulative sums
  const offsets: number[] = [];
  let vSum = 0;
  for (let i = 0; i < trims.length - 1; i++) {
    vSum += trims[i];
    offsets.push(Math.max(0, vSum - (i + 1) * t));
  }

  // Audio start times: start_i = sum(trims[0..i-1]) - i*t
  // For "cut", t=0 so starts are just cumulative sums (no overlap)
  const starts: number[] = [];
  let aSum = 0;
  for (let i = 0; i < trims.length; i++) {
    if (i === 0) starts.push(0);
    else {
      aSum += trims[i - 1];
      starts.push(Math.max(0, aSum - i * t));
    }
  }

  const filterParts: string[] = [];

  // --- Video: normalize + trim each clip ---
  for (let i = 0; i < req.clips.length; i++) {
    filterParts.push(
      `[${i}:v]` +
        `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,` +
        `fps=${fps},setsar=1,format=yuv420p,` +
        `trim=0:${trims[i].toFixed(3)},setpts=PTS-STARTPTS` +
        `[v${i}]`
    );
  }

  // --- Video: chain clips together ---
  if (isCut) {
    // "cut" transition: use concat filter (no overlap)
    const vLabels = req.clips.map((_, i) => `[v${i}]`).join("");
    filterParts.push(`${vLabels}concat=n=${req.clips.length}:v=1:a=0[v]`);
  } else {
    // xfade transition chain
    let last = `v0`;
    for (let i = 1; i < req.clips.length; i++) {
      const out = i === req.clips.length - 1 ? "v" : `v${i - 1}${i}`;
      filterParts.push(
        `[${last}][v${i}]xfade=transition=${req.transition.type}:duration=${t}:offset=${offsets[i - 1].toFixed(3)}[${out}]`
      );
      last = out;
    }
  }

  // --- Audio: place each clip audio on timeline ---
  // Handle clips without audio by synthesizing silence
  const audioLabels: string[] = [];
  for (let i = 0; i < req.clips.length; i++) {
    const startMs = Math.round(starts[i] * 1000);
    const trimDur = trims[i].toFixed(3);

    if (clipHasAudio[i]) {
      // Clip has audio - use it
      filterParts.push(
        `[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,` +
          `atrim=0:${trimDur},asetpts=PTS-STARTPTS,` +
          `adelay=${startMs}|${startMs}` +
          `[a${i}]`
      );
    } else {
      // Clip has no audio - synthesize silence (full filter chain for consistency)
      filterParts.push(
        `anullsrc=r=48000:cl=stereo,` +
          `aformat=sample_rates=48000:channel_layouts=stereo,` +
          `atrim=0:${trimDur},asetpts=PTS-STARTPTS,` +
          `adelay=${startMs}|${startMs}` +
          `[a${i}]`
      );
    }
    audioLabels.push(`[a${i}]`);
  }

  // Mix all clip audios + apply gain
  filterParts.push(
    `${audioLabels.join("")}amix=inputs=${audioLabels.length}:normalize=0,` +
      `volume=${req.mix.video_audio_gain_db}dB,alimiter=limit=0.98[vid_a]`
  );

  const totalDuration = trims.reduce((sum, d) => sum + d, 0) - (trims.length - 1) * t;

  // --- Voiceover handling ---
  // Note: voiceover is the LAST input (index = clips.length)
  if (req.voiceover_url) {
    const voIndex = req.clips.length;
    filterParts.push(
      `[${voIndex}:a]aformat=sample_rates=48000:channel_layouts=stereo,` +
        `atrim=0:${Math.max(0.1, totalDuration).toFixed(3)},asetpts=PTS-STARTPTS,` +
        `volume=${req.mix.voiceover_gain_db}dB[vo]`
    );

    if (req.mix.duck_video_audio) {
      // Sidechain compress video audio when voiceover is present
      filterParts.push(
        `[vid_a][vo]sidechaincompress=threshold=0.02:ratio=8:attack=5:release=250[ducked]`
      );
      filterParts.push(`[ducked][vo]amix=inputs=2:normalize=0,alimiter=limit=0.98[ao]`);
    } else {
      filterParts.push(`[vid_a][vo]amix=inputs=2:normalize=0,alimiter=limit=0.98[ao]`);
    }
  } else {
    // No voiceover: just trim video audio bed
    filterParts.push(
      `[vid_a]atrim=0:${Math.max(0.1, totalDuration).toFixed(3)},asetpts=PTS-STARTPTS[ao]`
    );
  }

  return { filter: filterParts.join(";\n"), duration: totalDuration };
}

// --- Helpers ---

async function download(url: string, outPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(outPath, buf);
}

async function uploadToSupabase(mp4Path: string, req: FFmpegServiceRequest): Promise<string> {
  const file = await fs.readFile(mp4Path);
  
  // URL-encode the path to handle special characters
  const encodedPath = req.upload.path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  
  const url = `${req.upload.supabase_url}/storage/v1/object/${req.upload.bucket}/${encodedPath}`;

  const resp = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${req.upload.supabase_service_key}`,
      "Content-Type": "video/mp4",
      "x-upsert": req.upload.upsert ? "true" : "false",
    },
    body: file,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Supabase upload failed: ${resp.status} ${text}`);
  }

  return `${req.upload.supabase_url}/storage/v1/object/public/${req.upload.bucket}/${encodedPath}`;
}

/**
 * Parse ffmpeg progress from stderr
 * Supports both time=HH:MM:SS.xx format and -progress out_time_ms
 */
function parseFfmpegProgress(chunk: string): number | null {
  // Try time= format first (most common)
  const timeMatch = chunk.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (timeMatch) {
    return Number(timeMatch[1]) * 3600 + Number(timeMatch[2]) * 60 + Number(timeMatch[3]);
  }

  // Try out_time_ms= format (from -progress)
  const msMatch = chunk.match(/out_time_ms=(\d+)/);
  if (msMatch) {
    return Number(msMatch[1]) / 1_000_000;
  }

  return null;
}

// --- Main render job ---

export async function runRenderJob(req: FFmpegServiceRequest): Promise<void> {
  const jobId = req.job_id;
  setJobStatus(jobId, { status: "rendering", started_at: new Date().toISOString(), progress: 0 });

  const tmpDir = `/tmp/${jobId}`;
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    // Download clips
    const clipPaths: string[] = [];
    for (let i = 0; i < req.clips.length; i++) {
      const p = `${tmpDir}/clip_${i}.mp4`;
      await download(req.clips[i].url, p);
      clipPaths.push(p);
    }

    // Probe each clip for audio streams
    const clipHasAudio: boolean[] = [];
    for (const p of clipPaths) {
      clipHasAudio.push(await hasAudioStream(p));
    }

    // Download voiceover if present
    let voPath: string | null = null;
    if (req.voiceover_url) {
      voPath = `${tmpDir}/voiceover.mp3`;
      await download(req.voiceover_url, voPath);
    }

    const outPath = `${tmpDir}/out.mp4`;
    const { filter, duration: expectedDuration } = buildFiltergraph(req, clipHasAudio);

    // Build ffmpeg args
    // IMPORTANT: -loglevel and -stats BEFORE inputs for reliable progress output
    const args: string[] = [
      "-loglevel", "info",
      "-stats",  // Ensure time= is emitted to stderr
    ];
    
    // Add clip inputs
    for (const p of clipPaths) args.push("-i", p);
    
    // Add voiceover input (must be last for filtergraph indexing)
    if (voPath) args.push("-i", voPath);

    args.push(
      "-filter_complex", filter,
      "-map", "[v]",
      "-map", "[ao]",
      "-c:v", "libx264",
      "-profile:v", "high",
      "-pix_fmt", "yuv420p",
      "-r", String(req.output.fps),
      "-b:v", req.output.video_bitrate,
      "-c:a", "aac",
      "-b:a", req.output.audio_bitrate,
      "-ar", "48000",
      "-shortest",
      outPath
    );

    // Run ffmpeg with progress tracking
    await new Promise<void>((resolve, reject) => {
      const p = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";

      p.stderr.on("data", (d) => {
        const chunk = d.toString();
        stderr += chunk;

        // Parse progress
        const tSec = parseFfmpegProgress(chunk);
        if (tSec != null && expectedDuration > 0) {
          const prog = Math.min(0.99, Math.max(0, tSec / expectedDuration));
          setJobStatus(jobId, { progress: prog });
        }
      });

      p.on("close", (code) => {
        if (code === 0) return resolve();
        reject(new Error(`ffmpeg failed (${code}): ${stderr.slice(-2000)}`));
      });
    });

    // Upload to Supabase
    const outputUrl = await uploadToSupabase(outPath, req);

    setJobStatus(jobId, {
      status: "succeeded",
      output_url: outputUrl,
      duration: expectedDuration,
      completed_at: new Date().toISOString(),
      progress: 1,
    });
  } catch (err) {
    setJobStatus(jobId, {
      status: "failed",
      error: err instanceof Error ? err.message : "Unknown error",
      completed_at: new Date().toISOString(),
    });
    throw err;
  } finally {
    // Cleanup temp files
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
```

### `src/server.ts`

```typescript
import express from "express";
import { getJob, getJobByIdempotencyKey, upsertJob, cleanupOldJobs } from "./jobs.js";
import { runRenderJob, type FFmpegServiceRequest } from "./ffmpeg.js";
import { validateRenderRequest } from "./validation.js";

const app = express();
app.use(express.json({ limit: "50mb" }));

// Cleanup old jobs every hour
setInterval(() => cleanupOldJobs(3600000), 3600000);

app.post("/render/reel", async (req, res) => {
  const body = req.body as FFmpegServiceRequest;

  try {
    // Check idempotency first - return existing job's FULL status if key matches
    // NOTE: This returns a superset of the initial 202 response (includes progress, output_url, etc.)
    // so clients can get current progress/result on retry without starting a new render
    if (body.idempotency_key) {
      const existingJob = getJobByIdempotencyKey(body.idempotency_key);
      if (existingJob) {
        console.log(`Idempotent request: returning existing job ${existingJob.job_id}`);
        // Return full job state (superset of JobStatus interface)
        return res.status(202).json({
          job_id: existingJob.job_id,
          status: existingJob.status,
          progress: existingJob.progress,
          eta_seconds: existingJob.eta_seconds,
          output_url: existingJob.output_url,
          duration: existingJob.duration,
          error: existingJob.error,
          started_at: existingJob.started_at,
          completed_at: existingJob.completed_at,
        });
      }
    }

    // Validate request (includes URL allowlist, duration checks, etc.)
    const errors = validateRenderRequest(body);
    if (errors.length > 0) {
      return res.status(400).json({
        status: "failed",
        error: errors.join("; "),
      });
    }

    // Create job with idempotency key
    upsertJob({ job_id: body.job_id, status: "queued" }, body.idempotency_key);

    // Fire-and-forget async render
    runRenderJob(body).catch((err) => {
      console.error(`Render job ${body.job_id} failed:`, err);
    });

    return res.status(202).json({
      job_id: body.job_id,
      status: "queued",
      eta_seconds: Math.ceil(body.clips.length * 10 + 15),
    });
  } catch (e: any) {
    return res.status(500).json({
      job_id: body?.job_id,
      status: "failed",
      error: e?.message || "error",
    });
  }
});

app.get("/jobs/:job_id", (req, res) => {
  const job = getJob(req.params.job_id);
  if (!job) {
    return res.status(404).json({ status: "failed", error: "Job not found" });
  }
  return res.json(job);
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const port = Number(process.env.PORT || 8080);
app.listen(port, () => console.log(`ffmpeg-service listening on ${port}`));
```

---

## Dockerfile (Multi-stage)

```dockerfile
# Stage 1: Build
FROM node:20-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Stage 2: Production
FROM node:20-slim

RUN apt-get update && apt-get install -y ffmpeg curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

ENV PORT=8080
EXPOSE 8080
CMD ["node", "dist/server.js"]
```

---

## package.json

```json
{
  "name": "ffmpeg-service",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --watch --loader ts-node/esm src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js"
  },
  "dependencies": {
    "express": "^4.19.2"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.14.0",
    "ts-node": "^10.9.2",
    "typescript": "^5.5.4"
  }
}
```

---

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

---

## fly.toml

```toml
app = "your-ffmpeg-service"
primary_region = "ord"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

[[vm]]
  memory = "2048mb"
  cpu_kind = "shared"
  cpus = 1
```

---

## Deployment

```bash
cd ffmpeg-service
fly launch
```

After deployment, add the `FFMPEG_SERVICE_URL` secret to Supabase:

```
https://your-ffmpeg-service.fly.dev
```

---

## Security Checklist

- ✅ **Never log `supabase_service_key`** - passed per-request for upload only
- ✅ **URL allowlist** - only accepts Supabase storage URLs, blocks localhost/private IPs
- ✅ **Idempotency** - duplicate requests return existing job instead of re-rendering
- ✅ **Input validation** - trim_seconds, transition safety, hard limits on clips/duration
- ✅ **URL encoding** - upload paths are properly encoded for special characters
- ✅ **Audio fallback** - clips without audio streams get synthesized silence
- ✅ **TTL cleanup** - jobs removed from memory after 1 hour
- ✅ **Hard limits** - max 50 clips, max 180s total duration

---

## Validation Rules

| Field | Rule |
|-------|------|
| `clips.length` | >= 2, <= 50 |
| `clips[i].trim_seconds` | >= 0.3s, <= generated_seconds |
| `clips[i].url` | HTTPS, Supabase storage hostname + path prefix |
| `voiceover_url` | HTTPS, Supabase storage hostname + path prefix |
| `transition.type` | Must be in allowlist: cut, fade, wipe, dissolve, etc. |
| `transition.duration` | < min(trim_seconds) - 0.1s (skipped when `type="cut"`; recommend sending `0`) |
| Total duration | <= 180s |

---

## Alternative Progress Tracking

If `time=` parsing is unreliable, use FFmpeg's `-progress` option:

```typescript
const args = [
  ...existingArgs,
  "-progress", "pipe:2",  // Send progress to stderr
  outPath
];
```

Then parse `out_time_ms=` from stderr (already supported in `parseFfmpegProgress`).
