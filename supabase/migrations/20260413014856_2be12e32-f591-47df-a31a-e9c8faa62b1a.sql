
-- Scrape jobs table: tracks each URL scrape
CREATE TABLE public.scrape_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  source_type text NOT NULL DEFAULT 'other' CHECK (source_type IN ('reddit', 'article', 'youtube', 'other')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fetching', 'extracting', 'done', 'failed')),
  raw_html text,
  raw_text text,
  extracted_json jsonb,
  error text,
  fetch_method text, -- 'static', 'perplexity'
  fetch_duration_ms integer,
  extraction_duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- Scraped insights: structured AI-extracted data from scrape jobs
CREATE TABLE public.scraped_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scrape_job_id uuid REFERENCES public.scrape_jobs(id) ON DELETE CASCADE NOT NULL,
  source_url text NOT NULL,
  source_type text NOT NULL,
  title text,
  topics text[] DEFAULT '{}',
  hook_patterns text[] DEFAULT '{}',
  emotional_triggers text[] DEFAULT '{}',
  content_format text,
  visual_style text,
  key_points text[] DEFAULT '{}',
  viral_score integer CHECK (viral_score BETWEEN 0 AND 100),
  relevance_tags text[] DEFAULT '{}',
  raw_extraction jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_scrape_jobs_status ON public.scrape_jobs(status);
CREATE INDEX idx_scrape_jobs_source ON public.scrape_jobs(source_type);
CREATE INDEX idx_scrape_jobs_created ON public.scrape_jobs(created_at DESC);
CREATE INDEX idx_scraped_insights_job ON public.scraped_insights(scrape_job_id);
CREATE INDEX idx_scraped_insights_topics ON public.scraped_insights USING GIN(topics);
CREATE INDEX idx_scraped_insights_hooks ON public.scraped_insights USING GIN(hook_patterns);
CREATE INDEX idx_scraped_insights_tags ON public.scraped_insights USING GIN(relevance_tags);

-- RLS
ALTER TABLE public.scrape_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scraped_insights ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read
CREATE POLICY "Authenticated users can read scrape_jobs"
  ON public.scrape_jobs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read scraped_insights"
  ON public.scraped_insights FOR SELECT TO authenticated
  USING (true);

-- Service role handles writes (pipeline)
CREATE POLICY "Service role manages scrape_jobs"
  ON public.scrape_jobs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role manages scraped_insights"
  ON public.scraped_insights FOR ALL TO service_role
  USING (true) WITH CHECK (true);
