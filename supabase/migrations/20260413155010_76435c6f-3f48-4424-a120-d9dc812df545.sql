
-- Add verification evidence fields to product_links
ALTER TABLE public.product_links
  ADD COLUMN IF NOT EXISTS match_confidence integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS validation_status text DEFAULT 'pending'
    CHECK (validation_status IN ('verified', 'probable', 'candidate', 'rejected', 'pending')),
  ADD COLUMN IF NOT EXISTS validation_reasons text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS matched_tokens text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS distinctive_tokens_matched text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ai_verdict boolean,
  ADD COLUMN IF NOT EXISTS ai_confidence integer,
  ADD COLUMN IF NOT EXISTS fetch_method text DEFAULT 'native',
  ADD COLUMN IF NOT EXISTS extracted_product_name text,
  ADD COLUMN IF NOT EXISTS structured_price_cents integer,
  ADD COLUMN IF NOT EXISTS schema_type text,
  ADD COLUMN IF NOT EXISTS canonical_url text,
  ADD COLUMN IF NOT EXISTS content_quality_score integer,
  ADD COLUMN IF NOT EXISTS evidence_summary jsonb DEFAULT '{}';

-- Index for filtering by validation status
CREATE INDEX IF NOT EXISTS idx_product_links_validation_status 
  ON public.product_links(validation_status);

-- Update existing verified links to 'verified' status with confidence 70
UPDATE public.product_links 
  SET validation_status = 'verified', match_confidence = 70 
  WHERE verified = true AND validation_status = 'pending';
