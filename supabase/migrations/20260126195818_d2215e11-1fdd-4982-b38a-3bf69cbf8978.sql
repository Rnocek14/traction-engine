-- Add thumbnail dimension columns for smart chain decisions
ALTER TABLE public.video_jobs 
ADD COLUMN IF NOT EXISTS thumbnail_width integer,
ADD COLUMN IF NOT EXISTS thumbnail_height integer;