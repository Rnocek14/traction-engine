-- Add canonical pair columns for deduplication
ALTER TABLE public.video_comparisons
  ADD COLUMN IF NOT EXISTS job_min uuid,
  ADD COLUMN IF NOT EXISTS job_max uuid,
  ADD COLUMN IF NOT EXISTS winner_job uuid;

-- Backfill existing rows
UPDATE public.video_comparisons
SET job_min = LEAST(job_a, job_b),
    job_max = GREATEST(job_a, job_b),
    winner_job = CASE 
      WHEN winner = 'A' THEN job_a 
      WHEN winner = 'B' THEN job_b 
      ELSE NULL 
    END
WHERE job_min IS NULL;

-- Add NOT NULL constraints (after backfill)
ALTER TABLE public.video_comparisons
  ALTER COLUMN job_min SET NOT NULL,
  ALTER COLUMN job_max SET NOT NULL;

-- Add unique index to prevent duplicate comparisons
CREATE UNIQUE INDEX IF NOT EXISTS video_comparisons_unique_pair
  ON public.video_comparisons(job_min, job_max, prompt_hash);

-- Drop the overly permissive insert policy and create a restrictive one
DROP POLICY IF EXISTS "video_comparisons_insert_service_role" ON public.video_comparisons;

-- Comment for winner_job
COMMENT ON COLUMN public.video_comparisons.winner_job IS 'UUID of winning job (null for tie)';