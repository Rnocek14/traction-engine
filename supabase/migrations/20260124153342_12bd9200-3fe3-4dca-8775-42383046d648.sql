-- Upgrade prompt_learnings for negative learning + time decay

-- Add negative learning columns
ALTER TABLE public.prompt_learnings
ADD COLUMN failed_uses integer NOT NULL DEFAULT 0,
ADD COLUMN avoid_pattern boolean NOT NULL DEFAULT false,
ADD COLUMN last_success_at timestamp with time zone,
ADD COLUMN last_failure_at timestamp with time zone;

-- Add index for querying patterns to avoid
CREATE INDEX idx_prompt_learnings_avoid 
ON public.prompt_learnings (provider, avoid_pattern) 
WHERE avoid_pattern = true;

-- Add index for time-decay queries (recent successes first)
CREATE INDEX idx_prompt_learnings_recent_success 
ON public.prompt_learnings (provider, last_success_at DESC NULLS LAST)
WHERE successful_uses > 0;

-- Add semantic pattern support (pattern_type 'semantic_trait')
-- No schema change needed - just use pattern_type = 'semantic_trait'

-- Add comments
COMMENT ON COLUMN public.prompt_learnings.failed_uses IS 'Count of uses where accuracy_rating <= 2';
COMMENT ON COLUMN public.prompt_learnings.avoid_pattern IS 'True when failed_uses/total_uses > 0.6 - pattern should be avoided';
COMMENT ON COLUMN public.prompt_learnings.last_success_at IS 'Timestamp of most recent rating >= 4 for time decay';
COMMENT ON COLUMN public.prompt_learnings.last_failure_at IS 'Timestamp of most recent rating <= 2';