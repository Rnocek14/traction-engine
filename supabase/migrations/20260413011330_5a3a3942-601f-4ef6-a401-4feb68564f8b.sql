
-- prompt_templates: reusable prompt families
CREATE TABLE IF NOT EXISTS public.prompt_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  stage text NOT NULL CHECK (stage IN ('topic', 'script', 'hook', 'visual')),
  family text NOT NULL,
  description text,
  template_text text NOT NULL,
  system_instructions text,
  variables_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  scoring_weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  verticals text[] NOT NULL DEFAULT '{}'::text[],
  platforms text[] NOT NULL DEFAULT '{}'::text[],
  is_active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prompt_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prompt_templates_select_public" ON public.prompt_templates FOR SELECT USING (true);
CREATE POLICY "prompt_templates_insert_authenticated" ON public.prompt_templates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "prompt_templates_update_authenticated" ON public.prompt_templates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- prompt_experiments: individual prompt runs
CREATE TABLE IF NOT EXISTS public.prompt_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES public.prompt_templates(id) ON DELETE SET NULL,
  stage text NOT NULL CHECK (stage IN ('topic', 'script', 'hook', 'visual')),
  family text NOT NULL,
  vertical text,
  platform text,
  provider text,
  model text,
  account_id text,
  story_job_id uuid REFERENCES public.story_jobs(id) ON DELETE SET NULL,
  script_run_id uuid REFERENCES public.script_runs(id) ON DELETE SET NULL,
  parent_experiment_id uuid REFERENCES public.prompt_experiments(id) ON DELETE SET NULL,
  generation_round integer NOT NULL DEFAULT 1,
  prompt_text text NOT NULL,
  prompt_variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  input_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'created' CHECK (
    status IN ('created', 'generated', 'scored', 'approved', 'rejected', 'posted', 'retired')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prompt_experiments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prompt_experiments_select_public" ON public.prompt_experiments FOR SELECT USING (true);
CREATE POLICY "prompt_experiments_insert_authenticated" ON public.prompt_experiments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "prompt_experiments_update_authenticated" ON public.prompt_experiments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- prompt_scores: multi-layer scoring
CREATE TABLE IF NOT EXISTS public.prompt_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES public.prompt_experiments(id) ON DELETE CASCADE,
  score_layer text NOT NULL CHECK (score_layer IN ('preflight', 'output', 'human', 'performance')),
  overall_score numeric(5,2),
  novelty numeric(5,2),
  clarity numeric(5,2),
  specificity numeric(5,2),
  hook_strength numeric(5,2),
  visuality numeric(5,2),
  coherence numeric(5,2),
  pacing numeric(5,2),
  continuity numeric(5,2),
  postability numeric(5,2),
  confidence numeric(5,2),
  risk_score numeric(5,2),
  hard_fail boolean NOT NULL DEFAULT false,
  notes text,
  score_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  scored_by text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prompt_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prompt_scores_select_public" ON public.prompt_scores FOR SELECT USING (true);
CREATE POLICY "prompt_scores_insert_authenticated" ON public.prompt_scores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "prompt_scores_update_authenticated" ON public.prompt_scores FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- prompt_outcomes: real-world performance
CREATE TABLE IF NOT EXISTS public.prompt_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES public.prompt_experiments(id) ON DELETE CASCADE,
  story_job_id uuid REFERENCES public.story_jobs(id) ON DELETE SET NULL,
  external_post_id text,
  platform text,
  impressions integer,
  views integer,
  watch_3s_rate numeric(6,3),
  watch_15s_rate numeric(6,3),
  avg_watch_time numeric(8,2),
  ctr numeric(6,3),
  likes integer,
  comments integer,
  shares integer,
  saves integer,
  conversions integer,
  revenue numeric(12,2),
  outcome_score numeric(5,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prompt_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prompt_outcomes_select_public" ON public.prompt_outcomes FOR SELECT USING (true);
CREATE POLICY "prompt_outcomes_insert_authenticated" ON public.prompt_outcomes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "prompt_outcomes_update_authenticated" ON public.prompt_outcomes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- prompt_family_stats: aggregated routing stats
CREATE TABLE IF NOT EXISTS public.prompt_family_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage text NOT NULL,
  family text NOT NULL,
  vertical text,
  platform text,
  provider text,
  sample_size integer NOT NULL DEFAULT 0,
  avg_preflight_score numeric(5,2),
  avg_output_score numeric(5,2),
  avg_human_score numeric(5,2),
  avg_performance_score numeric(5,2),
  approval_rate numeric(6,3),
  rejection_rate numeric(6,3),
  hard_fail_rate numeric(6,3),
  last_used_at timestamptz,
  fatigue_score numeric(5,2) DEFAULT 0,
  promoted boolean NOT NULL DEFAULT false,
  retired boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.prompt_family_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prompt_family_stats_select_public" ON public.prompt_family_stats FOR SELECT USING (true);
CREATE POLICY "prompt_family_stats_insert_authenticated" ON public.prompt_family_stats FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "prompt_family_stats_update_authenticated" ON public.prompt_family_stats FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Lineage fields on story_jobs
ALTER TABLE public.story_jobs
  ADD COLUMN IF NOT EXISTS topic_experiment_id uuid REFERENCES public.prompt_experiments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS script_experiment_id uuid REFERENCES public.prompt_experiments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hook_experiment_id uuid REFERENCES public.prompt_experiments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS visual_experiment_id uuid REFERENCES public.prompt_experiments(id) ON DELETE SET NULL;

-- Lineage field on video_jobs
ALTER TABLE public.video_jobs
  ADD COLUMN IF NOT EXISTS visual_experiment_id uuid REFERENCES public.prompt_experiments(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_prompt_templates_stage_family ON public.prompt_templates(stage, family);
CREATE INDEX IF NOT EXISTS idx_prompt_experiments_stage_family ON public.prompt_experiments(stage, family);
CREATE INDEX IF NOT EXISTS idx_prompt_experiments_story_job ON public.prompt_experiments(story_job_id);
CREATE INDEX IF NOT EXISTS idx_prompt_experiments_status ON public.prompt_experiments(status);
CREATE INDEX IF NOT EXISTS idx_prompt_scores_experiment_layer ON public.prompt_scores(experiment_id, score_layer);
CREATE INDEX IF NOT EXISTS idx_prompt_outcomes_experiment ON public.prompt_outcomes(experiment_id);
CREATE INDEX IF NOT EXISTS idx_prompt_family_stats_lookup ON public.prompt_family_stats(stage, family, vertical, platform, provider);

-- Updated_at triggers
CREATE TRIGGER update_prompt_templates_updated_at BEFORE UPDATE ON public.prompt_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_prompt_experiments_updated_at BEFORE UPDATE ON public.prompt_experiments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_prompt_outcomes_updated_at BEFORE UPDATE ON public.prompt_outcomes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_prompt_family_stats_updated_at BEFORE UPDATE ON public.prompt_family_stats FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
