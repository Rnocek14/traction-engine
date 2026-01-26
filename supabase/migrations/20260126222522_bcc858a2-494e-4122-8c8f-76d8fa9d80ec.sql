-- Enable Realtime for video_jobs table so UI can receive instant progress updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.video_jobs;