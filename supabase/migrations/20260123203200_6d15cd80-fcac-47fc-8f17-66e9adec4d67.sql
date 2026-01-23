-- Clean slate: delete all pipeline data
-- Order matters due to foreign key relationships

-- 1. Delete video jobs (references script_runs)
DELETE FROM video_jobs;

-- 2. Delete studio timelines (references script_runs)
DELETE FROM studio_timelines;

-- 3. Delete script fingerprints (references script_runs)
DELETE FROM script_fingerprints;

-- 4. Delete script variants (references script_runs)
DELETE FROM script_variants;

-- 5. Delete all script runs
DELETE FROM script_runs;