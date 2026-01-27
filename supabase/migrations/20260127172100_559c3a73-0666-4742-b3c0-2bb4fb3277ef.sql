-- Fix original_prompt for existing Film Mode story jobs
-- Story: 06413850-6638-4df7-a53e-c5e33a08bdbb

-- Scene 1 (sequence_index=1): "GAZES at approaching dragon army"
UPDATE video_jobs 
SET original_prompt = 'GAZES at approaching dragon army'
WHERE id = '2e714138-2320-4cfb-964b-be4ee03e180e';

-- Scene 2 (sequence_index=2): "UNLEASHES a battle roar"
UPDATE video_jobs 
SET original_prompt = 'UNLEASHES a battle roar'
WHERE id = '34e0de50-0fe1-45e6-a169-b0f6b6fe80cb';