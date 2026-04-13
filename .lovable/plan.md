

# Phase 1: Product Intelligence Layer — Foundation

Build the product data model, scoring table, FK links, ecommerce vertical, and a manual product entry UI. No automation, no scraper expansion, no auto-scaling yet.

---

## Database Migration (single migration)

1. **Add `ecommerce` to `content_vertical` enum**

2. **Create `products` table** — id, name, category, subcategory, source_url, image_url, price_cents, supplier_price_cents, estimated_margin_pct, supplier_url, shipping_days, status (`discovered|researching|approved|active|paused|dead`), discovered_via (`manual|scraper|tiktok_shop`), notes, created_at, updated_at. RLS: public read, service_role write.

3. **Create `product_analysis` table** — product_id (unique FK → products), wow_factor/social_media_potential/impulse_buy_appeal/demonstrability_score/competition_level (all integer 1-5), price_sweet_spot (boolean), emotional_triggers (text[]), trending_status (`emerging|rising|peak|declining|saturated`), overall_score (0-100 composite), analyzed_by (`manual|ai`), analyzed_at. RLS: public read, service_role write.

4. **Add FK columns to existing tables**
   - `content_ideas`: add `product_id` (uuid FK → products), `cta_url` (text), `cta_type` (text)
   - `story_jobs`: add `product_id` (uuid FK → products)

---

## Products Page (`/products`)

- **Status pipeline tabs**: Discovered → Researching → Approved → Active → Dead
- **Product grid** with status badges, price, margin %, and analysis scores
- **Manual product entry dialog**: name, category, source URL, image URL, price, supplier price, notes
- **Product detail card**: info, margin calc, analysis scores as visual badges, linked ideas/videos count
- **Manual scoring form** (dialog): 5 dimension sliders (1-5), price sweet spot toggle, trending status dropdown, emotional triggers multi-select. Auto-computes overall_score as weighted average. Saves to `product_analysis`.

---

## Navigation & Routing

- Add `/products` route to `App.tsx`
- Add "Products" link to `GlobalNav.tsx`

---

## Files

| File | Action |
|------|--------|
| Migration SQL | Create tables, enum, FKs |
| `src/pages/Products.tsx` | New page |
| `src/components/products/ProductGrid.tsx` | Grid with filters |
| `src/components/products/ProductEntryForm.tsx` | Manual intake |
| `src/components/products/ProductScoringForm.tsx` | 5-dimension scoring |
| `src/components/products/ProductDetailCard.tsx` | Detail view |
| `src/hooks/use-products.ts` | Data hook |
| `src/App.tsx` | Add route |
| `src/components/GlobalNav.tsx` | Add nav link |

---

## Explicitly Deferred (Phase 2+)

- AI product scoring edge function
- Product discovery via scraper expansion
- Product-aware idea generation angles
- Supplier reliability tracking
- Product ROI dashboard
- Winner detection / auto-scaling

