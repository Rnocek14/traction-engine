

# Fix Remaining Prompt Compilation Issues in Myth Mode

## Summary

The flowing-prose overhaul fixed 5 major bugs (double archetype, ALLCAPS, structural labels, redundant state block, generic beats). But 4 new issues emerged in the "Descent into Shadow" generation that prevent the prompts from being truly clean.

## Issues to Fix

### 1. Action Duplicated Verbatim in Every Prompt (Critical)

The `silhouette_action` text appears twice in every prompt: once as the opening line, and again inside the motion beats. This is because `buildMythPromptV3` outputs the audited action on its own, then appends `buildMythMotionBeats` which also embeds the same `silhouette_action`.

**Fix:** Remove the standalone action line from `buildMythPromptV3`. Instead, let `buildMythMotionBeats` be the sole carrier of the action, structured as: `[anticipation] -- then [action] -- [follow-through]`. The `auditSubject` call should be applied to the motion beats output, not to a separate action line.

### 2. "full force" Filler Removed

The hardcoded `", full force"` connector in `buildMythMotionBeats` adds zero visual information. Replace with nothing -- let the em-dash carry the transition naturally: `"[anticipation] -- then [action] -- [follow-through]"`.

### 3. Capitalization and Double Periods

- Capitalize the first letter of the motion beats output before appending after a period
- Clean up double periods by ensuring only one period separates sections
- Add a utility to strip trailing periods from segments before joining

### 4. Redundant "upward upward" from Verb Upgrades

`upgradeToTrajectoryVerbs` converts "rises" to "surges upward", but doesn't check if the surrounding context already contains "upward". Add a post-processing step: if the upgraded text contains the same directional word twice within 40 chars, remove the duplicate.

## Technical Changes

### File: `supabase/functions/_shared/myth-continuity.ts`

**Change 1: Restructure `buildMythPromptV3` to eliminate action duplication**
- Remove line 1178 (`let actionParagraph = auditedAction`)
- Remove line 1184 (`. ${motionProse}.`)
- Instead, apply `upgradeToTrajectoryVerbs` and `auditSubject` to the motion beats output directly
- The motion beats already contain the action; they become the sole opening paragraph

**Change 2: Update `buildMythMotionBeats` to drop "full force"**
- Line 1035: change `${actionClean}, full force` to just `${actionClean}`
- Result: `"[anticipation] -- then [action] -- [follow-through]"`

**Change 3: Capitalize + clean punctuation**
- After building the motion prose, capitalize its first letter
- Before joining sections, strip trailing periods to prevent doubles
- Join with `. ` (period-space) for clean sentence boundaries

**Change 4: Deduplicate directional words post-upgrade**
- After `upgradeToTrajectoryVerbs`, scan for repeated directional words (upward, forward, downward, outward, backward) within a short window
- If found, remove the second occurrence

## Expected Output After Fix

**Before (current Scene 0, 540 chars):**
```
The warrior leaps downward — lands on stony ground — dust explodes 
outward. shadow sharpens into form, outline crystallizes — then 
leaps downward — lands on stony ground — dust explodes outward, 
full force — full figure stands revealed, presence claimed. Behind, 
shadows swell and engulf as descent begins. the shadowy underworld, 
layered paper depths, sudden illumination — sharp shadows snap into 
existence, hard edge light carves the figure from darkness.. 
Articulated cutout limbs, backlit from below, high contrast. No 
realistic faces.
```

**After (target, ~420 chars):**
```
Shadow sharpens into form, outline crystallizes — then the warrior 
leaps downward, lands on stony ground, dust explodes outward — full 
figure stands revealed, presence claimed. Behind, shadows swell and 
engulf as descent begins. The shadowy underworld, layered paper 
depths, sudden illumination — sharp shadows snap into existence. 
Articulated cutout limbs, backlit from below, high contrast. No 
realistic faces.
```

One clean paragraph. Action appears once. No filler words. Proper capitalization. ~420 chars inside the high-weight window.

## Non-Code Issue: Auto-Rater Quota

All 5 scenes failed auto-rating due to OpenAI 429 (quota exhaustion). This is the same billing issue blocking story creation. Once the API key is refreshed or credits added, the auto-rater will need to be re-triggered for these jobs to get quality scores.

## Deployment

- Edit `supabase/functions/_shared/myth-continuity.ts`
- Deploy `continue-story-myth-mode` (imports from myth-continuity)
- Regen story after OpenAI quota is restored to verify
