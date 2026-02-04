# Comprehensive Platform UX Architecture Audit

**Date:** February 2026  
**Auditor:** Lovable AI  
**Status:** ✅ IMPLEMENTED

---

## Implementation Summary (Completed)

### Core Fixes Applied:

1. **✅ GlobalNav Component** (`src/components/GlobalNav.tsx`)
   - Persistent top navigation bar with 4 workspaces: Dashboard | Stories | Scripts | Settings
   - Always visible across all pages
   - Active state highlighting

2. **✅ Unified `/stories` Route** (`src/pages/Stories.tsx`)
   - Story Library in left panel (always visible)
   - Story Workspace in right panel (loads in-place)
   - No more "teleporting" to separate pages
   - Creation wizard integrated

3. **✅ Settings Hub** (`src/pages/Settings.tsx`)
   - Centralized for Providers, Accounts, Advanced tools
   - Compare tool and Learning Inspector moved here

4. **✅ Named Back Links**
   - "Back to Stories" instead of ambiguous arrows
   - Clear destination labels throughout

5. **✅ Updated All Pages**
   - Dashboard, Scripts, QA Review, Routing Analytics all use GlobalNav
   - Consistent navigation experience

### Routes Changed:
- `/stories` - New unified stories workspace
- `/stories/:storyId` - Story editing (inline)
- `/settings` - New settings hub
- `/story/:storyId` - Redirects to `/stories/:storyId`
- `/studio/lab/*` - Redirects to `/stories`

---

## Phase 1: Current State Inventory

### A) Route + Page Map

| Route | Page/Component | Primary Purpose | Primary Object | Entry Points | Exit Points | Required Context |
|-------|---------------|-----------------|----------------|--------------|-------------|------------------|
| `/` | `Index.tsx` | Dashboard overview, metrics, accounts | Dashboard/Accounts | Direct navigation | `/scripts`, `/qa-review`, `/account/:id` | None |
| `/account/:accountId` | `AccountDetail.tsx` | Individual account health/config | Account | Dashboard cards | Dashboard only | Account ID |
| `/scripts` | `ScriptGenerator.tsx` | Generate QA-gated scripts | Script | Dashboard header | Can open Studio (implicit) | None |
| `/qa-review` | `QAReviewInbox.tsx` | Review failed/blocked scripts | Script QA | Dashboard header | Dashboard | None |
| `/studio` | `Studio.tsx` | Script-based video editing | Script Run | Dashboard (implicit) | Lab, Dashboard | None |
| `/studio/:scriptRunId` | `Studio.tsx` | Edit specific script | Script Run | Script Generator, Launcher | Dashboard, Lab | Script Run ID |
| `/studio/lab` | `Lab.tsx` | R&D sandbox for videos/stories | Video Jobs | Studio header | Story Studio, Analytics | None |
| `/studio/lab/story` | `Lab.tsx` | Create new story | Story | Lab tab | Story Studio | `?new=true` optional |
| `/studio/lab/story/:storyId` | Redirect | **DEPRECATED** - redirects | Story | Old links | Story Studio | Story ID |
| `/story/:storyId` | `StoryStudio.tsx` | Scene-first story editor | Story + Scenes | Story Library, Lab | Lab only | Story ID |
| `/studio/analytics` | `RoutingAnalytics.tsx` | Provider performance data | Analytics | Lab header | Lab | None |
| `/login` | `Login.tsx` | Authentication | User | Various | Previous page | None |

### B) Navigation Surfaces Audit

#### 1. Dashboard Header (`Header.tsx`)
| Nav Item | Destination | Context Preserved | Issues |
|----------|-------------|-------------------|--------|
| Scripts | `/scripts` | ✅ None needed | ✅ OK |
| QA Review | `/qa-review` | ✅ None needed | ✅ OK |
| Content Engine logo | Home | ✅ None needed | ❌ No link to Studio/Lab |

**Missing:** No direct navigation to Studio or Lab from Dashboard

