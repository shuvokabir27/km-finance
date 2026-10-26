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