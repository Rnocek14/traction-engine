
-- Create viral_videos table for demand-driven product discovery
CREATE TABLE public.viral_videos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  url TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'tiktok',
  views INTEGER,
  likes INTEGER,
  comments_count INTEGER,
  shares INTEGER,
  caption TEXT,
  creator_handle TEXT,
  extracted_product_name TEXT,
  extracted_product_description TEXT,
  linked_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  demand_signals JSONB DEFAULT '{}'::jsonb,
  source_hook TEXT,
  processing_status TEXT NOT NULL DEFAULT 'pending',
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT viral_videos_url_unique UNIQUE(url)
);

-- Enable RLS
ALTER TABLE public.viral_videos ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "viral_videos_select_public"
  ON public.viral_videos FOR SELECT
  USING (true);

CREATE POLICY "viral_videos_insert_authenticated"
  ON public.viral_videos FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "viral_videos_update_authenticated"
  ON public.viral_videos FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "viral_videos_all_service_role"
  ON public.viral_videos FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Timestamp trigger
CREATE TRIGGER update_viral_videos_updated_at
  BEFORE UPDATE ON public.viral_videos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for product lookups
CREATE INDEX idx_viral_videos_linked_product ON public.viral_videos(linked_product_id);
CREATE INDEX idx_viral_videos_status ON public.viral_videos(processing_status);
