
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
