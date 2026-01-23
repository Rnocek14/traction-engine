# FFmpeg Microservice Implementation (Fly.io)

Complete implementation guide for the FFmpeg assembly microservice that renders reels from clips + voiceover.

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
    type: string;       // "fade", "wipe", "cut"
    duration: number;   // seconds, e.g. 0.2
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
    ├── server.ts      # Express routes
    ├── jobs.ts        # In-memory job store
    └── ffmpeg.ts      # Filtergraph builder + render runner
```

---

## Core Implementation

### `src/jobs.ts`

```typescript
export type JobStatus = "queued" | "rendering" | "succeeded" | "failed";

export interface Job {
  job_id: string;
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

export function getJob(job_id: string): Job | undefined {
  return jobs.get(job_id);
}

export function upsertJob(job: Job): void {
  jobs.set(job.job_id, job);
}

export function setJobStatus(job_id: string, patch: Partial<Job>): void {
  const cur = jobs.get(job_id) || { job_id, status: "queued" as const };
  jobs.set(job_id, { ...cur, ...patch });
}

// Optional: TTL cleanup for old jobs (run on interval)
export function cleanupOldJobs(maxAgeMs: number = 3600000): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    const completed = job.completed_at ? new Date(job.completed_at).getTime() : 0;
    if (completed && now - completed > maxAgeMs) {
      jobs.delete(id);
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
 * Build FFmpeg filtergraph using trim_seconds for all offset math.
 * Includes:
 * - Per-clip video normalization (scale/pad/fps/trim)
 * - xfade transitions with correct offsets
 * - Audio bed from all clips with timeline placement
 * - Voiceover with optional sidechain ducking
 */
export function buildFiltergraph(req: FFmpegServiceRequest) {
  const { width, height, fps } = req.output;
  const t = req.transition.duration;

  // Use trim_seconds as source of truth
  const trims = req.clips.map((c) => Math.max(0.05, Number(c.trim_seconds)));

  // Video xfade offsets: offset_i = sum(trims[0..i]) - (i+1)*t
  const offsets: number[] = [];
  let vSum = 0;
  for (let i = 0; i < trims.length - 1; i++) {
    vSum += trims[i];
    offsets.push(Math.max(0, vSum - (i + 1) * t));
  }

  // Audio start times: start_i = sum(trims[0..i-1]) - i*t
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

  // --- Video: xfade chain ---
  let last = `v0`;
  for (let i = 1; i < req.clips.length; i++) {
    const out = i === req.clips.length - 1 ? "v" : `v${i - 1}${i}`;
    filterParts.push(
      `[${last}][v${i}]xfade=transition=${req.transition.type}:duration=${t}:offset=${offsets[i - 1].toFixed(3)}[${out}]`
    );
    last = out;
  }

  // --- Audio: place each clip audio on timeline ---
  const audioLabels: string[] = [];
  for (let i = 0; i < req.clips.length; i++) {
    const startMs = Math.round(starts[i] * 1000);
    filterParts.push(
      `[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,` +
        `atrim=0:${trims[i].toFixed(3)},asetpts=PTS-STARTPTS,` +
        `adelay=${startMs}|${startMs}` +
        `[a${i}]`
    );
    audioLabels.push(`[a${i}]`);
  }

  // Mix all clip audios + apply gain
  filterParts.push(
    `${audioLabels.join("")}amix=inputs=${audioLabels.length}:normalize=0,` +
      `volume=${req.mix.video_audio_gain_db}dB,alimiter=limit=0.98[vid_a]`
  );

  const totalDuration = trims.reduce((sum, d) => sum + d, 0) - (trims.length - 1) * t;

  // --- Voiceover handling ---
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
  const url = `${req.upload.supabase_url}/storage/v1/object/${req.upload.bucket}/${req.upload.path}`;

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

  return `${req.upload.supabase_url}/storage/v1/object/public/${req.upload.bucket}/${req.upload.path}`;
}

function parseFfmpegTimeToSeconds(line: string): number | null {
  const m = line.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
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

    // Download voiceover if present
    let voPath: string | null = null;
    if (req.voiceover_url) {
      voPath = `${tmpDir}/voiceover.mp3`;
      await download(req.voiceover_url, voPath);
    }

    const outPath = `${tmpDir}/out.mp4`;
    const { filter, duration: expectedDuration } = buildFiltergraph(req);

    // Build ffmpeg args
    const args: string[] = [];
    for (const p of clipPaths) args.push("-i", p);
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

        // Parse progress from time=HH:MM:SS.xx
        const lines = chunk.split("\n");
        for (const line of lines) {
          const tSec = parseFfmpegTimeToSeconds(line);
          if (tSec != null && expectedDuration > 0) {
            const prog = Math.min(0.99, Math.max(0, tSec / expectedDuration));
            setJobStatus(jobId, { progress: prog });
          }
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
import { getJob, upsertJob, cleanupOldJobs } from "./jobs.js";
import { runRenderJob, type FFmpegServiceRequest } from "./ffmpeg.js";

const app = express();
app.use(express.json({ limit: "50mb" }));

// Cleanup old jobs every hour
setInterval(() => cleanupOldJobs(3600000), 3600000);

app.post("/render/reel", async (req, res) => {
  const body = req.body as FFmpegServiceRequest;

  try {
    if (!body?.job_id) {
      return res.status(400).json({ status: "failed", error: "job_id required" });
    }
    if (!body?.clips?.length || body.clips.length < 2) {
      return res.status(400).json({ status: "failed", error: "need >=2 clips" });
    }

    // Validate trim_seconds
    for (const clip of body.clips) {
      if (clip.trim_seconds < 0.3) {
        return res.status(400).json({
          status: "failed",
          error: `Clip trim_seconds too short: ${clip.trim_seconds}s (min 0.3s)`,
        });
      }
    }

    upsertJob({ job_id: body.job_id, status: "queued" });

    // Fire-and-forget async render
    runRenderJob(body).catch((err) => {
      console.error(`Render job ${body.job_id} failed:`, err);
    });

    return res.status(202).json({
      job_id: body.job_id,
      status: "queued",
      eta_seconds: Math.ceil(body.clips.length * 10 + 15), // rough estimate
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

## Dockerfile

```dockerfile
FROM node:20-slim

RUN apt-get update && apt-get install -y ffmpeg curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY dist ./dist

ENV PORT=8080
EXPOSE 8080
CMD ["node", "dist/server.js"]
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
npm run build
fly launch
```

After deployment, add the `FFMPEG_SERVICE_URL` secret to Supabase:

```
https://your-ffmpeg-service.fly.dev
```

---

## Security Notes

1. **Never log `supabase_service_key`** - it's passed per-request for upload only
2. **Validate clip URLs** - ensure they match expected Supabase storage domain
3. **Hard limits**: max 50 clips, max 180s total duration
4. **TTL cleanup** - jobs are removed from memory after 1 hour
