-- Add auto-rating columns to video_jobs
ALTER TABLE public.video_jobs
  ADD COLUMN IF NOT EXISTS auto_match_score integer,
  ADD COLUMN IF NOT EXISTS auto_quality_score integer,
  ADD COLUMN IF NOT EXISTS auto_overall_score integer,
  ADD COLUMN IF NOT EXISTS auto_confidence numeric(3,2),
  ADD COLUMN IF NOT EXISTS auto_rated_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_rater_version text,
  ADD COLUMN IF NOT EXISTS auto_reasons text[],
  ADD COLUMN IF NOT EXISTS human_rating_override boolean DEFAULT false;

-- Add source tracking to prompt_learnings to distinguish auto vs human
ALTER TABLE public.prompt_learnings
  ADD COLUMN IF NOT EXISTS learning_source text DEFAULT 'human';

-- Add index for finding unrated videos
CREATE INDEX IF NOT EXISTS idx_video_jobs_auto_rating_pending 
  ON public.video_jobs (status, auto_rated_at) 
  WHERE status = 'done' AND auto_rated_at IS NULL;

COMMENT ON COLUMN public.video_jobs.auto_match_score IS 'VLM-scored prompt adherence (0-100)';
COMMENT ON COLUMN public.video_jobs.auto_quality_score IS 'VLM-scored visual quality (0-100)';
COMMENT ON COLUMN public.video_jobs.auto_overall_score IS 'Combined score: 0.6*match + 0.4*quality';
COMMENT ON COLUMN public.video_jobs.auto_confidence IS 'VLM confidence in rating (0-1)';
COMMENT ON COLUMN public.video_jobs.human_rating_override IS 'True if human rating should override auto-learning';