#### 2. Studio Header (`StudioHeader` in `Studio.tsx`)
| Nav Item | Destination | Context Preserved | Issues |
|----------|-------------|-------------------|--------|
| Content Engine | `/` | ❌ Loses script context | ⚠️ OK |
| Rendition Studio | `/studio` | ✅ None needed | ✅ OK |

**Missing:** No link to Lab, Stories, or Analytics

#### 3. Lab Header
| Nav Item | Destination | Context Preserved | Issues |
|----------|-------------|-------------------|--------|
| Back arrow | `/studio` | ❌ Loses lab state | ⚠️ Expected |
| Analytics button | `/studio/analytics` | ❌ Loses lab context | ⚠️ Expected |

**Missing:** No breadcrumbs showing current location

#### 4. Story Studio Header
| Nav Item | Destination | Context Preserved | Issues |
|----------|-------------|-------------------|--------|
| Back arrow | `/studio/lab` | ❌ Loses story context | ⚠️ Expected |

**Missing:** No breadcrumbs, no alternative navigation

#### 5. Story Library (in Lab)
| Nav Item | Destination | Context Preserved | Issues |
|----------|-------------|-------------------|--------|
| Story card click | `/story/:id` | ❌ Leaves Lab entirely | ⚠️ Mental model shift |
| New button | `/studio/lab/story?new=true` | ✅ Stays in Lab | ✅ OK |

### C) Object Lifecycle Map

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         CONTENT CREATION LIFECYCLE                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────────┐     ┌──────────────┐     ┌─────────────┐     ┌────────────┐       │
│  │  TOPIC   │────▶│   SCRIPT     │────▶│  VIDEO JOB  │────▶│   OUTPUT   │       │
│  │  BANK    │     │    RUN       │     │   (clip)    │     │   (reel)   │       │
│  └──────────┘     └──────────────┘     └─────────────┘     └────────────┘       │
│       │                 │                    │                   │               │
│       │                 │                    │                   │               │
│  topic_bank        script_runs          video_jobs          Assembled          │
│                         │                    │                 Video            │
│                    QA Gate              Auto-Rating                             │
│                  (qa_passed/            (scores,                                │
│                   qa_failed)             defects)                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────────┐     ┌──────────────┐     ┌─────────────┐     ┌────────────┐       │
│  │  STORY   │     │   STORYBOARD │     │  VIDEO JOB  │     │   OUTPUT   │       │
│  │   JOB    │────▶│    SCENES    │────▶│   (clip)    │────▶│   (reel)   │       │
│  └──────────┘     └──────────────┘     └─────────────┘     └────────────┘       │
│       │                 │                    │                   │               │
│       │                 │                    │                   │               │
│  story_jobs        storyboard_json      video_jobs          Assembled          │
│  (draft/           (embedded in         (scene_id           with               │
│   generating/       story_jobs)          link)             voiceover           │
│   done/archived)                                                                │
│       │                                      │                                  │
│       └──────────────────────────────────────┘                                  │
│                    story_voiceovers                                             │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### Status States and Display Locations

| Object | Status Values | Where Displayed |
|--------|--------------|-----------------|
| `script_runs` | `draft`, `qa_passed`, `qa_failed`, `generating` | Script Generator, QA Inbox, Studio |
| `story_jobs` | `draft`, `generating`, `done`, `archived` | Story Library, Story Studio |
| `video_jobs` | `queued`, `running`, `done`, `failed` | Story Studio (scenes), Lab (filmstrip) |
| `story_voiceovers` | `pending`, `generating`, `done`, `error` | Story Studio (preview) |

---

## Phase 2: Where the UX Breaks

### A) Context Loss Audit (Critical Issues)

#### 1. **Dashboard → Lab (No Direct Path)** 🔴 Critical
- **User knows:** They want to create/manage stories
- **User expects:** A link to Story/Lab from dashboard
- **User gets:** Must go to `/studio` first, then find Lab
- **Context lost:** Multiple clicks to reach creation
- **Can return easily:** Yes, but confusing hierarchy

