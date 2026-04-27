-- 1. app_angles table
CREATE TABLE IF NOT EXISTS public.app_angles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL,
  name text NOT NULL,
  emotion text NOT NULL DEFAULT 'curiosity', -- fear | curiosity | value | relatable | social_proof | aspiration
  hypothesis text,
  hook_examples text[] NOT NULL DEFAULT '{}',
  cta_style text NOT NULL DEFAULT 'soft', -- soft | direct | urgent | none
  target_audience text,
  status text NOT NULL DEFAULT 'testing', -- testing | winner | loser | paused
  videos_count integer NOT NULL DEFAULT 0,
  avg_outcome_score numeric,
  total_clicks integer NOT NULL DEFAULT 0,
  total_signups integer NOT NULL DEFAULT 0,
  total_revenue_cents integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_angles_app_id ON public.app_angles(app_id);
CREATE INDEX IF NOT EXISTS idx_app_angles_status ON public.app_angles(status);

ALTER TABLE public.app_angles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "App angles viewable by everyone"
  ON public.app_angles FOR SELECT TO public USING (true);

CREATE POLICY "Authenticated can manage app angles"
  ON public.app_angles FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage app angles"
  ON public.app_angles FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER update_app_angles_updated_at
  BEFORE UPDATE ON public.app_angles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Link app_angle_id into story_jobs, content_ideas, campaigns
ALTER TABLE public.story_jobs ADD COLUMN IF NOT EXISTS app_angle_id uuid;
ALTER TABLE public.content_ideas ADD COLUMN IF NOT EXISTS app_angle_id uuid;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS app_angle_id uuid;

CREATE INDEX IF NOT EXISTS idx_story_jobs_app_angle_id ON public.story_jobs(app_angle_id);
CREATE INDEX IF NOT EXISTS idx_content_ideas_app_angle_id ON public.content_ideas(app_angle_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_app_angle_id ON public.campaigns(app_angle_id);

-- 3. Vertical assignment for the 3 ready apps
UPDATE public.apps SET verticals = ARRAY['privacy']::text[]
  WHERE name ILIKE '%footprint finder%';

UPDATE public.apps SET verticals = ARRAY['health']::text[]
  WHERE name ILIKE '%neurospark%';

UPDATE public.apps SET verticals = ARRAY['education']::text[]
  WHERE name ILIKE '%smartedu%';

-- Lake Geneva + Meridian: explicitly leave empty (parked)
UPDATE public.apps SET verticals = ARRAY[]::text[], notes = COALESCE(notes,'') || ' [PARKED — needs Local/Finance vertical]'
  WHERE (name ILIKE '%lake geneva%' OR name ILIKE '%meridian%')
  AND (verticals IS NULL OR cardinality(verticals) = 0);

-- 4. Seed starter angles for the 3 ready apps
INSERT INTO public.app_angles (app_id, name, emotion, hypothesis, hook_examples, cta_style, target_audience, status)
SELECT a.id, 'Privacy Fear', 'fear',
  'People panic when shown how exposed their personal data is — fear converts to action.',
  ARRAY['Your email is on 45 broker sites','Anyone can find your home address in 12 seconds','I typed my name and found my SSN'],
  'direct',
  'Adults 25-45 who feel uneasy about digital privacy',
  'testing'
FROM public.apps a WHERE a.name ILIKE '%footprint finder%'
ON CONFLICT DO NOTHING;

INSERT INTO public.app_angles (app_id, name, emotion, hypothesis, hook_examples, cta_style, target_audience, status)
SELECT a.id, 'Curiosity Reveal', 'curiosity',
  'Showing what data brokers know about you triggers curiosity → click.',
  ARRAY['What your phone secretly knows about you','I checked what data brokers had on me','The internet has a file on you'],
  'soft',
  'Tech-curious adults',
  'testing'
FROM public.apps a WHERE a.name ILIKE '%footprint finder%'
ON CONFLICT DO NOTHING;

INSERT INTO public.app_angles (app_id, name, emotion, hypothesis, hook_examples, cta_style, target_audience, status)
SELECT a.id, 'Relatable Struggle', 'relatable',
  'Naming the focus problem creates instant identification — viewer thinks "that''s me".',
  ARRAY['Why you can''t finish anything anymore','Your brain isn''t broken, it''s overstimulated','I opened my phone to set a timer and forgot why'],
  'soft',
  'Burned-out adults 22-40',
  'testing'
FROM public.apps a WHERE a.name ILIKE '%neurospark%'
ON CONFLICT DO NOTHING;

INSERT INTO public.app_angles (app_id, name, emotion, hypothesis, hook_examples, cta_style, target_audience, status)
SELECT a.id, 'Quick Value', 'value',
  'A 5-minute fix for a real cognitive symptom builds immediate trust.',
  ARRAY['Reset your focus in 5 minutes','3 things to do before you open your phone','One drill that calms ADHD spirals'],
  'direct',
  'Adults seeking focus/recovery tools',
  'testing'
FROM public.apps a WHERE a.name ILIKE '%neurospark%'
ON CONFLICT DO NOTHING;

INSERT INTO public.app_angles (app_id, name, emotion, hypothesis, hook_examples, cta_style, target_audience, status)
SELECT a.id, 'Parental Concern', 'fear',
  'Parents who see real examples of harmful content slipping past filters convert to action.',
  ARRAY['What YouTube Kids actually shows your child','The filter you trust isn''t blocking this','I tested 3 parental apps — only one worked'],
  'direct',
  'Parents of kids 5-14',
  'testing'
FROM public.apps a WHERE a.name ILIKE '%smartedu%'
ON CONFLICT DO NOTHING;

INSERT INTO public.app_angles (app_id, name, emotion, hypothesis, hook_examples, cta_style, target_audience, status)
SELECT a.id, 'Smart Parenting Tips', 'value',
  'Educational tips for digital-age parenting earn trust before any pitch.',
  ARRAY['3 settings every parent should change today','How to set up a kid''s phone the right way','The 10-minute parental control checklist'],
  'soft',
  'Modern parents who want practical advice',
  'testing'
FROM public.apps a WHERE a.name ILIKE '%smartedu%'
ON CONFLICT DO NOTHING;