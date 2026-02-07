

# Fix 3 Remaining Prompt Compilation Issues in Myth Mode

## Summary

"Descent of Shadows" was generated with the latest code, and while action duplication is fixed, 3 systemic issues remain that affect every scene.

## Issues

### 1. ALLCAPS Verbs in silhouette_action (affects all 5 scenes)

The storyboard's `silhouette_action` field contains ALLCAPS verbs from GPT-4o formatting (EXPANDS, PULSES, CLASHES, CLATTERS, BURSTS). The previous fix lowercased `environment_motion` but not the action itself.

**Examples:**
- Scene 1: `"sword's light EXPANDS then PULSES with each swing"`
- Scene 2: `"sword arcs and CLASHES against spectral forms"`
- Scene 4: `"light BURSTS around the warrior forth"`

**Fix:** In `buildMythMotionBeats`, apply a regex to strip ALLCAPS words down to lowercase in the `actionClean` variable, right after `truncateClean`. Target pattern: any word that is 4+ chars and entirely uppercase.

### 2. auditSubject Creates Broken Grammar (affects 4 of 5 scenes)

The anticipation phrases from `ANTICIPATION_BY_BEAT` use body-part subjects ("muscles coil", "body leans", "posture buckles", "tension gathers"). When `auditSubject` prepends "The warrior", it produces "The warrior muscles coil" instead of "The warrior's muscles coil".

**Fix:** Update `auditSubject` to detect when the first word after the archetype would be a body-part noun (muscles, body, posture, tension, chest, weight, shadow, silhouette, form, outline). In that case, insert possessive `'s` after the archetype: "The warrior's muscles coil".

### 3. auditSubject Injects Archetype Mid-Sentence (Scene 4)

When `silhouette_action` starts with a non-character subject like "light BURSTS forth", the audit tries to inject the archetype but places it in the wrong position, producing "light BURSTS around the warrior forth".

**Fix:** The audit should only prepend the archetype at the very start of the full prompt (which it already does for the motion beats). The issue is that `auditSubject` also has fallback mid-sentence injection logic that fires incorrectly. Remove or constrain the mid-sentence injection so it only fires if the archetype is completely absent from the surrounding context. Since the motion beats already start with anticipation phrases that get the archetype prepended, mid-sentence injection is unnecessary.

## Technical Implementation

### File: `supabase/functions/_shared/myth-continuity.ts`

**Change 1: Lowercase ALLCAPS in silhouette_action (in `buildMythMotionBeats`, ~line 1030)**

After `truncateClean`, add:
```typescript
// Strip ALLCAPS words (4+ chars) to lowercase — LLM formatting artifacts
const actionNorm = actionClean.replace(/\b[A-Z]{4,}\b/g, w => w.toLowerCase());
```
Then use `actionNorm` instead of `actionClean` in the return template.

**Change 2: Possessive insertion in `auditSubject` (~line 1120-1140)**

Add a body-part detection step after the archetype prepend:
```typescript
const BODY_PARTS = new Set([
  "muscles", "body", "posture", "tension", "chest", 
  "weight", "shadow", "silhouette", "form", "outline",
  "stance", "frame", "limbs", "arms", "hands"
]);

// After prepending archetype, check if next word is a body part
const firstWord = textAfterArchetype.split(/\s/)[0].toLowerCase();
if (BODY_PARTS.has(firstWord)) {
  // Insert possessive: "The warrior muscles" -> "The warrior's muscles"
  result = result.replace(archetype, `${archetype}'s`);
}
```

**Change 3: Disable mid-sentence archetype injection in `auditSubject`**

Remove or guard the fallback that injects "around the warrior" mid-sentence. The prepend-at-start logic is sufficient since the motion beats are the sole action carrier.

### Deployment

- Deploy `continue-story-myth-mode` (imports myth-continuity)
- Regenerate "Descent of Shadows" to verify

### Expected Results

**Scene 0 before:** `"The warrior shadow sharpens into form"`
**Scene 0 after:** `"The warrior's shadow sharpens into form"`

**Scene 1 before:** `"sword's light EXPANDS then PULSES"`
**Scene 1 after:** `"sword's light expands then pulses"`

**Scene 4 before:** `"light BURSTS around the warrior forth"`
**Scene 4 after:** `"The warrior's tension gathers one last time, chest lifts — then grasps sword, lifts it high — light bursts forth, scattering shadows"`

