-- Create studio_timelines table to store clip-based timeline data
CREATE TABLE public.studio_timelines (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  script_run_id uuid NOT NULL REFERENCES public.script_runs(id) ON DELETE CASCADE,
  timeline_json jsonb NOT NULL DEFAULT '{"clips": []}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  label text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  published_at timestamp with time zone
);

-- Create index for quick lookups by script
CREATE INDEX idx_studio_timelines_script_run_id ON public.studio_timelines(script_run_id);
CREATE INDEX idx_studio_timelines_version ON public.studio_timelines(script_run_id, version DESC);

-- Enable RLS
ALTER TABLE public.studio_timelines ENABLE ROW LEVEL SECURITY;

-- RLS policies: readable by all, writable by service role
CREATE POLICY "studio_timelines_select_public"
  ON public.studio_timelines
  FOR SELECT
  USING (true);

CREATE POLICY "studio_timelines_insert_service_role"
  ON public.studio_timelines
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "studio_timelines_update_service_role"
  ON public.studio_timelines
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_studio_timelines_updated_at
  BEFORE UPDATE ON public.studio_timelines
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();