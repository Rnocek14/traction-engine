-- Update timeline with optimized Reels pacing (front-loaded faster cuts)
UPDATE studio_timelines
SET timeline_json = jsonb_build_object(
  'clips', jsonb_build_array(
    jsonb_build_object(
      'id', '06e322a1-7ad7-4656-8aeb-94266240e567',
      'type', 'video',
      'start', 0,
      'end', 2.0,
      'prompt', 'Close-up of person sitting peacefully, eyes closed, morning light on face — cinematic shallow depth of field, slight camera push-in',
      'settings', jsonb_build_object('provider', 'sora', 'size', '1080x1920', 'duration', 2),
      'disabled', false,
      'locked', false,
      'notes', 'HOOK - fast impact, motion adds energy'
    ),
    jsonb_build_object(
      'id', '369e3a09-21b3-4e9c-82d1-75cebcb97dec',
      'type', 'video',
      'start', 2.0,
      'end', 5.0,
      'prompt', 'Soft focus transition to brain visualization, glowing neural pathways lighting up — medical illustration style',
      'settings', jsonb_build_object('provider', 'sora', 'size', '1080x1920', 'duration', 3),
      'disabled', false,
      'locked', false,
      'notes', 'Visual metaphor - the science moment'
    ),
    jsonb_build_object(
      'id', 'b7c6dbb4-8438-41ae-8a85-02091b177b8a',
      'type', 'video',
      'start', 5.0,
      'end', 7.5,
      'prompt', 'Hands resting on lap, gentle breathing motion visible — warm indoor lighting',
      'settings', jsonb_build_object('provider', 'sora', 'size', '1080x1920', 'duration', 2.5),
      'disabled', false,
      'locked', false,
      'notes', 'Grounding moment - calm before action'
    ),
    jsonb_build_object(
      'id', 'c20f3827-9bf9-4d6a-a950-c8f8f2a6bda3',
      'type', 'video',
      'start', 7.5,
      'end', 10.5,
      'prompt', 'Person slowly opening eyes with calm determination — golden hour through window',
      'settings', jsonb_build_object('provider', 'sora', 'size', '1080x1920', 'duration', 3),
      'disabled', false,
      'locked', false,
      'notes', 'Transition - ready to act'
    ),
    jsonb_build_object(
      'id', 'bb7d38cf-9f22-4167-b050-ff7378648d4c',
      'type', 'video',
      'start', 10.5,
      'end', 16.0,
      'prompt', 'Beginning a simple arm raise exercise with intention — physical therapy setting, show full motion arc',
      'settings', jsonb_build_object('provider', 'sora', 'size', '1080x1920', 'duration', 5.5),
      'disabled', false,
      'locked', false,
      'notes', 'THE ACTION - linger here, show it clearly'
    ),
    jsonb_build_object(
      'id', '3d7e1bb7-171f-44bf-8b66-866674ff16e8',
      'type', 'video',
      'start', 16.0,
      'end', 22.0,
      'prompt', 'Warm smile of accomplishment, text overlay ''Visualize first'' and small ''AI Voice'' disclosure bottom corner — uplifting closure',
      'settings', jsonb_build_object('provider', 'sora', 'size', '1080x1920', 'duration', 6),
      'disabled', false,
      'locked', false,
      'notes', 'CTA lands here - space for on-screen text + AI disclosure'
    )
  ),
  'duration', 22,
  'playback', jsonb_build_object('fps', 30, 'loop', false)
),
version = 2,
label = 'The One Thing Before Training (Optimized)',
updated_at = now()
WHERE id = 'b597d1ae-06e5-4dcf-a4f0-0dc33950bf08';

-- Also update script_content to include AI disclosure in caption
UPDATE script_runs
SET script_content = script_content || jsonb_build_object(
  'ai_disclosure', 'AI Voice',
  'caption', 'If you''re recovering from a stroke, do THIS before you train today. Your recovery just got faster 👇 [AI Voice]'
)
WHERE id = 'd4ba85e6-db02-47bf-b5a1-01df1c6ad962';