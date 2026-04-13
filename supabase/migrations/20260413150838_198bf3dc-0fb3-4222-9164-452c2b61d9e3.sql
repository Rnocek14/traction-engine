
CREATE TABLE public.product_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  link_type TEXT NOT NULL DEFAULT 'retail' CHECK (link_type IN ('retail', 'wholesale', 'supplier', 'review', 'social')),
  platform TEXT NOT NULL DEFAULT 'unknown',
  price_cents INTEGER,
  title TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_links_product_id ON public.product_links(product_id);

ALTER TABLE public.product_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Product links are viewable by everyone"
  ON public.product_links FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage product links"
  ON public.product_links FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage product links"
  ON public.product_links FOR ALL
  TO service_role USING (true) WITH CHECK (true);
