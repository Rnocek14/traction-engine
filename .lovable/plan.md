# Story Spine Architecture Fix

## Status: ✅ IMPLEMENTED

---

## Problem: Narrative Collapse

The system was generating **scenes**, not **stories**. GPT-4o produces rich narrative structure (`story_spine`, `motif_anchors`, `change_type`, `action_summary`) but it was being **discarded** before storage.

**Root Cause Chain:**
1. GPT generates full Director Brain output including `story_spine`
2. `StoryBuilderPanel.onSuccess` only extracted `scenes` and `anchors`
3. `storyboard_json` was saved as `{ scenes }` — no spine
4. Chain functions had no access to the narrative structure
5. Progression injection had nothing meaningful to work with

---

## Implemented Fixes (5 Phases)

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

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/lab/StoryBuilderPanel.tsx` | Capture + persist full narrative structure |
| `supabase/functions/generate-storyboard/index.ts` | Add action_summary to schema |
| `supabase/functions/generate-story-chained/index.ts` | Accept and persist story_spine |
| `supabase/functions/continue-story-chain/index.ts` | Read spine, prefer action_summary |
| `src/types/scene-roles.ts` | Sora-first for problem/cta roles |

---

## Why This Fixes Narrative Collapse

The dragon story worked because its prompts were **simple, evocative, and causally linked**. New stories failed because:

1. GPT generates structure → system discarded it
2. Enrichment added technical noise
3. Progression injection extracted from noise
4. Providers received visual specs without story intent

By **preserving the narrative layer** and using **explicit action_summary**, every scene knows:
- What happened before
- What happens now
- What must change
- What must NOT repeat

This transforms the pipeline from "visual continuity engine" to **story engine**.
