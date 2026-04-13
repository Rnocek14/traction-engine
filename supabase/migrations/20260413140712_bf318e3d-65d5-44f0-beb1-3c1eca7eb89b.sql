
-- Add new verticals for Business B
ALTER TYPE public.content_vertical ADD VALUE IF NOT EXISTS 'gadgets';
ALTER TYPE public.content_vertical ADD VALUE IF NOT EXISTS 'home';
ALTER TYPE public.content_vertical ADD VALUE IF NOT EXISTS 'toys';

-- Create monetization mode enum
DO $$ BEGIN
  CREATE TYPE public.monetization_mode AS ENUM ('app_first', 'product_first', 'hybrid');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create account status enum
DO $$ BEGIN
  CREATE TYPE public.account_status AS ENUM ('active', 'paused', 'warmup', 'flagged');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create platform enum
DO $$ BEGIN
  CREATE TYPE public.account_platform AS ENUM ('tiktok', 'instagram', 'youtube_shorts');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add strategy columns to account_configs
ALTER TABLE public.account_configs
  ADD COLUMN IF NOT EXISTS account_name text,
  ADD COLUMN IF NOT EXISTS handle text,
  ADD COLUMN IF NOT EXISTS platform public.account_platform NOT NULL DEFAULT 'tiktok',
  ADD COLUMN IF NOT EXISTS monetization_mode public.monetization_mode NOT NULL DEFAULT 'app_first',
  ADD COLUMN IF NOT EXISTS status public.account_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS allowed_product_categories text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS allowed_offer_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS posting_frequency_target integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS max_daily_posts integer NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS priority_score integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS content_style text,
  ADD COLUMN IF NOT EXISTS voice_id text,
  ADD COLUMN IF NOT EXISTS voice_provider text DEFAULT 'elevenlabs';
