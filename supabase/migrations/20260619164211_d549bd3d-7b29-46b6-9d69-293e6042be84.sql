
CREATE TABLE public.bonuses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  note TEXT,
  given_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bonuses TO authenticated;
GRANT ALL ON public.bonuses TO service_role;

ALTER TABLE public.bonuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own bonuses" ON public.bonuses
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE INDEX bonuses_member_idx ON public.bonuses(member_id);

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
    SELECT COALESCE(COUNT(*) * m.rate, 0) INTO earned
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
