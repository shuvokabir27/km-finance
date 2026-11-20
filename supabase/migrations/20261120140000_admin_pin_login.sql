-- Migration: 20261120140000_admin_pin_login.sql
-- Allow admin lookup and login directly by PIN

CREATE OR REPLACE FUNCTION public.find_admin_by_pin(_pin text)
RETURNS TABLE (email text, mobile text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT email, mobile FROM public.admin_credentials
  WHERE pin = extensions.crypt(_pin, pin)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.find_admin_by_pin(text) TO service_role;
