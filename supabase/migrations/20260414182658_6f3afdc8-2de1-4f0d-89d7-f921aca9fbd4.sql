-- Fix Gadget Finds Daily: viral discovery role
UPDATE account_configs SET 
  content_pillars = ARRAY['kitchen_gadgets','travel_gadgets','smart_home','weird_gadgets','unique_finds','bathroom_gadgets','edc_tools'],
  banned_topics = ARRAY['cables','cable management','desk setup','microphones','monitors']
WHERE account_id = 'gadget_finds';

-- Fix Tech Hacks: problem solver role
UPDATE account_configs SET 
  content_pillars = ARRAY['phone_accessories','cable_management','productivity_tools','desk_setup','daily_annoyances'],
  banned_topics = ARRAY[]::text[]
WHERE account_id = 'tech_hacks';

-- Fix Amazon Finds: listicle/shopping role (all categories)
UPDATE account_configs SET 
  content_pillars = ARRAY['kitchen_gadgets','car_gadgets','travel_gadgets','phone_accessories','edc_tools','bathroom_gadgets','smart_home','desk_setup','cable_management','productivity_tools'],
  banned_topics = ARRAY[]::text[]
WHERE account_id = 'amazon_finds';

-- Fix Footprint Finder: local history ONLY
UPDATE account_configs SET 
  content_pillars = ARRAY['local_history','weird_facts','hidden_places','urban_legends','before_after_locations','mysteries'],
  banned_topics = ARRAY['cybersecurity','data breaches','privacy','VPN','passwords','hacking','encryption','surveillance','digital safety']
WHERE account_id = 'footprint_finder';

-- Fix Stroke Recovery: health education ONLY
UPDATE account_configs SET 
  content_pillars = ARRAY['education','habits','motivation','mythbusting','recovery_tips','caregiver_support'],
  banned_topics = ARRAY['cybersecurity','data breaches','privacy','VPN','passwords','hacking','encryption','surveillance','digital safety']
WHERE account_id = 'stroke_recovery_app';

-- Purge contaminated Footprint Finder ideas (cyber/privacy topics)
UPDATE content_ideas SET status = 'rejected'
WHERE account_id = 'footprint_finder' 
  AND status IN ('proposed', 'approved')
  AND (
    title ILIKE '%cyber%' OR title ILIKE '%privacy%' OR title ILIKE '%VPN%' 
    OR title ILIKE '%password%' OR title ILIKE '%hack%' OR title ILIKE '%data breach%'
    OR title ILIKE '%encryption%' OR title ILIKE '%surveillance%'
    OR subject ILIKE '%cyber%' OR subject ILIKE '%privacy%' OR subject ILIKE '%VPN%'
    OR subject ILIKE '%password%' OR subject ILIKE '%data breach%'
  );

-- Purge contaminated Stroke Recovery ideas (cyber/privacy topics)
UPDATE content_ideas SET status = 'rejected'
WHERE account_id = 'stroke_recovery_app' 
  AND status IN ('proposed', 'approved')
  AND (
    title ILIKE '%cyber%' OR title ILIKE '%privacy%' OR title ILIKE '%VPN%' 
    OR title ILIKE '%password%' OR title ILIKE '%hack%' OR title ILIKE '%data breach%'
    OR title ILIKE '%encryption%' OR title ILIKE '%surveillance%'
    OR subject ILIKE '%cyber%' OR subject ILIKE '%privacy%' OR subject ILIKE '%VPN%'
    OR subject ILIKE '%password%' OR subject ILIKE '%data breach%'
  );