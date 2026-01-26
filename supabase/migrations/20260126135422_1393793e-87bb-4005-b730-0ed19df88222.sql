-- Fix story_analysis RLS policies
-- Remove INSERT/UPDATE policies - service role bypasses RLS anyway
-- Keep SELECT for authenticated users only

DROP POLICY IF EXISTS "story_analysis_insert_service_role" ON story_analysis;
DROP POLICY IF EXISTS "story_analysis_update_service_role" ON story_analysis;

-- Update SELECT policy to authenticated users (more secure than public)
DROP POLICY IF EXISTS "story_analysis_select_public" ON story_analysis;
CREATE POLICY "story_analysis_select_authenticated" ON story_analysis
  FOR SELECT TO authenticated
  USING (true);