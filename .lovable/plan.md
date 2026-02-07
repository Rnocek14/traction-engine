

# Fix Myth Mode: Bugs + Architectural Improvements

## Status: What's Working vs. What's Broken

**Working:**
- Sanitization bypass (combat verbs preserved)
- 8s duration floor (all scenes >= 8s)
- Action light behavior (strobe/shockwave in prompts)
- Auto-rater motion cap at 75 (correct penalty)
- Force/escalation headers in prompts

**Broken (3 bugs, 4 architectural issues):**

---

## Bug 1: Double Archetype — "The warrior The warrior"

Every prompt starts with `The warrior The warrior —`. This is because:

1. `buildMythPromptV3` line 1162: `const actionLine = "The ${archetype} ${auditedAction}..."` — prepends "The warrior"
2. `auditSubject()` line 1116: if the first clause doesn't contain the archetype, it prepends `"The ${archetype} — "` — adds ANOTHER "The warrior"

The problem: the `auditedAction` string already starts with the archetype from the regex replacements (line 1106: `"${archetype}'s ${object} ${verb} as the ${archetype}"`), but then line 1162 ALSO prepends `"The ${archetype}"`.

**Fix:** Remove the `"The ${archetype}"` prefix from line 1162 — let `auditSubject()` be solely responsible for ensuring the archetype is the subject. Change the actionLine to just use the audited action directly.

---

## Bug 2: Verb Mangling — "lunges for out"

`upgradeToTrajectoryVerbs()` replaces "reaches" with "lunges for" via regex. When the original text is "reaches out", it becomes "lunges for out" — grammatically broken.

The problem: the verb upgrades are naive single-word replacements that don't account for phrasal verbs (reaches out, reaches for, stands tall, walks forward).

**Fix:** 
- Process multi-word phrases FIRST (longest match first): "reaches out" -> "lunges outward", "reaches for" -> "lunges for"
- Then process single-word fallbacks
- Add the missing phrasal verbs to the upgrade map

---

## Bug 3: Generic Beat 1 and Beat 3 Templates

When `hasSceneData` is true (line 993), Beat 1 and Beat 3 use hardcoded templates:
- Beat 1: `"${startClean} — figure coils, weight shifts, muscles tense"` (SAME for every scene)
- Beat 3: `"${endClean} — momentum carries through, new position held"` (SAME for every scene)

Only Beat 2 uses the actual `silhouette_action`. This means 2/3 of the motion sequence is identical across all 5 scenes.

**Fix:** Make all 3 beats derive from scene data:
- Beat 1: Use beat_type to select anticipation verb (introduction: "shadow sharpens into form", battle: "weight drops, stance widens", journey: "body leans into motion")
- Beat 3: Use beat_type to select follow-through verb (battle: "impact ripples outward, stance recovers", journey: "arrives at new ground, posture shifts")

---

## Architectural Issue 4: Structural Labels Are Noise to Sora

