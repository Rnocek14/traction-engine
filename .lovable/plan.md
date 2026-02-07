

# Deep System Audit: Why Videos Aren't "Cool" Yet

## Executive Summary

After scanning the full pipeline -- storyboard generation, prompt compilation, moderation, video queuing, and the actual prompts sent to Sora -- I've identified **7 concrete blockers** preventing dynamic, cinematic output. The system has a lot of sophisticated infrastructure, but several critical issues cause the final prompt that reaches Sora to produce static or underwhelming results.

---

## The Full Pipeline (What Actually Happens)

```text
User creates story
  -> create-story-myth-mode (GPT-4o generates storyboard JSON)
  -> continue-story-myth-mode (builds prompts per scene)
     -> buildMythPromptV3() in myth-continuity.ts
     -> queue-video (sends to Sora API)
        -> sanitizeForModeration("soft") applied to EVERY prompt
        -> FormData sent to OpenAI /v1/videos
  -> process-video (polls for completion, downloads mp4)
  -> auto-rate-video (GPT-4o Vision scores result)
```

---

## Blocker 1: Subject Confusion -- Objects Are the Grammatical Subject

**Evidence from "The Warrior's Descent":**

| Scene | Prompt Head (what Sora reads first) | Problem |
|-------|--------------------------------------|---------|
| 0 | "A warrior strides forward, cape billows, **sword slices** through the air" | OK - warrior is subject |
| 1 | "A warrior **sword gleams, guides, pulls** down winding path" | SWORD is doing all verbs |
| 2 | "A warrior **swings blade**, sparks fly, **demons recoil**" | Acceptable but "demons" get animated |
| 3 | "A warrior **sword shatters, fragments scatter**, warrior falls back" | SWORD and FRAGMENTS are subjects |
| 4 | "A warrior **fragments glow, coalesce**, light explodes outward" | FRAGMENTS and LIGHT are subjects |

**Root cause:** `buildMythPromptV3` concatenates `archetype + silhouette_action` directly. When `silhouette_action` is "sword gleams, guides, pulls", the resulting sentence makes the sword the grammatical subject, and Sora animates it while the warrior stands still.

**Fix:** Add a compile-time subject audit that rewrites any prompt where the character is not the grammatical subject of the primary action verb.

---

## Blocker 2: Scene 0 Is Only 4 Seconds

Scene 0 gets `snapDurationForSora(6)` = 4 seconds. A 3-beat motion sequence (anticipation, peak action, follow-through) cannot resolve in 4 seconds. Sora defaults to a single pose with ambient particle effects.

**Fix:** Set a minimum floor of 8 seconds for all myth mode scenes, especially those with 3-beat motion sequences.

---

## Blocker 3: Motion Beats Are Generic Templates, Not Scene-Specific

`buildMythMotionBeats()` uses hardcoded templates by beat_type:

```
introduction -> "Beat 1: Shadow solidifies... Beat 2: First limb moves... Beat 3: Full figure revealed"
```

These are the same regardless of whether the scene is "warrior enters a cave" or "dragon emerges from fire." They don't reference the actual `silhouette_action`, the character, or the environment.

**Fix:** Move 3-beat generation into the storyboard LLM prompt so GPT generates scene-specific motion beats, OR dynamically compose beats from the scene's action/environment data.

---

## Blocker 4: Soft Moderation Still Sanitizes Myth Prompts

In `queue-video`, line 539:
```typescript
const { sanitized, wasModified, replacements } = sanitizeForModeration(variantPrompt, "soft");
```

This is applied to **every** myth prompt, even though myth mode uses Sora (not Runway). The `SOFT_REPLACEMENTS` array rewrites combat verbs:
- "stab through" -> "thrust toward"  
- "slash across" -> "swing across"
- "fight to the death" -> "fight desperately"

For a story called "The Warrior's Descent" fighting demons, this blunts every action verb.

**Fix:** Set myth mode's sanitization to "off" in the matrix (same as spectacle/brutality modes), since myth mode uses silhouette abstraction which inherently reduces violence signaling. OR pass `sanitization_level: "off"` from `continue-story-myth-mode`.

---

## Blocker 5: "from X to Y" Transformation Was Fixed But "Scene begins: X" Replacement Is Also Problematic

V3.1 changed `"From ${start} to ${end}"` to `"Scene begins: ${start_state}. Through the action, it becomes: ${end_state}"`. But this is still a two-keyframe instruction that models render as a morph:

```
Scene begins: warrior holding sword high, shadows alive with threat.
Through the action, it becomes: sword dimming, demons pressing in closer.
```

Sora reads "begins" and "becomes" as two target frames, renders the start pose, then morphs to the end pose. There is no physical process described between them.

**Fix:** Replace the start/end format with a single continuous action description. The physical transformation should be embedded in the action line itself, not in a separate "begins/becomes" block.

---

