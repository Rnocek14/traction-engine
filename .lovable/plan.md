
# Fix Video Lab Generate Page Layout

## Problem Analysis

Based on the screenshot, the Video Lab Generate page has severe layout issues:

1. **Video preview squeezed at top** - The main video takes minimal space while a huge empty area exists below
2. **Can't click/see all videos** - The filmstrip only shows 2 thumbnails visible, with no indication more exist
3. **50%+ of screen is wasted** - The entire lower half of the right panel is empty/unused

## Root Causes Identified

### Layout Structure Issue
```text
LabPreviewPanel (flex-col h-full)
├── Preview Area (flex-[3] min-h-0)  ← Problem: not expanding properly
│   ├── Header (shrink-0)
│   ├── Video Container (flex-1 min-h-[300px])  ← Capped by parent
│   └── Action Bar (shrink-0)
└── UnifiedFilmstrip (max-h-[180px] shrink-0)  ← Fixed height, can't scroll videos
```

The flex layout isn't distributing space correctly because:
- Parent container constraints aren't flowing through properly
- Video uses `max-h-full` which caps to its container's computed height
- Filmstrip has horizontal scroll only - shows ~2-3 thumbnails

## Solution

### 1. Fix Video Preview Expansion
Make the video container truly fill available space by:
- Removing conflicting `min-h-0` with proper overflow handling
- Using `flex-1` with `overflow-hidden` to contain but allow expansion
- Video element: remove max-height constraints, use `h-full w-full object-contain`

### 2. Improve Filmstrip Layout
- Add a grid view option when "All" is selected (instead of single horizontal row)
- Make filmstrip collapsible with a toggle
- Add visual scroll indicators

### 3. Files to Modify

**LabPreviewPanel.tsx**
- Line 163: Change preview area structure to properly expand
- Line 190: Fix video container to fill space
- Line 205-218: Remove max-h constraints on video element

**UnifiedFilmstrip.tsx**
- Add optional grid view for library browsing
- Add expand/collapse toggle
- Show video count and scroll indicator

## Technical Implementation

### LabPreviewPanel Changes
```typescript
// Current (broken):
<div className="flex-[3] min-h-0 flex flex-col">
  <div className="flex-1 min-h-[300px] flex items-center justify-center...">
    <video className="max-w-full max-h-full w-auto h-auto object-contain" />

// Fixed:
<div className="flex-1 min-h-0 flex flex-col overflow-hidden">
  <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
    <video className="w-full h-full object-contain" />
```

### UnifiedFilmstrip Changes
- Add `isExpanded` state with toggle button
- When expanded: show grid layout with wrap, taller container
- When collapsed: single row, compact (current behavior but smaller)
- Add visible count: "Showing 3 of 47 videos →"

## Visual Result

```text
After Fix:
┌─────────────────────────────────────┐
│ [RUNWAY] [done]                 ★ 4 │  ← Status bar (compact)
├─────────────────────────────────────┤
│                                     │
│                                     │
│          [VIDEO PREVIEW]            │  ← Fills 70%+ of space
│         (full-size video)           │
│                                     │
│                                     │
├─────────────────────────────────────┤
│ ▼ Videos (47) All|Rated|Unrated    │  ← Collapsible header
│ [th] [th] [th] [th] [th] [th] →    │  ← Horizontal scroll with indicator
└─────────────────────────────────────┘
```

## Impact
- Video preview will expand to fill available space
- Users can easily browse all videos
- No wasted screen real estate
- Clear visual feedback on how many videos exist
