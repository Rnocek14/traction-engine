CREATE POLICY "content_ideas_select_public"
  ON public.content_ideas FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "content_ideas_select_authenticated" ON public.content_ideas;