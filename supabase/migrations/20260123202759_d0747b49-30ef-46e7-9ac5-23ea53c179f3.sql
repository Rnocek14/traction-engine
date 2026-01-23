-- Phase 1.1: Delete failed video jobs
DELETE FROM video_jobs WHERE status = 'failed';

-- Phase 1.2: Extend clips ≤2.0s to 3.0s minimum duration
UPDATE studio_timelines
SET timeline_json = jsonb_set(
  timeline_json,
  '{clips}',
  (
    SELECT jsonb_agg(
      CASE 
        WHEN ((clip->>'end')::numeric - (clip->>'start')::numeric) <= 2.0
        THEN clip || jsonb_build_object('end', (clip->>'start')::numeric + 3.0)
        ELSE clip
      END
    )
    FROM jsonb_array_elements(timeline_json->'clips') AS clip
  )
),
updated_at = now()
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(timeline_json->'clips') AS c
  WHERE ((c->>'end')::numeric - (c->>'start')::numeric) <= 2.0
);