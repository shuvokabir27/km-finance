CREATE OR REPLACE FUNCTION public.shooting_summary(_shooting_id UUID)
RETURNS TABLE (
  present_count BIGINT,
  attendance_cost NUMERIC,
  extra_cost NUMERIC,
  total_cost NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  att_cost NUMERIC := 0;
  att_count BIGINT := 0;
  ext_cost NUMERIC := 0;
BEGIN
  SELECT COALESCE(SUM(m.rate), 0), COUNT(*)
    INTO att_cost, att_count
  FROM public.attendance a
  JOIN public.members m ON m.id = a.member_id
  WHERE a.shooting_id = _shooting_id AND a.present = true;

  SELECT COALESCE(SUM(amount), 0) INTO ext_cost
  FROM public.shooting_expenses WHERE shooting_id = _shooting_id;

  RETURN QUERY SELECT att_count, att_cost, ext_cost, att_cost + ext_cost;
END;
$$;