-- Drop all restrictive "Deny anonymous access" policies that block ALL access
DROP POLICY IF EXISTS "Deny anonymous access to emergency_cases" ON public.emergency_cases;
DROP POLICY IF EXISTS "Deny anonymous access to profiles" ON public.profiles;
DROP POLICY IF EXISTS "Deny anonymous access to user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Deny anonymous access to chw_assignments" ON public.chw_assignments;
DROP POLICY IF EXISTS "Deny anonymous access to chat_sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Deny anonymous access to chat_messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Deny anonymous access to sms_logs" ON public.sms_logs;
DROP POLICY IF EXISTS "Deny anonymous access to audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Deny anonymous access to emergency_contacts" ON public.emergency_contacts;
DROP POLICY IF EXISTS "Deny anonymous access to push_subscriptions" ON public.push_subscriptions;

-- Convert all remaining restrictive policies to permissive (drop and recreate)

-- Emergency cases
DROP POLICY IF EXISTS "Admins can manage all cases" ON public.emergency_cases;
CREATE POLICY "Admins can manage all cases" ON public.emergency_cases FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "CHWs can view assigned cases" ON public.emergency_cases;
CREATE POLICY "CHWs can view assigned cases" ON public.emergency_cases FOR SELECT TO authenticated USING (is_chw(auth.uid()) AND (assigned_chw_id = auth.uid() OR assigned_chw_id IS NULL));

DROP POLICY IF EXISTS "CHWs can update assigned cases" ON public.emergency_cases;
CREATE POLICY "CHWs can update assigned cases" ON public.emergency_cases FOR UPDATE TO authenticated USING (is_chw(auth.uid()) AND assigned_chw_id = auth.uid());

DROP POLICY IF EXISTS "Users can create their own cases" ON public.emergency_cases;
CREATE POLICY "Users can create their own cases" ON public.emergency_cases FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own cases" ON public.emergency_cases;
CREATE POLICY "Users can view their own cases" ON public.emergency_cases FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Profiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "CHWs can view assigned user profiles" ON public.profiles;
CREATE POLICY "CHWs can view assigned user profiles" ON public.profiles FOR SELECT TO authenticated USING (is_chw(auth.uid()) AND EXISTS (SELECT 1 FROM emergency_cases ec WHERE ec.user_id = profiles.user_id AND ec.assigned_chw_id = auth.uid()));

DROP POLICY IF EXISTS "Users can create their own profile" ON public.profiles;
CREATE POLICY "Users can create their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- User roles
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
CREATE POLICY "Admins can manage all roles" ON public.user_roles FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- CHW assignments
DROP POLICY IF EXISTS "Admins can manage assignments" ON public.chw_assignments;
CREATE POLICY "Admins can manage assignments" ON public.chw_assignments FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "CHWs can view their own assignments" ON public.chw_assignments;
CREATE POLICY "CHWs can view their own assignments" ON public.chw_assignments FOR SELECT TO authenticated USING (auth.uid() = chw_user_id);

-- Chat sessions
DROP POLICY IF EXISTS "Users can manage their own chat sessions" ON public.chat_sessions;
CREATE POLICY "Users can manage their own chat sessions" ON public.chat_sessions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Chat messages
DROP POLICY IF EXISTS "Users can manage messages in their sessions" ON public.chat_messages;
CREATE POLICY "Users can manage messages in their sessions" ON public.chat_messages FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM chat_sessions cs WHERE cs.id = chat_messages.session_id AND cs.user_id = auth.uid()));

-- SMS logs
DROP POLICY IF EXISTS "Admins can view all SMS logs" ON public.sms_logs;
CREATE POLICY "Admins can view all SMS logs" ON public.sms_logs FOR SELECT TO authenticated USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can view their own SMS logs" ON public.sms_logs;
CREATE POLICY "Users can view their own SMS logs" ON public.sms_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Audit logs
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role can insert audit logs" ON public.audit_logs;
CREATE POLICY "Service role can insert audit logs" ON public.audit_logs FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can insert their own audit logs" ON public.audit_logs;
CREATE POLICY "Users can insert their own audit logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Emergency contacts
DROP POLICY IF EXISTS "Users can manage their own emergency contacts" ON public.emergency_contacts;
CREATE POLICY "Users can manage their own emergency contacts" ON public.emergency_contacts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Push subscriptions
DROP POLICY IF EXISTS "Users can manage their own subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can manage their own subscriptions" ON public.push_subscriptions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Health facilities
DROP POLICY IF EXISTS "Admins can manage facilities" ON public.health_facilities;
CREATE POLICY "Admins can manage facilities" ON public.health_facilities FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Anyone can view verified facilities" ON public.health_facilities;
CREATE POLICY "Anyone can view verified facilities" ON public.health_facilities FOR SELECT USING (is_verified = true);

-- First aid protocols
DROP POLICY IF EXISTS "Admins can manage protocols" ON public.first_aid_protocols;
CREATE POLICY "Admins can manage protocols" ON public.first_aid_protocols FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Anyone can view protocols" ON public.first_aid_protocols;
CREATE POLICY "Anyone can view protocols" ON public.first_aid_protocols FOR SELECT USING (true);

-- USSD sessions
DROP POLICY IF EXISTS "Service role manages USSD sessions" ON public.ussd_sessions;
CREATE POLICY "Service role manages USSD sessions" ON public.ussd_sessions FOR ALL USING (true);