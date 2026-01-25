-- RPC: get_raw_routing_tag_coverage - monitors raw tag flow and identifies unknown tags
CREATE OR REPLACE FUNCTION public.get_raw_routing_tag_coverage(
  p_days int default 7,
  p_max_rows int default 5000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cutoff timestamptz := now() - make_interval(days => p_days);
  v_result jsonb;
BEGIN
  WITH base AS (
    SELECT id, provider, auto_rated_at, raw_routing_tags
    FROM public.video_jobs
    WHERE status = 'done'
      AND auto_rated_at IS NOT NULL
      AND auto_rated_at >= v_cutoff
    ORDER BY auto_rated_at DESC
    LIMIT p_max_rows
  ),
  counts AS (
    SELECT
      count(*) AS total_rated,
      count(*) FILTER (
        WHERE raw_routing_tags IS NOT NULL
          AND array_length(raw_routing_tags, 1) > 0
      ) AS with_raw_tags
    FROM base
  ),
  tag_rows AS (
    SELECT
      b.provider,
      btrim(public.normalize_routing_tag(tag), '_') AS tag_norm
    FROM base b
    CROSS JOIN LATERAL unnest(coalesce(b.raw_routing_tags, array[]::text[])) AS tag
  ),
  valid_tags AS (
    SELECT provider, tag_norm
    FROM tag_rows
    WHERE tag_norm IS NOT NULL AND length(tag_norm) > 0
  ),
  unique_tags AS (
    SELECT count(DISTINCT tag_norm) AS unique_tag_count
    FROM valid_tags
  ),
  top_tags AS (
    SELECT tag_norm AS tag, count(*) AS count
    FROM valid_tags
    GROUP BY tag_norm
    ORDER BY count DESC
    LIMIT 20
  ),
  top_unknown_tags AS (
    SELECT v.tag_norm AS tag, count(*) AS count
    FROM valid_tags v
    LEFT JOIN public.routing_tag_allowlist a
      ON a.tag = v.tag_norm
    WHERE a.tag IS NULL
    GROUP BY v.tag_norm
    ORDER BY count DESC
    LIMIT 20
  )
  SELECT jsonb_build_object(
    'windowDays', p_days,
    'maxRows', p_max_rows,
    'totalRated', (SELECT total_rated FROM counts),
    'withRawTags', (SELECT with_raw_tags FROM counts),
    'withoutRawTags', (SELECT total_rated - with_raw_tags FROM counts),
    'pctWithRawTags', CASE
      WHEN (SELECT total_rated FROM counts) > 0
      THEN round(((SELECT with_raw_tags FROM counts)::numeric / (SELECT total_rated FROM counts)) * 100)
      ELSE 0
    END,
    'uniqueRawTags', (SELECT unique_tag_count FROM unique_tags),
    'topRawTags', (SELECT coalesce(jsonb_agg(jsonb_build_object('tag', tag, 'count', count)), '[]'::jsonb) FROM top_tags),
    'topUnknownRawTags', (SELECT coalesce(jsonb_agg(jsonb_build_object('tag', tag, 'count', count)), '[]'::jsonb) FROM top_unknown_tags)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

-- RPC: get_auto_promote_candidates_from_raw - returns promotion candidates from raw tags
CREATE OR REPLACE FUNCTION public.get_auto_promote_candidates_from_raw(
  p_days int default 7,
  p_min_count int default 40,
  p_min_providers int default 2,
  p_max_candidates int default 50,
  p_max_rows int default 20000
)
RETURNS TABLE (
  raw_tag text,
  n bigint,
  providers int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH base AS (
    SELECT provider, raw_routing_tags, auto_rated_at
    FROM public.video_jobs
    WHERE status = 'done'
      AND auto_rated_at IS NOT NULL
      AND auto_rated_at >= now() - make_interval(days => p_days)
    ORDER BY auto_rated_at DESC
    LIMIT p_max_rows
  ),
  exploded AS (
    SELECT
      b.provider,
      btrim(public.normalize_routing_tag(tag), '_') AS tag_norm
    FROM base b
    CROSS JOIN LATERAL unnest(coalesce(b.raw_routing_tags, array[]::text[])) AS tag
  ),
  filtered AS (
    SELECT e.provider, e.tag_norm
    FROM exploded e
    LEFT JOIN public.routing_tag_allowlist a
      ON a.tag = e.tag_norm
    WHERE e.tag_norm IS NOT NULL
      AND length(e.tag_norm) >= 2
      AND a.tag IS NULL
      AND e.tag_norm NOT IN (
        'video','scene','shot','camera','clip','footage','frame','image','picture','movie','film',
        'content','media','visual','the','a','an','this','that','it',
        'person','people','man','woman'
      )
  ),
  agg AS (
    SELECT
      tag_norm AS raw_tag,
      count(*) AS n,
      count(DISTINCT provider) AS providers
    FROM filtered
    GROUP BY tag_norm
  )
  SELECT raw_tag, n, providers
  FROM agg
  WHERE n >= p_min_count
    AND providers >= p_min_providers
  ORDER BY n DESC
  LIMIT p_max_candidates;
$$;