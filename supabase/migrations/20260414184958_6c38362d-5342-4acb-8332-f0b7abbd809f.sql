
-- STEP 1: Reject all 🔴 slop posts
UPDATE content_ideas SET status = 'rejected', updated_at = now()
WHERE status = 'proposed' AND id IN (
  -- Gadget Finds 🔴
  '76e9eb90-4f55-4b18-af8b-1f44df2f84d5', -- cables productivity
  'e3787cd7-33f7-4f9e-a8eb-5048feb00de9', -- mini microphone
  '55efa74a-625a-4365-be24-578092efa1fa', -- gadget set-up revealed
  -- Tech Hacks 🔴
  'cb3a424b-42e6-48ff-a5df-5af6af505753', -- stop losing cables duplicate
  '7ae66dd4-76b9-4c69-962d-9a8947523775', -- desk killing productivity
  '7ecb5787-ca1d-47c7-8aef-1987b7e824d6', -- cheap gadget audio
  '60893fdd-2a8d-42c1-bd05-5cbb1d675366', -- shocking truth microphones
  -- Amazon Finds 🔴
  '421d5aa5-7674-49ea-b569-04ad2be26900', -- transform desk
  'f3cb87c8-02ac-4395-833b-5fe544cfbbe2', -- mini microphone content game
  -- Privacy Minute 🔴
  '6686d1b4-edb0-40b2-93aa-62d8ad8b40fb'  -- shocking truth apps
);

-- STEP 1b: Remove duplicates (keep one cable mgmt, one before/after)
UPDATE content_ideas SET status = 'rejected', updated_at = now()
WHERE status = 'proposed' AND id IN (
  '49502fb3-03b7-4620-8dab-417e7e832625', -- cable mgmt hacks duplicate (keeping b6d73fef)
  '3aa98fc6-91f8-4825-a55d-773fed25aa7c', -- boost productivity desk setups (redundant)
  'db833fd0-fbcb-4d48-b57d-be6df6840c46', -- before & after duplicate (keeping 7855864f)
  '1c4b269c-fee7-40cc-9099-ca84e27a9ec0'  -- 5 productivity tools (generic)
);

-- STEP 2: Tweak the keepers - smart home gadget hook
UPDATE content_ideas SET title = 'I tried this $30 smart home gadget — worth it?', updated_at = now()
WHERE id = '31243b05-3e9e-43fc-8b72-e7147fd02bbf';

-- STEP 2: Tweak Amazon Finds title
UPDATE content_ideas SET title = '5 gadgets under $25 that are actually worth it', updated_at = now()
WHERE id = '552028fb-464f-4e5d-89aa-559ef516586e';

-- STEP 2: Approve the final batch (6-7 posts)
UPDATE content_ideas SET status = 'approved', updated_at = now()
WHERE id IN (
  '91acc5cf-3181-42f5-86f4-315afac09bea', -- 3 Kitchen Gadgets Under $20
  '10498913-5901-4f74-a3bc-ca7bfbd370b0', -- 5 Bathroom Gadgets
  '7fc19ed1-e7da-4606-a8ce-1024ee415cba', -- Magnetic clips under $13
  'e0a0a66d-7ab0-4ba9-81ca-3a5480d99ba9', -- Charging cables mess $10 fix
  '5232d967-1fcb-4168-bd97-54e16db1ec80', -- Hidden Ghost Towns
  '652653d0-f4ba-4236-8f33-d55a8a22195c', -- Urban Legends
  'c9ca580b-035d-40f2-92e7-e93ce728f20a'  -- Weird Facts Landmarks
);
