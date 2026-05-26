
-- Create two new story_jobs from existing orphan clips
WITH new_stories AS (
  INSERT INTO public.story_jobs (id, account_id, title, story_type, status, total_clips, completed_clips, content_type, storyboard_json, created_at)
  VALUES
    (gen_random_uuid(), 'lab-archive', 'The Beast of Bray Road', 'cryptid', 'draft', 5, 5, 'growth', '{"scenes":[]}'::jsonb, now()),
    (gen_random_uuid(), 'lab-archive', 'Dragon Lab Reel',        'fantasy', 'draft', 5, 5, 'growth', '{"scenes":[]}'::jsonb, now())
  RETURNING id, title
),
werewolf_story AS (SELECT id FROM new_stories WHERE title = 'The Beast of Bray Road'),
dragon_story  AS (SELECT id FROM new_stories WHERE title = 'Dragon Lab Reel'),

-- Attach werewolf clips (ordered by created_at)
ww AS (
  UPDATE public.video_jobs vj
  SET story_job_id = (SELECT id FROM werewolf_story),
      is_primary = true,
      sequence_index = ord.seq
  FROM (
    SELECT id, (row_number() OVER (ORDER BY created_at))::int - 1 AS seq
    FROM public.video_jobs
    WHERE id IN (
      'fff62f0c-df98-4cd8-9cd1-664713722c21',
      '969b23d6-4728-4300-b32f-a37385cbb0fa',
      '5af807c3-54e1-48ff-a936-53bb61654143',
      'e0938978-47fb-4ce7-9d0d-290886be0977',
      'a28ac92b-1487-4026-a85d-8099beb7d4f8'
    )
  ) ord
  WHERE vj.id = ord.id
  RETURNING vj.id
),

-- Attach dragon clips
dr AS (
  UPDATE public.video_jobs vj
  SET story_job_id = (SELECT id FROM dragon_story),
      is_primary = true,
      sequence_index = ord.seq
  FROM (
    SELECT id, (row_number() OVER (ORDER BY created_at))::int - 1 AS seq
    FROM public.video_jobs
    WHERE id IN (
      '4eb22e3d-86e9-4d24-a224-4557fb78b27d',
      'ea1623d6-0ac6-482d-8745-8e33437ee8ad',
      'c3a13afe-aade-43e3-9234-99976def021b',
      '7d66de9b-b6f4-4517-a7ad-1f13d34785ee',
      '4691019d-9ac9-4da3-8517-d646bdf18357'
    )
  ) ord
  WHERE vj.id = ord.id
  RETURNING vj.id
)
SELECT (SELECT id FROM werewolf_story) AS werewolf_story_id,
       (SELECT id FROM dragon_story)   AS dragon_story_id,
       (SELECT count(*) FROM ww)       AS werewolf_clips_attached,
       (SELECT count(*) FROM dr)       AS dragon_clips_attached;
