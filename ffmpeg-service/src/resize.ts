import { spawn } from "node:child_process";
import fs from "node:fs/promises";

export interface ResizeRequest {
  job_id: string;
  image_url: string;
  target_width: number;
  target_height: number;
  mode?: "fit" | "cover" | "stretch"; // default: cover (crop to fill)
  upload: {
    bucket: string;
    output_path: string;
    supabase_url: string;
    supabase_service_key: string;
  };
}

export interface ResizeResult {
  resized_url: string;
  original_width?: number;
  original_height?: number;
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
      if (code !== 0) return reject(new Error("ffprobe failed"));
      const parts = stdout.trim().split("x");
      if (parts.length === 2) {
        resolve({ width: parseInt(parts[0], 10), height: parseInt(parts[1], 10) });
      } else {
        reject(new Error(`Could not parse dimensions: ${stdout}`));
      }
    });
  });
}

/**
 * Resize an image to target dimensions.
 * 
 * Modes:
 * - cover (default): Scale and crop to fill target dimensions (maintains aspect, crops overflow)
 * - fit: Scale to fit within target dimensions (may have letterboxing)
 * - stretch: Force exact dimensions (may distort)
 */
export async function resizeImage(req: ResizeRequest): Promise<ResizeResult> {
  const tmpDir = `/tmp/resize_${req.job_id}_${Date.now()}`;
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    // Download image
    const inputPath = `${tmpDir}/input.jpg`;
    await download(req.image_url, inputPath);

    // Get original dimensions
    const originalDims = await getImageDimensions(inputPath);
    console.log(`[resize] Original: ${originalDims.width}x${originalDims.height}, Target: ${req.target_width}x${req.target_height}`);

    const outputPath = `${tmpDir}/output.jpg`;
    const mode = req.mode || "cover";
    const tw = req.target_width;
    const th = req.target_height;

    let vfFilter: string;
    
    switch (mode) {
      case "fit":
        // Scale to fit, add black bars if needed
        vfFilter = `scale=${tw}:${th}:force_original_aspect_ratio=decrease,pad=${tw}:${th}:(ow-iw)/2:(oh-ih)/2:black`;
        break;
      case "stretch":
        // Force exact dimensions (may distort)
        vfFilter = `scale=${tw}:${th}`;
        break;
      case "cover":
      default:
        // Scale and crop to fill (most common for I2V)
        vfFilter = `scale=${tw}:${th}:force_original_aspect_ratio=increase,crop=${tw}:${th}`;
        break;
    }

    await runFFmpeg([
      "-i", inputPath,
      "-vf", vfFilter,
      "-q:v", "2",
      "-y",
      outputPath,
    ]);

    // Upload resized image
    const resizedUrl = await uploadToSupabase(
      outputPath,
      req.upload.bucket,
      req.upload.output_path,
      "image/jpeg",
      req.upload.supabase_url,
      req.upload.supabase_service_key
    );

    console.log(`[resize] ✓ Resized to ${tw}x${th}, uploaded to ${resizedUrl}`);

    return {
      resized_url: resizedUrl,
      original_width: originalDims.width,
      original_height: originalDims.height,
    };
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
