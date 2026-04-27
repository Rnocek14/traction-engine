-- Allow public (anon) to toggle the kill switch and edit spend caps,
-- since this internal tool has no auth layer.
DROP POLICY IF EXISTS "system_settings_update_authenticated" ON public.system_settings;

CREATE POLICY "system_settings_update_public"
ON public.system_settings
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);