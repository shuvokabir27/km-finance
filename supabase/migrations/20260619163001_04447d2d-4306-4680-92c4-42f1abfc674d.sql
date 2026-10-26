CREATE TABLE public.shootings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  name TEXT NOT NULL,
  shoot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  location TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, shoot_date, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shootings TO authenticated;
GRANT ALL ON public.shootings TO service_role;

ALTER TABLE public.shootings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own shootings" ON public.shootings
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE TABLE public.shooting_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  shooting_id UUID NOT NULL REFERENCES public.shootings(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  note TEXT,
  spent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shooting_expenses TO authenticated;
GRANT ALL ON public.shooting_expenses TO service_role;

ALTER TABLE public.shooting_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own shooting expenses" ON public.shooting_expenses
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE INDEX idx_shooting_expenses_shooting ON public.shooting_expenses(shooting_id);

ALTER TABLE public.attendance ADD COLUMN shooting_id UUID REFERENCES public.shootings(id) ON DELETE SET NULL;
CREATE INDEX idx_attendance_shooting ON public.attendance(shooting_id);

CREATE OR REPLACE FUNCTION public.shooting_summary(_shooting_id UUID)
RETURNS TABLE (
  present_count BIGINT,
  attendance_cost NUMERIC,
  extra_cost NUMERIC,
  total_cost NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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