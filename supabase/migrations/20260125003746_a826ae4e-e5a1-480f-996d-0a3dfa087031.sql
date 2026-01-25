-- Create a SQL normalizer function that matches frontend logic
CREATE OR REPLACE FUNCTION public.normalize_routing_tag(p_tag text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT trim(both '_' from
    regexp_replace(
      regexp_replace(
        regexp_replace(
          lower(trim(coalesce(p_tag, ''))),
          '[\s-]+', '_', 'g'
        ),
        '[^a-z0-9_]', '', 'g'
      ),
      '_+', '_', 'g'
    )
  );
$$;

-- Rewrite get_routing_tag_coverage with:
-- 1. Correct "general" detection using normalize_routing_tag
-- 2. Bounded CTE using p_max_rows
-- 3. Proper reuse of base CTE for all aggregations
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
BEGIN
  v_cutoff := now() - (p_days || ' days')::interval;

  -- Use CTE to bound rows once and reuse
  WITH base AS (
    SELECT id, auto_routing_tags
    FROM video_jobs
    WHERE status = 'done'
      AND auto_rated_at IS NOT NULL
      AND auto_rated_at >= v_cutoff
    ORDER BY auto_rated_at DESC
    LIMIT p_max_rows
  ),
  counts AS (
    SELECT
      count(*) AS total_rated,
      count(*) FILTER (WHERE auto_routing_tags IS NOT NULL AND array_length(auto_routing_tags, 1) > 0) AS with_tags
    FROM base
  ),
  general_count AS (
    -- A job is "general" if NO tag survives normalization
    SELECT count(*) AS cnt
    FROM base b
    WHERE NOT EXISTS (
      SELECT 1
      FROM unnest(coalesce(b.auto_routing_tags, array[]::text[])) t(tag)
      WHERE length(normalize_routing_tag(tag)) > 0
    )
  ),
  free_tag_count AS (
    SELECT count(*) AS cnt
    FROM base
    CROSS JOIN LATERAL unnest(auto_routing_tags) AS tag
    WHERE tag LIKE 'x_%'
  ),
  top_kept AS (
    SELECT tag, count(*) AS count
    FROM base
    CROSS JOIN LATERAL unnest(auto_routing_tags) AS tag
    WHERE tag NOT LIKE 'x_%'
    GROUP BY tag
    ORDER BY count DESC
    LIMIT 15
  ),
  top_free AS (
    SELECT tag, count(*) AS count
    FROM base
    CROSS JOIN LATERAL unnest(auto_routing_tags) AS tag
    WHERE tag LIKE 'x_%'
    GROUP BY tag
    ORDER BY count DESC
    LIMIT 15
  )
  SELECT jsonb_build_object(
    'totalRated', (SELECT total_rated FROM counts),
    'withTags', (SELECT with_tags FROM counts),
    'withoutTags', (SELECT total_rated - with_tags FROM counts),
    'pctWithTags', CASE 
      WHEN (SELECT total_rated FROM counts) > 0 
      THEN round(((SELECT with_tags FROM counts)::numeric / (SELECT total_rated FROM counts)) * 100)
      ELSE 0 
    END,
    'generalClusterPct', CASE 
      WHEN (SELECT total_rated FROM counts) > 0 
      THEN round(((SELECT cnt FROM general_count)::numeric / (SELECT total_rated FROM counts)) * 100)
      ELSE 0 
    END,
    'totalGeneral', (SELECT cnt FROM general_count),
    'freeTagCount', (SELECT cnt FROM free_tag_count),
    'topKept', (SELECT coalesce(jsonb_agg(jsonb_build_object('tag', tag, 'count', count)), '[]'::jsonb) FROM top_kept),
    'topFree', (SELECT coalesce(jsonb_agg(jsonb_build_object('tag', tag, 'count', count)), '[]'::jsonb) FROM top_free)
  ) INTO v_result;

  RETURN v_result;
END;
$$;