-- Add routing audit columns to video_jobs for tracking routing decisions
ALTER TABLE public.video_jobs
ADD COLUMN IF NOT EXISTS routed_provider text,
ADD COLUMN IF NOT EXISTS routing_source text,
ADD COLUMN IF NOT EXISTS routing_confidence numeric,
ADD COLUMN IF NOT EXISTS routing_cluster_key text,
ADD COLUMN IF NOT EXISTS routing_reason text;

-- Create atomic claim function for compare queue (FOR UPDATE SKIP LOCKED)
CREATE OR REPLACE FUNCTION public.claim_compare_queue(p_limit integer)
RETURNS SETOF video_compare_queue
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cte AS (
    SELECT id
    FROM video_compare_queue
    WHERE status = 'pending'
    ORDER BY priority DESC, created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE video_compare_queue q
  SET status = 'running', started_at = now()
  FROM cte
  WHERE q.id = cte.id
  RETURNING q.*;
$$;

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION public.claim_compare_queue(integer) TO service_role;