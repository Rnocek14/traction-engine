
CREATE TABLE public.product_unit_economics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE UNIQUE,
  retail_price_cents INTEGER NOT NULL,
  supplier_cost_cents INTEGER NOT NULL,
  shipping_cost_cents INTEGER NOT NULL DEFAULT 0,
  packaging_cost_cents INTEGER NOT NULL DEFAULT 0,
  platform_fee_pct NUMERIC(5,2) NOT NULL DEFAULT 5.00,
  payment_fee_pct NUMERIC(5,2) NOT NULL DEFAULT 2.90,
  expected_return_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 5.00,
  content_cost_per_sale_cents INTEGER NOT NULL DEFAULT 0,
  gross_margin_cents INTEGER,
  gross_margin_pct NUMERIC(5,2),
  net_margin_cents INTEGER,
  net_margin_pct NUMERIC(5,2),
  break_even_units INTEGER,
  break_even_cpa_cents INTEGER,
  break_even_roas NUMERIC(6,2),
  viability_grade TEXT CHECK (viability_grade IN ('A', 'B', 'C', 'D', 'F')),
  calculator_version TEXT NOT NULL DEFAULT 'v1',
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_unit_economics_product_id ON public.product_unit_economics(product_id);
CREATE INDEX idx_product_unit_economics_viability ON public.product_unit_economics(viability_grade);

ALTER TABLE public.product_unit_economics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Product economics viewable by everyone"
  ON public.product_unit_economics FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage product economics"
  ON public.product_unit_economics FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage product economics"
  ON public.product_unit_economics FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER update_product_unit_economics_updated_at
  BEFORE UPDATE ON public.product_unit_economics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
