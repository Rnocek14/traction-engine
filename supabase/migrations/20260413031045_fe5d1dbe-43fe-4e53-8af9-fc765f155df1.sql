CREATE TABLE public.content_ideas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id TEXT NOT NULL,
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  angle TEXT,
  vertical TEXT,
  suggested_hook_type TEXT,
  suggested_format TEXT,
  emotional_triggers TEXT[] NOT NULL DEFAULT '{}',
  trend_source_ids UUID[] NOT NULL DEFAULT '{}',
  reasoning TEXT,
  opportunity_score INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'proposed',
  story_job_id UUID REFERENCES public.story_jobs(id),
  generated_by TEXT NOT NULL DEFAULT 'auto',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.content_ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_ideas_select_authenticated"
  ON public.content_ideas FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "content_ideas_insert_authenticated"
  ON public.content_ideas FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "content_ideas_update_authenticated"
  ON public.content_ideas FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_content_ideas_status ON public.content_ideas(status);
CREATE INDEX idx_content_ideas_account ON public.content_ideas(account_id);
CREATE INDEX idx_content_ideas_created ON public.content_ideas(created_at DESC);

CREATE TRIGGER update_content_ideas_updated_at
  BEFORE UPDATE ON public.content_ideas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();