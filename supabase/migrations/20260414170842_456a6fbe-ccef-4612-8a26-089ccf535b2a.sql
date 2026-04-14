
-- Approve top 3 starter products and add short descriptions for content generation
UPDATE public.products SET status = 'approved', short_description = 'Magnetic clips that snap onto your desk to keep charging cables organized and tangle-free' WHERE id = 'a5dc18eb-8480-466d-a4d7-1f2888afa5bc';

UPDATE public.products SET status = 'approved', short_description = 'Ultra-compact wireless clip-on microphone for phones — perfect for TikTok, podcasts, and vlogging' WHERE id = '6d3bae09-4337-4c10-9ca0-efe471284a5d';

UPDATE public.products SET status = 'approved', short_description = 'Slim portable power bank with built-in cables — charge any device anywhere without carrying extra cords' WHERE id = 'bd086596-737c-44c4-93fd-db251086bce9';
