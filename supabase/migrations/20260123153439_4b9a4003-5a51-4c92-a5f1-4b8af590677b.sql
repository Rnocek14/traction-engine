-- Add columns for assembled reel tracking
ALTER TABLE public.script_runs
ADD COLUMN IF NOT EXISTS assembled_video_url TEXT,
ADD COLUMN IF NOT EXISTS assembled_status TEXT DEFAULT 'none',
ADD COLUMN IF NOT EXISTS assembled_meta JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS assembled_at TIMESTAMP WITH TIME ZONE;

-- Add check constraint for valid assembled_status values
ALTER TABLE public.script_runs
ADD CONSTRAINT check_assembled_status 
CHECK (assembled_status IN ('none', 'queued', 'rendering', 'succeeded', 'failed'));

-- Add index for filtering by assembly status
CREATE INDEX IF NOT EXISTS idx_script_runs_assembled_status 
ON public.script_runs(assembled_status) 
WHERE assembled_status != 'none';