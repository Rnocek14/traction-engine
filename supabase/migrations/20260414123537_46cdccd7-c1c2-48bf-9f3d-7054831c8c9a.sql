
-- 1. Apps table
CREATE TABLE public.apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text,
  description text,
  icon_url text,
  verticals text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.apps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Apps are viewable by everyone" ON public.apps FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage apps" ON public.apps FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_apps_updated_at BEFORE UPDATE ON public.apps
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Published posts table
CREATE TABLE public.published_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_job_id uuid REFERENCES public.story_jobs(id) ON DELETE SET NULL,
  account_id text NOT NULL,
  platform text NOT NULL DEFAULT 'tiktok',
  external_post_id text,
  posted_at timestamptz,
  status text NOT NULL DEFAULT 'draft',
  performance_data jsonb DEFAULT '{}',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.published_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published posts are viewable by everyone" ON public.published_posts FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage published posts" ON public.published_posts FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_published_posts_updated_at BEFORE UPDATE ON public.published_posts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_published_posts_account ON public.published_posts(account_id);
CREATE INDEX idx_published_posts_story_job ON public.published_posts(story_job_id);

-- 3. Add content_type to content_ideas
ALTER TABLE public.content_ideas ADD COLUMN IF NOT EXISTS content_type text NOT NULL DEFAULT 'growth';
