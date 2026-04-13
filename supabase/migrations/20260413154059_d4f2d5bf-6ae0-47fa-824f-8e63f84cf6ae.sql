-- Product-level daily conversion tracking
CREATE TABLE public.product_conversions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual', -- tiktok_shop, shopify, manual, other
  
  -- Funnel metrics
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  add_to_carts INTEGER DEFAULT 0,
  purchases INTEGER DEFAULT 0,
  
  -- Revenue
  revenue_cents INTEGER DEFAULT 0,
  refunds INTEGER DEFAULT 0,
  refund_amount_cents INTEGER DEFAULT 0,
  
  -- Costs
  ad_spend_cents INTEGER DEFAULT 0,
  cogs_cents INTEGER DEFAULT 0, -- cost of goods sold (supplier + shipping)
  
  -- Computed (filled by edge function or trigger)
  gross_profit_cents INTEGER,
  net_profit_cents INTEGER,
  roas NUMERIC(8,2),
  conversion_rate NUMERIC(6,4), -- purchases / clicks
  cost_per_acquisition_cents INTEGER,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(product_id, date, source)
);

-- Video-level conversion tracking
CREATE TABLE public.video_conversions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  story_job_id UUID REFERENCES public.story_jobs(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  platform TEXT NOT NULL DEFAULT 'tiktok',
  external_post_id TEXT,
  date DATE NOT NULL,
  
  -- Funnel
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  add_to_carts INTEGER DEFAULT 0,
  purchases INTEGER DEFAULT 0,
  
  -- Revenue
  revenue_cents INTEGER DEFAULT 0,
  ad_spend_cents INTEGER DEFAULT 0,
  
  -- Computed
  roas NUMERIC(8,2),
  ctr NUMERIC(6,4),
  conversion_rate NUMERIC(6,4),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(story_job_id, date, platform)
);

-- Indexes
CREATE INDEX idx_product_conversions_product_date ON public.product_conversions(product_id, date DESC);
CREATE INDEX idx_product_conversions_source ON public.product_conversions(source);
CREATE INDEX idx_video_conversions_product ON public.video_conversions(product_id, date DESC);
CREATE INDEX idx_video_conversions_story ON public.video_conversions(story_job_id);

-- RLS
ALTER TABLE public.product_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_conversions ENABLE ROW LEVEL SECURITY;

-- Product conversions policies
CREATE POLICY "Product conversions viewable by everyone"
  ON public.product_conversions FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage product conversions"
  ON public.product_conversions FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
CREATE POLICY "Service role can manage product conversions"
  ON public.product_conversions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Video conversions policies
CREATE POLICY "Video conversions viewable by everyone"
  ON public.video_conversions FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage video conversions"
  ON public.video_conversions FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
CREATE POLICY "Service role can manage video conversions"
  ON public.video_conversions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Auto-update timestamps
CREATE TRIGGER update_product_conversions_updated_at
  BEFORE UPDATE ON public.product_conversions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_video_conversions_updated_at
  BEFORE UPDATE ON public.video_conversions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();