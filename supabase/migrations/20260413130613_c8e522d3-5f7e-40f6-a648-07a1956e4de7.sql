
ALTER TABLE public.products
  ADD COLUMN marketing_plan jsonb DEFAULT NULL,
  ADD COLUMN plan_generated_at timestamptz DEFAULT NULL,
  ADD COLUMN plan_version integer NOT NULL DEFAULT 0,
  ADD COLUMN plan_status text NOT NULL DEFAULT 'none';
