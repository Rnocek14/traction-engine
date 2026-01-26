import { spawn } from "node:child_process";
import fs from "node:fs/promises";

export interface ThumbnailRequest {
  job_id: string;
  video_url: string;
  upload: {
    bucket: string;
    thumbnail_path: string;
    spritesheet_path?: string;
    supabase_url: string;
    supabase_service_key: string;
  };
  options?: {
    thumbnail_time?: number; // seconds into video, default 0.5
    spritesheet_cols?: number; // grid columns, default 5
    spritesheet_frames?: number; // total frames, default 10
  };
}

export interface ThumbnailResult {
  thumbnail_url: string;
  spritesheet_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
}

async function download(url: string, outPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(outPath, buf);
}

async function uploadToSupabase(
  filePath: string,
  bucket: string,
  storagePath: string,
  contentType: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<string> {
  const file = await fs.readFile(filePath);
  
  const encodedPath = storagePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  
  const url = `${supabaseUrl}/storage/v1/object/${bucket}/${encodedPath}`;

  const resp = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: file,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Supabase upload failed: ${resp.status} ${text}`);
  }

  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${encodedPath}`;
}

function runFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`ffmpeg failed (${code}): ${stderr.slice(-1000)}`));
    });
  });
}

async function getImageDimensions(imagePath: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const p = spawn("ffprobe", [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height",
      "-of", "csv=p=0:s=x",
      imagePath,
    ]);
    let stdout = "";
    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.on("close", (code) => {
      if (code !== 0) {
        console.error("ffprobe failed for dimensions, using defaults");
        return resolve({ width: 720, height: 1280 }); // Default to portrait
      }
      const parts = stdout.trim().split("x");
      if (parts.length === 2) {
        resolve({ width: parseInt(parts[0], 10), height: parseInt(parts[1], 10) });
      } else {
        console.error(`Could not parse dimensions: ${stdout}, using defaults`);
        resolve({ width: 720, height: 1280 });
      }
    });
  });
}

export async function extractThumbnail(req: ThumbnailRequest): Promise<ThumbnailResult> {
  const tmpDir = `/tmp/thumb_${req.job_id}`;
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    // Download video
    const videoPath = `${tmpDir}/input.mp4`;
    await download(req.video_url, videoPath);

    const thumbnailTime = req.options?.thumbnail_time ?? 0.5;
    const thumbnailPath = `${tmpDir}/thumbnail.jpg`;

    // Extract single frame thumbnail
    await runFFmpeg([
      "-ss", String(thumbnailTime),
      "-i", videoPath,
      "-vframes", "1",
      "-q:v", "2",
      "-y",
      thumbnailPath,
    ]);

    // Get thumbnail dimensions
    const thumbDims = await getImageDimensions(thumbnailPath);

    // Upload thumbnail
    const thumbnailUrl = await uploadToSupabase(
      thumbnailPath,
      req.upload.bucket,
      req.upload.thumbnail_path,
      "image/jpeg",
      req.upload.supabase_url,
      req.upload.supabase_service_key
    );

    const result: ThumbnailResult = { 
      thumbnail_url: thumbnailUrl,
      thumbnail_width: thumbDims.width,
      thumbnail_height: thumbDims.height,
    };

    // Optionally extract spritesheet
    if (req.upload.spritesheet_path) {
      const cols = req.options?.spritesheet_cols ?? 5;
      const totalFrames = req.options?.spritesheet_frames ?? 10;
      const spritesheetPath = `${tmpDir}/spritesheet.jpg`;

      // Get video duration first
      const durationSec = await getVideoDuration(videoPath);
      const interval = Math.max(0.1, durationSec / totalFrames);

      // Extract frames and tile into grid
      await runFFmpeg([
        "-i", videoPath,
        "-vf", `fps=1/${interval},scale=160:-1,tile=${cols}x${Math.ceil(totalFrames / cols)}`,
        "-q:v", "3",
        "-y",
        spritesheetPath,
      ]);

      result.spritesheet_url = await uploadToSupabase(
        spritesheetPath,
        req.upload.bucket,
        req.upload.spritesheet_path,
        "image/jpeg",
        req.upload.supabase_url,
        req.upload.supabase_service_key
      );
    }

    return result;
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const p = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "csv=p=0",
      videoPath,
    ]);
    let stdout = "";
    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error("ffprobe failed"));
      const dur = parseFloat(stdout.trim());
      resolve(isNaN(dur) ? 5 : dur);
    });
  });
}
