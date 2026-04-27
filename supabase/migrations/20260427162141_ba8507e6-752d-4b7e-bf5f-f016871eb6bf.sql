
-- ============================================================
-- Equal-Weight Monetization Architecture: Schema + Seed
-- ============================================================

-- 1. Expand apps table with marketing fields
ALTER TABLE public.apps
  ADD COLUMN IF NOT EXISTS cta_url text,
  ADD COLUMN IF NOT EXISTS value_prop text,
  ADD COLUMN IF NOT EXISTS target_audience text,
  ADD COLUMN IF NOT EXISTS pricing_model text,
  ADD COLUMN IF NOT EXISTS readiness_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS marketing_plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS screenshots text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS hooks text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS notes text;

-- 2. Add app_id to story_jobs and content_ideas (sibling to product_id)
ALTER TABLE public.story_jobs
  ADD COLUMN IF NOT EXISTS app_id uuid REFERENCES public.apps(id) ON DELETE SET NULL;

ALTER TABLE public.content_ideas
  ADD COLUMN IF NOT EXISTS app_id uuid REFERENCES public.apps(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_story_jobs_app_id ON public.story_jobs(app_id) WHERE app_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_content_ideas_app_id ON public.content_ideas(app_id) WHERE app_id IS NOT NULL;

-- 3. Add explicit mix percentage columns to vertical_configs
--    (growth_ratio is kept for backward compat; new code reads these)
ALTER TABLE public.vertical_configs
  ADD COLUMN IF NOT EXISTS growth_pct integer NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS app_pct integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS product_pct integer NOT NULL DEFAULT 10;

-- 4. App funnel events (mirrors product_conversions for app signups)
CREATE TABLE IF NOT EXISTS public.app_funnel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  story_job_id uuid REFERENCES public.story_jobs(id) ON DELETE SET NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  source text NOT NULL DEFAULT 'manual',
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  signups integer NOT NULL DEFAULT 0,
  activations integer NOT NULL DEFAULT 0,
  paid_conversions integer NOT NULL DEFAULT 0,
  revenue_cents integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_funnel_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "App funnel events viewable by everyone"
  ON public.app_funnel_events FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage app funnel events"
  ON public.app_funnel_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service role can manage app funnel events"
  ON public.app_funnel_events FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_app_funnel_events_app_id ON public.app_funnel_events(app_id);
CREATE INDEX IF NOT EXISTS idx_app_funnel_events_date ON public.app_funnel_events(date DESC);

-- 5. Campaigns: vertical + monetization asset (app OR product) + status + 10-vid counter
CREATE TABLE IF NOT EXISTS public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  vertical text NOT NULL,
  asset_kind text NOT NULL CHECK (asset_kind IN ('app','product')),
  app_id uuid REFERENCES public.apps(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','killed','scaled','testing')),
  videos_published integer NOT NULL DEFAULT 0,
  total_clicks integer NOT NULL DEFAULT 0,
  total_conversions integer NOT NULL DEFAULT 0,
  total_revenue_cents integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT one_asset_per_campaign CHECK (
    (asset_kind = 'app' AND app_id IS NOT NULL AND product_id IS NULL)
    OR (asset_kind = 'product' AND product_id IS NOT NULL AND app_id IS NULL)
  )
);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Campaigns viewable by everyone"
  ON public.campaigns FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage campaigns"
  ON public.campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service role can manage campaigns"
  ON public.campaigns FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_campaigns_vertical ON public.campaigns(vertical);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON public.campaigns(status);

-- 6. updated_at triggers
CREATE TRIGGER trg_apps_updated_at BEFORE UPDATE ON public.apps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_app_funnel_events_updated_at BEFORE UPDATE ON public.app_funnel_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_campaigns_updated_at BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Seed the 5 launch-ready apps
INSERT INTO public.apps (name, url, cta_url, description, value_prop, target_audience, pricing_model, verticals, readiness_score, hooks, status)
VALUES
  (
    'Footprint Finder',
    'https://footprintfinder.co',
    'https://footprintfinder.co',
    'Privacy tool that finds where your personal info is exposed online and helps you remove it.',
    'See every data broker, people-search site, and public record exposing your email, phone, and address — then remove yourself with one click.',
    'Privacy-conscious adults 25-55 worried about doxxing, identity theft, and stalkers',
    'freemium',
    ARRAY['privacy']::text[],
    80,
    ARRAY[
      'Your email is on 47 broker sites. Here''s how to find them.',
      'I typed my name into this tool and almost threw my phone.',
      'Why your address is showing up in Google search results.'
    ]::text[],
    'active'
  ),
  (
    'NeuroSpark Recovery',
    'https://mind-weave-recover.lovable.app',
    'https://mind-weave-recover.lovable.app',
    'AI-guided cognitive recovery program for people rebuilding focus, memory, and mental clarity after burnout, illness, or brain fog.',
    'Daily 10-minute brain training built around your specific recovery goals — adapts as you improve.',
    'Adults recovering from long COVID, burnout, concussion, or chronic stress',
    'subscription',
    ARRAY['health']::text[],
    65,
    ARRAY[
      'I lost my focus for 8 months. This is what got it back.',
      'Brain fog is not in your head. (well it is, but...)',
      'The 10-minute drill that rebuilt my memory.'
    ]::text[],
    'active'
  ),
  (
    'SmartEdu Filtering',
    'https://smartedufiltering.lovable.app',
    'https://smartedufiltering.lovable.app',
    'Find the right college, certification, or trade program by filtering on outcomes, salary, and ROI — not marketing.',
    'Stop comparing schools by reputation. Compare them by what graduates actually earn.',
    'High school students, parents, and career changers researching education paths',
    'free',
    ARRAY['education']::text[],
    70,
    ARRAY[
      'This college costs $200k. Graduates earn $38k. Here''s how to spot it.',
      'The 3 filters every parent should use before paying tuition.',
      'How I picked a $12k program over a $80k one for the same job.'
    ]::text[],
    'active'
  ),
  (
    'Lake Geneva News',
    'https://idea-digester-spark.lovable.app',
    'https://idea-digester-spark.lovable.app',
    'Hyperlocal news aggregator and event guide for Lake Geneva, WI — restaurants, weather, things to do this weekend.',
    'Everything happening in Lake Geneva this week, in one place — without the noise.',
    'Lake Geneva residents, second-home owners, and weekend visitors',
    'free',
    ARRAY[]::text[],
    50,
    ARRAY[
      'Things to do in Lake Geneva this weekend (locals don''t want you to know #2).',
      'The 5 best restaurants in Lake Geneva — ranked by an actual local.',
      'Why Lake Geneva is the most underrated weekend trip in the Midwest.'
    ]::text[],
    'active'
  ),
  (
    'Meridian Prop Trading',
    'https://docu-guidance-guru.lovable.app',
    'https://docu-guidance-guru.lovable.app',
    'Funded trading education and challenge prep — pass prop firm evaluations and get paid to trade.',
    'The exact rules, risk model, and trade plan that pass funded challenges — without blowing the account.',
    'Aspiring traders 22-45 chasing prop firm payouts (FTMO, Apex, MyForexFunds-alternatives)',
    'one_time',
    ARRAY[]::text[],
    60,
    ARRAY[
      'I passed a $100k funded challenge. Here''s the only rule that mattered.',
      '90% of traders fail prop firms because of this one mistake.',
      'How to size positions so a bad day doesn''t kill your account.'
    ]::text[],
    'active'
  )
ON CONFLICT DO NOTHING;
