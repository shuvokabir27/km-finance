
-- Member type enum
CREATE TYPE public.member_type AS ENUM ('daily', 'monthly');

-- Members table
CREATE TABLE public.members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT,
  type public.member_type NOT NULL,
  rate NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.members TO authenticated;
GRANT ALL ON public.members TO service_role;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own members" ON public.members FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- Attendance (daily only)
CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  present BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(member_id, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO authenticated;
GRANT ALL ON public.attendance TO service_role;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own attendance" ON public.attendance FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- Monthly salaries (auto-added for monthly members)
CREATE TABLE public.monthly_salaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  month DATE NOT NULL, -- first day of month
  amount NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(member_id, month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_salaries TO authenticated;
GRANT ALL ON public.monthly_salaries TO service_role;
ALTER TABLE public.monthly_salaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own salaries" ON public.monthly_salaries FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- Payments
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  note TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own payments" ON public.payments FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- Balance function
CREATE OR REPLACE FUNCTION public.member_balance(_member_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m public.members%ROWTYPE;
  earned NUMERIC := 0;
  paid NUMERIC := 0;
BEGIN
  SELECT * INTO m FROM public.members WHERE id = _member_id AND owner_id = auth.uid();
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

-- Auto-add current month's salary for new monthly member
CREATE OR REPLACE FUNCTION public.add_initial_monthly_salary()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type = 'monthly' AND NEW.rate > 0 THEN
    INSERT INTO public.monthly_salaries (owner_id, member_id, month, amount)
    VALUES (NEW.owner_id, NEW.id, date_trunc('month', now())::date, NEW.rate)
    ON CONFLICT (member_id, month) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER members_initial_salary
AFTER INSERT ON public.members
FOR EACH ROW EXECUTE FUNCTION public.add_initial_monthly_salary();

-- Function to add monthly salaries for all monthly members (called by cron on 1st of month)
CREATE OR REPLACE FUNCTION public.add_monthly_salaries_for_all()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.monthly_salaries (owner_id, member_id, month, amount)
  SELECT owner_id, id, date_trunc('month', now())::date, rate
  FROM public.members
  WHERE type = 'monthly' AND rate > 0
  ON CONFLICT (member_id, month) DO NOTHING;
END;
$$;

-- Schedule monthly job: 1st of every month at 00:05
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule(
  'add-monthly-salaries',
  '5 0 1 * *',
  $$ SELECT public.add_monthly_salaries_for_all(); $$
);
