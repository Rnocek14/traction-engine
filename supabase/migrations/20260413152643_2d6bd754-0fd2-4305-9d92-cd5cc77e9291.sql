
CREATE TABLE public.product_suppliers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  supplier_name TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'unknown',
  supplier_url TEXT,
  unit_cost_cents INTEGER,
  shipping_cost_cents INTEGER,
  shipping_country TEXT DEFAULT 'CN',
  target_market TEXT DEFAULT 'US',
  processing_days INTEGER,
  delivery_days INTEGER,
  moq INTEGER DEFAULT 1,
  reliability_score INTEGER CHECK (reliability_score BETWEEN 1 AND 5),
  defect_risk INTEGER CHECK (defect_risk BETWEEN 1 AND 5),
  communication_score INTEGER CHECK (communication_score BETWEEN 1 AND 5),
  stock_status TEXT NOT NULL DEFAULT 'unknown' CHECK (stock_status IN ('in_stock', 'low_stock', 'out_of_stock', 'unknown')),
  return_policy TEXT,
  expected_return_rate_pct NUMERIC(5,2) DEFAULT 0,
  overall_supplier_score INTEGER,
  verification_status TEXT NOT NULL DEFAULT 'estimated' CHECK (verification_status IN ('estimated', 'partially_verified', 'verified')),
  verified_at TIMESTAMPTZ,
  notes TEXT,
  is_preferred BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_suppliers_product_id ON public.product_suppliers(product_id);

ALTER TABLE public.product_suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Product suppliers viewable by everyone"
  ON public.product_suppliers FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage product suppliers"
  ON public.product_suppliers FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage product suppliers"
  ON public.product_suppliers FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER update_product_suppliers_updated_at
  BEFORE UPDATE ON public.product_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
