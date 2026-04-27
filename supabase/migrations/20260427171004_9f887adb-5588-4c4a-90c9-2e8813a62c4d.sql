-- Backfill api_call_log from script_runs (cast enum to text for comparison)
INSERT INTO public.api_call_log (
  provider, model, function_name, operation,
  story_job_id, status, cost_cents, created_at, metadata
)
SELECT
  'openai',
  'gpt-4o',
  'generate-script',
  'script_run',
  NULL,
  CASE WHEN status::text IN ('failed','error') THEN 'failed' ELSE 'success' END,
  COALESCE(NULLIF(generation_cost_cents, 0), 2),
  created_at,
  jsonb_build_object('backfill', true, 'source_table', 'script_runs', 'source_id', id, 'orig_status', status::text)
FROM public.script_runs;

-- Backfill api_call_log from video_jobs
INSERT INTO public.api_call_log (
  provider, model, function_name, operation,
  story_job_id, status, cost_cents, created_at, metadata
)
SELECT
  provider,
  NULL,
  CASE provider
    WHEN 'sora' THEN 'queue-video'
    WHEN 'runway' THEN 'queue-video-runway'
    WHEN 'luma' THEN 'queue-video-luma'
    ELSE 'queue-video'
  END,
  'video_submit',
  story_job_id,
  CASE WHEN status::text = 'failed' THEN 'failed' ELSE 'success' END,
  CASE provider
    WHEN 'sora' THEN 60
    WHEN 'runway' THEN 50
    WHEN 'luma' THEN 40
    ELSE 50
  END,
  created_at,
  jsonb_build_object('backfill', true, 'source_table', 'video_jobs', 'source_id', id, 'job_status', status::text)
FROM public.video_jobs;