#### 2. **Lab → Story Studio** 🟡 Medium
- **User knows:** They're in Lab, browsing stories
- **User expects:** Story to open in a panel or same mental space
- **User gets:** Full page navigation to `/story/:id`
- **Context lost:** Lab state, active tab, compare selections
- **Can return easily:** Yes, via back arrow

#### 3. **Story Studio → Back** 🟡 Medium
- **User knows:** They're editing a story
- **User expects:** Context breadcrumbs showing "Lab > Story: Title"
- **User gets:** Only a back arrow, no breadcrumbs
- **Context lost:** Where they came from
- **Can return easily:** Yes, but unclear where "back" goes

#### 4. **Script Generator → Studio (Implicit)** 🟡 Medium
- **User knows:** They generated a script
- **User expects:** To continue working on it
- **User gets:** Click on script card navigates to Studio
- **Context lost:** Clear call-to-action
- **Can return easily:** Via browser back

#### 5. **No Global Navigation** 🔴 Critical
- Every page has different nav structure
- No consistent way to jump between major sections
- Dashboard nav is minimal; other pages have ad-hoc headers

### B) Redundant + Fragmented Screens

| Issue | Current State | Recommendation |
|-------|--------------|----------------|
| **Scripts page vs Studio Launcher** | Two separate places to generate scripts | Merge into Studio Launcher only |
| **Lab tabs (Generate, Story, Compare, Learning)** | Too many tabs, unclear purpose | Simplify to: Create Story, Library, Compare |
| **Story Library in Lab sidebar** | Nested too deep | Promote to top-level or add to Dashboard |
| **QA Review Inbox** | Standalone page | Could be Studio panel/tab |
| **Account Detail** | Full separate page | Could be modal or side panel |

### C) "Where Am I?" Test Results

| Page | What am I looking at? | Current object? | What can I do? | What next? | How to get back? |
|------|----------------------|-----------------|----------------|------------|------------------|
| Dashboard | ✅ Clear | ✅ Accounts/Metrics | ⚠️ Unclear paths | ❌ No guidance | N/A |
| Script Generator | ✅ Clear | ✅ Scripts | ✅ Clear | ⚠️ Implicit | ✅ Dashboard link |
| QA Inbox | ✅ Clear | ✅ Failed scripts | ✅ Clear | ⚠️ Implicit | ✅ Dashboard link |
| Studio (no script) | ✅ Clear | ⚠️ None selected | ✅ Clear | ⚠️ Implicit | ⚠️ Only logo |
| Studio (with script) | ⚠️ Dense | ✅ Script | ⚠️ Complex | ❌ Unclear | ⚠️ Only logo |
| Lab | ⚠️ Too many tabs | ⚠️ Multiple types | ⚠️ Overwhelming | ❌ Unclear | ✅ Back arrow |
| Story Studio | ✅ Clear | ✅ Story | ✅ Clear | ✅ Generate button | ⚠️ Only back arrow |
| Analytics | ✅ Clear | ✅ Stats | ✅ View only | ⚠️ Unclear | ✅ Back arrow |
| Account Detail | ✅ Clear | ✅ Account | ⚠️ Mostly mock | ⚠️ Unclear | ✅ Back button |

---

## Phase 3: Proposed Simplified Platform Flow

