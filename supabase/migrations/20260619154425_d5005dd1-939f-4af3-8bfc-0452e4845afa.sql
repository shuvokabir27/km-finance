
CREATE OR REPLACE FUNCTION public.member_balance(_member_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  m public.members%ROWTYPE;
  earned NUMERIC := 0;
  paid NUMERIC := 0;
BEGIN
  SELECT * INTO m FROM public.members WHERE id = _member_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  IF m.type = 'daily' THEN
    SELECT COALESCE(COUNT(*) * m.rate, 0) INTO earned
    FROM public.attendance WHERE member_id = _member_id AND present = true;
  ELSE
    SELECT COALESCE(SUM(amount), 0) INTO earned
    FROM public.monthly_salaries WHERE member_id = _member_id;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO paid
  FROM public.payments WHERE member_id = _member_id;

  RETURN earned - paid;
END;
$$;
