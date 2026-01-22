-- ============================================
-- Script Pipeline: Uniqueness + Validation Constraints
-- ============================================

-- 1. Add CHECK constraint for non-empty account_id
ALTER TABLE public.script_runs
ADD CONSTRAINT script_runs_account_id_not_empty CHECK (account_id <> '');

ALTER TABLE public.script_fingerprints
ADD CONSTRAINT script_fingerprints_account_id_not_empty CHECK (account_id <> '');

-- 2. Unique indexes to prevent duplicate fingerprints per account
-- Prevents same hook pattern from being used on same account
CREATE UNIQUE INDEX uniq_fingerprint_account_hook
ON public.script_fingerprints(account_id, hook_hash);

-- Prevents same voiceover from being used on same account
CREATE UNIQUE INDEX uniq_fingerprint_account_voiceover
ON public.script_fingerprints(account_id, voiceover_hash);

-- 3. Add hard_block_flags column to track critical safety issues
ALTER TABLE public.script_runs
ADD COLUMN hard_block_flags TEXT[] NOT NULL DEFAULT '{}';

-- 4. Add qa_override tracking for admin overrides
ALTER TABLE public.script_runs
ADD COLUMN qa_override_by TEXT,
ADD COLUMN qa_override_reason TEXT,
ADD COLUMN qa_override_at TIMESTAMPTZ;