### A) Core Workspaces (4 Only)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TOP NAVIGATION BAR                           │
├─────────────────────────────────────────────────────────────────────┤
│  🏠 Dashboard  │  🎬 Stories  │  📝 Scripts  │  ⚙️ Settings         │
└─────────────────────────────────────────────────────────────────────┘
```

| Workspace | Purpose | Contains |
|-----------|---------|----------|
| **Dashboard** | Overview, quick access | Metrics, recent stories, recent scripts, pipeline status |
| **Stories** | All story work | Story Library, Story Studio (in-place), Outputs |
| **Scripts** | Script generation & QA | Generator, QA Inbox (as tabs), Recent scripts |
| **Settings** | Configuration | Accounts, Providers, Analytics, Compare Tool |

### B) "Stories" Workspace (Primary Fix)

The Stories workspace is a **unified story management experience**:

```
┌─────────────────────────────────────────────────────────────────────┐
│  🎬 Stories                                        [+ New Story]    │
├──────────────────┬──────────────────────────────────────────────────┤
│                  │                                                   │
│  STORY LIBRARY   │         SELECTED STORY WORKSPACE                 │
│  ─────────────   │         ────────────────────────                 │
│                  │                                                   │
│  📁 Recent       │  ┌─────────────────────────────────────────┐    │
│     Story A      │  │  Story: "Lonely Astronaut"              │    │
│     Story B  ◀───┼──│  Status: 3/5 scenes done  [Generate]   │    │
│     Story C      │  │                                          │    │
│                  │  │  ┌──────┬──────────────┬─────────────┐  │    │
│  📁 Archived     │  │  │Scenes│   Preview    │  Inspector  │  │    │
│     Story D      │  │  │      │              │             │  │    │
│                  │  │  │  1 ✓ │   [video]    │  Scene 2    │  │    │
│  ─────────────   │  │  │  2 ◀ │              │  prompt...  │  │    │
│                  │  │  │  3   │              │  camera...  │  │    │
│  [+ New Story]   │  │  │  4   │              │  [regen]    │  │    │
│                  │  │  │  5   │              │             │  │    │
│                  │  │  └──────┴──────────────┴─────────────┘  │    │
│                  │  └─────────────────────────────────────────┘    │
│                  │                                                   │
└──────────────────┴──────────────────────────────────────────────────┘
```

**Key principles:**
1. Story Library is always visible on left
2. Clicking a story loads it **in place** (no page navigation)
3. Story context (title, status, progress) is always visible
4. Breadcrumb: `Stories > [Story Name]`

### C) Strict Navigation Rules

1. **Always show breadcrumbs** for detail views
   - `Stories > Lonely Astronaut`
   - `Scripts > QA Inbox`
   - `Settings > Analytics`

2. **Always show object header** with key info
   - Story name + status badge
   - Script name + QA status

3. **Use panels/tabs instead of pages** for related views
   - Story: Scenes | Outputs | History (tabs)
   - Scripts: Generate | QA Inbox (tabs)

4. **Preserve state on return**
   - Story Library: Remember last selected story
   - Filters: Persist across navigation

5. **Every page has explicit navigation**
   - Top nav always visible
   - Breadcrumbs for current location
   - Primary action always visible (Generate, Create)

---

## Phase 4: Deliverables

### Current State Issues (Ranked)

| # | Issue | Severity | Location |
|---|-------|----------|----------|
| 1 | No global navigation - each page has different nav | 🔴 Critical | All pages |
| 2 | No path from Dashboard to Stories/Lab | 🔴 Critical | Dashboard |
| 3 | Story Library → Story Studio is full page nav | 🟡 Medium | Lab |
| 4 | No breadcrumbs anywhere | 🟡 Medium | All detail pages |
| 5 | Lab has too many confusing tabs | 🟡 Medium | Lab |
| 6 | Scripts page duplicates Studio Launcher | 🟡 Medium | Scripts |
| 7 | Account Detail is orphaned page | 🟢 Low | Account Detail |
| 8 | QA Inbox could be integrated into Scripts | 🟢 Low | QA Inbox |

### Concrete Fix List

| # | Location | Problem | Proposed Fix | Expected Win | Effort |
|---|----------|---------|--------------|--------------|--------|
| 1 | `App.tsx` | No global nav | Add persistent top navigation bar | Users always know where they are | M |
| 2 | Create `GlobalNav.tsx` | Doesn't exist | Create component with 4 main sections | Consistent navigation | M |
| 3 | Dashboard `Header.tsx` | Missing links | Add Stories + Studio links | Direct access to creation | S |
| 4 | Story Studio | No breadcrumbs | Add breadcrumb showing "Stories > [Title]" | Clear hierarchy | S |
| 5 | Lab → Story transition | Full page nav | Load story in-place within Lab, or add breadcrumbs | No context loss | M |
| 6 | Lab tabs | 4 confusing tabs | Reduce to: Library (with wizard), Compare, Analytics | Clearer purpose | M |
| 7 | Story Studio header | Only back arrow | Add full header with nav + breadcrumbs | Clear location | S |
| 8 | Script Generator | Separate page | Merge into Studio as tab/panel | One place for scripts | M |
| 9 | QA Inbox | Separate page | Make tab in Scripts section | Unified script workflow | M |
| 10 | All detail pages | No "safe back" | Add explicit "Back to [Parent]" with destination label | Clear navigation | S |
| 11 | Story Library | In Lab sidebar | Also add to Dashboard as quick access widget | Faster access | S |
| 12 | Dashboard | No recent stories | Add "Recent Stories" card linking to Stories | Discovery | S |
| 13 | Create `Breadcrumbs` util | Doesn't exist | Use existing breadcrumb.tsx, integrate everywhere | Consistent hierarchy | S |
| 14 | Story creation | Deep in Lab tabs | Add "Create Story" button to top nav + dashboard | Discoverable | S |
| 15 | Route `/stories` | Doesn't exist | Create dedicated Stories route | Clean URL | M |
| 16 | Lab page rename | Called "Lab" | Rename to "Create" or merge into Stories | Clearer purpose | S |
| 17 | Settings page | Doesn't exist | Create Settings hub for Analytics, Accounts, Providers | Organized config | L |
| 18 | Account modal | Full page for config | Convert to modal/sheet from Dashboard | Less navigation | M |
| 19 | Analytics page | Only via Lab | Add to Settings section | Logical grouping | S |
| 20 | Compare tool | In Lab tabs | Move to Settings/Advanced or dedicated route | Cleaner Lab | S |

### Implementation Plan

#### Phase A: Add Global Navigation (Week 1)
1. Create `GlobalNav.tsx` component with 4 sections
2. Add to `App.tsx` above `<Routes>`
3. Ensure consistent across all pages
4. Add breadcrumb support infrastructure

#### Phase B: Consolidate Stories (Week 2)
1. Create `/stories` route that shows Library + Workspace
2. Load Story Studio **inline** when story selected
3. Add breadcrumbs: "Stories > [Story Title]"
4. Deprecate `/studio/lab/story` routes

#### Phase C: Simplify Scripts (Week 2)
1. Merge Script Generator into Studio
2. Add QA Inbox as tab in unified Scripts view
3. Add to global nav

#### Phase D: Create Settings Hub (Week 3)
1. Create `/settings` route
2. Move Analytics, Compare, Account configs here
3. Keep accessible from relevant contexts

#### Phase E: Dashboard Enhancement (Week 3)
1. Add "Recent Stories" widget
2. Add "Quick Actions" for Create Story, Generate Script
3. Link to all major sections

### Acceptance Tests

- [ ] From Dashboard → click "Stories" → see Story Library + can create/edit stories within 1 click
- [ ] User can always return to previous list without losing context
- [ ] User can answer "where am I?" in 3 seconds on every page (via breadcrumbs + header)
- [ ] Creating a story from anywhere → lands in story editor with context
- [ ] Top nav is visible on every page
- [ ] No more than 2 clicks to reach any major feature
- [ ] Story workflow: Create → Edit Scenes → Generate → Export all in one "workspace"
- [ ] Script workflow: Generate → QA Review → Studio edit all discoverable from one section

---

## Quick Win Implementation Order

**Immediate (can do now):**
1. Add Stories/Lab link to Dashboard header
2. Add breadcrumbs to Story Studio
3. Rename back arrows to "Back to Lab" / "Back to Stories"

**Short-term (this sprint):**
4. Create GlobalNav component
5. Add Recent Stories to Dashboard
6. Consolidate Lab tabs

**Medium-term (next sprint):**
7. Create `/stories` unified route
8. Create Settings hub
9. Merge Script Generator into Studio
