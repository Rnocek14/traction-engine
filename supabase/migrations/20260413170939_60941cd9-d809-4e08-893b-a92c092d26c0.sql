
ALTER TABLE public.products DROP CONSTRAINT products_discovered_via_check;
ALTER TABLE public.products ADD CONSTRAINT products_discovered_via_check 
  CHECK (discovered_via = ANY (ARRAY['manual', 'scraper', 'tiktok_shop', 'viral_video']));
