-- Create RPC to get routing allowlist health metrics
CREATE OR REPLACE FUNCTION public.get_routing_allowlist_health()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH counts AS (
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE source = 'auto') AS auto_total,
      count(*) FILTER (WHERE source = 'manual') AS manual_total
    FROM routing_tag_allowlist
  ),
  recent AS (
    SELECT
      count(*) AS promoted_last_24h,
      max(added_at) AS last_auto_promote_at
    FROM routing_tag_allowlist
    WHERE source = 'auto'
      AND added_at >= now() - interval '24 hours'
  ),
  latest AS (
    SELECT coalesce(
      jsonb_agg(jsonb_build_object('tag', tag, 'added_at', added_at, 'note', note) ORDER BY added_at DESC),
      '[]'::jsonb
    ) AS last_promoted
    FROM (
      SELECT tag, added_at, note
      FROM routing_tag_allowlist
      WHERE source = 'auto'
      ORDER BY added_at DESC
      LIMIT 20
    ) t
  )
  SELECT jsonb_build_object(
    'allowlistTotal', (SELECT total FROM counts),
    'allowlistAutoTotal', (SELECT auto_total FROM counts),
    'allowlistManualTotal', (SELECT manual_total FROM counts),
    'promotedLast24h', (SELECT promoted_last_24h FROM recent),
    'lastAutoPromoteAt', (SELECT last_auto_promote_at FROM recent),
    'lastPromoted', (SELECT last_promoted FROM latest)
  );
$$;