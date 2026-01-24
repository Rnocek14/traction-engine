-- RPC 1: Get cron job status for comparison pipeline jobs
CREATE OR REPLACE FUNCTION public.get_cron_status()
RETURNS TABLE (
  jobname text,
  schedule text,
  active boolean,
  last_start timestamptz,
  last_end timestamptz,
  last_status text,
  last_return_message text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    j.jobname,
    j.schedule,
    j.active,
    r.start_time as last_start,
    r.end_time as last_end,
    r.status as last_status,
    r.return_message as last_return_message
  FROM cron.job j
  LEFT JOIN LATERAL (
    SELECT *
    FROM cron.job_run_details d
    WHERE d.jobid = j.jobid
    ORDER BY d.start_time DESC
    LIMIT 1
  ) r ON true
  WHERE j.jobname IN ('queue-comparisons-10m','process-compare-queue-3m')
  ORDER BY j.jobname;
$$;

-- RPC 2: Get compare queue health metrics
CREATE OR REPLACE FUNCTION public.get_compare_queue_health()
RETURNS TABLE (
  pending_count bigint,
  running_count bigint,
  failed_count bigint,
  done_count bigint,
  oldest_pending_age_seconds bigint,
  stale_running_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH counts AS (
    SELECT
      count(*) FILTER (WHERE status='pending') as pending_count,
      count(*) FILTER (WHERE status='running') as running_count,
      count(*) FILTER (WHERE status='failed') as failed_count,
      count(*) FILTER (WHERE status='done') as done_count
    FROM public.video_compare_queue
  ),
  oldest AS (
    SELECT
      COALESCE(EXTRACT(EPOCH FROM (now() - min(created_at)))::bigint, 0) as oldest_pending_age_seconds
    FROM public.video_compare_queue
    WHERE status='pending'
  ),
  stale AS (
    SELECT
      count(*)::bigint as stale_running_count
    FROM public.video_compare_queue
    WHERE status='running'
      AND started_at IS NOT NULL
      AND started_at < (now() - interval '15 minutes')
  )
  SELECT
    counts.pending_count,
    counts.running_count,
    counts.failed_count,
    counts.done_count,
    oldest.oldest_pending_age_seconds,
    stale.stale_running_count
  FROM counts, oldest, stale;
$$;