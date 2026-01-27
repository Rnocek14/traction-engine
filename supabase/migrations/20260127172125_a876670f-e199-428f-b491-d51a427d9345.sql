-- Fix Scene 3 (sequence_index=3): "DODGES falling rubble"
UPDATE video_jobs 
SET original_prompt = 'DODGES falling rubble'
WHERE id = '235029f6-3890-490e-9663-0591ed4d4134';