# Traction Engine

**A multi-vertical, automated marketing engine that turns one operator into a 50-account content studio.**

Traction Engine is not a dropshipping tool, not a content scheduler, and not a single-niche page farm. It is a **reusable media machine** that promotes your own apps, opportunistic dropship products, and future offers across a portfolio of niche audience verticals — all from one cockpit.

> Mission: build durable audience equity across many small accounts, then route that attention into whatever you're monetizing this month — apps first, products second, anything else third.

---

## What this app actually does

At its core, Traction Engine runs four loops in parallel:

1. **Audience loop** — grow niche accounts with high-retention UGC + brainrot-style content
2. **Research loop** — discover viral products, viral hooks, and viral formats across the web
3. **Production loop** — script → storyboard → voiceover → multi-provider AI video → assembled reel
4. **Monetization loop** — route attention to your apps, dropship products, or partner offers, then measure what actually converts

Everything is account-aware, vertical-aware, and outcome-scored.

---

## Architecture: Verticals are primary

The whole platform is organized around **verticals** (audience niches), not around products or platforms.

```text
                    ┌──────────────────────────┐
                    │       VERTICALS          │  ← primary unit
                    │  (audience + identity)   │
                    └────────────┬─────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
        ┌─────────┐        ┌─────────┐        ┌─────────┐
        │  APPS   │        │PRODUCTS │        │ GROWTH  │
        │ (strat) │        │ (opp.)  │        │ (info)  │
        └─────────┘        └─────────┘        └─────────┘
              │                  │                  │
              └──────────────────┴──────────────────┘
                                 │
                                 ▼
                    ┌──────────────────────────┐
                    │   50+ SOCIAL ACCOUNTS    │
                    │ TikTok · Reels · Shorts  │
                    └──────────────────────────┘
```

**Default content mix per vertical:** 70% growth / 20% app / 10% product (configurable; gadgets/home/toys flip to product-led).

### Active verticals

| Business | Vertical    | Mode          | Notes                              |
|----------|-------------|---------------|------------------------------------|
| A        | Privacy     | app_first     | Strategic priority                 |
| A        | Health      | app_first     | Strict compliance (claim-binding)  |
| A        | Education   | app_first     | Authority + listicle heavy         |
| B        | Gadgets     | product_first | "Gadget Finds" / "Amazon Finds"    |
| B        | Home        | product_first | High realism, satisfying demos     |
| B        | Toys        | product_first | High-volume opportunistic          |

---

## Feature surface

### 1. Multi-account network ("Account Network")
- 50+ TikTok, Instagram, and YouTube Shorts accounts under one roof
- Each account has a **persona, promise, audience, hook style, posting frequency, allowed product categories** and a monetization mode (`app_first`, `product_first`, `hybrid`)
- Status lifecycle: `warmup → active → paused/flagged`
- Auto-assignment routes new products/apps to the best-fit accounts via category, pillar, and priority scoring

### 2. App marketing engine
- Catalog of your own apps with value props, CTAs, and target verticals
- **App-angle testing**: fear / curiosity / value angles tested per app, per vertical
- Winners get scaled; losers get killed via the **10-Video Rule**
- App promos respect the vertical's tone (a privacy app reads very differently in the Health vertical vs. Education)

### 3. Dropshipping research + content
- **SERP-based discovery** (SerpAPI / Google Shopping) feeds candidate products
- **Perplexity-powered intelligence** scrapes listings, og:images, and supplier signals
- **AI Link Validator** + identity-anchor gating reject vague or mismatched candidates
- **Multi-image acquisition** (up to 8 real images per product) so generated ads use *actual* product visuals, not hallucinations
- **Readiness gate**: no ad generation until a product has a confirmed link, anchor term, and `readiness_score ≥ 40`
- 5-angle video diversity per winning product: Problem · Curiosity · Social Proof · Compare · Demo
- Performance tracked end-to-end: Revenue − COGS − Shipping − Fees = Net profit. **Winner = 5+ sales.**

### 4. Viral video ingestion + intelligence
- Paste any viral TikTok/Reel URL → extract product, hook, demand signals, creator handle
- **5-dimension viral scoring**: timely · emotion · share · novel · controversy
- Jaccard token deduplication so you don't chase the same trend twice
- Demand score drives whether the system spins up production around it

### 5. Story & video production pipeline
The "Lab" / Story Studio is where ideas become finished reels.

```text
Idea
  → Story (create-story · myth-mode · film-mode)
    → Storyboard (scenes, beats, camera)
      → Script (compile-story-script, canonical timing)
        → Voiceover (ElevenLabs eleven_multilingual_v2, word-level timestamps)
          → Visuals (Sora hero · Runway kinetic · Luma texture)
            → Assembly (FFmpeg microservice on Fly.io)
              → QA gates → Reel
```

