-- Add unique constraint on story_analysis.story_job_id to prevent duplicates forever
ALTER TABLE public.story_analysis
ADD CONSTRAINT story_analysis_story_job_id_unique UNIQUE (story_job_id);