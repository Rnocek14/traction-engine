ALTER TABLE public.story_jobs 
ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_story_jobs_review_status ON public.story_jobs (review_status);