The prompt contains labels like `MOTION SEQUENCE:`, `ENVIRONMENT ACTION:`, `STYLE:`, `FORCE:`, `ESC=3`, `SETPIECE=1`. Sora is a video generation model, not an instruction-following LLM. These labels:
- Waste character budget on non-visual tokens
- Create no meaningful model priors (Sora doesn't know what "ESC=3" means)
- Fragment the prompt into disconnected blocks instead of a flowing visual description

**Fix:** Remove all structural labels and write prompts as flowing prose paragraphs. Convert `FORCE: unknown | ESC=3 | SETPIECE=1` and `MOTION SEQUENCE: Beat 1...` into natural continuous description. Keep only `"No realistic faces."` as a constraint.

---

## Architectural Issue 5: `auditSubject` Regex Creates Ungrammatical Text

Line 1106: the replacement pattern `"${archetype}'s ${object} ${verb} as the ${archetype}"` produces text like:
- "warrior's shards fly as the warrior outward, then hover"

The "as the warrior" fragment dangles — there's no completing verb. The regex replaces the object-verb pair but doesn't construct a complete clause for the character.

**Fix:** Rewrite the replacement to produce complete sentences:
- "fragments scatter" -> "the warrior sends fragments scattering"
- "shield explodes" -> "the warrior's shield explodes around them"
- Use a map of object+verb -> character-as-subject rewrites instead of a generic regex

---

## Architectural Issue 6: Prompt Is Still Too Long (~700+ chars)

Even with V3's "60/20/20 split", the prompt contains:
- Action line (~150 chars)
- Escalation header (~50 chars) 
- Motion sequence with 3 beats (~250 chars)
- Environment action (~80 chars)
- Setting line (~40 chars)
- Style line (~60 chars)
- Light behavior (~100 chars)
- Avoid line (~20 chars)

Total: ~750 chars. With the "first 500 chars = 80% weight" principle, the motion beats and environment are falling into the low-priority tail. The light behavior and style compete for attention.

**Fix:** 
- Merge the 3-beat motion INTO the action line as flowing prose (no separate block)
- Drop the separate style/light/setting lines — weave them into the action description
- Target: 400-500 chars total, all visual, all in one paragraph

---

## Architectural Issue 7: Storyline Quality Is Actually Fine

The storyboard generation (GPT-4o) is producing good narrative structure — proper beat types, escalation, force fields, symbol arcs. The problem is entirely in **prompt compilation**, not story creation. The LLM output has rich `silhouette_action`, `start_state`, `end_state`, and `environment_motion` fields. They're just being assembled badly.

---

## Implementation Plan

### Files to modify:
- `supabase/functions/_shared/myth-continuity.ts` — All prompt compilation fixes

### Changes:

1. **Fix `upgradeToTrajectoryVerbs`**: Process multi-word phrases first (longest-match-first), add missing phrasal verbs

2. **Fix `auditSubject`**: Replace generic regex with a curated rewrite map that produces complete grammatical sentences. Remove the dangling "as the [archetype]" pattern.

3. **Fix `buildMythPromptV3`**: 
   - Remove the duplicate `"The ${archetype}"` prefix (let auditSubject own it)
   - Merge motion beats INTO the action line as prose (not a separate labeled block)
   - Remove all structural labels (MOTION SEQUENCE, ENVIRONMENT ACTION, STYLE, FORCE, ESC)
   - Write the full prompt as 1-2 flowing paragraphs targeting 400-500 chars
   - Weave style/light cues into the action description naturally

4. **Fix `buildMythMotionBeats`**: Make Beat 1 and Beat 3 use beat_type-specific anticipation/follow-through verbs instead of hardcoded "figure coils, weight shifts" / "momentum carries through"

### Expected result:

Before (current broken output):
```
The warrior The warrior — strides forward, shield raised high — light 
pulses along its edge, casting shadows behind — starting from warrior in 
darkness, shield dull, through the action shifting into warrior in partial 
light, shield gleaming.

FORCE: unknown | ESC=3 | SETPIECE=1

MOTION SEQUENCE:
Beat 1 (anticipation): warrior in darkness — figure coils, weight shifts, 
muscles tense. Beat 2 (peak): strides forward, shield raised high — full 
force, maximum displacement. Beat 3 (settle): warrior in partial light — 
momentum carries through, new position held.

ENVIRONMENT ACTION: shadows retreat from shield's glow.

Setting: ancient battlefield, layered paper depths.

STYLE: Shadow silhouettes, high contrast, fluid articulated motion.

Sudden illumination — sharp shadows snap into existence.

No realistic faces.
```

After (target output):
```
A warrior silhouette surges forward from darkness, shield thrust high — 
light erupts along its edge as shadows recoil. Weight drops low then 
launches into a full stride, shield arm extending, momentum carrying 
through into a braced stance as the glow steadies. Behind, battlefield 
shadows retreat in layered paper depths, sharp illumination snapping 
the figure into hard-edged relief. Articulated cutout limbs, backlit 
from below, high contrast black and gold. No realistic faces.
```

One flowing paragraph. ~450 chars. All visual. Action physics at the head. Style woven in naturally at the tail.

### Technical notes:
- No database changes needed
- No changes to `queue-video` or `auto-rate-video` (those fixes are working)
- No changes to storyboard generation (storyline is fine)
- Only `myth-continuity.ts` prompt compilation needs work
- Deploy `continue-story-myth-mode` after changes (it imports from myth-continuity)

