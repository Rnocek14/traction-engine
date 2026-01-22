-- Add settings column to video_jobs for storing resolution, aspect, duration, etc.
ALTER TABLE public.video_jobs
ADD COLUMN IF NOT EXISTS settings jsonb DEFAULT '{}'::jsonb;

-- Add index for efficient querying of settings
CREATE INDEX IF NOT EXISTS video_jobs_settings_gin
ON public.video_jobs
USING gin (settings);