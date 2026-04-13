
-- Feedback loop table: tracks which scraped insights led to which outcomes
CREATE TABLE public.insight_performance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scraped_insight_id UUID NOT NULL REFERENCES public.scraped_insights(id) ON DELETE CASCADE,
  story_job_id UUID NOT NULL REFERENCES public.story_jobs(id) ON DELETE CASCADE,
  outcome_score INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scraped_insight_id, story_job_id)
);

ALTER TABLE public.insight_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "insight_performance_select_public"
  ON public.insight_performance FOR SELECT
  TO public USING (true);

CREATE POLICY "insight_performance_insert_service"
  ON public.insight_performance FOR INSERT
  TO service_role WITH CHECK (true);

CREATE INDEX idx_insight_perf_insight ON public.insight_performance(scraped_insight_id);
CREATE INDEX idx_insight_perf_score ON public.insight_performance(outcome_score DESC NULLS LAST);
