

# Deep System Audit & Restructuring Plan

---

## A. What Is Actually Built and Working

### Pages (16 routes, 6 in nav)

| Page | Route | Purpose | Status |
|------|-------|---------|--------|
| Command Center | `/` | Priority actions dashboard | Working but product-centric, no vertical view |
| Ideas | `/ideas` | Trend scraping + content ideas | Working. 48 ideas generated, all stuck in "proposed" |
| Products | `/products` | Product discovery + grid | Working. 45 products (29 discovered, 16 researching) |
| Product Dossier | `/products/:id` | Deep product view + Primary Action Engine | Working. One-click video pipeline exists |
| Produce | `/produce` | Story library + editor | Working but only used for organic stories, not product videos |
| Review | `/review` | Video approval + performance + scripts | Working. 2 assembled videos exist |
| Settings | `/settings` | Providers, accounts, prompts, advanced | Partially working. Account tab broken (no account list) |
| Studio | `/studio` | Script timeline editor | Working but disconnected from main workflow |
| ScriptGenerator | `/scripts` | Generate scripts | Working but disconnected |
| AccountDetail | `/account/:id` | Single account view | Working, but unreachable from nav (only via direct URL) |
| RoutingAnalytics | `/studio/analytics` | Provider routing stats | Working but zero data |
| Login | `/login` | Auth | Working |

### Database (49 tables, key ones)

| Table | Records | Status |
|-------|---------|--------|
| `account_configs` | 14 | Fully configured. 6 verticals, monetization modes set |
| `products` | 45 | 29 discovered, 16 researching. 0 approved/active. 4 have images |
| `product_links` | 142 | Links exist but none verified |
| `product_images` | 6 | Only 2 products have images. None verified |
| `product_suppliers` | 0 | Empty |
| `product_conversions` | 0 | Empty |
| `content_ideas` | 48 | All stuck in "proposed" status |
| `story_jobs` | 99 | 2 assembled successfully, 46 done but not assembled, 12 generating, 12 draft |
| `video_jobs` | 419,650 | 418,547 failed, 1,057 done, 46 running |
| `script_runs` | 137,813 | Massive volume, mostly from pipeline artifacts |
| `scraped_insights` | 11 (last 7d) | Scraper working but low volume |
| `published_posts` | Does not exist | No publishing table |

### Edge Functions (55 functions)

**Actually used in the current flow:**
- `produce-product-video` - Product video orchestrator (working)
- `product-to-videos` - Concept generation + queuing (working)
- `product-research` - Perplexity/SerpAPI research (working)
- `queue-video` / `queue-video-smart` - Sora/Runway dispatch (working)
- `process-video` - Sora poller (working, recently fixed)
- `assemble-reel` - FFmpeg assembly (working, 2 successes)
- `create-story` - Story creation (working)
- `generate-storyboard` - Storyboard generation (working)
- `auto-scrape-trends` - Trend scraper (working, runs via pg_cron)
- `generate-ideas` - AI idea generation (working)
- `scrape-supplier-images` - Image scraper (partially working)
- `ingest-viral-video` - Viral video intake (working)

**Built but never producing output:**
- `generate-voiceover` / `generate-story-voiceover` - Voiceover gen (exists, unclear if used)
- `compare-videos` / `process-compare-queue` - A/B comparison (exists, 0 data)
- `ingest-performance` / `ingest-conversions` - Performance tracking (exists, 0 data)
- `assign-product-accounts` - Product-to-account matching (exists but not wired to UI action)

**Dead/unused:**
- `create-story-film-mode` / `create-story-myth-mode` / `continue-story-*` - Legacy story modes
- `generate-reel-sequence` / `generate-reel-sequence-runway` - Old reel pipeline
- `create-reel` - Legacy
- Career/education tables (career_profiles, career_steps, courses, etc.) - From a different project entirely

### Pipelines That Actually Work End-to-End

1. **Product Discovery**: Manual entry or viral URL paste -> product created in DB
2. **Product Research**: Click "Research" -> Perplexity/SerpAPI finds retail links -> stored
3. **Product Video Generation**: Click "Create First Video" -> concepts -> story_jobs -> video_jobs -> Sora renders -> FFmpeg assembles -> MP4 download (2 successes exist)
4. **Trend Scraping**: Auto-scrape runs 2x/day -> scraped_insights populated
5. **Idea Generation**: Click "Generate Ideas" -> AI creates content_ideas from trends

### Pipelines That Stall Midway

1. **Ideas -> Production**: 48 ideas sit in "proposed". No one-click "produce this idea" button
2. **Story Creation (Produce)**: Can create stories, but clip rendering has 99.8% failure rate historically
3. **Product Image Acquisition**: Only 6 images across 45 products. Scraper exists but rarely fires
4. **Assembly**: Only 2 of 99 story_jobs ever assembled successfully

