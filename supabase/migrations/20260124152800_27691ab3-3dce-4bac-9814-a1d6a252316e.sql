-- Create prompt_learnings table to store successful patterns per provider
CREATE TABLE public.prompt_learnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('sora', 'runway', 'luma')),
  
  -- Pattern categorization
  pattern_type text NOT NULL, -- 'subject', 'camera', 'lighting', 'motion', 'environment', 'style_hint'
  pattern_value text NOT NULL, -- The actual pattern text
  
  -- Success metrics
  total_uses integer NOT NULL DEFAULT 0,
  successful_uses integer NOT NULL DEFAULT 0, -- rating >= 4
  average_rating numeric(3,2),
  
  -- Example prompts that used this pattern
  example_prompts text[] DEFAULT '{}',
  
  -- Timestamps
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  
  -- Unique constraint per provider + pattern
  UNIQUE (provider, pattern_type, pattern_value)
);

-- Enable RLS
ALTER TABLE public.prompt_learnings ENABLE ROW LEVEL SECURITY;

-- Public read, service role write (edge functions update this)
CREATE POLICY "prompt_learnings_select_public" ON public.prompt_learnings
  FOR SELECT USING (true);

CREATE POLICY "prompt_learnings_insert_service_role" ON public.prompt_learnings
  FOR INSERT WITH CHECK (true);

CREATE POLICY "prompt_learnings_update_service_role" ON public.prompt_learnings
  FOR UPDATE USING (true) WITH CHECK (true);

-- Index for querying top patterns per provider
CREATE INDEX idx_prompt_learnings_provider_success 
ON public.prompt_learnings (provider, pattern_type, average_rating DESC NULLS LAST)
WHERE successful_uses > 0;

-- Create update trigger for updated_at
CREATE TRIGGER update_prompt_learnings_updated_at
  BEFORE UPDATE ON public.prompt_learnings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add comments
COMMENT ON TABLE public.prompt_learnings IS 'Learned prompt patterns from successful video generations, used to optimize future prompts per provider';
COMMENT ON COLUMN public.prompt_learnings.pattern_type IS 'Category: subject, camera, lighting, motion, environment, style_hint';
COMMENT ON COLUMN public.prompt_learnings.successful_uses IS 'Count of uses where accuracy_rating >= 4';