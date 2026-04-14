
-- Vertical content engine configuration
CREATE TABLE public.vertical_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical text NOT NULL UNIQUE,
  daily_growth_target integer NOT NULL DEFAULT 3,
  daily_product_target integer NOT NULL DEFAULT 1,
  daily_app_target integer NOT NULL DEFAULT 0,
  growth_ratio integer NOT NULL DEFAULT 80,
  auto_generate boolean NOT NULL DEFAULT false,
  last_engine_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vertical_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vertical configs viewable by everyone"
  ON public.vertical_configs FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage vertical configs"
  ON public.vertical_configs FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Seed defaults for existing verticals
INSERT INTO public.vertical_configs (vertical, daily_growth_target, daily_product_target, growth_ratio, auto_generate) VALUES
  ('privacy', 3, 1, 80, false),
  ('health', 3, 1, 80, false),
  ('education', 3, 1, 80, false),
  ('gadgets', 2, 2, 60, false),
  ('home', 3, 1, 80, false),
  ('toys', 3, 1, 80, false);

-- Add verticals assignment to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS verticals text[] NOT NULL DEFAULT '{}'::text[];

-- Index for fast product-to-vertical lookups
CREATE INDEX idx_products_verticals ON public.products USING GIN(verticals);

-- Trigger for updated_at
CREATE TRIGGER update_vertical_configs_updated_at
  BEFORE UPDATE ON public.vertical_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
