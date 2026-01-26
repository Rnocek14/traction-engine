

# Fix: Image-to-Video Dimension Mismatch in Story Chains

## Problem Summary

Your "Blooming Appetite" story is stuck because of an **aspect ratio mismatch** in the chaining system:

1. **Scene 1** (Runway) completed successfully at 720x1280 (portrait)
2. **Scene 2** (Luma) completed, but its thumbnail may not be 720x1280
3. **Scene 3+** (Sora) is failing repeatedly with:
   > "Inpaint image must match the requested width and height"

The FFmpeg thumbnail extraction creates thumbnails at the video's native resolution, but Sora's Image-to-Video API requires the starting frame to **exactly match** the output dimensions (720x1280).

---

## Why Scene 1 and 2 Look Similar

Scene 2 used Scene 1's thumbnail as a starting frame. Luma's I2V mode begins animation from that exact image, so the visual starting point was the park scene. The prompt described a kitchen, but without enough visual differentiation cues, Luma may have maintained too much visual continuity from the reference.

---

## Solution: Resize Starting Frames to Match Output Dimensions

### Technical Approach

We'll modify the chain continuation logic to ensure starting frames are resized to match the requested video dimensions before being sent to Sora.

### Option A: Resize via FFmpeg Service (Preferred)
Add a new endpoint or parameter to the FFmpeg service that resizes/crops images to a target dimension.

### Option B: Resize in Edge Function
Use a lightweight image processing approach in the edge function to resize the thumbnail URL before passing to Sora.

### Option C: Use Provider-Native Thumbnails When Available
Luma returns its own thumbnail at the correct aspect ratio - prefer that over FFmpeg-extracted ones.

---

## Implementation Steps

### Step 1: Update `continue-story-chain` to detect dimension mismatches

Before queuing to Sora, check if the starting frame needs resizing:

```typescript
// If targeting Sora with a starting frame, ensure dimensions match
if (selectedProvider === "sora" && !isFirstScene && latestThumbnail) {
  // Sora requires exact dimension match
  const targetSize = "720x1280";
  // Option: Call FFmpeg service to resize, or skip I2V for first Sora in chain
}
```

### Step 2: Add resize capability to FFmpeg service

Create a `/resize` endpoint that:
- Takes an image URL and target dimensions
- Returns a resized image URL in Supabase storage
- Handles crop/fit modes for aspect ratio changes

### Step 3: Update thumbnail extraction to store dimensions

Store the thumbnail dimensions in `video_jobs` so the chain can make smart decisions:
```sql
ALTER TABLE video_jobs ADD COLUMN thumbnail_width integer;
ALTER TABLE video_jobs ADD COLUMN thumbnail_height integer;
```

### Step 4: Fallback for mismatched dimensions

If dimensions don't match and resize fails, fall back to Text-to-Video mode instead of Image-to-Video for that scene (losing continuity but not blocking the chain).

---

## Immediate Workaround

To unblock "The Blooming Appetite" now, we can:

1. **Option A**: Manually reset Scene 3 to use Text-to-Video (skip the reference frame)
2. **Option B**: Use Luma or Runway for Scene 3 (they may be more flexible with input dimensions)
3. **Option C**: Fix the thumbnail to be 720x1280 manually

---

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/continue-story-chain/index.ts` | Add dimension check and resize logic |
| `ffmpeg-service/src/thumbnail.ts` | Add resize endpoint |
| `ffmpeg-service/src/server.ts` | Register resize route |
| `supabase/functions/queue-video/index.ts` | Better error handling for dimension mismatch |

---

## Validation

After implementing:
1. Scene 3+ should successfully queue with properly sized starting frames
2. The chain should complete all 6 scenes
3. Future stories should chain correctly across providers

