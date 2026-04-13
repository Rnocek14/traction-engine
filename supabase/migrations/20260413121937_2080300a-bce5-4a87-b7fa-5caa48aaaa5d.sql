
-- 1. Add ecommerce to content_vertical enum
ALTER TYPE public.content_vertical ADD VALUE IF NOT EXISTS 'ecommerce';

-- 2. Create products table
CREATE TABLE public.products (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  category text,
  subcategory text,
  source_url text,
  image_url text,
  price_cents integer,
  supplier_price_cents integer,
  estimated_margin_pct numeric,
  supplier_url text,
  shipping_days integer,
  status text NOT NULL DEFAULT 'discovered',
  discovered_via text NOT NULL DEFAULT 'manual',
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT products_status_check CHECK (status IN ('discovered','researching','approved','active','paused','dead')),
  CONSTRAINT products_discovered_via_check CHECK (discovered_via IN ('manual','scraper','tiktok_shop'))
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products_select_public" ON public.products FOR SELECT USING (true);
CREATE POLICY "products_insert_authenticated" ON public.products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "products_update_authenticated" ON public.products FOR UPDATE TO authenticated USING (true);

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Create product_analysis table
CREATE TABLE public.product_analysis (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  wow_factor integer CHECK (wow_factor BETWEEN 1 AND 5),
  social_media_potential integer CHECK (social_media_potential BETWEEN 1 AND 5),
  impulse_buy_appeal integer CHECK (impulse_buy_appeal BETWEEN 1 AND 5),
  demonstrability_score integer CHECK (demonstrability_score BETWEEN 1 AND 5),
  competition_level integer CHECK (competition_level BETWEEN 1 AND 5),
  price_sweet_spot boolean DEFAULT false,
  emotional_triggers text[] DEFAULT '{}'::text[],
  trending_status text DEFAULT 'emerging',
  overall_score integer DEFAULT 0,
  analyzed_by text DEFAULT 'manual',
  analyzed_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT product_analysis_trending_check CHECK (trending_status IN ('emerging','rising','peak','declining','saturated')),
  CONSTRAINT product_analysis_analyzed_by_check CHECK (analyzed_by IN ('manual','ai')),
  CONSTRAINT product_analysis_product_unique UNIQUE (product_id)
);

ALTER TABLE public.product_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_analysis_select_public" ON public.product_analysis FOR SELECT USING (true);
CREATE POLICY "product_analysis_insert_authenticated" ON public.product_analysis FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "product_analysis_update_authenticated" ON public.product_analysis FOR UPDATE TO authenticated USING (true);

CREATE TRIGGER update_product_analysis_updated_at
  BEFORE UPDATE ON public.product_analysis
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Add product_id, cta_url, cta_type to content_ideas
ALTER TABLE public.content_ideas
  ADD COLUMN product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN cta_url text,
  ADD COLUMN cta_type text;

-- 5. Add product_id to story_jobs
ALTER TABLE public.story_jobs
  ADD COLUMN product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;
