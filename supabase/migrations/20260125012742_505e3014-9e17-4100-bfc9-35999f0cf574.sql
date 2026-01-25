-- Story Jobs: Parent container for multi-clip stories
CREATE TABLE IF NOT EXISTS public.story_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id text NOT NULL,
  story_type text NOT NULL DEFAULT 'short_story', -- 'short_story' | 'brainrot' | 'info' | 'hybrid'
  title text,
  
  -- Global continuity anchors (the "show bible" for this story)
  continuity_anchors jsonb DEFAULT '{}'::jsonb,
  
  -- Storyboard definition
  storyboard_json jsonb DEFAULT '{"scenes": []}'::jsonb,
  
  -- Status tracking
  status text NOT NULL DEFAULT 'draft',
  total_clips int DEFAULT 0,
  completed_clips int DEFAULT 0,
  
  -- Quality metrics
  continuity_score int,
  weakest_clip_id uuid,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add parent reference to video_jobs
ALTER TABLE public.video_jobs 
ADD COLUMN IF NOT EXISTS story_job_id uuid REFERENCES public.story_jobs(id),
ADD COLUMN IF NOT EXISTS sequence_index int,
ADD COLUMN IF NOT EXISTS continuity_score int,
ADD COLUMN IF NOT EXISTS continuity_notes text[];

-- Indexes for story queries
CREATE INDEX IF NOT EXISTS idx_video_jobs_story_job ON public.video_jobs(story_job_id);
CREATE INDEX IF NOT EXISTS idx_story_jobs_status ON public.story_jobs(status);
CREATE INDEX IF NOT EXISTS idx_story_jobs_account ON public.story_jobs(account_id);

-- Enable RLS
ALTER TABLE public.story_jobs ENABLE ROW LEVEL SECURITY;

-- RLS policies for story_jobs
CREATE POLICY "story_jobs_select_public" ON public.story_jobs
FOR SELECT USING (true);

CREATE POLICY "story_jobs_insert_service_role" ON public.story_jobs
FOR INSERT WITH CHECK (true);

CREATE POLICY "story_jobs_update_service_role" ON public.story_jobs
FOR UPDATE USING (true) WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_story_jobs_updated_at
  BEFORE UPDATE ON public.story_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();