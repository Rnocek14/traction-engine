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
    /** If true, freeze last frame to reach requested_seconds (for audio-master mode) */
    freeze_extend?: boolean;
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
 */
export function buildFiltergraph(
  req: FFmpegServiceRequest,
  clipHasAudio: boolean[]
) {
  const { width, height, fps } = req.output;
  const isCut = req.transition.type === "cut";
  const t = isCut ? 0 : req.transition.duration;

  // For each clip: effective duration for timeline purposes
  // If freeze_extend, we use requested_seconds (narration); otherwise trim_seconds (clamped)
  const effectiveDurations = req.clips.map((c) => {
    if (c.freeze_extend && c.requested_seconds > c.generated_seconds) {
      return Math.max(0.05, Number(c.requested_seconds));
    }
    return Math.max(0.05, Number(c.trim_seconds));
  });

  // Video xfade offsets based on effective durations
  const offsets: number[] = [];
  let vSum = 0;
  for (let i = 0; i < effectiveDurations.length - 1; i++) {
    vSum += effectiveDurations[i];
    offsets.push(Math.max(0, vSum - (i + 1) * t));
  }

  // Audio start times
  const starts: number[] = [];
  let aSum = 0;
  for (let i = 0; i < effectiveDurations.length; i++) {
    if (i === 0) starts.push(0);
    else {
      aSum += effectiveDurations[i - 1];
      starts.push(Math.max(0, aSum - i * t));
    }
  }

  const filterParts: string[] = [];

  // Video: normalize + trim (+ freeze-frame extend if needed)
  for (let i = 0; i < req.clips.length; i++) {
    const clip = req.clips[i];
    const trimDur = Math.max(0.05, Number(clip.trim_seconds));
    const effectiveDur = effectiveDurations[i];
    const needsFreeze = clip.freeze_extend && effectiveDur > trimDur;
    const freezePad = needsFreeze ? effectiveDur - trimDur : 0;

    let videoFilter =
      `[${i}:v]` +
      `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,` +
      `fps=${fps},setsar=1,format=yuv420p,` +
      `trim=0:${trimDur.toFixed(3)},setpts=PTS-STARTPTS`;

    // Freeze last frame if narration is longer than clip
    if (needsFreeze && freezePad > 0.01) {
      videoFilter += `,tpad=stop_mode=clone:stop_duration=${freezePad.toFixed(3)}`;
      console.log(`Clip ${i}: freezing last frame for ${freezePad.toFixed(2)}s (requested=${clip.requested_seconds}s, generated=${clip.generated_seconds}s)`);
    }

    videoFilter += `[v${i}]`;
    filterParts.push(videoFilter);
  }

  // Video: chain clips together
  if (isCut) {
    const vLabels = req.clips.map((_, i) => `[v${i}]`).join("");
    filterParts.push(`${vLabels}concat=n=${req.clips.length}:v=1:a=0[v]`);
  } else {
    let last = `v0`;
    for (let i = 1; i < req.clips.length; i++) {
      const out = i === req.clips.length - 1 ? "v" : `v${i - 1}${i}`;
      filterParts.push(
        `[${last}][v${i}]xfade=transition=${req.transition.type}:duration=${t}:offset=${offsets[i - 1].toFixed(3)}[${out}]`
      );
      last = out;
    }
  }

  // Audio: place each clip audio on timeline (using effective durations)
  const audioLabels: string[] = [];
  for (let i = 0; i < req.clips.length; i++) {
    const startMs = Math.round(starts[i] * 1000);
    const effectiveDur = effectiveDurations[i].toFixed(3);

    if (clipHasAudio[i]) {
      // For clips with audio: trim to effective duration (may include silence during freeze)
      const trimDur = Math.max(0.05, Number(req.clips[i].trim_seconds)).toFixed(3);
      filterParts.push(
        `[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo,` +
          `atrim=0:${trimDur},asetpts=PTS-STARTPTS,` +
          `apad=whole_dur=${effectiveDur},` +
          `adelay=${startMs}|${startMs}` +
          `[a${i}]`
      );
    } else {
      filterParts.push(
        `anullsrc=r=48000:cl=stereo,` +
          `aformat=sample_rates=48000:channel_layouts=stereo,` +
          `atrim=0:${effectiveDur},asetpts=PTS-STARTPTS,` +
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

  const totalDuration = effectiveDurations.reduce((sum, d) => sum + d, 0) - (effectiveDurations.length - 1) * t;

  // Voiceover handling
  if (req.voiceover_url) {
    const voIndex = req.clips.length;
    filterParts.push(
      `[${voIndex}:a]aformat=sample_rates=48000:channel_layouts=stereo,` +
        `atrim=0:${Math.max(0.1, totalDuration).toFixed(3)},asetpts=PTS-STARTPTS,` +
        `volume=${req.mix.voiceover_gain_db}dB[vo]`
    );

    if (req.mix.duck_video_audio) {
      filterParts.push(
        `[vid_a][vo]sidechaincompress=threshold=0.02:ratio=8:attack=5:release=250[ducked]`
      );
      filterParts.push(`[ducked][vo]amix=inputs=2:normalize=0,alimiter=limit=0.98[ao]`);
    } else {
      filterParts.push(`[vid_a][vo]amix=inputs=2:normalize=0,alimiter=limit=0.98[ao]`);
    }
  } else {
    filterParts.push(
      `[vid_a]atrim=0:${Math.max(0.1, totalDuration).toFixed(3)},asetpts=PTS-STARTPTS[ao]`
    );
  }

  return { filter: filterParts.join(";\n"), duration: totalDuration };
}

async function download(url: string, outPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(outPath, buf);
}

async function uploadToSupabase(mp4Path: string, req: FFmpegServiceRequest): Promise<string> {
  const file = await fs.readFile(mp4Path);
  
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

function parseFfmpegProgress(chunk: string): number | null {
  const timeMatch = chunk.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (timeMatch) {
    return Number(timeMatch[1]) * 3600 + Number(timeMatch[2]) * 60 + Number(timeMatch[3]);
  }

  const msMatch = chunk.match(/out_time_ms=(\d+)/);
  if (msMatch) {
    return Number(msMatch[1]) / 1_000_000;
  }

  return null;
}

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

    const args: string[] = [
      "-loglevel", "info",
      "-stats",
    ];
    
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

    await new Promise<void>((resolve, reject) => {
      const p = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";

      p.stderr.on("data", (d) => {
        const chunk = d.toString();
        stderr += chunk;

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
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
