-- Create routing_tag_allowlist table for data-driven tag promotion
CREATE TABLE IF NOT EXISTS public.routing_tag_allowlist (
  tag text PRIMARY KEY,
  added_by uuid NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'manual', -- 'manual' | 'auto'
  note text NULL
);

-- Enable RLS
ALTER TABLE public.routing_tag_allowlist ENABLE ROW LEVEL SECURITY;

-- Read access for authenticated users
CREATE POLICY "routing_tag_allowlist_select_authenticated"
ON public.routing_tag_allowlist
FOR SELECT
TO authenticated
USING (true);

-- Insert/update only via service role (edge functions)
CREATE POLICY "routing_tag_allowlist_insert_service_role"
ON public.routing_tag_allowlist
FOR INSERT
WITH CHECK (true);

CREATE POLICY "routing_tag_allowlist_update_service_role"
ON public.routing_tag_allowlist
FOR UPDATE
USING (true)
WITH CHECK (true);

-- Fix the RPC with proper underscore trimming and NULL safety
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
    -- A job is "general" if NO tag survives normalization (including underscore trimming)
    SELECT count(*) AS cnt
    FROM base b
    WHERE NOT EXISTS (
      SELECT 1
      FROM unnest(coalesce(b.auto_routing_tags, array[]::text[])) t(tag)
      WHERE length(btrim(normalize_routing_tag(tag), '_')) > 0
    )
  ),
  free_tag_count AS (
    SELECT coalesce(count(*), 0) AS cnt
    FROM base
    CROSS JOIN LATERAL unnest(coalesce(auto_routing_tags, array[]::text[])) AS tag
    WHERE tag LIKE 'x_%'
  ),
  top_kept AS (
    SELECT tag, count(*) AS count
    FROM base
    CROSS JOIN LATERAL unnest(coalesce(auto_routing_tags, array[]::text[])) AS tag
    WHERE tag NOT LIKE 'x_%'
    GROUP BY tag
    ORDER BY count DESC
    LIMIT 15
  ),
  top_free AS (
    SELECT tag, count(*) AS count
    FROM base
    CROSS JOIN LATERAL unnest(coalesce(auto_routing_tags, array[]::text[])) AS tag
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