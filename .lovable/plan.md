

# Execution Plan: Fix the Content Engine End-to-End

## The Root Problem

The `assemble-reel` edge function has a **critical bug in story mode**: all DB status updates and the upload file path reference `script_run_id`, which is **undefined** when called in story mode (where only `story_job_id` is provided). This means:

- Status is never written (`.eq("id", undefined)` matches nothing)
- Upload path becomes `assembled/undefined.mp4`
- The FFmpeg service may render successfully but the result is lost

This is why **zero assembled videos exist** despite having complete stories with 4 clips + voiceover each.

Additionally, the `StudioPreview` component calls `assemble-reel` with `{ story_job_id: storyId }` but never gets back a working URL because the function silently fails on the DB side.

---

## Phase 1: Fix Assembly (THE Critical Blocker)

### 1A. Fix `assemble-reel` story mode DB writes

**File:** `supabase/functions/assemble-reel/index.ts`

Every place that references `script_run_id` after the mode split needs to use `primaryId` instead, and write to the correct table:

- **Lines 583-592** (FFmpeg not configured error): Write to `story_jobs` when `isStoryMode`, not `script_runs`
- **Lines 610-619** (mark as rendering): Same — use `story_jobs` table + `primaryId`
- **Line 654** (upload path): Change to `assembled/${primaryId}.mp4`
- **Lines 703-718** (success update): Write to `story_jobs` table when `isStoryMode`
- **Lines 733-743** (async job update): Same
- **Lines 769-779** (error update): Same

For story mode, the updates should target `story_jobs` and set fields like `assembled_video_url`, `assembled_status`, `assembled_at`, `assembled_meta` — which may require adding these columns if they don't exist on `story_jobs`.

### 1B. Check/add assembly columns to `story_jobs`

Run a query to check if `story_jobs` has `assembled_video_url`, `assembled_status`, `assembled_at`, `assembled_meta` columns. If not, create a migration to add them.

### 1C. Fix voiceover ID mismatch

The story `542539bb` has `active_voiceover_id = 726ba302` in `story_jobs`, but the voiceover marked `is_active = true` in `story_voiceovers` is `3f6dd04f`. The code fetches by `active_voiceover_id` from `story_jobs`, so verify this voiceover exists and has audio.

### 1D. Deploy and test

- Deploy the fixed `assemble-reel`
- Call it via `curl_edge_functions` with `story_job_id: "542539bb-6a70-4e86-b70e-7fc4013f3bbe"` (which has 4 complete clips + voiceover)
- Verify FFmpeg service receives the request and the upload path is correct

---

## Phase 2: Fix the Client-Side Assembly Flow

### 2A. Update `StudioPreview` to use `useReelAssembly` hook

The `StudioPreview` currently does a raw `supabase.functions.invoke("assemble-reel")` with no status polling. Replace with the existing `useReelAssembly` hook which already handles polling.

### 2B. Update `useReelAssembly` for story mode

The `useReelAssembly` hook currently queries `script_runs` for status. Add a story mode path that queries `story_jobs` instead.

---

## Phase 3: Generate a Real Video (Post-Fix)

Once assembly works:

1. The story `542539bb` already has 4 completed clips + voiceover — trigger assembly from the UI
2. For NEW videos: refill credits on ONE provider (Runway recommended — cheapest per clip)
3. Create a new story, let the chain run, then assemble

---

## Phase 4: Publishing Pipeline (TikTok)

### Why TikTok first
- Content Upload API is simpler than Instagram's (no Facebook Business setup)
- Direct video upload endpoint
- Better organic reach for new accounts in 2026

### Implementation
- New edge function `publish-video` that takes an assembled video URL + caption + account config
- Uses TikTok Content Posting API v2
- New `published_posts` table to track what was posted where
- Requires: TikTok developer app + OAuth token per account (stored as secrets)

---

## Phase 5: Basic Analytics

- New edge function `ingest-tiktok-analytics` (cron, daily)
- Pulls views/likes/shares per video via TikTok API
- Stores in `post_performance` table
- Dashboard card showing top performers

---

## Phase 6: Simplification (Cut List)

Systems to **disable/ignore** right now:
- Video comparison queue (`queue-comparisons`, `process-compare-queue`)
- Provider routing intelligence (`provider_cluster_stats`)  
- Auto-promote routing tags
- Lab/Compare panels in UI
- QA Review Inbox (premature)
- Multi-provider A/B testing

Focus: Runway only → Assembly → Post → Measure

---

## 14-Day Execution Plan

```text
Day 1-2:  Fix assemble-reel story mode bug + add story_jobs columns
          Test with existing story 542539bb (has clips + VO)
          Verify assembled MP4 lands in Supabase storage

Day 3-4:  Fix client-side assembly flow (useReelAssembly for stories)
          Refill Runway credits
          Generate 2-3 new stories end-to-end

Day 5-6:  Watch assembled videos critically
          Fix any clip/VO sync issues
          Tune transitions

Day 7-8:  Set up TikTok developer app
          Build publish-video edge function
          Post first video manually via API

Day 9-10: Build basic scheduling (post queue table + cron)
          Post 5-10 videos to one account

Day 11-12: Build basic analytics ingestion
           Track views/retention on posted videos

Day 13-14: Evaluate what's working
           Iterate on hooks/scripts based on data
           Plan next batch
```

---

## Estimated Changes

| File | Change |
|------|--------|
| `supabase/functions/assemble-reel/index.ts` | Fix all `script_run_id` refs to use `primaryId` + correct table |
| Migration | Add assembly columns to `story_jobs` if missing |
| `src/hooks/use-reel-assembly.ts` | Add story mode query path |
| `src/components/story-studio/StudioPreview.tsx` | Use `useReelAssembly` hook |
| New: `supabase/functions/publish-video/index.ts` | TikTok upload (Phase 4) |
| New: migration for `published_posts` table | Phase 4 |

