-- Create story_analysis table for story-level quality analysis
CREATE TABLE public.story_analysis (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  story_job_id UUID NOT NULL UNIQUE REFERENCES public.story_jobs(id) ON DELETE CASCADE,
  overall_flow_score INTEGER CHECK (overall_flow_score >= 0 AND overall_flow_score <= 100),
  character_continuity INTEGER CHECK (character_continuity >= 0 AND character_continuity <= 100),
  environment_consistency INTEGER CHECK (environment_consistency >= 0 AND environment_consistency <= 100),
  motion_logic INTEGER CHECK (motion_logic >= 0 AND motion_logic <= 100),
  prompt_execution INTEGER CHECK (prompt_execution >= 0 AND prompt_execution <= 100),
  weak_scenes INTEGER[] DEFAULT '{}',
  failure_patterns TEXT[] DEFAULT '{}',
  recommendations TEXT[] DEFAULT '{}',
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  analyzer_version TEXT NOT NULL DEFAULT 'v1.0',
  raw JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.story_analysis ENABLE ROW LEVEL SECURITY;

-- RLS policies - public read, service role write
CREATE POLICY "story_analysis_select_public" 
  ON public.story_analysis 
  FOR SELECT 
  USING (true);

CREATE POLICY "story_analysis_insert_service_role" 
  ON public.story_analysis 
  FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "story_analysis_update_service_role" 
  ON public.story_analysis 
  FOR UPDATE 
  USING (true)
  WITH CHECK (true);

-- Create index for efficient lookups
CREATE INDEX idx_story_analysis_story_job_id ON public.story_analysis(story_job_id);
CREATE INDEX idx_story_analysis_overall_flow_score ON public.story_analysis(overall_flow_score);
CREATE INDEX idx_story_analysis_analyzed_at ON public.story_analysis(analyzed_at DESC);