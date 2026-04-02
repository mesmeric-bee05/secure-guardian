
-- Phase 1: Security fixes

-- 1. Drop the overly permissive INSERT policy on audit_logs
-- Audit logs should only be inserted by service role (edge functions), not directly by clients
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;

-- 2. Add deny-all policies on ussd_sessions for anon and authenticated roles
-- This table is only accessed by edge functions using service_role_key which bypasses RLS
CREATE POLICY "Deny all access for authenticated users"
ON public.ussd_sessions
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "Deny all access for anon users"
ON public.ussd_sessions
FOR ALL
TO anon
USING (false)
WITH CHECK (false);
