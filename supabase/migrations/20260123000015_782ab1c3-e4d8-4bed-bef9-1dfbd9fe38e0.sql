-- Add TTS voiceover fields to script_runs
ALTER TABLE public.script_runs
ADD COLUMN IF NOT EXISTS voiceover_audio_url text,
ADD COLUMN IF NOT EXISTS voiceover_audio_format text DEFAULT 'mp3',
ADD COLUMN IF NOT EXISTS voiceover_voice text DEFAULT 'coral',
ADD COLUMN IF NOT EXISTS voiceover_instructions text,
ADD COLUMN IF NOT EXISTS voiceover_generated_at timestamp with time zone;

-- Create audio storage bucket for voiceovers
INSERT INTO storage.buckets (id, name, public)
VALUES ('audio', 'audio', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for audio bucket
CREATE POLICY "Audio files are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'audio');

CREATE POLICY "Service role can upload audio"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'audio');

CREATE POLICY "Service role can update audio"
ON storage.objects FOR UPDATE
USING (bucket_id = 'audio');

CREATE POLICY "Service role can delete audio"
ON storage.objects FOR DELETE
USING (bucket_id = 'audio');