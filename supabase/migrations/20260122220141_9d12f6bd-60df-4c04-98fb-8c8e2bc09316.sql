-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'qa', 'viewer');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (avoids recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS policies for user_roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
  ON public.user_roles
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Add regenerated_from_id to script_runs for tracking regenerations
ALTER TABLE public.script_runs 
  ADD COLUMN regenerated_from_id UUID REFERENCES public.script_runs(id);

-- Create index for regeneration tracking
CREATE INDEX idx_script_runs_regenerated_from ON public.script_runs(regenerated_from_id);

-- Add video_jobs table for async video generation
CREATE TABLE public.video_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_run_id UUID NOT NULL REFERENCES public.script_runs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  provider TEXT NOT NULL DEFAULT 'sora',
  request_id TEXT,
  output_url TEXT,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on video_jobs
ALTER TABLE public.video_jobs ENABLE ROW LEVEL SECURITY;

-- RLS policies for video_jobs (read-only for anon, writes via service_role)
CREATE POLICY "video_jobs_select_public"
  ON public.video_jobs
  FOR SELECT
  USING (true);

CREATE POLICY "video_jobs_insert_service_role"
  ON public.video_jobs
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "video_jobs_update_service_role"
  ON public.video_jobs
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Trigger for updated_at on video_jobs
CREATE TRIGGER update_video_jobs_updated_at
  BEFORE UPDATE ON public.video_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();