- **Script-first architecture**: storyboard is the canonical timing authority
- **Audio-first orchestration**: VO + hooks generate before video to lock pacing
- **Scene role routing**: Sora for coherent hero shots, Runway for motion, Luma for texture
- **Narrative escalation contract**: enforces mid-story escalation + peak tension
- **Recovery ladder**: 3-stage automated sanitization/fallback when a provider rejects a prompt
- **Provider circuit breaker**: auto-disables any provider with >90% failure over 24h

### 6. UGC + Brainrot aesthetic
Realism is tuned per vertical to maximize reach:

| Style preset    | Realism | Used for                          |
|-----------------|---------|-----------------------------------|
| Gadget Finds    | 60%     | Discovery, "what is this thing?"  |
| Tech Hacks      | 85%     | Demo-heavy authority content      |
| Amazon Finds    | 90%     | High-conversion product reveals   |
| Brainrot Growth | low     | Engagement-farming, top-of-funnel |

**Brainrot is a deliberate growth lever.** Fast cuts, overstimulating overlays, meme audio, and absurd hooks live in the growth bucket of the content mix. They earn the followers; the monetization videos cash them in.

Guardrails: hooks ≤ 3s, no dead air, 3–6 word text overlays, no filler, no generic stock scenes, no abstract drift on high-realism presets.

### 7. Quality, safety & compliance
- **P0 sanitization**: strips structural metadata, enforces Sora (600) / Runway (300) prompt limits
- **P1 quality engine**: no-filler gate, strict Hook → Value Points → CTA structure
- **P3 platform retention**: TikTok/Reels-tuned pacing rules
- **P4 style control**: bans abstract content above 80% realism
- **Unified policy v1**: sanitize-vs-block for Health, Finance, News verticals
- **Research-first**: factual content requires claim-binding to verified citations
- **Asset gate**: no ad generation without a verified asset (product with confirmed links OR app with cta_url + value_prop)

### 8. Publishing + winner detection
- Publish via **TikTok Content Posting API v2** (preferred) and Facebook/Reels
- **Daily Content Engine** schedules per-vertical storyboards using `growth_ratio`
- **Outcome scoring (0–100)**: Engagement (50) + Retention (30) + Reach (20)
- **Winner Engine** auto-scales content > 3x baseline views AND > 70% retention
- **10-Video Rule decisions**: Kill (0 clicks), Fix Funnel (no sales), Test (1–2), Scale (3+)

### 9. Cost & ops
- Cost overlay across every provider (OpenAI, ElevenLabs, Sora, Runway, Luma, SerpAPI, Perplexity)
- Cron monitor, system health panel, prompt leaderboard, learning inspector
- QA Review Inbox for human-in-the-loop overrides

---

## The cockpit (UI map)

| Route                 | What it's for                                                  |
|-----------------------|----------------------------------------------------------------|
| `/`                   | Dashboard — pipeline, metrics, account network, recent videos  |
| `/today`              | Today's plan per account, ready-to-post queue                  |
| `/verticals`          | Per-vertical engine settings, suggestions, review queue        |
| `/account/:id`        | Single account: identity, content, performance                 |
| `/catalog`            | Unified Apps + Products catalog                                |
| `/products`           | Product research, dossiers, marketing plans                    |
| `/campaigns`          | App-angle testing across verticals                             |
| `/ideas`              | Content ideas, trend intelligence, scraper health              |
| `/stories-library`    | Story library + **Story Studio** (the production pipeline)     |
| `/studio`             | Per-scene generation, voiceover, assembly, version timeline    |
| `/produce`            | Bulk produce queue                                             |
| `/review`             | Assembled video review + performance ingestion                 |
| `/qa-inbox`           | Human QA review of compliance/quality flags                    |
| `/cost`               | Provider cost dashboard                                        |
| `/routing-analytics`  | Provider routing performance                                   |
| `/settings`           | Prompt templates, leaderboard, system config                   |

---

## Tech stack

- **Frontend**: React 18 · Vite · TypeScript · Tailwind · shadcn/ui
- **Backend**: Lovable Cloud (Supabase) — Postgres, RLS, Edge Functions, Storage, Auth
- **AI**: OpenAI (GPT-4o scripts), ElevenLabs (voiceover), Sora / Runway / Luma (video), Perplexity (research), SerpAPI (discovery)
- **Media**: FFmpeg microservice on Fly.io (`ffmpeg-service/`) for assembly, resize, thumbnails
- **Commerce**: Shopify integration (`traction-engine-20sgn` dev store) for product test destinations

---

## Operating philosophy

- **Verticals are primary.** Apps and products are equal-weight monetization assets routed *into* verticals, not the other way around.
- **Apps are strategic. Products are opportunistic.** Build durable demand for your own apps; ride product trends while they're hot.
- **UGC + brainrot for reach, demos for revenue.** The growth bucket buys attention. The monetization bucket spends it.
- **Visual-first.** Every video must demonstrate the benefit in the first 2 seconds. No talking-head intros.
- **Kill fast, scale faster.** The 10-Video Rule is non-negotiable.
- **No ads without verified assets.** Compliance, realism, and link validity are gates, not suggestions.

---

## License

Private. All rights reserved.
