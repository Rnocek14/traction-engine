CREATE OR REPLACE FUNCTION public.get_upcoming_work_by_account()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH story_pending AS (
    SELECT
      COALESCE(account_id, '(unassigned)') AS account_id,
      count(*) FILTER (WHERE status::text = 'draft')      AS stories_draft,
      count(*) FILTER (WHERE status::text = 'generating') AS stories_generating,
      count(*) FILTER (WHERE status::text = 'partial')    AS stories_partial,
      count(*) FILTER (WHERE status::text IN ('draft','generating','partial')) AS stories_total,
      min(created_at) FILTER (WHERE status::text IN ('draft','generating','partial')) AS oldest_pending_at
    FROM public.story_jobs
    GROUP BY 1
  ),
  video_pending AS (
    SELECT
      COALESCE(s.account_id, '(unassigned)') AS account_id,
      count(*) FILTER (WHERE v.status IN ('queued','running')) AS videos_active,
      count(*) FILTER (WHERE v.status = 'queued')              AS videos_queued,
      count(*) FILTER (WHERE v.status = 'running')             AS videos_running,
      sum(CASE v.provider WHEN 'sora' THEN 60 WHEN 'runway' THEN 50 WHEN 'luma' THEN 40 ELSE 50 END)
        FILTER (WHERE v.status IN ('queued','running')) AS videos_active_est_cents
    FROM public.video_jobs v
    LEFT JOIN public.story_jobs s ON s.id = v.story_job_id
    GROUP BY 1
  ),
  ideas_pending AS (
    SELECT
      COALESCE(account_id, '(unassigned)') AS account_id,
      count(*) FILTER (WHERE status = 'proposed') AS ideas_proposed
    FROM public.content_ideas
    GROUP BY 1
  ),
  merged AS (
    SELECT
      COALESCE(s.account_id, v.account_id, i.account_id) AS account_id,
      COALESCE(s.stories_draft, 0)      AS stories_draft,
      COALESCE(s.stories_generating, 0) AS stories_generating,
      COALESCE(s.stories_partial, 0)    AS stories_partial,
      COALESCE(s.stories_total, 0)      AS stories_total,
      s.oldest_pending_at,
      COALESCE(v.videos_active, 0)      AS videos_active,
      COALESCE(v.videos_queued, 0)      AS videos_queued,
      COALESCE(v.videos_running, 0)     AS videos_running,
      COALESCE(v.videos_active_est_cents, 0) AS videos_active_est_cents,
      COALESCE(i.ideas_proposed, 0)     AS ideas_proposed,
      -- worst-case spend if every pending story produced ~3 videos avg ($0.55 ea) + script ($0.02)
      (COALESCE(s.stories_total,0) * (3 * 55 + 2)) + COALESCE(v.videos_active_est_cents, 0) AS worst_case_cents
    FROM story_pending s
    FULL OUTER JOIN video_pending v ON v.account_id = s.account_id
    FULL OUTER JOIN ideas_pending i ON i.account_id = COALESCE(s.account_id, v.account_id)
  )
  SELECT jsonb_build_object(
    'totals', jsonb_build_object(
      'accounts_with_backlog', count(*) FILTER (WHERE stories_total + videos_active + ideas_proposed > 0),
      'stories_pending', COALESCE(SUM(stories_total), 0),
      'videos_active',   COALESCE(SUM(videos_active), 0),
      'ideas_proposed',  COALESCE(SUM(ideas_proposed), 0),
      'worst_case_cents', COALESCE(SUM(worst_case_cents), 0)
    ),
    'accounts', COALESCE(jsonb_agg(jsonb_build_object(
      'account_id', account_id,
      'stories_draft', stories_draft,
      'stories_generating', stories_generating,
      'stories_partial', stories_partial,
      'stories_total', stories_total,
      'oldest_pending_at', oldest_pending_at,
      'videos_active', videos_active,
      'videos_queued', videos_queued,
      'videos_running', videos_running,
      'videos_active_est_cents', videos_active_est_cents,
      'ideas_proposed', ideas_proposed,
      'worst_case_cents', worst_case_cents
    ) ORDER BY worst_case_cents DESC, stories_total DESC) FILTER (WHERE stories_total + videos_active + ideas_proposed > 0), '[]'::jsonb)
  )
  FROM merged;
$$;

GRANT EXECUTE ON FUNCTION public.get_upcoming_work_by_account() TO anon, authenticated, service_role;