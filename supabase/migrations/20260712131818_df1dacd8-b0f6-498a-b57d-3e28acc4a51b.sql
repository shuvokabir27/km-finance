ALTER TABLE public.payments 
  ADD COLUMN IF NOT EXISTS method TEXT NOT NULL DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS bank_account_number TEXT;
ALTER TABLE public.payments 
  ADD CONSTRAINT payments_method_check CHECK (method IN ('cash','bkash','nagad','rocket','upay','bank'));