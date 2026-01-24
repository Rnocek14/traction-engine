-- Create video_comparisons table for pairwise ranking data
CREATE TABLE IF NOT EXISTS public.video_comparisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_a uuid NOT NULL REFERENCES public.video_jobs(id) ON DELETE CASCADE,
  job_b uuid NOT NULL REFERENCES public.video_jobs(id) ON DELETE CASCADE,
  prompt_hash text,
  provider_a text NOT NULL,
  provider_b text NOT NULL,
  winner text NOT NULL CHECK (winner IN ('A', 'B', 'tie')),
  confidence numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  deltas jsonb NOT NULL DEFAULT '{}'::jsonb,
  reasons text[] NOT NULL DEFAULT '{}'::text[],
  key_defects_a text[] DEFAULT '{}'::text[],
  key_defects_b text[] DEFAULT '{}'::text[],
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.video_comparisons ENABLE ROW LEVEL SECURITY;

-- Public read, service role write
CREATE POLICY "video_comparisons_select_public" ON public.video_comparisons
  FOR SELECT USING (true);

CREATE POLICY "video_comparisons_insert_service_role" ON public.video_comparisons
  FOR INSERT WITH CHECK (true);

-- Index for analytics queries
CREATE INDEX idx_video_comparisons_providers ON public.video_comparisons(provider_a, provider_b);
CREATE INDEX idx_video_comparisons_winner ON public.video_comparisons(winner);
CREATE INDEX idx_video_comparisons_created ON public.video_comparisons(created_at DESC);

-- Comment
COMMENT ON TABLE public.video_comparisons IS 'Pairwise video quality comparisons for provider routing calibration';