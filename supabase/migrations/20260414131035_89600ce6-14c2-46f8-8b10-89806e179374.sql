
-- Add hook_style to account_configs for account-level content identity
ALTER TABLE public.account_configs
ADD COLUMN IF NOT EXISTS hook_style text NOT NULL DEFAULT 'curiosity';

-- Add comment for clarity
COMMENT ON COLUMN public.account_configs.hook_style IS 'Primary hook style: curiosity, shock, problem, listicle, aesthetic, demo';
