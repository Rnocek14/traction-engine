ALTER TABLE public.account_configs
  ADD COLUMN IF NOT EXISTS realism_level integer NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS visual_style text NOT NULL DEFAULT 'cinematic',
  ADD COLUMN IF NOT EXISTS style_notes text;

COMMENT ON COLUMN public.account_configs.realism_level IS '0=fully abstract/sci-fi, 100=fully grounded/realistic';
COMMENT ON COLUMN public.account_configs.visual_style IS 'Visual aesthetic: realistic, cinematic, sci-fi, abstract, hybrid';
COMMENT ON COLUMN public.account_configs.style_notes IS 'Free-text creative direction for generation engine';