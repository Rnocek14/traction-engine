-- Lock down script_runs: only service_role can write
DROP POLICY IF EXISTS "Allow insert for generation pipeline" ON public.script_runs;
DROP POLICY IF EXISTS "Allow update for generation pipeline" ON public.script_runs;
DROP POLICY IF EXISTS "Script runs are publicly readable" ON public.script_runs;

CREATE POLICY "script_runs_insert_service_role"
ON public.script_runs
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "script_runs_update_service_role"
ON public.script_runs
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "script_runs_select_public"
ON public.script_runs
FOR SELECT
TO anon, authenticated, service_role
USING (true);

-- Lock down script_fingerprints: only service_role can write
DROP POLICY IF EXISTS "Allow insert for fingerprints" ON public.script_fingerprints;
DROP POLICY IF EXISTS "Script fingerprints are publicly readable" ON public.script_fingerprints;

CREATE POLICY "script_fingerprints_insert_service_role"
ON public.script_fingerprints
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "script_fingerprints_select_public"
ON public.script_fingerprints
FOR SELECT
TO anon, authenticated, service_role
USING (true);

-- Lock down topic_bank updates: only service_role can write
DROP POLICY IF EXISTS "Allow insert for authenticated users" ON public.topic_bank;
DROP POLICY IF EXISTS "Allow update for authenticated users" ON public.topic_bank;

CREATE POLICY "topic_bank_insert_service_role"
ON public.topic_bank
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "topic_bank_update_service_role"
ON public.topic_bank
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);