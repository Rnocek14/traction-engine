-- Add dedicated column for raw VLM response text (cleaner than JSONB nesting)
ALTER TABLE public.story_analysis
ADD COLUMN IF NOT EXISTS vlm_raw_text TEXT;