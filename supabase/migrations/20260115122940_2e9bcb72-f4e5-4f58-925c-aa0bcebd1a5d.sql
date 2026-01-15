-- Fix audit_logs RLS policy to prevent spoofing user_id
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;

-- Create a policy that enforces user_id = auth.uid() for inserts
CREATE POLICY "Users can insert their own audit logs"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Allow service role and admins to insert audit logs for any user (for edge functions)
CREATE POLICY "Service role can insert audit logs"
  ON public.audit_logs FOR INSERT
  TO service_role
  WITH CHECK (true);