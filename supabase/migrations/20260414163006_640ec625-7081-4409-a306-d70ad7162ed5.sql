
-- Update Gadget Finds Daily: cinematic, realism 60
UPDATE public.account_configs
SET realism_level = 60,
    visual_style = 'cinematic',
    style_notes = 'Allow stylized reveals and flashy transitions. Product must still be recognizable. Fast cuts, satisfying moments.',
    content_style = 'demo-first, fast reveals, satisfying, flashy',
    updated_at = now()
WHERE id = '4594b217-b145-424f-9a6a-040c5e2adea7';

-- Rebrand Smart Stuff Under $50 → Tech Hacks: realistic, realism 85
UPDATE public.account_configs
SET account_name = 'Tech Hacks',
    account_id = 'tech_hacks',
    handle = '@TechHacksDaily',
    realism_level = 85,
    visual_style = 'realistic',
    style_notes = 'Must feel real and practical. Show actual product usage. No fantasy or abstract elements.',
    content_style = 'problem-solution, practical demos, real usage',
    hook_style = 'problem',
    promise = 'Simple tech solutions to everyday frustrations',
    updated_at = now()
WHERE id = '4e097254-699c-49a2-861b-e7537c92c2c4';

-- Insert new Amazon Finds account
INSERT INTO public.account_configs (
    account_id, account_name, handle, vertical, platform,
    monetization_mode, hook_style, promise,
    content_pillars, content_style,
    persona, audience, cta_style, cta_phrases,
    realism_level, visual_style, style_notes,
    priority_score
) VALUES (
    'amazon_finds', 'Amazon Finds', '@AmazonFindsHQ', 'gadgets', 'tiktok',
    'product_first', 'listicle', 'The best gadgets you can buy on Amazon right now',
    ARRAY['top picks', 'monthly roundups', 'under $30', 'best sellers'],
    'listicle format, clean product shots, rapid-fire reveals',
    '{"tone": "enthusiastic", "vibe": "curator"}'::jsonb,
    '{"who": "impulse shoppers and deal hunters", "pain_points": ["too many choices", "fear of bad purchases"]}'::jsonb,
    'direct', ARRAY['Link in bio', 'Comment LINK for the list', 'Save this for later'],
    90, 'realistic', 'Product clarity above all. No stylization. Clean backgrounds, real product footage feel.',
    80
);
