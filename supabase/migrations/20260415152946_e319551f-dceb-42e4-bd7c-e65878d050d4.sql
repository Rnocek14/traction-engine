-- Add missing validation columns to product_links
ALTER TABLE public.product_links
  ADD COLUMN IF NOT EXISTS matched_attributes jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS mismatched_attributes jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS canonical_snapshot jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS source_snapshot jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS validation_version text,
  ADD COLUMN IF NOT EXISTS ai_reasoning text;