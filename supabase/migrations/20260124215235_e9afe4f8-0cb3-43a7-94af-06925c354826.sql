-- Video Comparison Queue table for automated pair selection
CREATE TABLE public.video_compare_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_a UUID NOT NULL REFERENCES public.video_jobs(id) ON DELETE CASCADE,
  job_b UUID NOT NULL REFERENCES public.video_jobs(id) ON DELETE CASCADE,
  prompt_hash TEXT,
  cluster_key TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT video_compare_queue_status_check CHECK (status IN ('pending', 'running', 'done', 'failed', 'skipped')),
  CONSTRAINT video_compare_queue_different_jobs CHECK (job_a != job_b)
);

-- Unique constraint to prevent duplicate queue entries
CREATE UNIQUE INDEX video_compare_queue_pair_unique 
ON public.video_compare_queue (LEAST(job_a, job_b), GREATEST(job_a, job_b), cluster_key);

-- Index for queue processing
CREATE INDEX video_compare_queue_pending_idx 
ON public.video_compare_queue (status, priority DESC, created_at ASC) 
WHERE status = 'pending';

-- Enable RLS
ALTER TABLE public.video_compare_queue ENABLE ROW LEVEL SECURITY;

-- Public read access for analytics
CREATE POLICY "video_compare_queue_select_public" ON public.video_compare_queue
FOR SELECT USING (true);

-- Service role write access
CREATE POLICY "video_compare_queue_insert_service_role" ON public.video_compare_queue
FOR INSERT WITH CHECK (true);

CREATE POLICY "video_compare_queue_update_service_role" ON public.video_compare_queue
FOR UPDATE USING (true) WITH CHECK (true);

-- Provider Cluster Stats table for routing intelligence
CREATE TABLE public.provider_cluster_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cluster_key TEXT NOT NULL,
  provider TEXT NOT NULL,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  ties INTEGER NOT NULL DEFAULT 0,
  total_comparisons INTEGER NOT NULL DEFAULT 0,
  avg_confidence NUMERIC,
  avg_win_delta NUMERIC,
  last_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT provider_cluster_stats_unique UNIQUE (cluster_key, provider)
);

-- Index for routing lookups
CREATE INDEX provider_cluster_stats_cluster_idx 
ON public.provider_cluster_stats (cluster_key, total_comparisons DESC);

-- Enable RLS
ALTER TABLE public.provider_cluster_stats ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "provider_cluster_stats_select_public" ON public.provider_cluster_stats
FOR SELECT USING (true);

-- Service role write access
CREATE POLICY "provider_cluster_stats_insert_service_role" ON public.provider_cluster_stats
FOR INSERT WITH CHECK (true);

CREATE POLICY "provider_cluster_stats_update_service_role" ON public.provider_cluster_stats
FOR UPDATE USING (true) WITH CHECK (true);

-- Function to update provider stats from a comparison result
CREATE OR REPLACE FUNCTION public.update_provider_stats(
  p_cluster_key TEXT,
  p_provider_a TEXT,
  p_provider_b TEXT,
  p_winner TEXT,
  p_confidence NUMERIC,
  p_delta NUMERIC DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update provider A stats
  INSERT INTO provider_cluster_stats (cluster_key, provider, wins, losses, ties, total_comparisons, avg_confidence, avg_win_delta)
  VALUES (
    p_cluster_key,
    p_provider_a,
    CASE WHEN p_winner = 'A' THEN 1 ELSE 0 END,
    CASE WHEN p_winner = 'B' THEN 1 ELSE 0 END,
    CASE WHEN p_winner = 'tie' THEN 1 ELSE 0 END,
    1,
    p_confidence,
    CASE WHEN p_winner = 'A' THEN p_delta ELSE 0 END
  )
  ON CONFLICT (cluster_key, provider) DO UPDATE SET
    wins = provider_cluster_stats.wins + CASE WHEN p_winner = 'A' THEN 1 ELSE 0 END,
    losses = provider_cluster_stats.losses + CASE WHEN p_winner = 'B' THEN 1 ELSE 0 END,
    ties = provider_cluster_stats.ties + CASE WHEN p_winner = 'tie' THEN 1 ELSE 0 END,
    total_comparisons = provider_cluster_stats.total_comparisons + 1,
    avg_confidence = (COALESCE(provider_cluster_stats.avg_confidence, 0) * provider_cluster_stats.total_comparisons + p_confidence) / (provider_cluster_stats.total_comparisons + 1),
    avg_win_delta = CASE 
      WHEN p_winner = 'A' THEN (COALESCE(provider_cluster_stats.avg_win_delta, 0) * provider_cluster_stats.wins + p_delta) / (provider_cluster_stats.wins + 1)
      ELSE provider_cluster_stats.avg_win_delta
    END,
    last_updated_at = now();

  -- Update provider B stats
  INSERT INTO provider_cluster_stats (cluster_key, provider, wins, losses, ties, total_comparisons, avg_confidence, avg_win_delta)
  VALUES (
    p_cluster_key,
    p_provider_b,
    CASE WHEN p_winner = 'B' THEN 1 ELSE 0 END,
    CASE WHEN p_winner = 'A' THEN 1 ELSE 0 END,
    CASE WHEN p_winner = 'tie' THEN 1 ELSE 0 END,
    1,
    p_confidence,
    CASE WHEN p_winner = 'B' THEN p_delta ELSE 0 END
  )
  ON CONFLICT (cluster_key, provider) DO UPDATE SET
    wins = provider_cluster_stats.wins + CASE WHEN p_winner = 'B' THEN 1 ELSE 0 END,
    losses = provider_cluster_stats.losses + CASE WHEN p_winner = 'A' THEN 1 ELSE 0 END,
    ties = provider_cluster_stats.ties + CASE WHEN p_winner = 'tie' THEN 1 ELSE 0 END,
    total_comparisons = provider_cluster_stats.total_comparisons + 1,
    avg_confidence = (COALESCE(provider_cluster_stats.avg_confidence, 0) * provider_cluster_stats.total_comparisons + p_confidence) / (provider_cluster_stats.total_comparisons + 1),
    avg_win_delta = CASE 
      WHEN p_winner = 'B' THEN (COALESCE(provider_cluster_stats.avg_win_delta, 0) * provider_cluster_stats.wins + p_delta) / (provider_cluster_stats.wins + 1)
      ELSE provider_cluster_stats.avg_win_delta
    END,
    last_updated_at = now();
END;
$$;