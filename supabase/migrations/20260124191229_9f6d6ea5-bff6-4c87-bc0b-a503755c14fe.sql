-- Add enhanced auto-rating dimensions to video_jobs
ALTER TABLE public.video_jobs
  ADD COLUMN IF NOT EXISTS auto_motion_score integer,
  ADD COLUMN IF NOT EXISTS auto_cinematic_score integer,
  ADD COLUMN IF NOT EXISTS auto_artifact_flags text[];

-- Add comment for documentation
COMMENT ON COLUMN public.video_jobs.auto_motion_score IS 'Motion quality score (0-100): temporal consistency, smoothness, physics realism';
COMMENT ON COLUMN public.video_jobs.auto_cinematic_score IS 'Cinematic fidelity score (0-100): composition, depth, lighting artistry, mood';
COMMENT ON COLUMN public.video_jobs.auto_artifact_flags IS 'Detected AI artifact flags: morphing, flickering, physics_violation, etc.';