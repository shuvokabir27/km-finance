
REVOKE EXECUTE ON FUNCTION public.member_balance(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_initial_monthly_salary() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_monthly_salaries_for_all() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_balance(UUID) TO authenticated;
