-- ============================================
-- Content Engine: Show Bible + Topic Bank + Script System
-- ============================================

-- Enum for content verticals
CREATE TYPE content_vertical AS ENUM ('privacy', 'education', 'health', 'hyperlocal');

-- Enum for claim policy strictness
CREATE TYPE claim_policy_level AS ENUM ('standard', 'moderate', 'strict', 'medical');

-- Enum for CTA style
CREATE TYPE cta_style AS ENUM ('soft', 'direct', 'hard_offer');

-- Enum for script status
CREATE TYPE script_status AS ENUM ('draft', 'qa_passed', 'qa_failed', 'generating', 'published', 'rejected');

-- ============================================
-- 1. Account Configs (Show Bible)
-- ============================================
CREATE TABLE public.account_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id TEXT NOT NULL UNIQUE, -- matches mock account IDs
  vertical content_vertical NOT NULL,
  
  -- Persona & Audience
  persona JSONB NOT NULL DEFAULT '{"tone": "informative", "vibe": "friendly"}',
  audience JSONB NOT NULL DEFAULT '{"who": "", "pain_points": []}',
  promise TEXT NOT NULL, -- what followers get
  
  -- Content Strategy
  content_pillars TEXT[] NOT NULL DEFAULT '{}', -- 3-5 recurring categories
  banned_topics TEXT[] NOT NULL DEFAULT '{}', -- strict "never"
  claim_policy claim_policy_level NOT NULL DEFAULT 'standard',
  
  -- CTA Configuration
  cta_style cta_style NOT NULL DEFAULT 'soft',
  cta_destination TEXT, -- app/store/landing URL
  cta_phrases TEXT[] NOT NULL DEFAULT '{}', -- approved CTA variations
  
  -- Style Rules
  style_rules JSONB NOT NULL DEFAULT '{
    "max_length_seconds": 60,
    "pacing": "medium",
    "profanity": false,
    "emoji_allowed": true
  }',
  
  -- Safety
  disclaimer_rules JSONB NOT NULL DEFAULT '{"always_required": false, "trigger_keywords": []}',
  
  -- Uniqueness
  uniqueness_salt TEXT DEFAULT gen_random_uuid()::text,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 2. Content Policies (Global per vertical)
-- ============================================
CREATE TABLE public.content_policies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vertical content_vertical NOT NULL UNIQUE,
  
  -- Banned patterns (regex or keywords)
  banned_phrases TEXT[] NOT NULL DEFAULT '{}',
  required_disclaimers TEXT[] NOT NULL DEFAULT '{}',
  
  -- Claim restrictions
  prohibited_claim_types TEXT[] NOT NULL DEFAULT '{}',
  fact_check_required BOOLEAN NOT NULL DEFAULT false,
  
  -- Safety rules as structured JSON
  safety_rules JSONB NOT NULL DEFAULT '{}',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 3. Topic Bank
