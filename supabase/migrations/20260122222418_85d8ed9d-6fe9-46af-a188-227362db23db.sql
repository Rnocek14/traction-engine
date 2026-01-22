-- Phase 1: Studio Foundation Schema

-- 1. Create script_variants table for storing alternative versions
CREATE TABLE public.script_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_script_id UUID NOT NULL REFERENCES script_runs(id) ON DELETE CASCADE,
  variant_type TEXT NOT NULL CHECK (variant_type IN ('hook', 'cta', 'voiceover')),
  variant_content TEXT NOT NULL,
  selected BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for efficient lookups
CREATE INDEX idx_script_variants_parent ON script_variants(parent_script_id);

-- Enable RLS
ALTER TABLE script_variants ENABLE ROW LEVEL SECURITY;

-- RLS: Only admin/qa roles can read variants (internal QA tooling)
CREATE POLICY "variants_select_role_gated" 
ON script_variants 
FOR SELECT 
TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin', 'qa']::app_role[]));

-- RLS: Service role for inserts (edge functions)
CREATE POLICY "variants_insert_service_role" 
ON script_variants 
FOR INSERT 
WITH CHECK (true);

-- RLS: Service role for updates (edge functions)
CREATE POLICY "variants_update_service_role" 
ON script_variants 
FOR UPDATE 
USING (true) 
WITH CHECK (true);

-- 2. Add draft_edits column to script_runs for in-progress edits
ALTER TABLE script_runs ADD COLUMN IF NOT EXISTS draft_edits JSONB DEFAULT NULL;