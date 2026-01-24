-- Add prompt tracking columns to video_jobs for comparing enriched prompts to outputs
ALTER TABLE public.video_jobs
ADD COLUMN original_prompt text,
ADD COLUMN enriched_prompt text,
ADD COLUMN style_hints text,
ADD COLUMN accuracy_rating integer CHECK (accuracy_rating >= 1 AND accuracy_rating <= 5),
ADD COLUMN accuracy_notes text,
ADD COLUMN rated_at timestamp with time zone,
ADD COLUMN rated_by uuid;

-- Add index for querying by provider and rating for analysis
CREATE INDEX idx_video_jobs_prompt_analysis 
ON public.video_jobs (provider, accuracy_rating) 
WHERE accuracy_rating IS NOT NULL;

-- Add comment explaining the columns
COMMENT ON COLUMN public.video_jobs.original_prompt IS 'The raw prompt as entered by user before enrichment';
COMMENT ON COLUMN public.video_jobs.enriched_prompt IS 'The GPT-4o enriched prompt actually sent to the provider';
COMMENT ON COLUMN public.video_jobs.style_hints IS 'Style hints used during prompt enrichment (e.g., horror, cinematic)';
COMMENT ON COLUMN public.video_jobs.accuracy_rating IS 'Manual 1-5 rating of how accurately the video matched the prompt';
COMMENT ON COLUMN public.video_jobs.accuracy_notes IS 'Notes on what worked or did not work about the prompt';