-- ==============================================================================
-- KUAKATA MULTIMEDIA FINANCE - COMPLETE DATABASE SCHEMA
-- Auto-generated from 37 sequential Supabase migrations
-- Target: Supabase PostgreSQL (Run in Supabase SQL Editor)
-- ==============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ------------------------------------------------------------------------------
-- Migration: 20260619153826_9eb3968b-f5d8-4be5-ab25-8c47ec174104.sql
-- ------------------------------------------------------------------------------

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

-- ------------------------------------------------------------------------------
-- Migration: 20260619153921_ec02dd02-3a83-4d31-b879-109c3259e824.sql
-- ------------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.member_balance(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_initial_monthly_salary() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_monthly_salaries_for_all() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_balance(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- Migration: 20260619154425_d5005dd1-939f-4af3-8bfc-0452e4845afa.sql
-- ------------------------------------------------------------------------------

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

-- ------------------------------------------------------------------------------
-- Migration: 20260619162323_1193ef9d-aca1-43aa-87a6-37a8a0fdc962.sql
-- ------------------------------------------------------------------------------

ALTER TABLE public.members ADD COLUMN IF NOT EXISTS photo_url text;

-- ------------------------------------------------------------------------------
-- Migration: 20260619162357_8ea52b45-10d5-4d71-9f35-2da300065295.sql
-- ------------------------------------------------------------------------------

CREATE POLICY "own member photos read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'member-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "own member photos insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'member-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "own member photos update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'member-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "own member photos delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'member-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ------------------------------------------------------------------------------
-- Migration: 20260619162744_d126a056-8cd0-4615-83c3-96dfade5b54b.sql
-- ------------------------------------------------------------------------------

CREATE TYPE public.account_kind AS ENUM ('bkash', 'nagad', 'rocket', 'upay', 'bank');

CREATE TABLE public.member_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  kind public.account_kind NOT NULL,
  bank_name TEXT,
  branch TEXT,
  account_holder TEXT,
  account_number TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_accounts TO authenticated;
GRANT ALL ON public.member_accounts TO service_role;

ALTER TABLE public.member_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own member accounts" ON public.member_accounts
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE INDEX idx_member_accounts_member ON public.member_accounts(member_id);

-- ------------------------------------------------------------------------------
-- Migration: 20260619163001_04447d2d-4306-4680-92c4-42f1abfc674d.sql
-- ------------------------------------------------------------------------------

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

-- ------------------------------------------------------------------------------
-- Migration: 20260619163028_da631652-b92b-4975-8679-294103d9aca8.sql
-- ------------------------------------------------------------------------------

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

-- ------------------------------------------------------------------------------
-- Migration: 20260619164211_d549bd3d-7b29-46b6-9d69-293e6042be84.sql
-- ------------------------------------------------------------------------------

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

-- ------------------------------------------------------------------------------
-- Migration: 20260619174850_9e726296-d736-4368-a049-6905b66ca836.sql
-- ------------------------------------------------------------------------------

ALTER TABLE public.shootings ADD COLUMN IF NOT EXISTS director text;

-- ------------------------------------------------------------------------------
-- Migration: 20260619181042_e73b123e-58de-4f83-8df7-80f9f43423a3.sql
-- ------------------------------------------------------------------------------

CREATE TABLE public.admin_credentials (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  mobile text NOT NULL UNIQUE,
  pin text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mobile_11_digits CHECK (mobile ~ '^\d{11}$'),
  CONSTRAINT pin_4_digits CHECK (pin ~ '^\d{4}$')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_credentials TO authenticated;
GRANT ALL ON public.admin_credentials TO service_role;

ALTER TABLE public.admin_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own admin credentials" ON public.admin_credentials
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_admin_credentials_updated
BEFORE UPDATE ON public.admin_credentials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Public lookup: given mobile + pin, return associated email (or NULL).
CREATE OR REPLACE FUNCTION public.find_email_by_mobile_pin(_mobile text, _pin text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM public.admin_credentials
  WHERE mobile = _mobile AND pin = _pin
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.find_email_by_mobile_pin(text, text) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- Migration: 20260619183127_2364eda7-7b04-419e-a6d6-25fa4b546310.sql
-- ------------------------------------------------------------------------------

CREATE TABLE public.sms_otp_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mobile TEXT NOT NULL,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.sms_otp_codes TO service_role;
ALTER TABLE public.sms_otp_codes ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_sms_otp_mobile ON public.sms_otp_codes(mobile, created_at DESC);

-- ------------------------------------------------------------------------------
-- Migration: 20260620000548_7420ee1b-c89d-4c0f-895b-f721ebfec83b.sql
-- ------------------------------------------------------------------------------

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

-- ------------------------------------------------------------------------------
-- Migration: 20260620102641_a30d3d40-f5ac-4bee-a90e-48cd38825529.sql
-- ------------------------------------------------------------------------------

-- Add channel column to shootings
ALTER TABLE public.shootings ADD COLUMN IF NOT EXISTS channel text;

-- Channels table (owner-scoped, used for the dropdown of existing channels)
CREATE TABLE IF NOT EXISTS public.channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.channels TO authenticated;
GRANT ALL ON public.channels TO service_role;

ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage own channels"
ON public.channels
FOR ALL
TO authenticated
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

-- ------------------------------------------------------------------------------
-- Migration: 20260620103335_4fa38e27-7c2c-4365-b3a5-dc89d76b83b9.sql
-- ------------------------------------------------------------------------------

ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS logo_url text;

CREATE TABLE IF NOT EXISTS public.directors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  photo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.directors TO authenticated;
GRANT ALL ON public.directors TO service_role;

ALTER TABLE public.directors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their directors"
  ON public.directors FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE TRIGGER update_directors_updated_at
  BEFORE UPDATE ON public.directors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------------------------
-- Migration: 20260621024851_901ceaba-cd3d-46e2-b127-b83c55ffb9af.sql
-- ------------------------------------------------------------------------------

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS share_token text,
  ADD COLUMN IF NOT EXISTS share_enabled boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS members_share_token_key ON public.members (share_token) WHERE share_token IS NOT NULL;

-- ------------------------------------------------------------------------------
-- Migration: 20260621025524_80cb7ae5-a13e-44a9-8589-d2147cbc4c50.sql
-- ------------------------------------------------------------------------------

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS share_from date,
  ADD COLUMN IF NOT EXISTS share_to date;

-- ------------------------------------------------------------------------------
-- Migration: 20260621173942_f4fefc1a-79c4-4426-9129-5518af27c572.sql
-- ------------------------------------------------------------------------------

ALTER TABLE public.admin_credentials DROP CONSTRAINT IF EXISTS pin_4_digits;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

UPDATE public.admin_credentials
SET pin = extensions.crypt(pin, extensions.gen_salt('bf'))
WHERE pin IS NOT NULL AND pin NOT LIKE '$2%';

CREATE OR REPLACE FUNCTION public.hash_admin_pin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.pin IS NOT NULL AND NEW.pin !~ '^\$2[aby]?\$' THEN
    NEW.pin := extensions.crypt(NEW.pin, extensions.gen_salt('bf'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hash_admin_pin_trg ON public.admin_credentials;
CREATE TRIGGER hash_admin_pin_trg
BEFORE INSERT OR UPDATE OF pin ON public.admin_credentials
FOR EACH ROW EXECUTE FUNCTION public.hash_admin_pin();

CREATE OR REPLACE FUNCTION public.find_email_by_mobile_pin(_mobile text, _pin text)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT email FROM public.admin_credentials
  WHERE mobile = _mobile AND pin = extensions.crypt(_pin, pin)
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.find_email_by_mobile_pin(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_monthly_salaries_for_all() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_initial_monthly_salary() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hash_admin_pin() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Deny all client access" ON public.sms_otp_codes;
CREATE POLICY "Deny all client access" ON public.sms_otp_codes
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- ------------------------------------------------------------------------------
-- Migration: 20260626031539_354e84a0-9785-41d0-ad11-027ef720dc24.sql
-- ------------------------------------------------------------------------------

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

-- ------------------------------------------------------------------------------
-- Migration: 20260702125407_137a8529-214f-450e-9d1c-9a6d5ff9d72e.sql
-- ------------------------------------------------------------------------------

-- Trigger fn: when a shooting is created, auto-attend all monthly members
CREATE OR REPLACE FUNCTION public.auto_attend_monthly_on_shooting()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.attendance (owner_id, member_id, date, present, shooting_id, rate_override)
  SELECT NEW.owner_id, m.id, NEW.shoot_date, true, NEW.id, 0
  FROM public.members m
  WHERE m.owner_id = NEW.owner_id AND m.type = 'monthly'
  ON CONFLICT (member_id, date) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shootings_auto_attend_monthly ON public.shootings;
CREATE TRIGGER shootings_auto_attend_monthly
AFTER INSERT ON public.shootings
FOR EACH ROW EXECUTE FUNCTION public.auto_attend_monthly_on_shooting();

-- Trigger fn: when a monthly member is created, auto-attend all existing shootings
CREATE OR REPLACE FUNCTION public.auto_attend_shootings_on_monthly_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type = 'monthly' THEN
    INSERT INTO public.attendance (owner_id, member_id, date, present, shooting_id, rate_override)
    SELECT NEW.owner_id, NEW.id, s.shoot_date, true, s.id, 0
    FROM public.shootings s
    WHERE s.owner_id = NEW.owner_id
    ON CONFLICT (member_id, date) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS members_auto_attend_shootings ON public.members;
CREATE TRIGGER members_auto_attend_shootings
AFTER INSERT ON public.members
FOR EACH ROW EXECUTE FUNCTION public.auto_attend_shootings_on_monthly_member();

-- Backfill: for every existing monthly member, add attendance to every existing shooting
INSERT INTO public.attendance (owner_id, member_id, date, present, shooting_id, rate_override)
SELECT s.owner_id, m.id, s.shoot_date, true, s.id, 0
FROM public.shootings s
JOIN public.members m ON m.owner_id = s.owner_id AND m.type = 'monthly'
ON CONFLICT (member_id, date) DO NOTHING;

-- ------------------------------------------------------------------------------
-- Migration: 20260702125430_42525e80-afde-470a-927c-bd6312c8ccdb.sql
-- ------------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.auto_attend_monthly_on_shooting() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_attend_shootings_on_monthly_member() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- Migration: 20260702125724_f16a74eb-c419-4ad5-ae9d-d4db478596b2.sql
-- ------------------------------------------------------------------------------

-- Replace ALL policy with per-command policies; deny SELECT on base table so PIN hash is not readable
DROP POLICY IF EXISTS "own admin credentials" ON public.admin_credentials;

CREATE POLICY "own admin credentials insert"
ON public.admin_credentials FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "own admin credentials update"
ON public.admin_credentials FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "own admin credentials delete"
ON public.admin_credentials FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- No SELECT policy = SELECT denied for everyone; use the view below.

-- Safe view: exposes non-sensitive fields + has_pin flag, scoped to the caller
CREATE OR REPLACE VIEW public.admin_credentials_safe AS
SELECT
  user_id,
  email,
  mobile,
  (pin IS NOT NULL AND length(pin) > 0) AS has_pin,
  created_at,
  updated_at
FROM public.admin_credentials
WHERE user_id = auth.uid();

GRANT SELECT ON public.admin_credentials_safe TO authenticated;

-- ------------------------------------------------------------------------------
-- Migration: 20260702125757_3c51da7b-33df-42ee-8435-d111617c3d6a.sql
-- ------------------------------------------------------------------------------

-- Make the safe view run as invoker so RLS + column grants apply for the caller
DROP VIEW IF EXISTS public.admin_credentials_safe;

-- Column-level SELECT: everything except pin
REVOKE SELECT ON public.admin_credentials FROM authenticated;
GRANT SELECT (user_id, email, mobile, created_at, updated_at) ON public.admin_credentials TO authenticated;

-- Row filter so users only see their own row
CREATE POLICY "own admin credentials select"
ON public.admin_credentials FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE VIEW public.admin_credentials_safe
WITH (security_invoker = on) AS
SELECT
  user_id,
  email,
  mobile,
  (pin IS NOT NULL AND length(pin) > 0) AS has_pin,
  created_at,
  updated_at
FROM public.admin_credentials;

GRANT SELECT ON public.admin_credentials_safe TO authenticated;

-- ------------------------------------------------------------------------------
-- Migration: 20260702132116_84170c3b-bbe5-4b06-aedb-406bbdf90536.sql
-- ------------------------------------------------------------------------------

-- 1) Add columns
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS is_own boolean NOT NULL DEFAULT false;
ALTER TABLE public.shootings ADD COLUMN IF NOT EXISTS contract_amount numeric;

-- 2) Client payments table
CREATE TABLE IF NOT EXISTS public.client_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  shooting_id uuid REFERENCES public.shootings(id) ON DELETE SET NULL,
  channel text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  received_at date NOT NULL DEFAULT CURRENT_DATE,
  method text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_payments TO authenticated;
GRANT ALL ON public.client_payments TO service_role;

ALTER TABLE public.client_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own client_payments" ON public.client_payments
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE TRIGGER client_payments_updated_at
  BEFORE UPDATE ON public.client_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS client_payments_owner_channel_idx
  ON public.client_payments(owner_id, channel);
CREATE INDEX IF NOT EXISTS client_payments_shooting_idx
  ON public.client_payments(shooting_id);

-- 3) Per-channel summary (external channels only)
CREATE OR REPLACE FUNCTION public.client_channel_summary()
RETURNS TABLE(
  channel text,
  shooting_count bigint,
  contract_total numeric,
  received_total numeric,
  due_total numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ext_channels AS (
    SELECT name FROM public.channels
    WHERE owner_id = auth.uid() AND is_own = false
  ),
  contracts AS (
    SELECT s.channel, COUNT(*) AS cnt, COALESCE(SUM(s.contract_amount), 0) AS total
    FROM public.shootings s
    WHERE s.owner_id = auth.uid()
      AND s.channel IS NOT NULL
      AND s.channel IN (SELECT name FROM ext_channels)
    GROUP BY s.channel
  ),
  payments AS (
    SELECT p.channel, COALESCE(SUM(p.amount), 0) AS total
    FROM public.client_payments p
    WHERE p.owner_id = auth.uid()
    GROUP BY p.channel
  )
  SELECT
    ec.name AS channel,
    COALESCE(c.cnt, 0) AS shooting_count,
    COALESCE(c.total, 0) AS contract_total,
    COALESCE(p.total, 0) AS received_total,
    COALESCE(c.total, 0) - COALESCE(p.total, 0) AS due_total
  FROM ext_channels ec
  LEFT JOIN contracts c ON c.channel = ec.name
  LEFT JOIN payments p ON p.channel = ec.name
  ORDER BY due_total DESC, ec.name;
$$;

GRANT EXECUTE ON FUNCTION public.client_channel_summary() TO authenticated;

-- ------------------------------------------------------------------------------
-- Migration: 20260702132145_f278bc9b-347d-4546-b586-dbafd09eaecd.sql
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.client_channel_summary()
RETURNS TABLE(
  channel text,
  shooting_count bigint,
  contract_total numeric,
  received_total numeric,
  due_total numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH ext_channels AS (
    SELECT name FROM public.channels
    WHERE owner_id = auth.uid() AND is_own = false
  ),
  contracts AS (
    SELECT s.channel, COUNT(*) AS cnt, COALESCE(SUM(s.contract_amount), 0) AS total
    FROM public.shootings s
    WHERE s.owner_id = auth.uid()
      AND s.channel IS NOT NULL
      AND s.channel IN (SELECT name FROM ext_channels)
    GROUP BY s.channel
  ),
  payments AS (
    SELECT p.channel, COALESCE(SUM(p.amount), 0) AS total
    FROM public.client_payments p
    WHERE p.owner_id = auth.uid()
    GROUP BY p.channel
  )
  SELECT
    ec.name AS channel,
    COALESCE(c.cnt, 0) AS shooting_count,
    COALESCE(c.total, 0) AS contract_total,
    COALESCE(p.total, 0) AS received_total,
    COALESCE(c.total, 0) - COALESCE(p.total, 0) AS due_total
  FROM ext_channels ec
  LEFT JOIN contracts c ON c.channel = ec.name
  LEFT JOIN payments p ON p.channel = ec.name
  ORDER BY due_total DESC, ec.name;
$$;

-- ------------------------------------------------------------------------------
-- Migration: 20260712131818_df1dacd8-b0f6-498a-b57d-3e28acc4a51b.sql
-- ------------------------------------------------------------------------------

ALTER TABLE public.payments 
  ADD COLUMN IF NOT EXISTS method TEXT NOT NULL DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS bank_account_number TEXT;
ALTER TABLE public.payments 
  ADD CONSTRAINT payments_method_check CHECK (method IN ('cash','bkash','nagad','rocket','upay','bank'));

-- ------------------------------------------------------------------------------
-- Migration: 20260712143106_97412e44-107f-4c2e-a372-750d1872fa54.sql
-- ------------------------------------------------------------------------------

-- Role enum
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own roles" ON public.user_roles;
CREATE POLICY "users read own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- has_role security-definer
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- Admin allowlist -> auto-grant on verified email
CREATE OR REPLACE FUNCTION public.grant_admin_for_allowlisted_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL
     AND lower(NEW.email) IN ('kiksquad2@gmail.com') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_grant_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_grant_admin
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.grant_admin_for_allowlisted_email();

DROP TRIGGER IF EXISTS on_auth_user_confirmed_grant_admin ON auth.users;
CREATE TRIGGER on_auth_user_confirmed_grant_admin
AFTER UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW
WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
EXECUTE FUNCTION public.grant_admin_for_allowlisted_email();

-- Backfill existing users
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE lower(email) IN ('kiksquad2@gmail.com')
  AND email_confirmed_at IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;

-- ------------------------------------------------------------------------------
-- Migration: 20260712143438_ad0b1deb-d9d7-4311-992b-0315c063bc5c.sql
-- ------------------------------------------------------------------------------

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

-- ------------------------------------------------------------------------------
-- Migration: 20260920201122_6b9d30ac-1c96-4636-a998-381a7d308d1a.sql
-- ------------------------------------------------------------------------------

ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS is_shared boolean NOT NULL DEFAULT false;

CREATE TYPE public.income_source AS ENUM ('facebook', 'youtube', 'ads', 'other');

CREATE TABLE public.channel_partners (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  partner_name text NOT NULL,
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  share_percent numeric NOT NULL DEFAULT 50,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_partners TO authenticated;
GRANT ALL ON public.channel_partners TO service_role;
ALTER TABLE public.channel_partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own channel partners" ON public.channel_partners FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER trg_channel_partners_updated BEFORE UPDATE ON public.channel_partners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.channel_incomes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  shooting_id uuid REFERENCES public.shootings(id) ON DELETE SET NULL,
  source public.income_source NOT NULL DEFAULT 'other',
  amount numeric NOT NULL DEFAULT 0,
  earned_at date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_incomes TO authenticated;
GRANT ALL ON public.channel_incomes TO service_role;
ALTER TABLE public.channel_incomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own channel incomes" ON public.channel_incomes FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER trg_channel_incomes_updated BEFORE UPDATE ON public.channel_incomes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.partner_payouts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL,
  partner_id uuid NOT NULL REFERENCES public.channel_partners(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  method text NOT NULL DEFAULT 'cash',
  bank_account_number text,
  note text,
  paid_at date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_payouts TO authenticated;
GRANT ALL ON public.partner_payouts TO service_role;
ALTER TABLE public.partner_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own partner payouts" ON public.partner_payouts FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER trg_partner_payouts_updated BEFORE UPDATE ON public.partner_payouts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_channel_partners_channel ON public.channel_partners(channel_id);
CREATE INDEX idx_channel_incomes_channel ON public.channel_incomes(channel_id);
CREATE INDEX idx_partner_payouts_partner ON public.partner_payouts(partner_id);

CREATE OR REPLACE FUNCTION public.shared_channel_summary()
RETURNS TABLE(
  channel_id uuid,
  channel_name text,
  income_total numeric,
  expense_total numeric,
  net_profit numeric,
  partner_count bigint
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH ch AS (
    SELECT id, name FROM public.channels
    WHERE owner_id = auth.uid() AND is_shared = true
  ),
  inc AS (
    SELECT ci.channel_id, COALESCE(SUM(ci.amount), 0) AS total
    FROM public.channel_incomes ci
    WHERE ci.owner_id = auth.uid()
    GROUP BY ci.channel_id
  ),
  shoots AS (
    SELECT ch.id AS channel_id, s.id AS shooting_id
    FROM ch
    JOIN public.shootings s ON s.channel = ch.name AND s.owner_id = auth.uid()
  ),
  att AS (
    SELECT sh.channel_id, COALESCE(SUM(COALESCE(a.rate_override, m.rate)), 0) AS total
    FROM shoots sh
    JOIN public.attendance a ON a.shooting_id = sh.shooting_id AND a.present = true
    JOIN public.members m ON m.id = a.member_id
    GROUP BY sh.channel_id
  ),
  ext AS (
    SELECT sh.channel_id, COALESCE(SUM(e.amount), 0) AS total
    FROM shoots sh
    JOIN public.shooting_expenses e ON e.shooting_id = sh.shooting_id
    GROUP BY sh.channel_id
  ),
  pc AS (
    SELECT cp.channel_id, COUNT(*) AS cnt
    FROM public.channel_partners cp
    WHERE cp.owner_id = auth.uid()
    GROUP BY cp.channel_id
  )
  SELECT
    ch.id,
    ch.name,
    COALESCE(inc.total, 0),
    COALESCE(att.total, 0) + COALESCE(ext.total, 0),
    COALESCE(inc.total, 0) - (COALESCE(att.total, 0) + COALESCE(ext.total, 0)),
    COALESCE(pc.cnt, 0)
  FROM ch
  LEFT JOIN inc ON inc.channel_id = ch.id
  LEFT JOIN att ON att.channel_id = ch.id
  LEFT JOIN ext ON ext.channel_id = ch.id
  LEFT JOIN pc ON pc.channel_id = ch.id
  ORDER BY ch.name;
$$;

CREATE OR REPLACE FUNCTION public.partner_ledger()
RETURNS TABLE(
  partner_id uuid,
  partner_name text,
  channel_id uuid,
  channel_name text,
  share_percent numeric,
  net_profit numeric,
  entitled numeric,
  paid_total numeric,
  due numeric
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH sums AS (
    SELECT * FROM public.shared_channel_summary()
  ),
  pays AS (
    SELECT pp.partner_id, COALESCE(SUM(pp.amount), 0) AS total
    FROM public.partner_payouts pp
    WHERE pp.owner_id = auth.uid()
    GROUP BY pp.partner_id
  )
  SELECT
    cp.id,
    cp.partner_name,
    cp.channel_id,
    s.channel_name,
    cp.share_percent,
    COALESCE(s.net_profit, 0),
    ROUND(GREATEST(COALESCE(s.net_profit, 0), 0) * cp.share_percent / 100.0, 2),
    COALESCE(pays.total, 0),
    ROUND(GREATEST(COALESCE(s.net_profit, 0), 0) * cp.share_percent / 100.0, 2) - COALESCE(pays.total, 0)
  FROM public.channel_partners cp
  LEFT JOIN sums s ON s.channel_id = cp.channel_id
  LEFT JOIN pays ON pays.partner_id = cp.id
  WHERE cp.owner_id = auth.uid()
  ORDER BY s.channel_name, cp.partner_name;
$$;

-- ------------------------------------------------------------------------------
-- Migration: 20260921022413_ee0a7859-b29d-4cb7-a1ca-92f29c0fbe13.sql
-- ------------------------------------------------------------------------------

CREATE TABLE public.channel_partner_members (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL,
  partner_id uuid NOT NULL REFERENCES public.channel_partners(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (partner_id, member_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_partner_members TO authenticated;
GRANT ALL ON public.channel_partner_members TO service_role;

ALTER TABLE public.channel_partner_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own channel partner members" ON public.channel_partner_members
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE INDEX idx_channel_partner_members_partner ON public.channel_partner_members(partner_id);
CREATE INDEX idx_channel_partner_members_member ON public.channel_partner_members(member_id);

INSERT INTO public.channel_partner_members (owner_id, partner_id, member_id)
SELECT owner_id, id, member_id FROM public.channel_partners WHERE member_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------------------------
-- Migration: 20260921025730_2f4196e2-1eec-4a51-bd45-5e91afdc55e8.sql
-- ------------------------------------------------------------------------------

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.member_balance(_member_id uuid, _channel_id uuid DEFAULT NULL)
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

  IF _channel_id IS NOT NULL THEN
    -- Shared-channel tab: earnings from this channel's shootings only,
    -- minus payments tagged with this channel.
    IF m.type = 'daily' THEN
      SELECT COALESCE(SUM(COALESCE(a.rate_override, m.rate)), 0) INTO earned
      FROM public.attendance a
      WHERE a.member_id = _member_id
        AND a.present = true
        AND EXISTS (
          SELECT 1 FROM public.shootings s
          JOIN public.channels c ON c.owner_id = s.owner_id AND c.name = s.channel
          WHERE s.id = a.shooting_id AND c.id = _channel_id
        );
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO paid
    FROM public.payments
    WHERE member_id = _member_id AND channel_id = _channel_id;

    RETURN earned - paid;
  END IF;

  -- General balance: exclude shared-channel attendance earnings
  -- and exclude payments made from a shared channel tab.
  IF m.type = 'daily' THEN
    SELECT COALESCE(SUM(COALESCE(a.rate_override, m.rate)), 0) INTO earned
    FROM public.attendance a
    WHERE a.member_id = _member_id
      AND a.present = true
      AND NOT EXISTS (
        SELECT 1 FROM public.shootings s
        JOIN public.channels c ON c.owner_id = s.owner_id AND c.name = s.channel
        WHERE s.id = a.shooting_id AND c.is_shared = true
      );
  ELSE
    SELECT COALESCE(SUM(amount), 0) INTO earned
    FROM public.monthly_salaries WHERE member_id = _member_id;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO bonus
  FROM public.bonuses WHERE member_id = _member_id;

  SELECT COALESCE(SUM(amount), 0) INTO paid
  FROM public.payments
  WHERE member_id = _member_id AND channel_id IS NULL;

  RETURN earned + bonus - paid;
END;
$function$;

-- ------------------------------------------------------------------------------
-- Migration: 20260923120531_8a5f52e5-55d6-43a7-9c10-f4a8a8cd58e9.sql
-- ------------------------------------------------------------------------------

ALTER TABLE public.attendance DROP CONSTRAINT attendance_shooting_id_fkey;
ALTER TABLE public.attendance
  ADD CONSTRAINT attendance_shooting_id_fkey
  FOREIGN KEY (shooting_id) REFERENCES public.shootings(id) ON DELETE CASCADE;

DELETE FROM public.attendance
WHERE shooting_id IS NULL
  AND date = '2026-09-04'
  AND created_at >= '2026-09-21'
  AND created_at < '2026-09-22';

-- ------------------------------------------------------------------------------
-- Migration: 20260923123704_efd1817d-5814-4ca8-b7e7-08bf413dec98.sql
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.save_payment_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k account_kind;
BEGIN
  IF NEW.bank_account_number IS NULL OR btrim(NEW.bank_account_number) = '' THEN
    RETURN NEW;
  END IF;
  IF NEW.method IS NULL OR NEW.method = 'cash' THEN
    RETURN NEW;
  END IF;
  BEGIN
    k := NEW.method::account_kind;
  EXCEPTION WHEN others THEN
    RETURN NEW;
  END;

  IF NOT EXISTS (
    SELECT 1 FROM public.member_accounts
    WHERE member_id = NEW.member_id
      AND kind = k
      AND account_number = btrim(NEW.bank_account_number)
  ) THEN
    INSERT INTO public.member_accounts (owner_id, member_id, kind, account_holder, account_number, bank_name)
    SELECT NEW.owner_id, NEW.member_id, k, m.name, btrim(NEW.bank_account_number), NULL
    FROM public.members m WHERE m.id = NEW.member_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_save_account ON public.payments;
CREATE TRIGGER payments_save_account
AFTER INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.save_payment_account();

-- ------------------------------------------------------------------------------
-- Migration: 20260923123726_e35c31e1-f704-4c17-a854-d4efc9b3e23f.sql
-- ------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.save_payment_account() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- Migration: 20260923124129_b506d1a2-d73b-4d1a-b454-d40f4d4726e3.sql
-- ------------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS member_accounts_member_kind_number_unique
ON public.member_accounts (member_id, kind, btrim(account_number));

CREATE OR REPLACE FUNCTION public.save_payment_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k account_kind;
BEGIN
  IF NEW.bank_account_number IS NULL OR btrim(NEW.bank_account_number) = '' THEN
    RETURN NEW;
  END IF;
  IF NEW.method IS NULL OR NEW.method = 'cash' THEN
    RETURN NEW;
  END IF;
  BEGIN
    k := NEW.method::account_kind;
  EXCEPTION WHEN others THEN
    RETURN NEW;
  END;

  INSERT INTO public.member_accounts (owner_id, member_id, kind, account_holder, account_number, bank_name)
  SELECT NEW.owner_id, NEW.member_id, k, m.name, btrim(NEW.bank_account_number), NULL
  FROM public.members m
  WHERE m.id = NEW.member_id
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- Migration: 20260923124154_58d85c7a-08fd-4b15-8dfb-51f5aadd641f.sql
-- ------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.save_payment_account() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- Migration: 20260924062709_04ca2431-0290-44e4-8f54-de50cd7d4caf.sql
-- ------------------------------------------------------------------------------

CREATE TABLE public.shared_channel_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  shooting_id uuid REFERENCES public.shootings(id) ON DELETE SET NULL,
  date_from date,
  date_to date,
  token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(18), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_channel_reports TO authenticated;
GRANT ALL ON public.shared_channel_reports TO service_role;
ALTER TABLE public.shared_channel_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own shared channel reports" ON public.shared_channel_reports FOR ALL TO authenticated
USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