---

## B. What Is Partially Built, Weak, or Misleading

### Features That Create Complexity Without Leverage

1. **Studio page** (`/studio`) - Full script timeline editor with version chains, scene inspectors, clip camera selectors. Massive component tree (~15 components). Zero practical use in the current workflow. Scripts are generated by the pipeline, not manually edited.

2. **Produce page** - Merges stories + scripts in a resizable panel layout. Duplicates what the Product Dossier already does for product videos. The "story editor" (777 lines in Stories.tsx) is a full scene-by-scene editing workspace that no operator needs for a "click -> video" system.

3. **Prompt R&D system** - `prompt_experiments`, `prompt_scores`, `prompt_outcomes`, `prompt_family_stats`, `prompt_templates`, `prompt_learnings` (6 tables, ~0 records with useful data). Entire prompt experimentation framework built but never used.

4. **Provider routing** - `provider_cluster_stats`, `routing_tag_allowlist`, routing analytics page. Built for A/B testing Sora vs Runway vs Luma. Zero practical data.

5. **Compare tool** - Full video comparison panel. Zero comparisons made.

6. **Career/education tables** - `career_profiles`, `career_steps`, `courses`, `course_cri_scores`, `instructor_profiles`, `instructor_ratings`, `resume_exports`, `profiles` - All from a completely different app. Taking up space.

### Dead-End Flows

- **Settings > Accounts tab**: Says "Select an account from the dashboard" but dashboard has no account links
- **Ideas > Pipeline tab**: Shows `IdeaQueuePanel` but no way to move ideas through a pipeline
- **Content ideas**: All 48 permanently stuck at "proposed" - no "approve and produce" action

### Product Video Quality Risks

- **41 of 45 products have NO images at all** - Sora is generating from text prompts only, meaning it's inventing what the product looks like
- **Only 6 product_images exist, none verified** - The image selection system exists but is practically empty
- **One product has a TikTok URL as its image_url** (Kinetic Sand Slicer Pro) - clearly wrong
- **No human review of generated clips before assembly** - clips go straight to FFmpeg
- **No preview of what Sora generated** - operator can't see individual clips in the current UI
- **2 assembled videos exist** but quality is completely unknown

### Script_runs Pollution

137,813 `script_runs` records exist. Most are artifacts from the pipeline creating disposable `script_run` records just to satisfy `queue-video`'s foreign key requirement. This table has become a junk drawer.

---

## C. What Is Missing for the Real Business Model

### Critical Missing Pieces

| Missing Capability | Why It Matters | Severity |
|---|---|---|
| **Verticals page** | 6 verticals exist in DB but are invisible. No way to see your network, manage verticals, or assign content to them | CRITICAL |
| **Organic content creation** | System can only make product videos. Cannot create "haunted facts" or "finance tips" growth content. This is 80% of what accounts should post | CRITICAL |
| **Publishing** | No `published_posts` table. No TikTok/IG API integration. Every video must be manually downloaded and uploaded | CRITICAL |
| **Apps table** | No way to register your own apps as monetization targets. No `apps` table exists | HIGH |
| **Product-to-vertical assignment** | `story_jobs.product_id` exists but products aren't formally assigned to verticals. `assign-product-accounts` edge function exists but isn't wired into any UI | HIGH |
| **Content mix strategy** | No concept of "growth post" vs "monetization post". No ratio enforcement | HIGH |
| **Idea approval flow** | 48 ideas stuck at "proposed" with no "approve and produce" button | HIGH |
| **Account management UI** | 14 accounts exist but can only be viewed one at a time via direct URL. No list view, no management | MEDIUM |
| **Hook testing/rotation** | No A/B testing of hooks against same product. System generates one set of concepts and that's it | MEDIUM |
| **Performance feedback loop** | `product_conversions` and `video_conversions` tables exist but have 0 records. No data flowing back | MEDIUM |
| **Scheduling** | No content calendar, no posting schedule. Everything is ad-hoc | LOW (for now) |

---

## D. How the System Should Be Simplified

### Current Navigation (6 items)
Dashboard | Ideas | Products | Produce | Review | Settings

### Proposed Navigation (4 items)
**Verticals** | **Products** | **Studio** | **Settings**

### What Each Page Does

**Verticals** (new, replaces Dashboard as home)
- Grid of 6 verticals with account counts and content stats
- Click vertical -> see accounts, content queue, assigned products, assigned apps
- "Create Growth Post" button per vertical (organic content)
- "Assign Product" button per vertical (monetization content)
- Shows mix ratio: X growth posts / Y product posts

