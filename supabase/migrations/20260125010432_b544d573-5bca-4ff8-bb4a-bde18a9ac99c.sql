-- Add raw_routing_tags column for tag discovery (unfiltered VLM tags)
ALTER TABLE public.video_jobs
ADD COLUMN IF NOT EXISTS raw_routing_tags text[];

-- Add comment for documentation
COMMENT ON COLUMN public.video_jobs.raw_routing_tags IS 'Normalized but unfiltered routing tags from VLM for discovery/promotion pipeline';