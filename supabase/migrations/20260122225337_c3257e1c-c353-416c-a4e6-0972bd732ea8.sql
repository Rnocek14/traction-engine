-- Add thumbnail and spritesheet columns to video_jobs
ALTER TABLE public.video_jobs
ADD COLUMN IF NOT EXISTS thumbnail_url text,
ADD COLUMN IF NOT EXISTS spritesheet_url text,
ADD COLUMN IF NOT EXISTS openai_status text;