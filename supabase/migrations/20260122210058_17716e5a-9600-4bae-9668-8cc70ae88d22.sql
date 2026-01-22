-- Seed content_policies
INSERT INTO public.content_policies (
  vertical,
  banned_phrases,
  prohibited_claim_types,
  required_disclaimers,
  fact_check_required,
  safety_rules
) VALUES
(
  'health',
  ARRAY['cure your stroke', 'guaranteed recovery', 'doctor hates this', 'miracle cure'],
  ARRAY['cure_claim', 'guarantee_claim', 'treatment_replacement', 'diagnosis_instruction'],
  ARRAY['This is not medical advice.', 'Talk to a licensed clinician for personal guidance.'],
  true,
  '{"disallow_exercise_instructions": true, "disallow_diagnosis": true, "require_disclaimer_on_treatment": true}'::jsonb
),
(
  'privacy',
  ARRAY['guaranteed results', 'instant money', 'get rich quick'],
  ARRAY['guarantee_claim', 'illegal_instruction'],
  ARRAY['Results may vary.'],
  false,
  '{"disallow_illegal": true}'::jsonb
)
ON CONFLICT (vertical) DO UPDATE SET
  banned_phrases = EXCLUDED.banned_phrases,
  prohibited_claim_types = EXCLUDED.prohibited_claim_types,
  required_disclaimers = EXCLUDED.required_disclaimers,
  fact_check_required = EXCLUDED.fact_check_required,
  safety_rules = EXCLUDED.safety_rules;

-- Seed account_configs
INSERT INTO public.account_configs (
  account_id,
  vertical,
  persona,
  audience,
  promise,
  content_pillars,
  banned_topics,
  claim_policy,
  cta_style,
  cta_phrases,
  cta_destination,
  style_rules,
  disclaimer_rules,
  uniqueness_salt
) VALUES
(
  'stroke_recovery_app',
  'health',
  '{"tone": "calm", "vibe": "supportive"}'::jsonb,
  '{"who": "stroke survivors and caregivers", "pain_points": ["confusion", "overwhelm", "lack of routine", "fear of setbacks"]}'::jsonb,
  'Simple, safe daily support for recovery routines and progress tracking.',
  ARRAY['education', 'habits', 'motivation', 'mythbusting'],
  ARRAY['diagnosis', 'exercise prescriptions', 'medical cure claims'],
  'strict',
  'soft',
  ARRAY['Try the free checklist', 'Save this for later', 'Follow for daily recovery support'],
  'https://example.com/stroke-app',
  '{"max_length_seconds": 55, "pacing": "medium", "profanity": false, "emoji_allowed": true}'::jsonb,
  '{"always_required": true, "trigger_keywords": ["treatment", "rehab", "therapy", "recovery", "symptom"]}'::jsonb,
  'stroke-v1'
),
(
  'footprint_finder',
  'privacy',
  '{"tone": "playful", "vibe": "curious"}'::jsonb,
  '{"who": "people curious about their neighborhood history", "pain_points": ["boring research", "no time", "hard to trust sources"]}'::jsonb,
  'Turn any location into a story in 60 seconds.',
  ARRAY['local_history', 'weird_facts', 'mysteries', 'before_after'],
  ARRAY['doxxing', 'private addresses'],
  'moderate',
  'direct',
  ARRAY['Tap to explore your area', 'Get the map link', 'Follow for daily local stories'],
  'https://example.com/footprint',
  '{"max_length_seconds": 60, "pacing": "fast", "profanity": false, "emoji_allowed": true}'::jsonb,
  '{"always_required": false, "trigger_keywords": ["allegedly", "unverified", "rumor"]}'::jsonb,
  'footprint-v1'
)
ON CONFLICT (account_id) DO UPDATE SET
  vertical = EXCLUDED.vertical,
  persona = EXCLUDED.persona,
  audience = EXCLUDED.audience,
  promise = EXCLUDED.promise,
  content_pillars = EXCLUDED.content_pillars,
  banned_topics = EXCLUDED.banned_topics,
  claim_policy = EXCLUDED.claim_policy,
  cta_style = EXCLUDED.cta_style,
  cta_phrases = EXCLUDED.cta_phrases,
  cta_destination = EXCLUDED.cta_destination,
  style_rules = EXCLUDED.style_rules,
  disclaimer_rules = EXCLUDED.disclaimer_rules,
  uniqueness_salt = EXCLUDED.uniqueness_salt;

