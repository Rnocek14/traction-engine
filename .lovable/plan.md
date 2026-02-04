

# Story Generation UX Simplification Plan

## Current State Analysis

### What Exists Today

The `/studio/lab` page has **4 tabs** at the top level:
1. **Generate** - Single video generation with prompt/engine selection
2. **Story** - Story creation and editing (the focus of this audit)
3. **Compare** - A/B video comparison tool
4. **Learning** - AI learning inspector

When you click the **Story tab**, you see:
- **Left sidebar (272px)**: `StoryLibrary` - list of existing stories with "New" button
- **Right panel**: `StoryBuilderPanel` - a 2,459-line monolith that handles:
  - Story concept input and AI generation
  - Scene list with drag-and-drop editing
  - Continuity anchors (character/environment settings)
  - Video preview (multiple systems)
  - Voiceover/narration panel
  - Export/assembly controls

### Key UX Problems Identified

| Problem | Severity | Description |
|---------|----------|-------------|
| **Mode Confusion** | High | 5+ toggles in "Advanced Settings" (Myth Mode, Film Mode, Continuity Mode, Brutality Mode, Soft Continuity) - users don't know which to pick |
| **Dual Purpose Panel** | High | `StoryBuilderPanel` is both a "creation wizard" AND an "editing interface" - different mental models crammed together |
| **Duplicated Navigation** | Medium | New Story Studio exists at `/story/:id` but Lab still embeds the full editor |
| **Hidden Settings** | Medium | Critical settings (Tier, Provider Lock) are buried in collapsibles |
| **Multiple Previews** | Medium | 3 different preview components: `StoryVideoPlayer`, `StorySyncPreview`, and inline clip previews |
| **Generator Selection Invisible** | Medium | Provider routing is automatic via `getProviderForRoleWithContext()` - no per-scene override in creation flow |

### What Already Works Well

A dedicated `StoryStudio` page exists at `/story/:storyId` with:
- Clean 3-column layout (Scene List | Preview | Inspector)
- Per-scene provider override capability
- Primary clip selection
- Real-time status updates

The problem is: **the Lab's "Story" tab still tries to do everything** instead of just being a creation wizard that funnels into Story Studio.

---

## Proposed Solution: Minimal Generation Wizard

### Goal

Transform the Lab's Story tab into a **simple "Create Story" wizard** with 2-3 steps, then immediately navigate to `/story/:id` for editing.

### New User Flow

```text
/studio/lab (Story tab)
    |
    v
+---------------------------+
|     Create Story          |
|                           |
|  [Concept textarea]       |
|  "A lonely astronaut..."  |
|                           |
|  Story Type: [Short ▼]    |
|  Scenes: [5 ▼]            |
|                           |
|  [Advanced Settings ▼]    |
|    - Myth Mode toggle     |
|    - Film Mode toggle     |
|    - Tier: Volume/Hero    |
|                           |
|  [Build Story] button     |
+---------------------------+
    |
    | (on success)
    v
navigate("/story/{newStoryId}")
    |
    v
+---------------------------+
|     Story Studio          |
|  (3-column editor)        |
+---------------------------+
```

---

## Implementation Plan

### Phase 1: Quick Wins (1-2 hours)

**Goal**: Make the Lab Story tab a pure creation flow, remove duplicate editing

#### 1.1 Simplify StoryBuilderPanel

Remove from `StoryBuilderPanel.tsx`:
- Scene editing section (lines ~1844-2000) - this belongs in Story Studio
- Continuity anchors editor (lines ~1844-1900) - move to Story Studio
- Full preview section (lines ~2004-2059) - Story Studio has this
- "Generate Clips" button - generation happens in Story Studio

Keep only:
- Concept input
- Story type selector
- Scene count (add if missing)
- Collapsed "Advanced Settings" with mode toggles
- "Build Story" button that navigates to Story Studio

#### 1.2 Update Navigation After Creation

In `StoryBuilderPanel.tsx`, the `generateStory` mutation's `onSuccess` already calls:
```typescript
onStoryCreated?.(data.story_job_id);
```

