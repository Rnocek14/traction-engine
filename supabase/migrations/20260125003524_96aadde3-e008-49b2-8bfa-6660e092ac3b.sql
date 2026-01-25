-- RPC: get_routing_tag_coverage
-- Returns tag coverage stats for the routing analytics dashboard
-- Uses text[] properly with unnest() instead of jsonb functions

CREATE OR REPLACE FUNCTION public.get_routing_tag_coverage(
  p_days integer DEFAULT 7,
  p_max_rows integer DEFAULT 5000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_cutoff timestamptz;
  v_total_rated bigint;
  v_with_tags bigint;
  v_general_count bigint;
  v_free_tag_count bigint;
BEGIN
  v_cutoff := now() - (p_days || ' days')::interval;

  -- Count totals
  SELECT 
    count(*),
    count(*) FILTER (WHERE auto_routing_tags IS NOT NULL AND array_length(auto_routing_tags, 1) > 0)
  INTO v_total_rated, v_with_tags
  FROM video_jobs
  WHERE status = 'done'
    AND auto_rated_at IS NOT NULL
    AND auto_rated_at >= v_cutoff;

  -- Count jobs in "general" cluster (empty or null tags after normalization)
  -- A job is "general" if it has no tags or all tags are empty after cleanup
  SELECT count(*)
  INTO v_general_count
  FROM video_jobs
  WHERE status = 'done'
    AND auto_rated_at IS NOT NULL
    AND auto_rated_at >= v_cutoff
    AND (
      auto_routing_tags IS NULL 
      OR array_length(auto_routing_tags, 1) IS NULL
      OR array_length(auto_routing_tags, 1) = 0
    );

  -- Count free tags (x_ prefixed)
  SELECT coalesce(count(*), 0)
  INTO v_free_tag_count
  FROM video_jobs
  CROSS JOIN LATERAL unnest(auto_routing_tags) AS tag
  WHERE status = 'done'
    AND auto_rated_at IS NOT NULL
    AND auto_rated_at >= v_cutoff
    AND tag LIKE 'x_%';

  -- Build result
  v_result := jsonb_build_object(
    'totalRated', v_total_rated,
    'withTags', v_with_tags,
    'withoutTags', v_total_rated - v_with_tags,
    'pctWithTags', CASE WHEN v_total_rated > 0 THEN round((v_with_tags::numeric / v_total_rated) * 100) ELSE 0 END,
    'generalClusterPct', CASE WHEN v_total_rated > 0 THEN round((v_general_count::numeric / v_total_rated) * 100) ELSE 0 END,
    'totalGeneral', v_general_count,
    'freeTagCount', v_free_tag_count,
    'topKept', (
      SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
      FROM (
        SELECT tag, count(*) as count
        FROM video_jobs
        CROSS JOIN LATERAL unnest(auto_routing_tags) AS tag
        WHERE status = 'done'
          AND auto_rated_at IS NOT NULL
          AND auto_rated_at >= v_cutoff
          AND tag NOT LIKE 'x_%'
        GROUP BY tag
        ORDER BY count DESC
        LIMIT 15
      ) t
    ),
    'topFree', (
      SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
      FROM (
        SELECT tag, count(*) as count
        FROM video_jobs
        CROSS JOIN LATERAL unnest(auto_routing_tags) AS tag
        WHERE status = 'done'
          AND auto_rated_at IS NOT NULL
          AND auto_rated_at >= v_cutoff
          AND tag LIKE 'x_%'
        GROUP BY tag
        ORDER BY count DESC
        LIMIT 15
      ) t
    )
  );

  RETURN v_result;
END;
$$;