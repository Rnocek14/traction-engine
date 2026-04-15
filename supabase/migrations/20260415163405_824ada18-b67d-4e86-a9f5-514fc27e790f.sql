
-- Add enrichment columns to product_links
ALTER TABLE public.product_links
  ADD COLUMN IF NOT EXISTS source_title_full text,
  ADD COLUMN IF NOT EXISTS source_brand text,
  ADD COLUMN IF NOT EXISTS source_features text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source_image_urls text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source_specs jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source_enriched_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_enrichment_status text DEFAULT 'pending';
