-- Fix script_runs RLS policies: change from RESTRICTIVE to PERMISSIVE
DROP POLICY IF EXISTS "Allow insert for generation pipeline" ON public.script_runs;
DROP POLICY IF EXISTS "Allow update for generation pipeline" ON public.script_runs;
DROP POLICY IF EXISTS "Script runs are publicly readable" ON public.script_runs;

-- Recreate as PERMISSIVE policies (default)
CREATE POLICY "Allow insert for generation pipeline" 
ON public.script_runs 
FOR INSERT 
TO public
WITH CHECK (true);

CREATE POLICY "Allow update for generation pipeline" 
ON public.script_runs 
FOR UPDATE 
TO public
USING (true);

CREATE POLICY "Script runs are publicly readable" 
ON public.script_runs 
FOR SELECT 
TO public
USING (true);

-- Also fix script_fingerprints for consistency
DROP POLICY IF EXISTS "Allow insert for fingerprints" ON public.script_fingerprints;
DROP POLICY IF EXISTS "Script fingerprints are publicly readable" ON public.script_fingerprints;

CREATE POLICY "Allow insert for fingerprints" 
ON public.script_fingerprints 
FOR INSERT 
TO public
WITH CHECK (true);

CREATE POLICY "Script fingerprints are publicly readable" 
ON public.script_fingerprints 
FOR SELECT 
TO public
USING (true);