**Products** (keep, simplify)
- Discovery, research, dossier (keep as-is, it works)
- Primary Action Engine stays on dossier
- Add: product image preview grid with verify/reject before video gen
- Remove: Viral video list from main grid (move to dossier only)

**Studio** (merge Produce + Review)
- Single workspace for all content in production
- List of all story_jobs across all verticals
- Filter by: vertical, status, type (growth/product)
- Video preview, approve/reject, download, publish
- Replace the current split-panel story editor with a simpler card-based review

**Settings** (keep, fix)
- Accounts tab: show actual account list, click to edit
- Remove: Provider routing (premature)
- Remove: Prompt R&D (premature)
- Remove: Compare tool (premature)

### Pages/Routes to Remove or Redirect
- `/ideas` -> absorbed into Verticals (trending tab per vertical)
- `/produce` -> redirect to `/studio`
- `/scripts` -> remove (scripts are auto-generated)
- `/studio/analytics` -> remove (zero data)
- Stories.tsx (777 lines) -> replaced by simpler review cards

### Core Objects (Entity Model)

```text
Vertical (privacy, health, education, gadgets, home, toys)
  └── Account (1-to-many, e.g. privacy_minute, digital_safety)
       └── Content Job (story_job with type: growth | product | app_promo)
            └── Video Clips (video_jobs)
            └── Assembled Video (MP4)
            └── Published Post (future)

Product (standalone, assigned to 1+ verticals)
  └── Product Links
  └── Product Images
  └── Supplier / Economics

App (new table, standalone, assigned to 1+ verticals)
  └── Name, URL, promo assets
```

### Ideal Operator Workflow

```text
1. Check Verticals home → see which vertical needs content
2. For growth: click "Create Growth Post" → AI generates niche content → review → post
3. For product: go to Products → pick product → click "Create Video" → review → post
4. For app: (future) same as product but for app promo
5. Check Studio → approve/reject videos → download → post manually (later: auto-publish)
6. Log performance manually → system learns what works
```

---

## E. Target Architecture

### Database Changes Needed

1. **New table: `apps`** - name, url, description, icon_url, verticals (text[]), status, created_at
2. **New table: `published_posts`** - story_job_id, account_id, platform, external_post_id, posted_at, performance_data (jsonb)
3. **New column on `content_ideas`**: `content_type` enum (growth | product_promo | app_promo)
4. **Cleanup**: Drop or archive career_profiles, career_steps, courses, course_cri_scores, instructor_profiles, instructor_ratings, resume_exports (different project)

### Biggest Risks That Would Stop This From Making Money

1. **Video quality is unknown** - 2 assembled videos exist but nobody has watched them. If Sora output looks bad, the entire pipeline is useless
2. **No product images** - 41/45 products have no images. AI-generated "product videos" without real product photos are not usable as ads
3. **Publishing is fully manual** - Even if videos are good, the download-upload loop kills velocity
4. **No organic content pipeline** - Without growth content, accounts have no audience to monetize
5. **99.8% video_job failure rate** - Even though recently fixed, the pipeline reliability is unproven at scale

### Phase 1 (Do Now - Get to First Posted Video)

1. **Watch the 2 existing assembled videos** - Assess if they're actually usable
2. **Build Verticals home page** - Replace Dashboard with vertical grid showing accounts and content stats
3. **Fix product image pipeline** - Auto-scrape images on product creation, show preview in dossier so operator can verify BEFORE video gen
4. **Add organic content creation** - "Create Growth Post" button that generates niche content for a vertical (uses existing create-story but without a product)
5. **Simplify navigation** - 4 items: Verticals, Products, Studio, Settings

### Phase 2 (After First 10 Posted Videos)

1. Add `apps` table and app promo video flow
2. Wire TikTok Content Posting API
3. Performance tracking (wire existing empty tables)
4. Content mix ratio tracking per vertical

### Do NOT Build Yet

| Feature | Why Skip |
|---------|----------|
| Automated posting schedule | Post manually until video quality is validated |
| Hook A/B testing | Need posted content data first |
| Prompt R&D system | Current prompts haven't been tested at real scale |
| Provider routing optimization | Only using Sora right now |
| Unit economics calculator refinements | 0 sales data exists |
| Compare tool | Premature without volume |
| Full story editor (scene-by-scene) | Over-engineering for "click -> video" model |

### Cleanup Candidates (Reduce Codebase Complexity)

- `Stories.tsx` (777 lines) - Replace with simpler card view
- 15+ Studio components (ClipTimeline, SceneTimeline, InspectorPanel, etc.) - Not needed for current workflow
- Lab components (AssemblyPanel, ComparePanel, DualAxisRating, etc.) - R&D features with 0 usage
- Legacy story mode functions (film-mode, myth-mode, chain) - Unused
- Career/education tables - Different project

