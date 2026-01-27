

# Plan: Fix "Video Game Look" - Inject Role-Based Cinematography

## Problem Summary

The Dragon Siege clips look "video game like" because **every scene uses identical cinematography settings**:
- Same 50mm lens (no wide/tight variety)
- Same "smooth" motion (no handheld/dynamic/whip_pan variety)
- Same "natural" lighting (no dramatic/atmospheric variety)
- No realism anchors (no jitter, motion blur, dust particles)

The code for role-based cinematography **exists** (`buildCinematographyDirective`) but **is never called** during story chain generation.

## Root Cause

In `supabase/functions/continue-story-chain/index.ts`:
- Lines 612-728 build the `finalPrompt` with motion amplification, narrative context, and coverage directives
- But `buildCinematographyDirective()` is never invoked
- The prompts fall through to `queue-video` which uses default cinematography

## Solution

Inject the role-based cinematography directive into the prompt assembly pipeline, giving each scene distinct visual treatment.

---

## Implementation Details

### File: `supabase/functions/continue-story-chain/index.ts`

**Step 1: Import the cinematography builder**

Add to imports (around line 24):
```typescript
import { 
  buildCinematographyDirective, 
  getRoleCinematography,
  buildRealismAnchor 
} from "../_shared/cinematic-prompts.ts";
```

**Step 2: Build cinematography directive before prompt assembly**

After the cut type resolution (around line 553), add:
```typescript
// === ROLE-BASED CINEMATOGRAPHY (anti-"video game" variety) ===
const cinematographyDirective = buildCinematographyDirective(
  nextSceneIndex,
  sceneRole,
  true // includeRealism for action scenes
);
console.log(`[cinematography] Scene ${nextSceneIndex + 1} role=${sceneRole} → ${
  getRoleCinematography(sceneRole).lens
} lens, ${getRoleCinematography(sceneRole).motion} motion`);
```

**Step 3: Inject cinematography into prompt (near top for maximum influence)**

Modify the prompt assembly section (around lines 714-727) to include the cinematography directive:

For T2V spectacle scenes:
```typescript
finalPrompt = spectacleDirective + cinematographyDirective + narrativeBlock + finalPrompt;
```

For T2V regular scenes:
```typescript
finalPrompt = coverageDirective + cinematographyDirective + narrativeBlock + finalPrompt;
```

For I2V scenes:
```typescript
// After motion amplification, insert cinematography + narrative
finalPrompt = insertAfterMotion(finalPrompt, cinematographyDirective + narrativeBlock);
```

---

## Expected Result

After this fix, each scene will have distinct cinematography:

| Scene | Role | Lens | Motion | Lighting | Realism |
|-------|------|------|--------|----------|---------|
| 0 | hook | 24mm wide | dynamic | dramatic | handheld jitter |
| 1 | problem | 35mm | handheld | atmospheric | motion blur |
| 2 | story_a | 50mm | tracking | natural | dust particles |
| 3 | reset | 85mm portrait | whip_pan | dramatic | fire flicker |
| 4 | story_b | 50mm | dolly | motivated | lens flare |
| 5 | cta | 85mm portrait | static | soft | focus breathing |

The visual variety will break the "same shot repeated" feeling.

---

## Verification

After deployment, generate a new story and check the logs for:
```
[cinematography] Scene 1 role=hook → 24mm lens, dynamic motion
[cinematography] Scene 2 role=problem → 35mm lens, handheld motion
[cinematography] Scene 3 role=story_a → 50mm lens, tracking motion
...
```

Also verify the compiled prompts in `video_jobs.settings.prompt` contain the varied cinematography blocks.

---

## Additional Improvements (Optional)

### A: Log the full cinematography in style_hints for audit

Add to the audit data (around line 776):
```typescript
const auditData = {
  // ... existing fields ...
  cinematography: getRoleCinematography(sceneRole),
};
```

### B: Override continuity_anchors camera_language with role-based values

Currently, `story.continuity_anchors.camera_language` sets a global style that gets passed to `buildCinematicPrompt`. This could be modified per-scene to use role-based settings, but that's a larger change. The directive injection is the faster fix.

---

## Technical Summary

| Component | Current State | After Fix |
|-----------|---------------|-----------|
| Lens variety | ❌ All 50mm | ✅ 24mm → 85mm per role |
| Motion variety | ❌ All "smooth" | ✅ dynamic/handheld/tracking/whip_pan |
| Lighting variety | ❌ All "natural" | ✅ dramatic/atmospheric/natural/soft |
| Realism anchors | ❌ None | ✅ Jitter, blur, dust, flare per scene |
| Cut types | ✅ Face-only I2V working | ✅ No change needed |
| Character Bible T2V | ✅ Working | ✅ No change needed |

This fix targets the "video game look" at its source: **visual monotony due to missing cinematography variation**.

