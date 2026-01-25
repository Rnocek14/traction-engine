-- Create RPC to check for cron auth failures (401s) in the last 24h
CREATE OR REPLACE FUNCTION public.get_cron_auth_failures()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH failures AS (
    SELECT
      r.created,
      r.status_code,
      q.url
    FROM net._http_response r
    JOIN net.http_request_queue q ON q.id = r.id
    WHERE r.status_code = 401
      AND r.created >= now() - interval '24 hours'
      AND q.url LIKE '%supabase.co/functions/v1/%'
    ORDER BY r.created DESC
    LIMIT 50
  ),
  counts AS (
    SELECT
      count(*) AS total_failures,
      count(DISTINCT url) AS affected_endpoints
    FROM failures
  ),
  recent AS (
    SELECT coalesce(
      jsonb_agg(jsonb_build_object(
        'url', regexp_replace(url, '.*/functions/v1/', ''),
        'at', created
      ) ORDER BY created DESC),
      '[]'::jsonb
    ) AS recent_failures
    FROM (SELECT * FROM failures LIMIT 10) t
  )
  SELECT jsonb_build_object(
    'totalFailures24h', (SELECT total_failures FROM counts),
    'affectedEndpoints', (SELECT affected_endpoints FROM counts),
    'recentFailures', (SELECT recent_failures FROM recent),
    'hasFailures', (SELECT total_failures > 0 FROM counts)
  );
$$;