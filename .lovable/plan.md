

# Analysis: "Descent to the Abyss" -- What's Happening and What Needs Fixing

## Current Status

These videos were generated with the **old, buggy prompt compiler** before the flowing-prose overhaul was deployed. The current code in `myth-continuity.ts` has already fixed several issues (phrasal verbs, subject audit, removed labels), but has **not been used to regenerate** this story.

However, the current code still has problems that would affect a regen.

---

## What's Actually Wrong (Current Code Issues)

### 1. State Truncation Is Too Aggressive (40 chars)

Line 1178-1179 uses `truncateClean(start_state, 40)` and `truncateClean(end_state, 40)`.

Example state: `"warrior standing at the top of a gleaming staircase, shield shining"` (68 chars)
Truncated to: `"warrior standing at the top of a gleamin"` -- mid-word garbage.

This produces fragments like `"starting from warrior standing at the top of a"` and `"shifting into warrior leaping into darkness as the"` -- both are incomplete sentences that confuse Sora.

**Fix:** Increase truncation limit to 60 chars and ensure `truncateClean` cuts at the last complete word/comma boundary, never mid-word.

### 2. Start/End State Inlining Creates Redundancy

The current structure appends `"-- starting from X, shifting into Y"` AFTER the action, then ALSO appends the motion beats which ALSO reference start and end states via `ANTICIPATION_BY_BEAT` and `FOLLOWTHROUGH_BY_BEAT`.

This creates double-mention of the same information:
- `"leaps forward -- starting from warrior at staircase, shifting into warrior in darkness"`
- `"shadow sharpens into form -- then leaps forward -- full figure stands revealed"`

The action appears twice, the transformation is described twice, wasting ~150 chars on repetition.

**Fix:** Remove the explicit `"starting from / shifting into"` block. Let the motion beats alone carry the transformation arc (they already do via anticipation + follow-through).

### 3. ALLCAPS Verbs in Environment Motion

The storyboard's `environment_motion` field contains ALLCAPS verbs: `["staircase SPIRALS downward", "light DIMINISHES with each step"]`. These are LLM-formatting artifacts that get passed directly into the prompt. Sora doesn't interpret ALLCAPS as emphasis -- it's just noise.

**Fix:** Lowercase the environment motion text before injecting it.

### 4. Scene 2 Failed (Connection Reset) -- Not a Code Bug

Scene 2 (the trial/battle scene, 12s) failed with `"Connection reset by peer"` from the OpenAI API. This is an infrastructure issue, not a prompt issue. The scene needs to be regenerated.

### 5. Scene 3 Was Never Auto-Rated

Scene 3 completed (`status: done`) but has no auto-rating scores (`auto_motion_score: nil`). The auto-rater may have failed silently or was never triggered for this job.

---

## Storyboard Quality (GPT-4o Output)

The storyboard itself is **good**. The narrative arc is solid:

| Scene | Beat | Action | Quality |
|-------|------|--------|---------|
| 0 | introduction | leaps from staircase into darkness | Strong opening gesture |
| 1 | journey | pushes through shadows, path reveals | Good physical motion |
| 2 | trial | shield blocks demon collision, shadows splinter | Best action beat |
| 3 | consequence | shield shatters, fragments explode | Strong escalation |
| 4 | moral | rises, fragments reform into new shield | Satisfying resolution |

The `silhouette_action`, `start_state`, `end_state`, and `environment_motion` fields are all rich and specific. The problem is entirely in compilation.

---

## What the Fix Will Produce

### Before (what was actually sent):
```text
The warrior leaps forward from the last step — staircase folds in 
on itself — vanishes — starting from warrior standing at the top of 
a, shifting into warrior leaping into darkness as the. shadow 
sharpens into form, outline crystallizes — then leaps forward from 
the last step — staircase folds in on itself — vanishes, full force 
— full figure stands revealed, presence claimed. Behind, staircase 
SPIRALS downward, light DIMINISHES with each step. shadowed 
underworld, layered paper depths, sudden illumination — sharp 
shadows snap into existence, hard edge light carves the figure from 
darkness.... Articulated cutout limbs, backlit from below...
```
~680 chars. Action repeated twice. Truncated states. ALLCAPS verbs.

### After (what the fixed code will produce):
```text
The warrior leaps forward from the last step — staircase folds in 
on itself — vanishes. Shadow sharpens into form, outline 
crystallizes — then leaps forward, full force — full figure stands 
revealed, presence claimed. Behind, staircase spirals downward, 
light diminishes with each step. Shadowed underworld, layered paper 
depths, sudden illumination — sharp shadows snap into existence. 
Articulated cutout limbs, backlit from below, high contrast. No 
realistic faces.
```
~430 chars. One paragraph. No repetition. All visual.

---

## Implementation Plan

### File: `supabase/functions/_shared/myth-continuity.ts`

**Change 1: Remove the redundant "starting from / shifting into" block**
- Delete lines 1177-1181 (the inline transformation append)
- The motion beats already carry the transformation arc via beat-type-specific anticipation and follow-through phrases

**Change 2: Increase truncation limits in motion beats**
- In `buildMythMotionBeats` (line 1026), increase action truncation from 80 to 100 chars
- This prevents mid-sentence cuts in the silhouette_action

**Change 3: Lowercase environment motion text**
- At line 1188, lowercase the `envClean` string before injecting to remove ALLCAPS LLM artifacts

**Change 4: Ensure `truncateClean` cuts at word boundaries**
- Verify that `truncateClean` doesn't cut mid-word (check its implementation)

### Post-deploy:
- Deploy `continue-story-myth-mode`
- Regen "Descent to the Abyss" to verify prompt quality improvement

### No changes needed to:
- `queue-video` (sanitization bypass already working)
- `auto-rate-video` (motion cap at 75 already working)
- Storyboard generation (storyline quality is fine)
- `continue-story-myth-mode/index.ts` (already passes correct settings)

