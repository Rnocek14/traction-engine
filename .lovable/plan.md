

# UX Restructuring: "Today" Operations View

## Current State

The app has 4 nav items (Verticals, Products, Studio, Settings). The home page is a vertical grid overview. To see actionable content, the operator must: click a vertical, scroll past stats, find the TodaysPlanCard, then check ReviewQueue -- repeated per vertical. There is no single view that answers "what needs attention right now across ALL accounts?"

## Proposed Structure

### Navigation (4 items, reordered)

```text
Today (/)  |  Verticals (/verticals)  |  Products (/products)  |  Settings (/settings)
```

- **Today** becomes the new home page and default landing
- **Verticals** moves to `/verticals` (the current grid view, largely unchanged)
- **Studio** is removed from primary nav (accessible from Settings or as a sub-route)
- Products and Settings stay as-is

### New "Today" Page -- The Operations Dashboard

This is the single most important page. It answers: "What do I need to do right now?"

**Layout (top to bottom):**

1. **Summary bar** -- Single row of counts across ALL verticals:
   - Posts ready to review
   - Posts generating
   - Ideas low (accounts below threshold)
   - Posts approved today

2. **Account feed** -- The core of the page. A flat list of ALL active accounts, grouped by vertical, each showing:

```text
┌─────────────────────────────────────────────────────────┐
│ [TT] gadget_finds              Gadgets     ⚙️ Settings  │
│ Hook style: curiosity · 2/4 posts today                 │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Post 1   │  │ Post 2   │  │ Post 3   │              │
│  │ "This $9 │  │ [idea]   │  │ [empty]  │              │
│  │  gadget" │  │ LED Lamp │  │          │              │
│  │ ✅ Ready │  │ 🔄 Gen   │  │ + Create │              │
│  │[Approve] │  │          │  │          │              │
│  │[Reject]  │  │          │  │          │              │
│  └──────────┘  └──────────┘  └──────────┘              │
└─────────────────────────────────────────────────────────┘
```

Each account row shows up to 3 post slots (configurable). Each slot is one of:
- **Ready** (assembled video) -- thumbnail, title, Approve/Reject/Download buttons
- **Generating** -- title + spinner
- **Idea** (queued but not yet produced) -- title + "Produce" button
- **Empty** -- "+ Create" button to trigger idea generation

3. **Compact mode toggle** -- Collapses each account to a single row:

```text
gadget_finds (TT)  │ ✅ 1 ready  🔄 1 generating  💡 2 ideas  │ [Approve All]
```

### What Changes in Existing Pages

| Current | Change |
|---------|--------|
| `Verticals.tsx` (home `/`) | Moves to `/verticals`. Stays as the network overview grid, no changes to content |
| `VerticalDetail.tsx` | Stays at `/verticals/:vertical`. Remove TodaysPlanCard (now on Today page). Keep Accounts tab, Content, Ideas, Products tabs |
| `GlobalNav.tsx` | Reorder: Today (home), Verticals, Products, Settings. Drop Studio from primary nav |
| `Review.tsx` (at `/studio`) | Stays accessible but becomes secondary. Today page handles the primary review loop |
| `App.tsx` | New route structure: `/` = Today, `/verticals` = grid, `/verticals/:vertical` = detail |

### Pipeline Status Per Post

Each post card shows a clear pipeline badge:
- `💡 Idea` -- proposed, not yet produced
- `🔄 Generating` -- story_job created, video rendering
- `✅ Ready` -- assembled, awaiting review
- `📤 Approved` -- approved, ready to post
- `❌ Rejected` -- needs regeneration

### Technical Implementation

**New files:**
- `src/pages/Today.tsx` -- The operations dashboard
- `src/components/today/AccountRow.tsx` -- Single account row with post slots
- `src/components/today/PostSlot.tsx` -- Individual post card (idea/generating/ready states)
- `src/components/today/SummaryBar.tsx` -- Top-level stats across all verticals
- `src/hooks/use-today-feed.ts` -- Aggregates all accounts + their latest story_jobs + ideas into a flat feed

**Modified files:**
- `src/App.tsx` -- Route changes: `/` = Today, `/verticals` = Verticals grid
- `src/components/GlobalNav.tsx` -- Updated nav items
- `src/pages/Verticals.tsx` -- No content changes, just lives at `/verticals` now

**Data flow for `use-today-feed.ts`:**
1. Fetch all active `account_configs`
2. Fetch today's `story_jobs` for all accounts (grouped by account_id)
3. Fetch top 3 proposed `content_ideas` per account (fallback when no jobs exist)
4. Fetch `vertical_configs` for targets
5. Return flat array: `{ account, vertical, posts: [slot1, slot2, slot3], stats }`

**PostSlot actions (reuse existing mutations):**
- Approve/Reject: same as `ReviewQueue` (update `review_status` on `story_jobs`)
- Produce idea: invoke `product-to-videos` or `create-story` (existing functions)
- Generate ideas: invoke `generate-ideas` with `account_id` (existing)
- Download: direct link to `assembled_video_url`

### What Gets Removed/Hidden

- Studio link removed from primary nav (still accessible at `/studio` for power users)
- TodaysPlanCard component stays but is secondary (VerticalDetail only)
- No new database tables needed
- No new edge functions needed

### Operator Workflow After This

```text
1. Open app → see Today page
2. Scan accounts → see which have posts ready
3. Click Approve on ready posts (1 click)
4. Click "Produce" on queued ideas (1 click)  
5. Done. Move to posting externally.
```

Total clicks per post: 1 (approve) or 2 (produce + later approve).

