
-- ============================================================
-- CRITICAL FIX: Convert ALL restrictive policies to PERMISSIVE
-- Restrictive policies are AND-ed (all must pass), which blocks
-- access when multiple policies exist for the same command.
-- Permissive policies are OR-ed (any can pass), which is correct
-- for role-based access patterns.
-- ============================================================

-- ==================== emergency_cases ====================
DROP POLICY IF EXISTS "Admins can manage all cases" ON public.emergency_cases;
DROP POLICY IF EXISTS "CHWs can view assigned cases" ON public.emergency_cases;
DROP POLICY IF EXISTS "CHWs can update assigned cases" ON public.emergency_cases;
DROP POLICY IF EXISTS "Users can create their own cases" ON public.emergency_cases;
DROP POLICY IF EXISTS "Users can view their own cases" ON public.emergency_cases;

CREATE POLICY "Admins can manage all cases"
  ON public.emergency_cases FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "CHWs can view assigned cases"
  ON public.emergency_cases FOR SELECT TO authenticated
  USING (public.is_chw(auth.uid()) AND (assigned_chw_id = auth.uid() OR assigned_chw_id IS NULL));

CREATE POLICY "CHWs can update assigned cases"
  ON public.emergency_cases FOR UPDATE TO authenticated
  USING (public.is_chw(auth.uid()) AND assigned_chw_id = auth.uid());

CREATE POLICY "Users can create their own cases"
  ON public.emergency_cases FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own cases"
  ON public.emergency_cases FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ==================== profiles ====================
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "CHWs can view assigned user profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can create their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "CHWs can view assigned user profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_chw(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.emergency_cases ec
    WHERE ec.user_id = profiles.user_id AND ec.assigned_chw_id = auth.uid()
  ));

CREATE POLICY "Users can create their own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ==================== user_roles ====================
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ==================== chw_assignments ====================
DROP POLICY IF EXISTS "Admins can manage assignments" ON public.chw_assignments;
DROP POLICY IF EXISTS "CHWs can view their own assignments" ON public.chw_assignments;

CREATE POLICY "Admins can manage assignments"
  ON public.chw_assignments FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "CHWs can view their own assignments"
  ON public.chw_assignments FOR SELECT TO authenticated
  USING (auth.uid() = chw_user_id);

-- ==================== chat_sessions ====================
DROP POLICY IF EXISTS "Users can manage their own chat sessions" ON public.chat_sessions;

CREATE POLICY "Users can manage their own chat sessions"
  ON public.chat_sessions FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ==================== chat_messages ====================
DROP POLICY IF EXISTS "Users can manage messages in their sessions" ON public.chat_messages;

CREATE POLICY "Users can manage messages in their sessions"
  ON public.chat_messages FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.chat_sessions cs
    WHERE cs.id = chat_messages.session_id AND cs.user_id = auth.uid()
  ));

-- ==================== sms_logs ====================
DROP POLICY IF EXISTS "Admins can view all SMS logs" ON public.sms_logs;
DROP POLICY IF EXISTS "Users can view their own SMS logs" ON public.sms_logs;

CREATE POLICY "Admins can view all SMS logs"
  ON public.sms_logs FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Users can view their own SMS logs"
  ON public.sms_logs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ==================== audit_logs ====================
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Service role can insert audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Users can insert their own audit logs" ON public.audit_logs;

CREATE POLICY "Admins can view audit logs"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Authenticated users can insert audit logs"
  ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ==================== emergency_contacts ====================
DROP POLICY IF EXISTS "Users can manage their own emergency contacts" ON public.emergency_contacts;

CREATE POLICY "Users can manage their own emergency contacts"
  ON public.emergency_contacts FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ==================== push_subscriptions ====================
DROP POLICY IF EXISTS "Users can manage their own subscriptions" ON public.push_subscriptions;

CREATE POLICY "Users can manage their own subscriptions"
  ON public.push_subscriptions FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ==================== health_facilities ====================
DROP POLICY IF EXISTS "Admins can manage facilities" ON public.health_facilities;
DROP POLICY IF EXISTS "Anyone can view verified facilities" ON public.health_facilities;

CREATE POLICY "Admins can manage facilities"
  ON public.health_facilities FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Anyone can view verified facilities"
  ON public.health_facilities FOR SELECT TO authenticated
  USING (is_verified = true);

-- ==================== first_aid_protocols ====================
DROP POLICY IF EXISTS "Admins can manage protocols" ON public.first_aid_protocols;
DROP POLICY IF EXISTS "Anyone can view protocols" ON public.first_aid_protocols;

CREATE POLICY "Admins can manage protocols"
  ON public.first_aid_protocols FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Anyone can view protocols"
  ON public.first_aid_protocols FOR SELECT TO authenticated
  USING (true);

-- ==================== ussd_sessions ====================
DROP POLICY IF EXISTS "Service role manages USSD sessions" ON public.ussd_sessions;

CREATE POLICY "Service role manages USSD sessions"
  ON public.ussd_sessions FOR ALL TO service_role
  USING (true);

-- ==================== Restore handle_new_user trigger ====================
-- Ensure the trigger exists (it was reported missing)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
