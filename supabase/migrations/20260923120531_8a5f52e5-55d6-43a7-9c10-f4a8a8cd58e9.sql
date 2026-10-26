ALTER TABLE public.attendance DROP CONSTRAINT attendance_shooting_id_fkey;
ALTER TABLE public.attendance
  ADD CONSTRAINT attendance_shooting_id_fkey
  FOREIGN KEY (shooting_id) REFERENCES public.shootings(id) ON DELETE CASCADE;

DELETE FROM public.attendance
WHERE shooting_id IS NULL
  AND date = '2026-09-04'
  AND created_at >= '2026-09-21'
  AND created_at < '2026-09-22';