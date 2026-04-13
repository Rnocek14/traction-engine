
ALTER TABLE public.viral_videos
  ADD COLUMN extraction_confidence INTEGER DEFAULT 0,
  ADD COLUMN demand_score INTEGER DEFAULT 0,
  ADD COLUMN engagement_rate NUMERIC DEFAULT 0,
  ADD COLUMN hook_type TEXT,
  ADD COLUMN creative_strength_score INTEGER DEFAULT 0;
