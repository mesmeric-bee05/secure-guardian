CREATE TABLE public.donations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  amount_kes INTEGER NOT NULL CHECK (amount_kes >= 10 AND amount_kes <= 70000),
  phone_msisdn TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','failed','cancelled')),
  checkout_request_id TEXT UNIQUE,
  merchant_request_id TEXT,
  mpesa_receipt TEXT,
  result_desc TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.donations TO authenticated;
GRANT ALL ON public.donations TO service_role;

ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own donations"
  ON public.donations AS PERMISSIVE FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all donations"
  ON public.donations AS PERMISSIVE FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Authenticated users can create pending donations"
  ON public.donations AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

CREATE TRIGGER update_donations_updated_at
  BEFORE UPDATE ON public.donations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_donations_user_created ON public.donations(user_id, created_at DESC);
CREATE INDEX idx_donations_status ON public.donations(status);

-- Add optional menu_path column to ussd_sessions for richer menu tree
ALTER TABLE public.ussd_sessions
  ADD COLUMN IF NOT EXISTS menu_path TEXT;

-- Helpful index for CHW case analytics
CREATE INDEX IF NOT EXISTS idx_emergency_cases_chw_created
  ON public.emergency_cases(assigned_chw_id, created_at DESC);
