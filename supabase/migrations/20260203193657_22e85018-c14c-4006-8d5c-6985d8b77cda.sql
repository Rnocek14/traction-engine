-- Add alignment debug fields to story_voiceovers for diagnosing sync issues
ALTER TABLE public.story_voiceovers 
ADD COLUMN IF NOT EXISTS has_word_timestamps boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS alignment_ok boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS alignment_debug jsonb DEFAULT '{}'::jsonb;

-- Add comment explaining usage
COMMENT ON COLUMN public.story_voiceovers.has_word_timestamps IS 'True if word-level timing is available (vs scene-level only)';
COMMENT ON COLUMN public.story_voiceovers.alignment_ok IS 'True if ElevenLabs alignment passed mismatch/drift checks';
COMMENT ON COLUMN public.story_voiceovers.alignment_debug IS 'Debug metadata: canonical_length, alignment_length, mismatch_pct, prefix/suffix_match, fallback_reason';