# Fix: Image-to-Video Dimension Mismatch in Story Chains

## Status: ✅ IMPLEMENTED

---

## Problem Summary

Story chains were failing at Scene 3+ (Sora) because of an **aspect ratio mismatch** in the chaining system. Sora's Image-to-Video API requires the starting frame to **exactly match** the output dimensions (720x1280).

---

## Solution Implemented

### 1. FFmpeg Service `/resize` Endpoint
- Added `ffmpeg-service/src/resize.ts` with image resizing logic
- Supports `cover` (crop to fill), `fit` (letterbox), and `stretch` modes
- Uploads resized images to Supabase storage

### 2. Database Schema Update
- Added `thumbnail_width` and `thumbnail_height` columns to `video_jobs`
- Allows chain logic to detect dimension mismatches

### 3. Thumbnail Extraction Updates
- `process-video-runway` and `process-video-luma` now store dimensions
- FFmpeg `/thumbnail` endpoint returns dimensions

### 4. Chain Continuation Logic
- `continue-story-chain` detects dimension mismatches for Sora
- Calls FFmpeg `/resize` to match target dimensions before queueing
- Falls back to T2V if resize fails (prevents chain blocking)

---

## Deployment

1. FFmpeg service needs redeployment to Fly.io (push to main triggers GitHub Action)
2. Edge functions deployed: `continue-story-chain`, `process-video-runway`, `process-video-luma`
3. Database migration applied

---

## Validation

After FFmpeg service deploys:
- Scene 3+ should queue with correctly sized starting frames
- Story chains should complete across providers
- Future stories should chain correctly


