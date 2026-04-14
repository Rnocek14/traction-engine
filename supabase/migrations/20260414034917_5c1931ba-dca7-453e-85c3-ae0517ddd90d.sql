UPDATE video_jobs 
SET status = 'failed', 
    error = 'Stale job cleanup: exceeded 48h without completion',
    updated_at = now()
WHERE status IN ('running', 'queued')
AND created_at < now() - interval '48 hours';