-- Add cron job to continue story chains every 30 seconds
SELECT cron.schedule(
  'continue-story-chain-30s',
  '30 seconds',
  $$
  SELECT net.http_post(
    url := 'https://jrujlpljluvxewjytuab.supabase.co/functions/v1/continue-story-chain',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);