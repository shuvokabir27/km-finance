
-- Trigger-only / server-only functions: no external callers
REVOKE ALL ON FUNCTION public.grant_admin_for_allowlisted_email() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hash_admin_pin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.snapshot_attendance_rate() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_initial_monthly_salary() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_attend_shootings_on_monthly_member() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_attend_monthly_on_shooting() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_monthly_salaries_for_all() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.find_email_by_mobile_pin(text, text) FROM PUBLIC, anon, authenticated;

-- has_role: authenticated only (used by app RLS/gate)
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
