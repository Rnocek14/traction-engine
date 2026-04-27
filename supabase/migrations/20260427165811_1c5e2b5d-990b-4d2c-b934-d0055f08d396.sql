
-- ============================================================
-- COST GOVERNANCE: kill switch, spend caps, api_call_log
-- ============================================================

-- 1. system_settings: single-row table
CREATE TABLE IF NOT EXISTS public.system_settings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton       boolean NOT NULL DEFAULT true UNIQUE,
  automation_enabled         boolean NOT NULL DEFAULT true,
  daily_spend_cap_cents      integer NOT NULL DEFAULT 2000,
  per_story_cap_cents        integer NOT NULL DEFAULT 500,
  per_product_cap_cents      integer NOT NULL DEFAULT 1000,
  paused_reason              text,
  paused_at                  timestamptz,
  paused_by                  text,
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.system_settings (singleton, automation_enabled)
VALUES (true, true)
ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "system_settings_select_public"
  ON public.system_settings FOR SELECT TO public USING (true);

CREATE POLICY "system_settings_update_authenticated"
  ON public.system_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "system_settings_all_service_role"
  ON public.system_settings FOR ALL TO service_role USING (true) WITH CHECK (true);


-- 2. api_call_log
CREATE TABLE IF NOT EXISTS public.api_call_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  provider        text NOT NULL,
  model           text,
  function_name   text NOT NULL,
  operation       text,
  story_job_id    uuid,
  product_id      uuid,
  app_id          uuid,
  account_id      text,
  status          text NOT NULL DEFAULT 'success',
  cost_cents      integer NOT NULL DEFAULT 0,
  input_tokens    integer,
  output_tokens   integer,
  latency_ms      integer,
  error_message   text,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS api_call_log_created_idx ON public.api_call_log (created_at DESC);
CREATE INDEX IF NOT EXISTS api_call_log_provider_idx ON public.api_call_log (provider, created_at DESC);
CREATE INDEX IF NOT EXISTS api_call_log_story_idx ON public.api_call_log (story_job_id) WHERE story_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS api_call_log_product_idx ON public.api_call_log (product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS api_call_log_function_idx ON public.api_call_log (function_name, created_at DESC);

ALTER TABLE public.api_call_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_call_log_select_public"
  ON public.api_call_log FOR SELECT TO public USING (true);

CREATE POLICY "api_call_log_insert_authenticated"
  ON public.api_call_log FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "api_call_log_all_service_role"
  ON public.api_call_log FOR ALL TO service_role USING (true) WITH CHECK (true);


-- 3. is_automation_enabled()
CREATE OR REPLACE FUNCTION public.is_automation_enabled()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT automation_enabled FROM public.system_settings LIMIT 1), false);
$$;


-- 4. get_spend_summary()
CREATE OR REPLACE FUNCTION public.get_spend_summary()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH log_today AS (
    SELECT
      COALESCE(SUM(cost_cents), 0)::bigint AS today_cents,
      count(*) AS today_calls
    FROM public.api_call_log
    WHERE created_at >= date_trunc('day', now())
  ),
  log_7d AS (
    SELECT COALESCE(SUM(cost_cents), 0)::bigint AS cents
    FROM public.api_call_log
    WHERE created_at >= now() - interval '7 days'
  ),
  log_30d AS (
    SELECT COALESCE(SUM(cost_cents), 0)::bigint AS cents
    FROM public.api_call_log
    WHERE created_at >= now() - interval '30 days'
  ),
  by_provider AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'provider', provider,
      'cost_cents', cost_cents,
      'calls', calls
    ) ORDER BY cost_cents DESC), '[]'::jsonb) AS data
    FROM (
      SELECT provider,
             COALESCE(SUM(cost_cents),0)::bigint AS cost_cents,
             count(*) AS calls
      FROM public.api_call_log
      WHERE created_at >= now() - interval '7 days'
      GROUP BY provider
    ) p
  ),
  by_function AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'function_name', function_name,
      'cost_cents', cost_cents,
      'calls', calls
    ) ORDER BY cost_cents DESC), '[]'::jsonb) AS data
    FROM (
      SELECT function_name,
             COALESCE(SUM(cost_cents),0)::bigint AS cost_cents,
             count(*) AS calls
      FROM public.api_call_log
      WHERE created_at >= now() - interval '7 days'
      GROUP BY function_name
      ORDER BY 2 DESC
      LIMIT 10
    ) f
  ),
  daily AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'day', to_char(day, 'YYYY-MM-DD'),
      'cost_cents', cost_cents,
      'calls', calls
    ) ORDER BY day), '[]'::jsonb) AS data
    FROM (
      SELECT date_trunc('day', created_at) AS day,
             COALESCE(SUM(cost_cents),0)::bigint AS cost_cents,
             count(*) AS calls
      FROM public.api_call_log
      WHERE created_at >= now() - interval '14 days'
      GROUP BY day
    ) d
  ),
  top_stories AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'story_job_id', story_job_id,
      'cost_cents', cost_cents,
      'calls', calls
    ) ORDER BY cost_cents DESC), '[]'::jsonb) AS data
    FROM (
      SELECT story_job_id,
             COALESCE(SUM(cost_cents),0)::bigint AS cost_cents,
             count(*) AS calls
      FROM public.api_call_log
      WHERE story_job_id IS NOT NULL
        AND created_at >= now() - interval '30 days'
      GROUP BY story_job_id
      ORDER BY 2 DESC
      LIMIT 10
    ) s
  ),
  legacy AS (
    SELECT COALESCE((SELECT SUM(generation_cost_cents) FROM public.script_runs), 0)::bigint AS cents
  ),
  queues AS (
    SELECT jsonb_build_object(
      'video_jobs', (
        SELECT COALESCE(jsonb_object_agg(status, n), '{}'::jsonb)
        FROM (SELECT status, count(*) AS n FROM public.video_jobs GROUP BY status) t
      ),
      'story_jobs', (
        SELECT COALESCE(jsonb_object_agg(status, n), '{}'::jsonb)
        FROM (SELECT status, count(*) AS n FROM public.story_jobs GROUP BY status) t
      ),
      'compare_queue', (
        SELECT COALESCE(jsonb_object_agg(status, n), '{}'::jsonb)
        FROM (SELECT status, count(*) AS n FROM public.video_compare_queue GROUP BY status) t
      )
    ) AS data
  )
  SELECT jsonb_build_object(
    'today_cents',       (SELECT today_cents FROM log_today),
    'today_calls',       (SELECT today_calls FROM log_today),
    'last_7d_cents',     (SELECT cents FROM log_7d),
    'last_30d_cents',    (SELECT cents FROM log_30d),
    'legacy_total_cents',(SELECT cents FROM legacy),
    'by_provider',       (SELECT data FROM by_provider),
    'by_function',       (SELECT data FROM by_function),
    'daily',             (SELECT data FROM daily),
    'top_stories',       (SELECT data FROM top_stories),
    'queues',            (SELECT data FROM queues)
  );
$$;
