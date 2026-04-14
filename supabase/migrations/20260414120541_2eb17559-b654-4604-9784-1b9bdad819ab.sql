UPDATE video_jobs 
SET status = 'failed', 
    error = 'Manual queue cleanup',
    updated_at = now()
WHERE status IN ('queued', 'running');