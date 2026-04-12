

# Restructuring the Content Engine for Simplicity

## What Exists Today (Feature Audit)

The app currently has **7 routes and 5+ workspaces**, many of which overlap or are orphaned:

```text
CURRENT NAVIGATION
──────────────────
GlobalNav: Dashboard | Stories | Scripts | Settings
Hidden:    /studio (Rendition Studio - separate header, no GlobalNav link)
Hidden:    /qa-review (QA Inbox - not in GlobalNav)
Orphaned:  Lab page (legacy, redirects to /stories but still has code)
```

| Page | Purpose | Status |
|------|---------|--------|
| **Dashboard** (`/`) | Hardcoded metrics, pipeline visualizer, account grid | Mock data only, not connected to real DB |
| **Stories** (`/stories`) | Story library + 3-column editor (scenes, preview, inspector) | Working, core workflow |
| **Scripts** (`/scripts`) | Generate individual scripts per account/pillar | Working but disconnected from Stories |
| **Rendition Studio** (`/studio/:id`) | DaVinci-style timeline editor for script_runs | Complex, separate from Stories flow |
| **QA Review** (`/qa-review`) | Review flagged scripts, approve/reject/override | Working but hidden from nav |
| **Settings** | Provider routing, accounts, compare tool, learning inspector | Working |
| **Lab** (legacy) | Old story creation entry point | Redirects to /stories, dead code |

### Core Problem

The app has **two separate production paths** that don't connect:
1. **Stories path**: Create story → generate storyboard → generate clips → assemble reel
2. **Scripts path**: Generate script → open in Rendition Studio → generate video → assemble

Users must mentally map which workflow to use. The Dashboard shows fake data. QA Review is hidden. The Product Testing Engine you described would add a third path.

---

## Proposed Restructure

### Design Principle: One Pipeline, One Place

Collapse everything into **4 clear workspaces** that follow the actual production flow:

```text
NEW NAVIGATION
──────────────
Dashboard | Produce | Review | Settings
```

### Workspace Breakdown

**1. Dashboard** (`/`)
- Replace hardcoded metrics with real DB queries
- Show: total stories, videos generated today, assembly success rate, active jobs
- Pipeline visualizer connected to actual `story_jobs` and `video_jobs` status counts
- "Winners" section (top-performing videos when analytics exist)
- Quick-action: "New Story" button front and center

**2. Produce** (`/produce`)
- Merges: Stories + Scripts + Rendition Studio into one workspace
- Left panel: Library (stories + scripts in one list, filterable)
- Right panel: Context-sensitive editor
  - Story selected → 3-column story editor (existing Stories editor)
  - Script selected → Rendition Studio timeline (existing StudioLayout)
- Creation wizard accessible from "+ New" button (same StoryCreationWizard)
- The "Scripts" generator becomes a tab/mode within the creation flow (generate standalone script OR story)

**3. Review** (`/review`)
- Merges: QA Review Inbox + Approval Dashboard (from your Product Testing Engine)
- Shows all content awaiting human decision
- Cards with: preview thumbnail, hook text, scores, [Approve] [Reject] [Regenerate]
- Filters by status, account, content type
- This becomes your "only daily job" touchpoint

**4. Settings** (`/settings`) — stays as-is
- Providers & Routing
- Accounts
- Advanced (compare, learning inspector)

### What Gets Removed/Consolidated
- **Lab page**: Delete entirely (already orphaned)
- **Separate /studio route**: Embed into Produce workspace
- **Separate /qa-review route**: Embed into Review workspace
- **Fake dashboard metrics**: Replace with real queries

---

## Implementation Plan

### Phase 1: Clean Navigation (small, safe)
- Rename GlobalNav items: Dashboard | Produce | Review | Settings
- Add `/produce` route pointing to unified workspace
- Add `/review` route pointing to QA inbox
- Redirect `/stories` → `/produce`, `/scripts` → `/produce`, `/studio` → `/produce`
- Remove Lab page and its route

### Phase 2: Unified Produce Workspace
- Create `src/pages/Produce.tsx` that combines:
  - Story library sidebar (from Stories.tsx)
  - Script list in same sidebar (from ScriptGenerator queries)
  - Right panel switches between StoryEditor and StudioLayout based on selected item type
- Add "+ New" dropdown: "New Story" | "New Script"
- Keep all existing components, just re-parent them

### Phase 3: Live Dashboard
- Replace hardcoded MetricCard values with real Supabase queries:
  - `story_jobs` count by status
  - `video_jobs` count by status/today
  - `script_runs` count
- Pipeline visualizer reads from actual job counts
- Remove mock data

### Phase 4: Product Testing Engine Tables (future, after first video works)
- Add `products` and `product_analysis` tables
- Hook into the existing story creation wizard as a new "Product Video" story type
- Scoring/approval flows into the Review workspace

---

## What This Gives You

- **One place to make content** (Produce)
- **One place to approve content** (Review)
- **One place to see results** (Dashboard)
- **One place to configure** (Settings)
- No hidden pages, no duplicate workflows, no fake data
- Product Testing Engine slots in cleanly later without adding new pages

### Estimated Effort
- Phase 1: ~30 min (routing changes only)
- Phase 2: ~2-3 hours (component re-parenting, no new logic)
- Phase 3: ~1-2 hours (replace mock data with queries)
- Phase 4: Deferred until first video succeeds

