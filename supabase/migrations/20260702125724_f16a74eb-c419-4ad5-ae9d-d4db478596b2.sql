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