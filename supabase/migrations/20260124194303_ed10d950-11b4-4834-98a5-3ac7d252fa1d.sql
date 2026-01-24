-- Schedule Luma video processing every 30 seconds
SELECT cron.schedule(
  'process-luma-jobs',
  '*/30 * * * * *',
  $$
  SELECT net.http_post(
    url := 'https://jrujlpljluvxewjytuab.supabase.co/functions/v1/process-video-luma',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpydWpscGxqbHV2eGV3anl0dWFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA0NDMwODYsImV4cCI6MjA2NjAxOTA4Nn0.SDAcfo63YiNToCSXzoHRGhEKC3hmtYdp_cPBdFDN0HI"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Schedule Runway video processing every 30 seconds
SELECT cron.schedule(
  'process-runway-jobs',
  '*/30 * * * * *',
  $$
  SELECT net.http_post(
    url := 'https://jrujlpljluvxewjytuab.supabase.co/functions/v1/process-video-runway',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpydWpscGxqbHV2eGV3anl0dWFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA0NDMwODYsImV4cCI6MjA2NjAxOTA4Nn0.SDAcfo63YiNToCSXzoHRGhEKC3hmtYdp_cPBdFDN0HI"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Schedule auto-rating every 2 minutes (batch mode)
SELECT cron.schedule(
  'auto-rate-completed-videos',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://jrujlpljluvxewjytuab.supabase.co/functions/v1/auto-rate-video',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpydWpscGxqbHV2eGV3anl0dWFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA0NDMwODYsImV4cCI6MjA2NjAxOTA4Nn0.SDAcfo63YiNToCSXzoHRGhEKC3hmtYdp_cPBdFDN0HI"}'::jsonb,
    body := '{"batchMode": true}'::jsonb
  ) AS request_id;
  $$
);