
-- Create product_images table for multiple reference images per product
CREATE TABLE public.product_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'ai_search',
  label TEXT DEFAULT 'hero',
  is_primary BOOLEAN NOT NULL DEFAULT false,
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups by product
CREATE INDEX idx_product_images_product_id ON public.product_images(product_id);

-- Ensure only one primary image per product
CREATE UNIQUE INDEX idx_product_images_primary ON public.product_images(product_id) WHERE is_primary = true;

-- Enable RLS
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Product images are viewable by everyone"
  ON public.product_images FOR SELECT USING (true);

-- Service role handles writes (via edge functions)
CREATE POLICY "Service role can manage product images"
  ON public.product_images FOR ALL
  TO service_role USING (true) WITH CHECK (true);
