
ALTER TABLE public.story_jobs
  ADD COLUMN IF NOT EXISTS content_type text NOT NULL DEFAULT 'growth',
  ADD COLUMN IF NOT EXISTS auto_generated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_idea_id uuid REFERENCES public.content_ideas(id);
