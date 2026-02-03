-- Story Voiceovers table: separate entity for versioning, regeneration, multiple voices
CREATE TABLE public.story_voiceovers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  story_job_id UUID NOT NULL REFERENCES public.story_jobs(id) ON DELETE CASCADE,
  
  -- Script content
  raw_narration TEXT NOT NULL,                    -- Concatenated scene narrations (input)
  compiled_script TEXT,                           -- GPT-rewritten cohesive script
  scene_segments JSONB DEFAULT '[]',              -- Per-scene text with markers: [{scene_index, text, char_start, char_end}]
  ssml_content TEXT,                              -- Final SSML sent to TTS
  
  -- Voice configuration
  provider TEXT NOT NULL DEFAULT 'elevenlabs',    -- elevenlabs, openai
  voice_id TEXT NOT NULL,                         -- Provider voice ID
  voice_name TEXT,                                -- Human-readable name
  voice_settings JSONB DEFAULT '{}',              -- stability, similarity_boost, style, speed
  
  -- Timing data
  predicted_timing JSONB DEFAULT '[]',            -- Estimate before TTS: [{scene_index, start_ms, end_ms}]
  actual_timing JSONB DEFAULT '[]',               -- From TTS: [{scene_index, start_ms, end_ms, words: [{word, start_ms, end_ms}]}]
  total_duration_ms INTEGER,                      -- Actual audio duration
  
  -- Output
  audio_url TEXT,                                 -- Supabase storage URL
  audio_format TEXT DEFAULT 'mp3',
  
  -- Status & metadata
  status TEXT NOT NULL DEFAULT 'pending',         -- pending, compiling, generating, processing, done, failed
  error TEXT,
  provider_request_id TEXT,                       -- For debugging/support
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,        -- Current active voiceover for story
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast lookup by story
CREATE INDEX idx_story_voiceovers_story_job_id ON public.story_voiceovers(story_job_id);
CREATE INDEX idx_story_voiceovers_active ON public.story_voiceovers(story_job_id, is_active) WHERE is_active = true;

-- Only one active voiceover per story (enforced via trigger, not unique constraint for flexibility)
CREATE OR REPLACE FUNCTION public.ensure_single_active_voiceover()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_active = true THEN
    UPDATE public.story_voiceovers 
    SET is_active = false, updated_at = now()
    WHERE story_job_id = NEW.story_job_id 
      AND id != NEW.id 
      AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ensure_single_active_voiceover_trigger
BEFORE INSERT OR UPDATE ON public.story_voiceovers
FOR EACH ROW
EXECUTE FUNCTION public.ensure_single_active_voiceover();

-- Updated at trigger
CREATE TRIGGER update_story_voiceovers_updated_at
BEFORE UPDATE ON public.story_voiceovers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add active_voiceover_id to story_jobs for quick access
ALTER TABLE public.story_jobs 
  ADD COLUMN active_voiceover_id UUID REFERENCES public.story_voiceovers(id);

-- RLS Policies
ALTER TABLE public.story_voiceovers ENABLE ROW LEVEL SECURITY;

-- Public read (same as story_jobs)
CREATE POLICY "story_voiceovers_select_public" 
ON public.story_voiceovers 
FOR SELECT 
USING (true);

-- Service role insert/update
CREATE POLICY "story_voiceovers_insert_service_role" 
ON public.story_voiceovers 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "story_voiceovers_update_service_role" 
ON public.story_voiceovers 
FOR UPDATE 
USING (true) 
WITH CHECK (true);