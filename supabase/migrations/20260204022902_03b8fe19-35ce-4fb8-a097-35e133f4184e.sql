-- 1) Add scene_id column as TEXT to handle both UUID and string formats
ALTER TABLE video_jobs
ADD COLUMN scene_id text NULL;

-- 2) Add is_primary to handle duplicate clips per scene
ALTER TABLE video_jobs
ADD COLUMN is_primary boolean NOT NULL DEFAULT false;

-- 3) Partial unique index: one primary clip per scene per story
CREATE UNIQUE INDEX IF NOT EXISTS video_jobs_one_primary_per_scene
ON video_jobs (story_job_id, scene_id)
WHERE is_primary = true AND scene_id IS NOT NULL;

-- 4) Index for efficient lookups
CREATE INDEX IF NOT EXISTS video_jobs_scene_id_idx ON video_jobs (scene_id) WHERE scene_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS video_jobs_story_primary_idx ON video_jobs (story_job_id, is_primary) WHERE is_primary = true;

-- 5) Backfill scene_id from storyboard for existing jobs (handles any ID format)
WITH scenes AS (
  SELECT
    sj.id AS story_job_id,
    (scene->>'id') AS scene_id,
    COALESCE((scene->>'index')::int, ord::int - 1) AS scene_index
  FROM story_jobs sj,
  LATERAL jsonb_array_elements(sj.storyboard_json->'scenes') WITH ORDINALITY AS t(scene, ord)
  WHERE sj.storyboard_json ? 'scenes'
    AND jsonb_typeof(sj.storyboard_json->'scenes') = 'array'
)
UPDATE video_jobs v
SET scene_id = s.scene_id
FROM scenes s
WHERE v.story_job_id = s.story_job_id
  AND v.sequence_index = s.scene_index
  AND v.scene_id IS NULL;

-- 6) Set is_primary for existing clips (pick latest done per scene)
WITH ranked AS (
  SELECT
    id,
    story_job_id,
    scene_id,
    ROW_NUMBER() OVER (
      PARTITION BY story_job_id, scene_id
      ORDER BY 
        CASE WHEN status IN ('done','succeeded') THEN 0 ELSE 1 END,
        created_at DESC
    ) AS rn
  FROM video_jobs
  WHERE scene_id IS NOT NULL
)
UPDATE video_jobs v
SET is_primary = (r.rn = 1)
FROM ranked r
WHERE v.id = r.id;