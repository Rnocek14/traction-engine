
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS candidate_quality_score integer DEFAULT 0;

ALTER TABLE public.product_images
ADD COLUMN IF NOT EXISTS image_match_verdict text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS image_match_confidence integer DEFAULT 0;
