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