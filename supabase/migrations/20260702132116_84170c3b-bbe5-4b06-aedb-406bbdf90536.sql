
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
