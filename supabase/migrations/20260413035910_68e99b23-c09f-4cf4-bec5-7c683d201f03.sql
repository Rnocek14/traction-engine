
-- Allow public read access to scraped_insights (trend data, not PII)
CREATE POLICY "scraped_insights_select_public"
ON public.scraped_insights
FOR SELECT
TO public
USING (true);

-- Allow public read access to scrape_jobs (job status, not PII)
CREATE POLICY "scrape_jobs_select_public"
ON public.scrape_jobs
FOR SELECT
TO public
USING (true);
