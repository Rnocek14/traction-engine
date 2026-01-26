
# Director Brain Layer Implementation Plan

## Executive Summary

This plan adds a **story-first "Director Brain"** layer on top of your existing infrastructure. The goal is to make outputs feel "directed" rather than "random clips" by adding structured metadata about narrative intent, visual motifs, and beat-level change tracking.

**Current State:** 60-65% complete - solid routing, tier logic, continuity anchors, and provider-specific prompt compilers exist.

**Gap:** Missing story-level intelligence (spine, motifs, change labels) and edit grammar (cut cadence zones).

---

## Phase 1: Expand Storyboard Schema (Safe, Fast Win)

Add new fields to the storyboard output without breaking existing generation.

### 1.1 Update `generate-storyboard` System Prompt

**File:** `supabase/functions/generate-storyboard/index.ts`

Add these fields to the GPT-4o output schema:

```text
Root Level (new):
- story_spine: string (1 sentence: "Person discovers X → tries Y → realizes Z")
- motif_anchors: string[] (2-3 recurring visual metaphors)
- palette_keywords: string[] (consistent color terms)

Per Scene (new):
- change_type: "info" | "emotion" | "goal" | "stakes" | "location"
- narration_line: string (optional TTS line)
- onscreen_text: string (optional text overlay)
```

### 1.2 Update TypeScript Interfaces

**Files to update:**
- `src/lib/continuity-scoring.ts` - Update `StoryScene` and `Storyboard` interfaces
- `supabase/functions/generate-storyboard/index.ts` - Update `GeneratedScene` and `GeneratedStoryboard`

### 1.3 Backward Compatibility

All new fields are **optional with sensible defaults**:
- `story_spine` defaults to empty string
- `motif_anchors` defaults to empty array
- `change_type` defaults to "info"
- `narration_line` and `onscreen_text` default to undefined

**Risk Level:** Low - additive only, existing stories continue to work.

---

## Phase 2: Cut Cadence Zones (Logic Only)

Introduce zone-based duration suggestions that reflect attention science.

### 2.1 Define Zone Configuration

**New file:** `src/lib/cut-cadence.ts`

```text
Zones:
┌─────────────────────────────────────────────────────────────────┐
│  Zone        │ Duration Range │ Cut Speed  │ Typical Roles     │
├─────────────────────────────────────────────────────────────────┤
│  hook        │ 0.4s - 0.9s    │ Very Fast  │ hook              │
│  setup       │ 1.2s - 2.0s    │ Medium     │ problem, story_a  │
│  escalation  │ 1.0s - 1.8s    │ Fast       │ reset, story_b    │
│  payoff      │ 1.8s - 3.5s    │ Slow       │ cta, atmosphere   │
│  button      │ 1.0s - 2.0s    │ Clean Hold │ cta (final)       │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Zone-Aware Duration Suggestion

Add function `suggestDurationForZone(role, sceneIndex, totalScenes)` that:
1. Determines which zone the scene falls into
2. Returns recommended duration range
3. Can be used in UI to show guidance

### 2.3 Integration with Story Templates

**File:** `src/lib/story-templates.ts`

Add `zone` field to `StoryTemplateScene`:
```
zone: "hook" | "setup" | "escalation" | "payoff" | "button"
```

**Risk Level:** Low - logic only, doesn't change generation behavior yet.

---

## Phase 3: One-Hero-Shot Rule (Contained)

Designate exactly one beat per video for `sora-2-pro` quality (the "poster frame").

### 3.1 Add Hero Flag to Scene Schema

**Per-scene field:**
```
is_hero_shot: boolean (default: false)
```

### 3.2 Auto-Selection Logic

**In `generate-storyboard`:**
- Volume tier: Auto-mark `story_b` as hero shot (if exists), else `story_a`
- Hero tier: Allow multiple hero shots (story_a, story_b, establish)

### 3.3 Provider Selection Enhancement

**In routing logic:**
- When `is_hero_shot: true` → use `sora-2-pro` (when available)
- Otherwise → use `sora-2` for Sora-routed scenes

### 3.4 UI Indicator

**In `StoryBuilderPanel`:**
- Show star icon on hero shot scene
- Allow manual toggle to override auto-selection

**Risk Level:** Low - enhances existing routing, doesn't change fallback logic.

---

## Phase 4: Template-First CTA (Cost + Consistency Win)

Route CTA role to check for template assets before falling back to generation.

### 4.1 CTA Template Asset Storage

**New Supabase table (optional):** `cta_templates`
```
id: uuid
account_id: text
template_url: text (static image/video)
overlay_config: jsonb (text positions, brand colors)
created_at: timestamp
```

### 4.2 CTA Routing Logic

**In `generate-story-chained` and `continue-story-chain`:**

```text
if (role === "cta") {
  const template = await fetchCtaTemplate(account_id);
  if (template) {
    // Use template asset + overlay text
    return { type: "template", asset: template };
  } else {
    // Fall back to Luma generation
    return routeBySceneRole("cta", options);
  }
}
```

### 4.3 Fallback Behavior

- If no template exists: Generate with Luma (current behavior)
- Template + generation hybrid: Use Luma for background, overlay branded text

**Risk Level:** Medium - requires new table and template management UI (can defer).

---

## Implementation Order

### Immediate (This Session)

| Step | Description | Effort |
|------|-------------|--------|
| 1.1 | Update `generate-storyboard` system prompt to output new fields | 30 min |
| 1.2 | Update TypeScript interfaces in `continuity-scoring.ts` | 15 min |
| 1.3 | Test backward compatibility with existing stories | 10 min |

### Next Session

| Step | Description | Effort |
|------|-------------|--------|
| 2.1-2.3 | Cut cadence zone logic and template integration | 45 min |
| 3.1-3.4 | Hero shot flag and UI indicator | 30 min |

### Future (When Needed)

| Step | Description | Effort |
|------|-------------|--------|
| 4.1-4.3 | CTA template system with DB table | 2-3 hours |

---

## Technical Details

### Updated `GeneratedStoryboard` Interface

```typescript
interface GeneratedStoryboard {
  title: string;
  // NEW: Story-level intelligence
  story_spine: string;           // "Person discovers X → tries Y → realizes Z"
  motif_anchors: string[];       // ["floating data strings", "shadow figure"]
  palette_keywords: string[];    // ["cool blues", "warm highlights"]
  
