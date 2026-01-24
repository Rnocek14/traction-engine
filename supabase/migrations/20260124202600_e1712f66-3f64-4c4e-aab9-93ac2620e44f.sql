-- Add new auto-rating schema columns for routing intelligence
ALTER TABLE public.video_jobs 
  ADD COLUMN IF NOT EXISTS auto_defects jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS auto_routing_tags text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS auto_hard_fail boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_regen_recommended boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_best_use text DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.video_jobs.auto_defects IS 'Structured defect list: [{type, severity, evidence, deduction}]';
COMMENT ON COLUMN public.video_jobs.auto_routing_tags IS 'Tags for provider routing intelligence (e.g., low_light, fast_motion)';
COMMENT ON COLUMN public.video_jobs.auto_hard_fail IS 'True if video failed quality gate (score <55 or severe defects)';
COMMENT ON COLUMN public.video_jobs.auto_regen_recommended IS 'True if regeneration recommended (score <68 or moderate+ defects)';
COMMENT ON COLUMN public.video_jobs.auto_best_use IS 'Recommended usage tier: final, usable_social, draft_only, reject';