
-- ============================================================
-- 1. Products table extensions (canonical identity + readiness)
-- ============================================================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS canonical_name text,
  ADD COLUMN IF NOT EXISTS short_description text,
  ADD COLUMN IF NOT EXISTS distinctive_attributes text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS excluded_variants text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS synonyms text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS identity_confidence integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS readiness_state text DEFAULT 'research_only',
  ADD COLUMN IF NOT EXISTS readiness_score integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS preferred_supplier_id uuid,
  ADD COLUMN IF NOT EXISTS retail_anchor_price_cents integer;

-- ============================================================
-- 2. Product links extensions (temporal + override + richer extraction)
-- ============================================================
ALTER TABLE public.product_links
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS manually_overridden boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS override_action text,
  ADD COLUMN IF NOT EXISTS extracted_currency text DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS extracted_brand text;

-- ============================================================
-- 3. Product images extensions (ad readiness + quality flags)
-- ============================================================
ALTER TABLE public.product_images
  ADD COLUMN IF NOT EXISTS source_domain text,
  ADD COLUMN IF NOT EXISTS ad_readiness_score integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS watermarked boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS low_resolution boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS manually_approved boolean DEFAULT false;

-- ============================================================
-- 4. product_market_snapshots — cached price rollups
-- ============================================================
CREATE TABLE IF NOT EXISTS public.product_market_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  lowest_verified_retail_cents integer,
  median_verified_retail_cents integer,
  highest_verified_retail_cents integer,
  verified_retail_count integer DEFAULT 0,
  verified_wholesale_count integer DEFAULT 0,
  preferred_supplier_cost_cents integer,
  preferred_supplier_delivered_cents integer,
  spread_cents integer,
  spread_pct numeric,
  source_diversity_count integer DEFAULT 0,
  snapshot_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(product_id)
);

ALTER TABLE public.product_market_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_market_snapshots_select_public"
  ON public.product_market_snapshots FOR SELECT
  USING (true);

CREATE POLICY "product_market_snapshots_all_authenticated"
  ON public.product_market_snapshots FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "product_market_snapshots_all_service_role"
  ON public.product_market_snapshots FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- 5. product_decisions — operator audit trail
-- ============================================================
CREATE TABLE IF NOT EXISTS public.product_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  decision_type text NOT NULL,
  decision_value text,
  reason text,
  made_by text DEFAULT 'operator',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.product_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_decisions_select_public"
  ON public.product_decisions FOR SELECT
  USING (true);

CREATE POLICY "product_decisions_insert_authenticated"
  ON public.product_decisions FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "product_decisions_all_service_role"
  ON public.product_decisions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- 6. Indexes for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_product_links_product_validation
  ON public.product_links(product_id, validation_status);

CREATE INDEX IF NOT EXISTS idx_product_links_link_type
  ON public.product_links(product_id, link_type);

CREATE INDEX IF NOT EXISTS idx_product_decisions_product
  ON public.product_decisions(product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_market_snapshots_product
  ON public.product_market_snapshots(product_id);

CREATE INDEX IF NOT EXISTS idx_product_suppliers_product_preferred
  ON public.product_suppliers(product_id, is_preferred);

-- ============================================================
-- 7. FK for preferred_supplier_id on products
-- ============================================================
ALTER TABLE public.products
  ADD CONSTRAINT fk_products_preferred_supplier
  FOREIGN KEY (preferred_supplier_id) REFERENCES public.product_suppliers(id)
  ON DELETE SET NULL;

-- ============================================================
-- 8. Trigger for updated_at on new tables
-- ============================================================
CREATE TRIGGER update_product_market_snapshots_updated_at
  BEFORE UPDATE ON public.product_market_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