  scenes: GeneratedScene[];
  anchors: ContinuityAnchors;
}

interface GeneratedScene {
  prompt: string;
  duration_target: number;
  camera_direction: string;
  role: SceneRole;
  // NEW: Beat-level intelligence
  change_type: "info" | "emotion" | "goal" | "stakes" | "location";
  narration_line?: string;       // TTS line for this beat
  onscreen_text?: string;        // Text overlay
  is_hero_shot?: boolean;        // sora-2-pro flag
}
```

### Updated System Prompt Addition

```text
NARRATIVE STRUCTURE (required):
- story_spine: One sentence capturing desire → tension → turn → payoff
- motif_anchors: 2-3 recurring visual metaphors that appear across scenes
- palette_keywords: 3-5 color terms for consistency

PER-SCENE REQUIREMENTS:
- change_type: What changes from the previous beat? 
  Options: "info" (new learning), "emotion" (feeling shift), 
  "goal" (what character wants), "stakes" (why it matters), 
  "location" (physical move)
- Every cut MUST change something meaningful (no montage drift)
```

---

## Validation Criteria

### After Phase 1 Implementation

Generate 3 test storyboards and verify:
- [ ] Every storyboard has a non-empty `story_spine`
- [ ] At least 2 `motif_anchors` per story
- [ ] Every scene has a `change_type` (no nulls)
- [ ] Backward compatibility: old stories load without errors

### After Phase 3 Implementation

- [ ] Volume tier stories have exactly 1 hero shot flagged
- [ ] Hero tier allows multiple hero shots
- [ ] UI shows star indicator on hero shots

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/generate-storyboard/index.ts` | Add new fields to schema, update system prompt |
| `src/lib/continuity-scoring.ts` | Update `StoryScene` and `Storyboard` interfaces |
| `src/lib/cut-cadence.ts` | New file - zone definitions and duration logic |
| `src/lib/story-templates.ts` | Add `zone` field to templates |
| `src/components/lab/StoryBuilderPanel.tsx` | Display story_spine, motifs, hero indicator |
| `src/types/scene-roles.ts` | Add `ChangeType` type export |

---

## Risk Mitigation

1. **All new fields are optional** - existing stories continue to work
2. **Phase-gated implementation** - each phase is independently useful
3. **No changes to prompt compilation** - existing provider logic unchanged
4. **No changes to video_jobs schema** - new metadata stays in storyboard_json
