-- Add last_location_update column to chw_assignments for real-time tracking
ALTER TABLE public.chw_assignments
ADD COLUMN IF NOT EXISTS last_location_update timestamp with time zone DEFAULT now();

-- Enable realtime for chw_assignments table
ALTER PUBLICATION supabase_realtime ADD TABLE public.chw_assignments;

-- Security hardening: Add anonymous denial policies for all sensitive tables

-- Deny anonymous access to profiles
CREATE POLICY "Deny anonymous access to profiles"
  ON public.profiles FOR ALL
  TO anon
  USING (false);

-- Deny anonymous access to emergency_contacts
CREATE POLICY "Deny anonymous access to emergency_contacts"
  ON public.emergency_contacts FOR ALL
  TO anon
  USING (false);

-- Deny anonymous access to emergency_cases
CREATE POLICY "Deny anonymous access to emergency_cases"
  ON public.emergency_cases FOR ALL
  TO anon
  USING (false);

-- Deny anonymous access to audit_logs
CREATE POLICY "Deny anonymous access to audit_logs"
  ON public.audit_logs FOR ALL
  TO anon
  USING (false);

-- Deny anonymous access to user_roles
CREATE POLICY "Deny anonymous access to user_roles"
  ON public.user_roles FOR ALL
  TO anon
  USING (false);

-- Deny anonymous access to sms_logs
CREATE POLICY "Deny anonymous access to sms_logs"
  ON public.sms_logs FOR ALL
  TO anon
  USING (false);

-- Deny anonymous access to chat_sessions
CREATE POLICY "Deny anonymous access to chat_sessions"
  ON public.chat_sessions FOR ALL
  TO anon
  USING (false);

-- Deny anonymous access to chat_messages
CREATE POLICY "Deny anonymous access to chat_messages"
  ON public.chat_messages FOR ALL
  TO anon
  USING (false);

-- Deny anonymous access to chw_assignments
CREATE POLICY "Deny anonymous access to chw_assignments"
  ON public.chw_assignments FOR ALL
  TO anon
  USING (false);