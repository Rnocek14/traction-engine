
# Complete Constraint Removal Plan: Unleashing Action in Myth Mode

## ✅ IMPLEMENTATION COMPLETE (2026-02-05)

All phases have been implemented and deployed:

### Changes Made:

1. **`create-story-myth-mode/index.ts`** - Story Creation
   - ✅ Removed `slow_pacing: true` default
   - ✅ Removed `frame_by_frame_motion: true` default  
   - ✅ Added `pacing` parameter (slow/dynamic/fast) - defaults to "dynamic"
   - ✅ Added `epic_mode` parameter for full action support
   - ✅ Made `silhouette_only` conditional on epic_mode

2. **`myth-continuity.ts`** - Prompt Building
   - ✅ Added new beat types: `battle`, `chase`, `clash`, `ascension`
   - ✅ Added `ACTION_MOTION_POOLS` with combat/chase motion anchors
   - ✅ Added action-friendly `BEAT_PACING` directives
   - ✅ Added `MYTH_BEAT_CONFIGS` for battle/chase/clash/ascension
   - ✅ Removed "no smooth interpolation" from V2 builder negatives

3. **`auto-rate-video/index.ts`** - Rating System
   - ✅ Added `isSpectacleContext()` detection function
   - ✅ Added `SPECTACLE_TOLERANT_DEFECTS` set (floaty_motion, unnatural_motion, physics_violation, flicker)
   - ✅ Reduced motion penalties by 50% for spectacle content
   - ✅ Relaxed defect caps in spectacle mode (flicker not penalized, physics_violation caps at 75 not 60)

4. **`constraint-profiles.ts`** - Budget System
   - ✅ Added `myth-epic` and `myth-action` modes
   - ✅ myth-action gets spectacle-level freedom (tier1 disabled, sanitization off)
   - ✅ Updated mode multipliers for action content
   - ✅ Updated storyboard validation to skip verb checks for action modes

### Edge Functions Deployed:
- `create-story-myth-mode`
- `auto-rate-video`

### Verification:
- Existing stories keep their original settings
- NEW stories will use dynamic pacing by default
- Action beat types now available in storyboard generation
- Rating system won't penalize intentional dynamic motion

---

## Summary

This plan removes ALL action-killing constraints across the video generation system, with special focus on unlocking "The Awakening of Arcane" and future Myth Mode stories.

---

## Part 1: Files to Modify

### 1.1 `create-story-myth-mode/index.ts` - Story Creation
**Current Restrictions:**
```typescript
generation_settings: {
  slow_pacing: true,         // <-- KILLS ACTION
  frame_by_frame_motion: true, // <-- KILLS FLUIDITY  
  silhouette_only: true,
  no_faces: true,
}
```

**Changes:**
- Add `pacing` parameter to request (slow/medium/fast)
- Default pacing to `"dynamic"` instead of `"slow"`
- Remove `frame_by_frame_motion` default
- Make silhouette/no_faces optional for "epic" variants

### 1.2 `myth-continuity.ts` - Prompt Building
**Current Restrictions:**
- `BEAT_PACING` hardcodes slow tempo directives
- Motion anchors prioritize stillness/deliberation
- "No 3D rendering, no smooth interpolation" negatives block fluid motion
- Style anchors enforce rigid shadow-puppet aesthetic even for action

**Changes:**
- Create `DYNAMIC_BEAT_CONFIGS` with action-friendly pacing
- Add "battle", "chase", "transformation" beat types
- Remove motion-restricting negatives for non-pure-myth stories
- Create `buildMythPromptV3` for action-oriented variant

### 1.3 `auto-rate-video/index.ts` - Rating System
**Current Restrictions:**
```typescript
// These defect types penalize intentional action:
"unnatural_motion"  // -5 to -20 points
"floaty_motion"     // -5 to -15 points  
"physics_violation" // -10 to -25 points
"flicker"           // -5 to -20 points
```

**Problem:** Dynamic spectacle (dragons breathing fire, battles, magic) triggers these "defects" unfairly.

**Changes:**
- Add `spectacle_mode` flag to style_hints check
- When spectacle/myth-action mode: reduce motion penalties by 50%
- Add `intentional_dynamics` recognition in defect parsing
- Create `SPECTACLE_TOLERANT_DEFECTS` that are not penalized in action modes

### 1.4 `constraint-profiles.ts` - Budget System
**Changes:**
- Add `"myth-epic"` and `"myth-action"` modes alongside `"myth"`
- Give myth-epic mode spectacle-level freedom (sanitization: off, tier2: disabled)
- Update mode multipliers: myth-action gets 0.6x constraint budget

### 1.5 `moderation-safety.ts` - Sanitization Matrix
**Current State (already good):**
- Spectacle/brutality modes already bypass sanitization for Sora/Luma

**Verify:**
- Ensure myth mode can opt into spectacle-level sanitization via flag

---

## Part 2: Technical Implementation

