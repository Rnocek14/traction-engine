import express from "express";
import { getJob, getJobByIdempotencyKey, upsertJob, cleanupOldJobs } from "./jobs.js";
import { runRenderJob, type FFmpegServiceRequest } from "./ffmpeg.js";
import { validateRenderRequest } from "./validation.js";
import { extractThumbnail, type ThumbnailRequest } from "./thumbnail.js";
import { resizeImage, type ResizeRequest } from "./resize.js";

const app = express();
app.use(express.json({ limit: "50mb" }));

// Cleanup old jobs every hour
setInterval(() => cleanupOldJobs(3600000), 3600000);

app.post("/render/reel", async (req, res) => {
  const body = req.body as FFmpegServiceRequest;

  try {
    // Check idempotency first
    if (body.idempotency_key) {
      const existingJob = getJobByIdempotencyKey(body.idempotency_key);
      if (existingJob) {
        console.log(`Idempotent request: returning existing job ${existingJob.job_id}`);
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

    // Validate request
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
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "error";
    return res.status(500).json({
      job_id: body?.job_id,
      status: "failed",
      error: message,
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

// Thumbnail extraction endpoint
app.post("/thumbnail", async (req, res) => {
  const body = req.body as ThumbnailRequest;

  try {
    if (!body.job_id || !body.video_url || !body.upload?.thumbnail_path) {
      return res.status(400).json({
        error: "Missing required fields: job_id, video_url, upload.thumbnail_path",
      });
    }

    console.log(`Extracting thumbnail for job ${body.job_id}`);
    const result = await extractThumbnail(body);

    return res.json({
      success: true,
      ...result,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "error";
    console.error(`Thumbnail extraction failed for ${body?.job_id}:`, message);
    return res.status(500).json({
      error: message,
    });
  }
});

// Image resize endpoint for I2V dimension matching
app.post("/resize", async (req, res) => {
  const body = req.body as ResizeRequest;

  try {
    if (!body.job_id || !body.image_url || !body.target_width || !body.target_height || !body.upload?.output_path) {
      return res.status(400).json({
        error: "Missing required fields: job_id, image_url, target_width, target_height, upload.output_path",
      });
    }

    console.log(`Resizing image for job ${body.job_id}: ${body.target_width}x${body.target_height}`);
    const result = await resizeImage(body);

    return res.json({
      success: true,
      ...result,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "error";
    console.error(`Resize failed for ${body?.job_id}:`, message);
    return res.status(500).json({
      error: message,
    });
  }
});

const port = Number(process.env.PORT || 8080);
app.listen(port, () => console.log(`ffmpeg-service listening on ${port}`));
