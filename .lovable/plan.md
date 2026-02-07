

# Deep System Audit: Why Videos Aren't "Cool" Yet — IMPLEMENTED ✅

All 7 blockers have been fixed and deployed.

## Changes Summary

### Blocker 1: Subject Confusion ✅
**File:** `myth-continuity.ts` — Added `auditSubject()` function that detects object-as-subject patterns (e.g., "sword gleams", "fragments scatter") and rewrites them so the character archetype is the grammatical subject. Applied in `buildMythPromptV3` after verb upgrade.

### Blocker 2: 8-Second Minimum Floor ✅
**File:** `continue-story-myth-mode/index.ts` — Changed duration to `Math.max(8, snapDurationForSora(getSceneDuration(scene)))` ensuring no myth scene gets less than 8s.

### Blocker 3: Scene-Specific Motion Beats ✅
**File:** `myth-continuity.ts` — Rewrote `buildMythMotionBeats()` to compose beats from actual scene data (start_state → silhouette_action → end_state) when available, falling back to escalation templates only when data is missing.

### Blocker 4: Disable Soft Moderation for Myth Mode ✅
**Files:** `continue-story-myth-mode/index.ts` + `queue-video/index.ts` — Myth mode now passes `sanitization_level: "off"` and queue-video respects it, skipping `sanitizeForModeration()` entirely for myth prompts.

### Blocker 5: Inline Transformation ✅
**File:** `myth-continuity.ts` — Replaced "Scene begins: X. Through the action, it becomes: Y" with `buildInlineTransformation()` which embeds the change as a continuous phrase: "— starting from X, through the action shifting into Y".

### Blocker 6: Action Light Behavior ✅
**File:** `myth-continuity.ts` — Added `ACTION_LIGHT_BEHAVIOR` map with dynamic, impact-driven lighting (strobes, shockwaves, streak lighting) that replaces contemplative "breathing" light when `intensity_profile` is "action" or "epic".

### Blocker 7: Auto-Rater Myth Motion Penalty ✅
**File:** `auto-rate-video/index.ts` — Added myth-mode detection via style_hints. When myth mode is detected, motion scores are capped at 75 unless the VLM provides explicit evidence of primary subject displacement (ambient particles/light don't count).
