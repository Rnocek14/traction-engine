ALTER TABLE public.story_jobs
  ADD COLUMN IF NOT EXISTS assembled_video_url text,
  ADD COLUMN IF NOT EXISTS assembled_status text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS assembled_at timestamptz,
  ADD COLUMN IF NOT EXISTS assembled_meta jsonb DEFAULT '{}'::jsonb;