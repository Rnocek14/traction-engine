-- Fail all stuck running/queued video jobs older than 1 hour
UPDATE video_jobs 
SET status = 'failed', error = 'Stuck job cleanup — provider timeout'
WHERE status IN ('running', 'queued') 
  AND created_at < now() - interval '1 hour';

-- Reset the currently "generating" story job to draft so it can be re-triggered
UPDATE story_jobs 
SET status = 'draft', completed_clips = 0
WHERE status = 'generating' 
  AND completed_clips = 0
  AND created_at > now() - interval '7 days';