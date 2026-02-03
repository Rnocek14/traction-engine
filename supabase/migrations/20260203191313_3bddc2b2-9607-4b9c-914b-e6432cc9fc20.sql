-- Trigger to ensure only one active voiceover per story_job_id
CREATE OR REPLACE FUNCTION public.ensure_single_active_voiceover()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_active = true THEN
    UPDATE public.story_voiceovers 
    SET is_active = false, updated_at = now()
    WHERE story_job_id = NEW.story_job_id 
      AND id != NEW.id 
      AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop if exists then create trigger
DROP TRIGGER IF EXISTS ensure_single_active_voiceover_trigger ON public.story_voiceovers;

CREATE TRIGGER ensure_single_active_voiceover_trigger
  BEFORE INSERT OR UPDATE ON public.story_voiceovers
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_single_active_voiceover();