-- ============================================
CREATE TABLE public.topic_bank (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vertical content_vertical NOT NULL,
  pillar TEXT NOT NULL, -- e.g. "Data Brokers", "Browser Privacy"
  
  -- Topic details
  topic_prompt TEXT NOT NULL, -- the actual prompt/idea
  hook_variants TEXT[] NOT NULL DEFAULT '{}', -- pre-written hook options
  
  -- Metadata
  claim_sensitivity INTEGER NOT NULL DEFAULT 1 CHECK (claim_sensitivity >= 1 AND claim_sensitivity <= 5),
  suggested_cta TEXT,
  motif_hints TEXT[] NOT NULL DEFAULT '{}', -- visual suggestions
  
  -- Trend & Seasonality
  is_evergreen BOOLEAN NOT NULL DEFAULT true,
  seasonal_tags TEXT[] NOT NULL DEFAULT '{}', -- e.g. "new_year", "back_to_school"
  trend_keywords TEXT[] NOT NULL DEFAULT '{}',
  
  -- Usage tracking
  times_used INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  cooldown_days INTEGER NOT NULL DEFAULT 7, -- min days before reuse on same account
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 4. Script Runs (Generated Scripts)
-- ============================================
CREATE TABLE public.script_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id TEXT NOT NULL,
  topic_id UUID REFERENCES public.topic_bank(id),
  
  -- Status tracking
  status script_status NOT NULL DEFAULT 'draft',
  
  -- Generated content (JSON schema)
  script_content JSONB NOT NULL DEFAULT '{}',
  -- Expected schema:
  -- {
  --   "hook": "string (0-2s opener)",
  --   "voiceover": "string (full text)",
  --   "on_screen_text": [{"timestamp": 0, "text": "..."}],
  --   "scene_prompts": ["prompt1", "prompt2"],
  --   "broll_keywords": ["keyword1", "keyword2"],
  --   "caption": "string",
  --   "hashtags": ["tag1", "tag2"],
  --   "cta": "string",
  --   "disclaimer": "string or null"
  -- }
  
  -- QA Results
  qa_results JSONB DEFAULT NULL,
  qa_passed_at TIMESTAMPTZ,
  qa_failed_reason TEXT,
  
  -- Safety flags
  safety_flags TEXT[] NOT NULL DEFAULT '{}',
  fact_claims TEXT[] NOT NULL DEFAULT '{}', -- claims to verify
  
  -- Cost tracking (cents)
  generation_cost_cents INTEGER NOT NULL DEFAULT 0,
  
  -- Fingerprints for deduplication
  hook_hash TEXT,
  voiceover_hash TEXT,
  scene_hash TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

-- ============================================
-- 5. Script Fingerprints (Anti-duplication)
-- ============================================
CREATE TABLE public.script_fingerprints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  script_id UUID NOT NULL REFERENCES public.script_runs(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  
  -- Fingerprint hashes
  hook_hash TEXT NOT NULL,
  voiceover_hash TEXT NOT NULL,
  topic_id UUID,
  
  -- Similarity tracking
  similarity_score NUMERIC(5,4) DEFAULT 0, -- 0-1 score vs recent scripts
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- Indexes for performance
-- ============================================
CREATE INDEX idx_account_configs_vertical ON public.account_configs(vertical);
CREATE INDEX idx_topic_bank_vertical_pillar ON public.topic_bank(vertical, pillar);
CREATE INDEX idx_topic_bank_last_used ON public.topic_bank(last_used_at);
CREATE INDEX idx_script_runs_account ON public.script_runs(account_id);
CREATE INDEX idx_script_runs_status ON public.script_runs(status);
CREATE INDEX idx_script_fingerprints_hashes ON public.script_fingerprints(hook_hash, voiceover_hash);
CREATE INDEX idx_script_fingerprints_account ON public.script_fingerprints(account_id, created_at DESC);

-- ============================================
-- Enable RLS
-- ============================================
ALTER TABLE public.account_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topic_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.script_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.script_fingerprints ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies (read-only for now, admin writes via service role)
-- ============================================
-- Account configs: publicly readable (operator dashboard)
CREATE POLICY "Account configs are publicly readable" 
  ON public.account_configs FOR SELECT USING (true);

-- Content policies: publicly readable
CREATE POLICY "Content policies are publicly readable" 
  ON public.content_policies FOR SELECT USING (true);

-- Topic bank: publicly readable
CREATE POLICY "Topic bank is publicly readable" 
  ON public.topic_bank FOR SELECT USING (true);

-- Script runs: publicly readable
CREATE POLICY "Script runs are publicly readable" 
  ON public.script_runs FOR SELECT USING (true);

-- Fingerprints: publicly readable
CREATE POLICY "Script fingerprints are publicly readable" 
  ON public.script_fingerprints FOR SELECT USING (true);

-- ============================================
-- Trigger for updated_at
-- ============================================
CREATE TRIGGER update_account_configs_updated_at
  BEFORE UPDATE ON public.account_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_content_policies_updated_at
  BEFORE UPDATE ON public.content_policies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();