
# Fix Video Lab Generate Page - Complete Layout Chain Repair

## Problem Analysis

The video preview appears "scrunched to the top" because the height chain is broken at multiple points in the component hierarchy.

## Layout Chain Traced (with issues marked)

```text
Lab.tsx
├── div (h-screen flex flex-col)                    ✓ OK
├── header (shrink-0 ~40px)                         ✓ OK  
└── Tabs (flex-1 min-h-0)                           ✓ OK
    └── TabsContent[generate] (flex-1 min-h-0)      ✓ OK
        └── ResizablePanelGroup (h-full)            ✓ OK
            └── ResizablePanel[70%]                 ⚠️ NO h-full CLASS
                └── LabPreviewPanel                 ← Height not passed down!
                    ├── Preview (flex-1)            ← Can't grow, parent has no height
                    └── UnifiedFilmstrip (shrink-0)
                        └── Inner div (h-[200px])   ← Fixed but content overflows
                            └── ScrollArea (h-[200px]) ← Exceeds parent!
```

## Root Causes

### Issue 1: Lab.tsx - ResizablePanel missing height
**File**: `src/pages/Lab.tsx` line 306-318
**Problem**: The `ResizablePanel` containing `LabPreviewPanel` has no explicit height class
**Fix**: Add `className="h-full"` to the `ResizablePanel`

### Issue 2: UnifiedFilmstrip - Grid ScrollArea too tall
**File**: `src/components/lab/UnifiedFilmstrip.tsx` line 385
**Problem**: `ScrollArea` has `h-[200px]` inside a container that's also `h-[200px]`, but the container includes the header (~28px), causing overflow
**Fix**: Change grid mode ScrollArea to use remaining space calculation

### Issue 3: UnifiedFilmstrip - Header not accounted for in content height
**File**: `src/components/lab/UnifiedFilmstrip.tsx` line 379
**Problem**: Content div wraps everything but doesn't properly size for remaining space
**Fix**: Make content area use flex-1 and proper overflow handling

## Solution

### Fix 1: Lab.tsx - Add height to ResizablePanel

Line 306, change:
```typescript
<ResizablePanel defaultSize={70} minSize={45}>
```
To:
```typescript
<ResizablePanel defaultSize={70} minSize={45} className="h-full">
```

### Fix 2: UnifiedFilmstrip - Fix container structure

The filmstrip container needs proper flex layout to handle the header + content split correctly.

Lines 313-318, change:
```typescript
<Collapsible open={isExpanded} onOpenChange={setIsExpanded} className="shrink-0">
  <div className={cn(
    "border-t border-primary/30 bg-card/50 transition-all overflow-hidden",
    isExpanded ? "h-[200px]" : "h-[100px]",
    className
  )}>
```
To:
```typescript
<Collapsible open={isExpanded} onOpenChange={setIsExpanded} className="shrink-0">
  <div className={cn(
    "border-t border-primary/30 bg-card/50 transition-all overflow-hidden flex flex-col",
    isExpanded ? "h-[200px]" : "h-[100px]",
    className
  )}>
```

### Fix 3: UnifiedFilmstrip - Fix content area sizing

Line 379, change:
```typescript
<div className="p-1.5 overflow-hidden">
```
To:
```typescript
<div className="p-1.5 overflow-hidden flex-1 min-h-0">
```

### Fix 4: UnifiedFilmstrip - Fix grid ScrollArea height

Line 385, change:
```typescript
<ScrollArea className={cn("w-full", isExpanded ? "h-[200px]" : "h-[70px]")}>
```
To:
```typescript
<ScrollArea className="w-full h-full">
```

## Files to Modify

| File | Lines | Change |
|------|-------|--------|
| `src/pages/Lab.tsx` | 306 | Add `className="h-full"` to ResizablePanel |
| `src/components/lab/UnifiedFilmstrip.tsx` | 314 | Add `flex flex-col` to inner div |
| `src/components/lab/UnifiedFilmstrip.tsx` | 379 | Add `flex-1 min-h-0` to content div |
| `src/components/lab/UnifiedFilmstrip.tsx` | 385 | Change ScrollArea to `h-full` |

## Visual Result After Fix

```text
┌─────────────────────────────────────────────────────────┐
│ Header [Lab | R&D Sandbox]                     ~40px    │
├─────────────────────────────────────────────────────────┤
│ Tabs [Generate | Story | Compare | Learning]   ~32px    │
├─────────────────────────────────────────────────────────┤
│         │                                               │
│ Generate│            VIDEO PREVIEW                      │
│  Panel  │         (fills ~60% of height)                │
│  (30%)  │                                               │
│         │                                               │
│         ├───────────────────────────────────────────────┤
│         │ Prompt + Action Bar                    ~40px  │
│         ├───────────────────────────────────────────────┤
│         │ ▼ Filmstrip [Videos: 5]               100px   │
│         │ [🎬][🎬][🎬][🎬][🎬] →                        │
└─────────┴───────────────────────────────────────────────┘
```

## Technical Explanation

**Why the current layout fails:**
1. `ResizablePanel` is a flex child but doesn't have explicit height
2. When `LabPreviewPanel` uses `h-full`, it references an uncomputed height
3. The video `flex-1` can't expand because its ancestor chain lacks proper height flow

**Why this fix works:**
1. Adding `h-full` to `ResizablePanel` ensures it fills its grid cell
2. Making the filmstrip's inner div `flex flex-col` allows proper header/content split
3. Using `flex-1 min-h-0` on content allows it to shrink and scroll properly
4. Using `h-full` on ScrollArea makes it fill the remaining space dynamically
