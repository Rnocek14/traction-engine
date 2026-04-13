
# Phase 1: Product Intelligence Layer — Foundation ✅

Build the product data model, scoring table, FK links, ecommerce vertical, and a manual product entry UI. No automation, no scraper expansion, no auto-scaling yet.

## Completed
- Products table, product_analysis, product_images, product_links, product_suppliers, product_unit_economics
- Products page with grid, entry form, scoring form, detail card
- AI research pipeline (8-phase deep research)
- Supplier intelligence with weighted scoring
- Unit economics calculator with kill conditions
- Conversion tracking (product_conversions, video_conversions)
- Marketing plan generation + account assignment

---

# Link Verification Pipeline v3 ✅

Evidence-based verification system replacing brittle single-word URL matching.

## Architecture
- **Weighted Token Matching**: Distinctive tokens (brand names, unique words) carry 3x weight vs generic words (phone, stand, holder)
- **Structured Data Extraction**: JSON-LD Product schema, Open Graph, H1, canonical URL, breadcrumbs extracted BEFORE AI verification
- **Staged Verification**: Domain check → URL slug → Fetch → Dead page detection → Structured signals → Lexical relevance → AI verification (only for ambiguous cases)
- **Marketplace Heuristics**: Amazon, AliExpress, DHgate, Temu, Walmart, eBay each have custom dead-page signals
- **Firecrawl Fallback**: JS-heavy pages (DHgate, AliExpress) fall back to Firecrawl when native fetch returns thin content
- **Composed Confidence Score**: domain_trust(15) + structured_data(20) + weighted_relevance(20) + url_slug(10) + content_relevance(10) + ai_verdict(20) + price_extracted(5) = 0-100
- **Validation Statuses**: verified (80+), probable (60-79), candidate (50-59), rejected (<50)
- **Full Explainability**: Every link stores validation_reasons[], matched_tokens[], distinctive_tokens_matched[], ai_verdict, ai_confidence, fetch_method, extracted_product_name, evidence_summary
- **Manual Override**: Operators can approve/reject any link from the UI
- **Rejected links preserved**: Stored with evidence for audit trail

## DB Changes
- product_links: added match_confidence, validation_status, validation_reasons, matched_tokens, distinctive_tokens_matched, ai_verdict, ai_confidence, fetch_method, extracted_product_name, structured_price_cents, schema_type, canonical_url, content_quality_score, evidence_summary

---

# Phase 2: Conversion Tracking ✅

- product_conversions table (daily funnel: impressions → clicks → carts → purchases → revenue)
- video_conversions table (per-video attribution)
- ingest-conversions edge function (auto-pulls COGS from unit economics)
- ConversionTracker UI with summary dashboard + manual ingestion form
- Winner badge logic (5+ sales with positive net profit)

---

# Phase 3: Shopify PDP Publishing (Next)

- Shopify integration for product page creation
- Automated order sync
- Revenue data flowing back into conversion tracking

---

# Explicitly Deferred

- AI product scoring edge function improvements
- Product discovery via scraper expansion
- Product-aware idea generation angles
- Winner detection / auto-scaling
- Evaluation test fixtures for link verification