-- Seed topic_bank (health topics)
INSERT INTO public.topic_bank (
  vertical, pillar, topic_prompt, hook_variants, suggested_cta,
  motif_hints, claim_sensitivity, cooldown_days, times_used,
  seasonal_tags, trend_keywords, is_evergreen
) VALUES
(
  'health', 'education',
  'Explain one recovery concept that people often misunderstand, without giving medical instructions.',
  ARRAY['A lot of people get this wrong after a stroke…', 'This is why recovery feels nonlinear…', 'One thing I wish someone told caregivers earlier…'],
  'Save this and share with a caregiver.',
  ARRAY['calm hands', 'notebook checklist', 'progress dots', 'gentle routine'],
  4, 7, 0, ARRAY['evergreen'], ARRAY['stroke recovery', 'rehab', 'caregiver'], true
),
(
  'health', 'mythbusting',
  'Bust a common miracle cure style claim safely and redirect to evidence-based behavior.',
  ARRAY['Quick PSA: this miracle claim is misleading…', 'If you heard this recovery promise, pause…', 'Lets separate hope from hype in recovery…'],
  'Follow for daily safe recovery tips.',
  ARRAY['red flag stamp', 'myth vs fact cards'],
  5, 10, 0, ARRAY['evergreen'], ARRAY['myth', 'misinformation'], true
),
(
  'health', 'habits',
  'Share a simple daily habit that supports recovery without prescribing exercise.',
  ARRAY['This tiny habit changed my recovery routine…', 'One thing I do every morning now…', 'The simplest thing you can add to your day…'],
  'Try the free checklist.',
  ARRAY['morning routine', 'checklist', 'calm setting'],
  3, 5, 0, ARRAY['evergreen'], ARRAY['habits', 'routine', 'daily'], true
),
(
  'health', 'motivation',
  'Share an encouraging message for recovery without making promises.',
  ARRAY['If today feels hard, remember this…', 'Recovery is not a straight line…', 'Something I want every survivor to know…'],
  'Save this for later.',
  ARRAY['sunrise', 'hopeful', 'gentle'],
  2, 3, 0, ARRAY['evergreen'], ARRAY['motivation', 'hope', 'support'], true
),
(
  'privacy', 'local_history',
  'Tell a short what used to be here story (avoid private addresses; keep it general).',
  ARRAY['Youve walked past this spot a hundred times…', 'This place had a totally different life before…', 'Heres the story hiding in plain sight…'],
  'Tap to explore your neighborhood.',
  ARRAY['old map overlay', 'before/after dissolve', 'street corner wide shot'],
  2, 3, 0, ARRAY['evergreen'], ARRAY['local history', 'hidden history'], true
),
(
  'privacy', 'mysteries',
  'Present a local mystery as a question plus possibilities, clearly labeled as uncertain.',
  ARRAY['Nobody agrees on why this happened…', 'This local detail is still unexplained…', 'Okay, this one is weird…'],
  'Follow for daily local mysteries.',
  ARRAY['fog', 'question marks', 'archive photos'],
  3, 5, 0, ARRAY['halloween', 'fall'], ARRAY['mystery', 'urban legend'], true
),
(
  'privacy', 'weird_facts',
  'Share a surprising fact about data or digital footprints that most people dont know.',
  ARRAY['Your phone knows more about you than you think…', 'This setting has been tracking you for years…', 'Bet you didnt know apps share this…'],
  'Check your digital footprint.',
  ARRAY['phone screen', 'settings menu', 'data visualization'],
  3, 5, 0, ARRAY['evergreen'], ARRAY['data privacy', 'tracking', 'digital footprint'], true
),
(
  'privacy', 'before_after',
  'Show how a location or data setting looked before vs after a change.',
  ARRAY['Look how different this was 10 years ago…', 'Before and after: your privacy settings…', 'This is what changed when you updated…'],
  'Get the map link.',
  ARRAY['split screen', 'timeline', 'comparison'],
  2, 4, 0, ARRAY['evergreen'], ARRAY['before after', 'comparison', 'change'], true
)
ON CONFLICT DO NOTHING;