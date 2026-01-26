
# Fix "Generate 6 Clips (AI Enhanced)" - Complete Root Cause Analysis

## Issue Summary
The generation fails with "Invalid size" error because the frontend sends `size: "16:9"` (aspect ratio string), but the backend expects pixel dimensions like `"720x1280"`.

## Error Chain Traced

```text
Frontend (StoryBuilderPanel.tsx line 422)
   │
   │  sends: { size: "16:9" }   ← WRONG: aspect ratio, not pixel dimensions
   ▼
generate-story-chained (line 96)
   │
   │  uses settings.size directly: const size = settings?.size || "720x1280"
   │  receives: "16:9"
   ▼
queue-video-smart (line 208)
   │
   │  passes size unchanged to queue-video
   ▼
queue-video (line 87-88)
   │
   │  Validates: if (!allowedSizes.includes(size)) throw Error
   │  allowedSizes = ["720x1280", "1280x720", "1024x1792", "1792x1024"]
   │
   ▼
ERROR: "Invalid size. Allowed: 720x1280, 1280x720, 1024x1792, 1792x1024"
```

## All Issues Found

### Issue 1: Frontend sends wrong size format (CRITICAL)
**File**: `src/components/lab/StoryBuilderPanel.tsx`
**Line**: 421-422
**Problem**: `size: "16:9"` - sends aspect ratio instead of pixel dimensions
**Fix**: Change to `size: "1280x720"` (16:9 in pixels) or `size: "720x1280"` (9:16)

### Issue 2: Edge function doesn't convert aspect ratios (CRITICAL)
**File**: `supabase/functions/generate-story-chained/index.ts`
**Line**: 96
**Problem**: Passes `settings.size` directly without validation/conversion
**Fix**: Add aspect ratio to pixel dimension mapping:
```typescript
function normalizeSize(input?: string): string {
  const sizeMap: Record<string, string> = {
    "16:9": "1280x720",
    "9:16": "720x1280",
    "4:3": "1024x768",   // Not supported, but prevent crash
    "3:4": "768x1024",   // Not supported
  };
  return sizeMap[input || ""] || input || "720x1280";
}
```

### Issue 3: Duration not snapped in generate-story-chained (CRITICAL)
**File**: `supabase/functions/generate-story-chained/index.ts`
**Line**: 147
**Problem**: Still sends raw `duration_target` (e.g., 5) without snapping to valid Sora values (4/8/12)
**Evidence**: Log shows `seconds=4` after smart router, but initial call sends 5
**Fix**: Snap duration before calling queue-video-smart

### Issue 4: Duration 5/6s causing OpenAI API rejections (SECONDARY)
**Evidence from logs**:
```
OpenAI API error: 400 "Invalid value: '6'. Supported values are: '4', '8', and '12'."
OpenAI API error: 400 "Invalid value: '5'. Supported values are: '4', '8', and '12'."
```
This confirms duration snapping isn't happening at some point in the chain.

## Complete Fix Plan

### 1. Fix Frontend - StoryBuilderPanel.tsx
Change line 421-422:
```typescript
// FROM:
settings: {
  size: "16:9",
  provider: "smart",
}

// TO:
settings: {
  size: "1280x720",  // 16:9 in pixels (landscape)
  provider: "smart",
}
```

### 2. Fix generate-story-chained/index.ts
Add size normalization and duration snapping:

```typescript
// Add size normalization function (after line 73)
function normalizeSize(input?: string): string {
  const sizeMap: Record<string, string> = {
    "16:9": "1280x720",
    "9:16": "720x1280", 
    "1:1": "1024x1024",
  };
  // If already a valid pixel dimension, use it; otherwise map or default
  const validSizes = ["720x1280", "1280x720", "1024x1792", "1792x1024"];
  if (validSizes.includes(input || "")) return input!;
  return sizeMap[input || ""] || "720x1280";
}

// Add duration snapping function
function snapToValidDuration(seconds: number): number {
  if (seconds <= 6) return 4;
  if (seconds <= 10) return 8;
  return 12;
}

// Update line 96 (size handling)
const size = normalizeSize(settings?.size);

// Update line 147 (duration handling)
seconds: snapToValidDuration(firstScene.duration_target || 5),
```

### 3. Verify queue-video-smart already has snapping (it does)
The queue-video-smart already has `snapDurationForProvider` from the previous fix - confirmed in the diff.

## Files to Modify

| File | Change |
|------|--------|
| `src/components/lab/StoryBuilderPanel.tsx` | Line 422: Change `"16:9"` to `"1280x720"` |
| `supabase/functions/generate-story-chained/index.ts` | Add `normalizeSize()` and `snapToValidDuration()` functions, apply to settings |

## Deployment Required
After editing, deploy:
- `generate-story-chained`

## Expected Result After Fix
- Frontend sends valid pixel dimensions (`1280x720`)
- generate-story-chained validates/normalizes size
- Duration is snapped to 4/8/12 before any API calls
- Queue-video receives valid parameters
- OpenAI accepts the request

## Test Verification
1. Click "Generate 6 Clips (AI Enhanced)"
2. Check logs show:
   - `size: "1280x720"` or `"720x1280"`
   - `seconds: 4` or `8` or `12`
3. No "Invalid size" or "Invalid value" errors
4. Video generation starts successfully