And in `Lab.tsx`, this handler navigates:
```typescript
onStoryCreated={(newStoryId) => navigate(`/story/${newStoryId}`)}
```

This flow is correct. The issue is the panel also renders a full editing UI below the creation form. Remove that.

#### 1.3 Rename Lab "Story" Tab

Change the tab label from "Story" to "Create Story" to set expectations:
```tsx
<TabsTrigger value="story" className="gap-1.5 text-xs h-7">
  <Plus className="h-3.5 w-3.5" />
  Create Story
</TabsTrigger>
```

### Phase 2: UI Polish (1-2 hours)

#### 2.1 Consolidate Mode Selection into Presets

Replace 5 toggles with a single "Style Preset" selector:

| Preset | Description | Under the hood |
|--------|-------------|----------------|
| **Standard** | Default multi-provider routing | filmMode=false, mythMode=false |
| **Cinematic** | Film-first I2V chaining | filmMode=true |
| **Storybook** | Silhouettes, symbolic | mythMode=true |
| **Character Focus** | Single provider consistency | characterContinuityMode=true |

This dramatically reduces cognitive load.

#### 2.2 Add Scene Count Selector

Currently missing - users have no control over story length at creation time. Add:
```tsx
<Select value={sceneCount} onValueChange={setSceneCount}>
  <SelectTrigger className="h-8 text-xs w-20">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    {[3, 5, 7, 10].map(n => (
      <SelectItem key={n} value={String(n)}>{n} scenes</SelectItem>
    ))}
  </SelectContent>
</Select>
```

#### 2.3 Clear "What Happens Next" Messaging

Add a visual hint below the button:
```tsx
<p className="text-[10px] text-muted-foreground text-center flex items-center gap-1 justify-center">
  <ArrowRight className="h-3 w-3" />
  Opens Story Studio for editing and generation
</p>
```

### Phase 3: Story Studio Improvements (separate scope)

These improvements belong in `/story/:id` rather than the Lab:

1. **Generator Selection Dropdown** - per-scene provider override (already exists in SceneInspector)
2. **Alternates Gallery** - show all clips for a scene (already exists)
3. **Sync Quality Indicators** - narration vs clip duration mismatch
4. **Batch Generate** - generate all scenes with one click

---

## Files to Modify

### Primary Changes

| File | Action | Lines |
|------|--------|-------|
| `src/components/lab/StoryBuilderPanel.tsx` | Reduce to creation-only (remove ~1000 lines) | 2459 -> ~800 |
| `src/pages/Lab.tsx` | Rename tab, simplify Story tab content | ~10 lines |

### The Reduced StoryBuilderPanel Should Contain

1. **Header** - "Create a New Story"
2. **Concept Input** - Textarea for story idea
3. **Quick Settings Row**:
   - Story Type dropdown
   - Scene Count dropdown  
   - Tier selector (Volume/Hero)
4. **Style Preset** - Single selector replacing 5 toggles
5. **Build Story Button** - Triggers generation and navigation

### What Gets Removed from StoryBuilderPanel

- DnD scene editing (move to Story Studio)
- Scene role/duration editors (move to Story Studio)
- Continuity anchors editor (move to Story Studio)
- StorySyncPreview / StoryVideoPlayer (move to Story Studio)
- StoryNarrationPanel (move to Story Studio)
- StoryAnalysisPanel (move to Story Studio)
- ContinuityMonitor (move to Story Studio)
- Generate Clips button (move to Story Studio)
- Assemble/Export controls (move to Story Studio)

---

## Summary

The core fix is **separation of concerns**:

| Location | Purpose | Features |
|----------|---------|----------|
| **Lab > Create Story** | Wizard | Concept, type, presets, "Build" button |
| **Story Studio** | Editor | Scenes, prompts, providers, preview, export |

This eliminates the "where am I?" confusion by making each page single-purpose.

### Expected Outcomes

1. **Reduced cognitive load** - 5 toggles become 1 preset selector
2. **Clear workflow** - Create in Lab, Edit in Studio
3. **Faster onboarding** - New users see a simple form, not a 2500-line panel
4. **No feature loss** - All editing capabilities remain in Story Studio

