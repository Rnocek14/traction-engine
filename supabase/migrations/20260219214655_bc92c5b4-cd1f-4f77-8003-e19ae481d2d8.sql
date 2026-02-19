
-- Table for debug_persist audit snapshots
-- Write-only via service role; no client reads needed
CREATE TABLE public.story_engine_debug_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid,
  account_id text,
  debug_tag text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS (deny all by default — only service role writes)
ALTER TABLE public.story_engine_debug_runs ENABLE ROW LEVEL SECURITY;

-- Read policy for authenticated users (admin/qa inspection)
CREATE POLICY "debug_runs_select_authenticated"
  ON public.story_engine_debug_runs
  FOR SELECT
  USING (true);

-- Insert policy — service role only (edge function)
CREATE POLICY "debug_runs_insert_service_role"
  ON public.story_engine_debug_runs
  FOR INSERT
  WITH CHECK (true);

-- Index for quick lookup by job_id and debug_tag
CREATE INDEX idx_debug_runs_job_id ON public.story_engine_debug_runs (job_id);
CREATE INDEX idx_debug_runs_debug_tag ON public.story_engine_debug_runs (debug_tag) WHERE debug_tag IS NOT NULL;
CREATE INDEX idx_debug_runs_created_at ON public.story_engine_debug_runs (created_at DESC);
