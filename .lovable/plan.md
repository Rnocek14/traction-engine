# Story Spine Architecture Fix

## Status: ✅ FULLY IMPLEMENTED (Auto-Save Fixed)

---

## Problem: Narrative Collapse + Persistence Gap

Two distinct bugs were causing narrative loss:

1. **Narrative Collapse**: GPT-4o produces rich narrative structure (`story_spine`, `motif_anchors`, `change_type`, `action_summary`) but it was being **discarded** before storage.

2. **Persistence Gap**: Story data was only saved to DB when user clicked "Generate Clips". If they navigated away after generating a storyboard, all narrative structure was lost.

**Root Cause Chain:**
1. GPT generates full Director Brain output including `story_spine` + `action_summary`
2. `generate-storyboard` edge function returns all fields correctly ✅
3. `generateStory.onSuccess` captured state but **didn't save to DB**
4. `action_summary` wasn't being mapped from scene objects
5. Data only persisted when user clicked "Generate Clips" button

---

## Implemented Fixes (6 Phases)

### Phase 1: Store Full Storyboard_json ✅

**File:** `src/components/lab/StoryBuilderPanel.tsx`

- Added state for `storySpine`, `motifAnchors`, `paletteKeywords`
- Updated `generateStory.onSuccess` to capture all Director Brain fields
- Updated `createStory` mutation to persist full narrative structure
- Updated `handleGenerate` to save spine on update
- Pass `story_spine` and `motif_anchors` to `generate-story-chained`

### Phase 2: Add `action_summary` to Storyboard ✅

**File:** `supabase/functions/generate-storyboard/index.ts`

- Updated `SYSTEM_PROMPT` to request explicit `action_summary` per scene
- Added to JSON schema: `"action_summary": "Character performs specific action"`
- Critical instruction: "action_summary must describe CHARACTER ACTION, not camera motion"

### Phase 3: Read + Log Narrative Context in Chain ✅

**Files:**
- `supabase/functions/generate-story-chained/index.ts`
- `supabase/functions/continue-story-chain/index.ts`

- Read `story_spine` from request and `storyboard_json`
- Log story spine for debugging: `[chained] Story Spine: "..."`
- Prefer `action_summary` over heuristic extraction in progression injection

### Phase 4: Simplify Enrichment When Spine Exists ✅

**File:** `src/components/lab/StoryBuilderPanel.tsx`

- If `storySpine` exists → minimal enrichment (just append continuity)
- If no spine → full AI enrichment for manually-written scenes
- Prevents over-engineering GPT's already-poetic prompts

### Phase 5: Sora-First Routing for Story Beats ✅

**File:** `src/types/scene-roles.ts`

| Role | Before | After | Rationale |
|------|--------|-------|-----------|
| problem | luma | **sora** | Narrative clarity > atmosphere |
| cta | luma | **sora** | Story resolution needs coherence |
| atmosphere | luma | luma | Keep for pure texture/physics |
| hook | runway | runway | Attention mechanics |
| reset | runway | runway | Punchy micro-cuts |

### Phase 6: Auto-Save + action_summary Capture ✅ (NEW)

**File:** `src/components/lab/StoryBuilderPanel.tsx`

- `generateStory.onSuccess` now **auto-saves to DB immediately**
- Creates new story_job or updates existing one right after edge function returns
- Captures `action_summary` in scene mapping (was missing!)
- Navigates to new story after creation via `onStoryCreated` callback
- Console logs saved storyboard for debugging

---

## Validation Criteria

After generating a new story, check:

1. **DB:** `storyboard_json` contains:
   - `story_spine`
   - `motif_anchors`
   - `palette_keywords`
   - Per-scene: `change_type`, `action_summary`, `narration_line`

2. **Chain Logs:** Show:
   - `[chained] Story Spine: "Person discovers X → Y → Z"`
   - `[progression] action_summary: prev="..." next="..."`

3. **Visual Output:**
   - Each scene has different primary action
   - Character/environment continuity maintained
   - Stories feel like cause→effect, not montages

**Test SQL query:**
```sql
SELECT
  id,
  title,
  created_at,
  storyboard_json->>'story_spine' as story_spine,
  storyboard_json->'motif_anchors' as motif_anchors,
  storyboard_json->'scenes'->0->>'action_summary' as scene_1_action_summary,
  storyboard_json->'scenes'->0->>'change_type' as scene_1_change_type
FROM story_jobs
ORDER BY created_at DESC
LIMIT 5;
```

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/lab/StoryBuilderPanel.tsx` | Capture + persist full narrative structure + auto-save |
| `supabase/functions/generate-storyboard/index.ts` | Add action_summary to schema |
| `supabase/functions/generate-story-chained/index.ts` | Accept and persist story_spine |
| `supabase/functions/continue-story-chain/index.ts` | Read spine, prefer action_summary |
| `src/types/scene-roles.ts` | Sora-first for problem/cta roles |

---

## Why This Fixes Narrative Collapse + Persistence Gap

The dragon story worked because its prompts were **simple, evocative, and causally linked**. New stories failed because:

1. GPT generates structure → system discarded it (now captured)
2. User generates storyboard → navigates away → data lost (now auto-saved)
3. `action_summary` wasn't captured → progression injection blind (now captured)
4. Enrichment added technical noise → spine overwritten (now minimal enrichment when spine exists)

By **preserving the narrative layer** and **auto-saving immediately**, every scene knows:
- What happened before
- What happens now
- What must change
- What must NOT repeat

This transforms the pipeline from "visual continuity engine" to **story engine**.
