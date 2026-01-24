-- Add dual-axis human rating columns to video_jobs
ALTER TABLE public.video_jobs
ADD COLUMN IF NOT EXISTS human_match_rating INTEGER CHECK (human_match_rating >= 1 AND human_match_rating <= 5),
ADD COLUMN IF NOT EXISTS human_preference_rating INTEGER CHECK (human_preference_rating >= 1 AND human_preference_rating <= 5),
ADD COLUMN IF NOT EXISTS is_serendipity BOOLEAN NOT NULL DEFAULT FALSE;

-- Add index for serendipity collection queries
CREATE INDEX IF NOT EXISTS idx_video_jobs_serendipity ON public.video_jobs(is_serendipity) WHERE is_serendipity = TRUE;

-- Comment for clarity
COMMENT ON COLUMN public.video_jobs.human_match_rating IS 'Human rating 1-5: Did it match the prompt?';
COMMENT ON COLUMN public.video_jobs.human_preference_rating IS 'Human rating 1-5: Do I like it?';
COMMENT ON COLUMN public.video_jobs.is_serendipity IS 'True when preference high but match low - happy accident';