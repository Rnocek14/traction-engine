-- Add INSERT policies for seeding content tables (admin operations)
-- These tables are content configuration, typically managed by admins

-- content_policies: Allow service role / authenticated admins to insert
CREATE POLICY "Allow insert for authenticated users" 
ON public.content_policies 
FOR INSERT 
TO authenticated
WITH CHECK (true);

-- account_configs: Allow insert for authenticated users
CREATE POLICY "Allow insert for authenticated users" 
ON public.account_configs 
FOR INSERT 
TO authenticated
WITH CHECK (true);

-- topic_bank: Allow insert for authenticated users
CREATE POLICY "Allow insert for authenticated users" 
ON public.topic_bank 
FOR INSERT 
TO authenticated
WITH CHECK (true);

-- Also add UPDATE policies for the upsert operations
CREATE POLICY "Allow update for authenticated users" 
ON public.content_policies 
FOR UPDATE 
TO authenticated
USING (true);

CREATE POLICY "Allow update for authenticated users" 
ON public.account_configs 
FOR UPDATE 
TO authenticated
USING (true);

CREATE POLICY "Allow update for authenticated users" 
ON public.topic_bank 
FOR UPDATE 
TO authenticated
USING (true);

-- script_runs and script_fingerprints need INSERT for the generation pipeline
CREATE POLICY "Allow insert for generation pipeline" 
ON public.script_runs 
FOR INSERT 
TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow update for generation pipeline" 
ON public.script_runs 
FOR UPDATE 
TO authenticated
USING (true);

CREATE POLICY "Allow insert for fingerprints" 
ON public.script_fingerprints 
FOR INSERT 
TO authenticated
WITH CHECK (true);

-- Also need to add unique constraint on content_policies.vertical for ON CONFLICT
-- Check if it exists first by attempting to add it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'content_policies_vertical_key'
  ) THEN
    ALTER TABLE public.content_policies ADD CONSTRAINT content_policies_vertical_key UNIQUE (vertical);
  END IF;
END $$;

-- Add unique constraint on account_configs.account_id for ON CONFLICT
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'account_configs_account_id_key'
  ) THEN
    ALTER TABLE public.account_configs ADD CONSTRAINT account_configs_account_id_key UNIQUE (account_id);
  END IF;
END $$;

-- Create the select_topic RPC function for proper cooldown filtering
CREATE OR REPLACE FUNCTION public.select_topic(
  p_vertical text,
  p_pillar text DEFAULT NULL
)
RETURNS SETOF public.topic_bank
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT *
  FROM public.topic_bank t
  WHERE t.vertical = p_vertical::content_vertical
    AND (p_pillar IS NULL OR t.pillar = p_pillar)
    AND (
      t.last_used_at IS NULL
      OR t.last_used_at < (NOW() - make_interval(days => COALESCE(t.cooldown_days, 0)))
    )
  ORDER BY t.times_used ASC, random()
  LIMIT 1;
$$;