-- Add Sora-specific columns to video_jobs
ALTER TABLE public.video_jobs
ADD COLUMN IF NOT EXISTS openai_video_id text,
ADD COLUMN IF NOT EXISTS progress integer DEFAULT 0;

-- Create index for efficient polling
CREATE INDEX IF NOT EXISTS video_jobs_openai_video_id_idx 
ON public.video_jobs(openai_video_id) 
WHERE openai_video_id IS NOT NULL;

-- Create storage bucket for video outputs
INSERT INTO storage.buckets (id, name, public)
VALUES ('videos', 'videos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for video bucket
CREATE POLICY "Videos are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'videos');

CREATE POLICY "Service role can upload videos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'videos');

CREATE POLICY "Service role can update videos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'videos');