## Blocker 6: Style Block Conflicts With Action Intent

The V3 prompt ends with:
```
STYLE: Shadow silhouettes, high contrast, fluid articulated motion.
Light breathes from darkness, intensity slowly rises.
No realistic faces.
```

"Fluid articulated motion" tells the model to animate limbs smoothly -- good. But "Light breathes from darkness, intensity slowly rises" for an introduction scene creates a slow-fade-in effect that competes with the 3-beat action sequence. The light directive implies a contemplative, gradual reveal, while the motion beats demand rapid physical action.

**Fix:** Make light behavior match the intensity profile. For action stories, use dynamic light (strobes, flashes on impact, shockwave lighting) not breathing/gradual effects.

---

## Blocker 7: No Auto-Rating Feedback Loop for Motion Quality

The auto-rater gives motion scores of 78-88 for these clips, and the system accepts them as "good enough." But the user perceives them as static. The auto-rater's motion threshold is too forgiving -- it's measuring "is something moving?" not "is the motion dynamic and physically convincing?"

Current scores for The Warrior's Descent:
- Scene 0: motion=88, overall=86
- Scene 1: motion=82, overall=86  
- Scene 2: motion=78, overall=80
- Scene 3: motion=79, overall=85
- Scene 4: motion=86, overall=87

These scores suggest "good motion" but the user sees static poses with ambient particles. The rater needs recalibration for myth mode specifically.

---

## Implementation Plan

### Phase 1: Immediate Impact (Subject Fix + Duration + Sanitization)

1. **Subject Audit in `buildMythPromptV3`**
   - After `upgradeToTrajectoryVerbs()`, scan the action line
   - If the character archetype is not the grammatical subject of the first verb clause, restructure: force "The [archetype] [verb]..." format
   - Strip orphaned object-as-subject patterns like "sword gleams" -> "warrior's sword gleams as the warrior..."

2. **8-Second Minimum Floor**
   - In `continue-story-myth-mode`, change `snapDurationForSora(getSceneDuration(scene))` to enforce a minimum of 8
   - `Math.max(8, snapDurationForSora(getSceneDuration(scene)))`

3. **Disable Soft Moderation for Myth Mode**
   - In `queue-video`, detect myth mode (story_job_id present + story_type check or skip_enrichment flag) and set sanitization level to "off"
   - Alternative: have `continue-story-myth-mode` pass a `sanitization_level: "off"` field that queue-video respects

### Phase 2: Prompt Quality (Motion Beats + Transformation)

4. **Scene-Specific Motion Beats**
   - Instead of `buildMythMotionBeats(scene)` returning generic templates, compose beats from scene data:
     - Beat 1: Extract anticipation from `start_state`
     - Beat 2: Extract peak action from `silhouette_action` (with upgraded verbs)
     - Beat 3: Extract follow-through from `end_state`
   - This makes each beat unique to the scene content

5. **Inline Transformation (Remove "Scene begins/becomes")**
   - Embed the transformation directly into the action line
   - Instead of two blocks, write one continuous sentence:
     - Before: "A warrior swings blade... Scene begins: warrior holding sword high. Through the action, it becomes: sword dimming"
     - After: "A warrior swings blade from a stance with sword held high -- sparks fly as demons recoil -- the sword dims as demons press in closer"

### Phase 3: Style Alignment

6. **Match Light Behavior to Intensity**
   - When `intensity_profile === "action"`, override `LIGHT_BEHAVIOR_V2` with dynamic variants
   - introduction + action: "Sudden illumination, sharp shadows snap into existence"
   - journey + action: "Light pulses with movement, shadows stretch and snap with each stride"
   - clash + action: "Strobe flashes on impact, shockwave shadows expand"

7. **Auto-Rater Motion Threshold for Myth Mode**
   - Add a myth-mode penalty in `auto-rate-video` for scenes where the primary silhouette has minimal displacement (pose-to-pose detection)
   - Cap motion scores at 70 when the main subject occupies the same screen position in frame 1 and frame N

### Technical Details

**Files to modify:**
- `supabase/functions/_shared/myth-continuity.ts` -- Subject audit, scene-specific beats, inline transformation, action light behavior
- `supabase/functions/continue-story-myth-mode/index.ts` -- 8s minimum, pass sanitization_level
- `supabase/functions/queue-video/index.ts` -- Respect sanitization_level pass-through from story mode
- `supabase/functions/auto-rate-video/index.ts` -- Myth mode motion threshold (Phase 3)

**Risk assessment:**
- Subject audit: Low risk, only affects prompt text
- Duration floor: Low risk, Sora handles 8s well
- Sanitization off: Medium risk -- myth mode uses silhouettes (no faces/gore), so moderation blocks are unlikely, but monitor for any 400 errors
- Motion beats: Medium risk, need to ensure generated beats don't exceed prompt length budget (~700 chars total)

