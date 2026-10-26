
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
