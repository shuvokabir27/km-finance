
-- Backfill existing present attendance rows with current member rate
UPDATE public.attendance a
SET rate_override = m.rate
FROM public.members m
WHERE a.member_id = m.id
  AND a.present = true
  AND a.rate_override IS NULL;

-- Trigger to snapshot member rate onto attendance at write time
CREATE OR REPLACE FUNCTION public.snapshot_attendance_rate()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.present = true AND NEW.rate_override IS NULL THEN
    SELECT rate INTO NEW.rate_override FROM public.members WHERE id = NEW.member_id;
  END IF;
  IF NEW.present = false THEN
    NEW.rate_override := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_snapshot_rate ON public.attendance;
CREATE TRIGGER attendance_snapshot_rate
BEFORE INSERT OR UPDATE ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.snapshot_attendance_rate();
