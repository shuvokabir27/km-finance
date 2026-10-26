
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS rate_override numeric;

CREATE OR REPLACE FUNCTION public.member_balance(_member_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  m public.members%ROWTYPE;
  earned NUMERIC := 0;
  paid NUMERIC := 0;
  bonus NUMERIC := 0;
BEGIN
  SELECT * INTO m FROM public.members WHERE id = _member_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  IF m.type = 'daily' THEN
    SELECT COALESCE(SUM(COALESCE(rate_override, m.rate)), 0) INTO earned
    FROM public.attendance WHERE member_id = _member_id AND present = true;
  ELSE
    SELECT COALESCE(SUM(amount), 0) INTO earned
    FROM public.monthly_salaries WHERE member_id = _member_id;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO bonus
  FROM public.bonuses WHERE member_id = _member_id;

  SELECT COALESCE(SUM(amount), 0) INTO paid
  FROM public.payments WHERE member_id = _member_id;

  RETURN earned + bonus - paid;
END;
$function$;

CREATE OR REPLACE FUNCTION public.shooting_summary(_shooting_id uuid)
 RETURNS TABLE(present_count bigint, attendance_cost numeric, extra_cost numeric, total_cost numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  att_cost NUMERIC := 0;
  att_count BIGINT := 0;
  ext_cost NUMERIC := 0;
BEGIN
  SELECT COALESCE(SUM(COALESCE(a.rate_override, m.rate)), 0), COUNT(*)
    INTO att_cost, att_count
  FROM public.attendance a
  JOIN public.members m ON m.id = a.member_id
  WHERE a.shooting_id = _shooting_id AND a.present = true;

  SELECT COALESCE(SUM(amount), 0) INTO ext_cost
  FROM public.shooting_expenses WHERE shooting_id = _shooting_id;

  RETURN QUERY SELECT att_count, att_cost, ext_cost, att_cost + ext_cost;
END;
$function$;