### 2.1 New Beat Types for Myth Mode
```text
Current beat types: introduction, journey, trial, revelation, consequence, moral

NEW beat types to add:
- battle     → Fast cutting, dynamic motion, weapons/magic clash
- chase      → Continuous forward motion, urgency, speed
- clash      → Two forces meeting, impact, explosion
- ascension  → Rising action, building power, transformation crescendo
```

### 2.2 Action-Friendly Pacing Directives
```text
CURRENT (trial beat):
"[TEMPO: Accelerating panic. Actions crowd together. Desperation builds. Frantic energy.]"

NEW (battle beat):
"[TEMPO: Rapid cuts. Impact moments. Dynamic camera. Bodies in motion. Visceral energy.]"

NEW (chase beat):
"[TEMPO: Continuous forward thrust. Environment streaming past. Urgency visible. No pauses.]"
```

### 2.3 Motion Anchor Pools for Action
```text
NEW motion anchors for "battle" beat:
- "[MOTION: figures clash, impact sparks, bodies pivot and strike, momentum carries through]"
- "[MOTION: weapon arcs through air, target recoils, attacker follows through, dust rises]"
- "[MOTION: magic erupts from hands, target staggers, energy ripples outward, ground shakes]"
```

### 2.4 Rating System Mode Detection
```typescript
// In auto-rate-video, detect spectacle context:
const styleHints = JSON.parse(job.style_hints || "{}");
const isSpectacleContext = 
  styleHints.mode === "spectacle" ||
  styleHints.mode === "brutality" ||
  styleHints.beat_type === "battle" ||
  styleHints.beat_type === "chase" ||
  styleHints.pacing === "fast";

// Reduce motion penalties for spectacle content
if (isSpectacleContext) {
  motionRealism = Math.min(100, motionRealism + 10); // Boost baseline
  // Don't penalize "floaty_motion" or "unnatural_motion" as heavily
}
```

---

## Part 3: Configuration Changes

### 3.1 New Myth Mode Variants
```text
"myth"        → Classic: slow pacing, silhouette, fable structure
"myth-epic"   → Epic: dynamic pacing, silhouette allowed, action beats enabled
"myth-action" → Full action: no pacing restrictions, spectacle sanitization rules
```

### 3.2 Storyboard Prompt Changes
Update `buildMythStoryboardPrompt` to:
- Allow "battle", "chase", "clash" beat types in scene structure
- Remove "slow pacing" language from anti-boring rules
- Add COMBAT VERBS to allowed action words: strike, clash, charge, blast, shatter

### 3.3 V3 Prompt Builder
Create `buildMythPromptV3()` that:
- Removes "No smooth interpolation" negative
- Removes "frame-by-frame handcrafted motion" constraint
- Keeps silhouette aesthetic but allows fluid motion
- Uses shorter technique anchor (under 100 chars)

---

## Part 4: Specific Deletions

### Files and Lines to Delete/Modify:

1. **Delete hardcoded slow_pacing:**
   - `create-story-myth-mode/index.ts` line 248: `slow_pacing: true`
   - `create-story-myth-mode/index.ts` line 279: `slow_pacing: true`

2. **Delete frame_by_frame restriction:**
   - `create-story-myth-mode/index.ts` line 245: `frame_by_frame_motion: true`

3. **Delete overly restrictive negatives in V2 builder:**
   - `myth-continuity.ts` line 820: `"No 3D rendering, no smooth interpolation, no realistic faces."`
   - Replace with: `"No realistic faces."`

4. **Delete slow tempo from trial beat:**
   - `myth-continuity.ts` line 203-208: Update `BEAT_PACING` to be mode-aware

5. **Reduce motion defect penalties:**
   - `auto-rate-video/index.ts` lines 560-564: Add spectacle context check before applying caps

---

## Part 5: Verification Plan

After implementation, verify with these checks:

1. **Prompt Content Check:**
```sql
SELECT id, enriched_prompt, style_hints 
FROM video_jobs 
WHERE story_job_id = '540bd761-c516-46f6-9e90-09c3a3cf83d1'
LIMIT 1;
```
Verify: No "slow pacing", "frame-by-frame", or "no smooth interpolation" in prompts.

2. **Rating System Check:**
   - Generate a test battle scene
   - Verify motion_score is not unfairly penalized for dynamic content

3. **End-to-End Test:**
   - Create a new myth story with action premise
   - Confirm dynamic beats are allowed in storyboard
   - Confirm prompts are action-friendly
   - Confirm ratings don't penalize motion

---

## Execution Order

1. **Phase 1: Remove hardcoded restrictions** (immediate unblock)
   - Delete slow_pacing, frame_by_frame_motion defaults
   - Remove "no smooth interpolation" from V2 builder
   
2. **Phase 2: Add action beat types** (enable action storyboards)
   - Add battle/chase/clash to MYTH_BEAT_CONFIGS
   - Update storyboard prompt to allow action verbs

3. **Phase 3: Fix rating system** (stop penalizing action)
   - Add spectacle context detection
   - Reduce motion penalties for action content

4. **Phase 4: Create V3 builder** (full action support)
   - New prompt builder optimized for dynamic myth content
   - Optional use via story settings flag
