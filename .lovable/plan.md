

# Fix Plan: Story Builder Crash on Film Mode Stories

## Problem Summary

The Story Builder page crashes with `TypeError: Cannot read properties of undefined (reading 'defaultDuration')` when loading Film Mode stories.

## Root Cause

Film Mode stories are saved with `story_type: "film_continuity"` in the database. However:
1. The `StoryType` TypeScript type only includes: `"short_story" | "brainrot" | "info" | "hybrid"`
2. `STORY_TYPE_CONFIGS` has no entry for `"film_continuity"`
3. When the UI tries to load a Film Mode story, `STORY_TYPE_CONFIGS[storyType]` returns `undefined`
4. The component crashes when accessing `config.defaultDuration`

## Solution

Add `"film_continuity"` as a valid story type with appropriate configuration values.

---

## Technical Implementation

### Step 1: Update `src/lib/continuity-scoring.ts`

Add `"film_continuity"` to the type definition and config:

```typescript
export type StoryType = "short_story" | "brainrot" | "info" | "hybrid" | "film_continuity";
```

Add the configuration entry:

```typescript
export const STORY_TYPE_CONFIGS: Record<StoryType, StoryTypeConfig> = {
  // ... existing entries ...
  film_continuity: {
    name: "Film Mode",
    description: "Film-first architecture with face-only I2V and variety contract",
    clipPacing: "medium",
    typicalClipCount: [6, 10],
    continuityStrictness: "moderate",
    defaultDuration: 4,  // Film mode scenes often use 4-5 second clips
  },
};
```

### Step 2: Update `src/components/lab/StoryBuilderPanel.tsx`

Add a safety check when hydrating from existing story to auto-enable Film Mode:

```typescript
// In the hydration useEffect (around line 509-535)
useEffect(() => {
  if (forceNew || !existingStory) return;
  setTitle(existingStory.title || "");
  
  // Handle Film Mode stories - auto-enable film mode and map to valid type
  const rawStoryType = existingStory.story_type as string;
  if (rawStoryType === "film_continuity") {
    setFilmMode(true);
    setStoryType("film_continuity"); // Now valid since we added it to the type
  } else {
    setStoryType((rawStoryType as StoryType) || "short_story");
  }
  // ... rest of hydration
}, [existingStory, forceNew]);
```

### Step 3: Update rendering to handle potential undefined config (defensive)

Add a fallback in case config lookup fails:

```typescript
// Around line 1219
const config = STORY_TYPE_CONFIGS[storyType] || STORY_TYPE_CONFIGS.short_story;
```

And in `addScene`:

```typescript
const addScene = () => {
  const config = STORY_TYPE_CONFIGS[storyType] || STORY_TYPE_CONFIGS.short_story;
  // ...
};
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `src/lib/continuity-scoring.ts` | Add `"film_continuity"` to `StoryType` union and add config entry |
| `src/components/lab/StoryBuilderPanel.tsx` | Add fallback for undefined config, auto-enable filmMode when loading film_continuity stories |

## Expected Outcome

After this fix:
- Film Mode stories will load without crashing
- The UI will correctly identify and render Film Mode stories
- The `filmMode` toggle will be automatically enabled when viewing a Film Mode story
- Defensive fallbacks prevent future crashes from unknown story types

