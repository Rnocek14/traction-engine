-- Fail all OLD stuck "generating" story_jobs (pre-approved slop)
UPDATE story_jobs
SET status = 'failed', updated_at = now()
WHERE status = 'generating'
AND id NOT IN (
  '662a076d-613a-46df-afc2-bb57a95b0442',
  'a6c4bc8b-fd82-4ccc-bde5-6dc42aa17296',
  '6e1bc8f1-0a95-42ac-a978-a8a4bb913f94',
  'c94adfbf-d622-4c4d-a2a5-48b63f523090',
  '8a745365-100e-4af5-929f-c9d019a167e3',
  'afd7c5ef-a7a1-40b8-a615-ac34f8f6e9f4'
);