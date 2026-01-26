
# Fix Video Lab Generate Page - Video Preview Not Expanding

## Problem
The video preview is compressed into a tiny area (~100px) at the top while 60%+ of the screen remains empty below the filmstrip. Users cannot see videos properly.

## Root Cause
The flexbox height chain is broken due to conflicting CSS rules:

```text
Current Layout (Broken):
┌─────────────────────────────────────┐
│ LabPreviewPanel (flex-col h-full)   │
│  ├── Preview Area (flex-1 min-h-0)  │
│  │    └── Inner (h-full flex-col)   │ ← h-full breaks flex chain
│  │         └── Video (flex-1)       │ ← Can't grow, parent has no height
│  └── Filmstrip (max-h-[120px])      │ ← No shrink-0, content-based
└─────────────────────────────────────┘
```

The issue: `h-full` inside a `flex-1` parent doesn't work - the parent hasn't computed its height yet.

## Solution

### 1. Fix LabPreviewPanel.tsx
Remove the intermediate `h-full` div and flatten the structure:

**Line 163-165 (current):**
```typescript
<div className="flex-1 min-h-0 flex flex-col overflow-hidden">
  {activeResult ? (
    <div className="h-full flex flex-col">  // ← PROBLEM: h-full breaks chain
```

**Fixed:**
```typescript
<div className="flex-1 min-h-0 flex flex-col overflow-hidden">
  {activeResult ? (
    <>  // ← Use fragment, no intermediate container
```

**Line 190 video container (current):**
```typescript
<div className="flex-1 flex items-center justify-center bg-black/50 relative overflow-hidden p-4">
```

**Fixed - add min-h-0 to allow shrinking:**
```typescript
<div className="flex-1 min-h-0 flex items-center justify-center bg-black/50 relative overflow-hidden p-4">
```

### 2. Fix UnifiedFilmstrip.tsx
Ensure the filmstrip doesn't push the video out:

**Line 312-318 (current):**
```typescript
<Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
  <div className={cn(
    "border-t border-primary/30 bg-card/50 shrink-0 transition-all overflow-hidden",
    isExpanded ? "max-h-[280px]" : "max-h-[120px]",
```

**Fixed - move shrink-0 to Collapsible root and use fixed heights:**
```typescript
<Collapsible open={isExpanded} onOpenChange={setIsExpanded} className="shrink-0">
  <div className={cn(
    "border-t border-primary/30 bg-card/50 transition-all overflow-hidden",
    isExpanded ? "h-[200px]" : "h-[100px]",  // Fixed heights, not max-h
```

## Visual Result After Fix

```text
Fixed Layout:
┌─────────────────────────────────────┐
│ Header (shrink-0)                   │ ~40px
├─────────────────────────────────────┤
│                                     │
│                                     │
│         VIDEO PREVIEW               │ ~500px (flex-1)
│       (fills all space)             │
│                                     │
│                                     │
├─────────────────────────────────────┤
│ Prompt + Action Bar (shrink-0)      │ ~60px
├─────────────────────────────────────┤
│ ▼ Filmstrip [50 videos] (shrink-0)  │ 100px fixed
│ [th] [th] [th] [th] →               │
└─────────────────────────────────────┘
```

## Files to Modify

1. **src/components/lab/LabPreviewPanel.tsx**
   - Line 165: Remove `h-full` container, use fragment
   - Line 190: Add `min-h-0` to video container
   - Line 294: Close fragment instead of div

2. **src/components/lab/UnifiedFilmstrip.tsx**
   - Line 313: Add `className="shrink-0"` to Collapsible
   - Line 314-316: Change `max-h-*` to fixed `h-*` values

## Technical Notes
- `flex-1` means "grow to fill space" but only works when parent has a known height
- `min-h-0` allows a flex child to shrink below its content size
- `h-full` (100%) fails inside flex-1 because the parent's height isn't computed yet
- Using fixed heights on the filmstrip guarantees the video gets remaining space
