
UPDATE content_ideas 
SET status = 'rejected', updated_at = now()
WHERE status = 'proposed';
