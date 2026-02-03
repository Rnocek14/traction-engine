-- Partial unique index to make "two active voiceovers" impossible at DB level
-- This is a stronger guarantee than the trigger alone
CREATE UNIQUE INDEX IF NOT EXISTS idx_story_voiceovers_single_active 
ON public.story_voiceovers (story_job_id) 
WHERE is_active = true;