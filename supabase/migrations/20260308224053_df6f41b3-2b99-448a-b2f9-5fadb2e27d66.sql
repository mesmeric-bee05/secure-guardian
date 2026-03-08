-- RLS policies: recreate all as explicit PERMISSIVE

-- sms_logs
DROP POLICY IF EXISTS "Users can view their own SMS logs" ON public.sms_logs;
DROP POLICY IF EXISTS "Admins can view all SMS logs" ON public.sms_logs;
CREATE POLICY "Users can view their own SMS logs" ON public.sms_logs AS PERMISSIVE FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all SMS logs" ON public.sms_logs AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin(auth.uid()));

-- chw_assignments
DROP POLICY IF EXISTS "CHWs can view their own assignments" ON public.chw_assignments;
DROP POLICY IF EXISTS "Admins can manage assignments" ON public.chw_assignments;
CREATE POLICY "CHWs can view their own assignments" ON public.chw_assignments AS PERMISSIVE FOR SELECT TO authenticated USING (auth.uid() = chw_user_id);
CREATE POLICY "Admins can manage assignments" ON public.chw_assignments AS PERMISSIVE FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- health_facilities
DROP POLICY IF EXISTS "Anyone can view verified facilities" ON public.health_facilities;
DROP POLICY IF EXISTS "Admins can manage facilities" ON public.health_facilities;
CREATE POLICY "Anyone can view verified facilities" ON public.health_facilities AS PERMISSIVE FOR SELECT USING (is_verified = true);
CREATE POLICY "Admins can manage facilities" ON public.health_facilities AS PERMISSIVE FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- chat_sessions
DROP POLICY IF EXISTS "Users can manage their own chat sessions" ON public.chat_sessions;
CREATE POLICY "Users can manage their own chat sessions" ON public.chat_sessions AS PERMISSIVE FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- emergency_contacts
DROP POLICY IF EXISTS "Users can manage their own emergency contacts" ON public.emergency_contacts;
CREATE POLICY "Users can manage their own emergency contacts" ON public.emergency_contacts AS PERMISSIVE FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- first_aid_protocols
DROP POLICY IF EXISTS "Anyone can view protocols" ON public.first_aid_protocols;
DROP POLICY IF EXISTS "Admins can manage protocols" ON public.first_aid_protocols;
CREATE POLICY "Anyone can view protocols" ON public.first_aid_protocols AS PERMISSIVE FOR SELECT USING (true);
CREATE POLICY "Admins can manage protocols" ON public.first_aid_protocols AS PERMISSIVE FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- audit_logs
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs" ON public.audit_logs AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated users can insert audit logs" ON public.audit_logs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- chat_messages
DROP POLICY IF EXISTS "Users can manage messages in their sessions" ON public.chat_messages;
CREATE POLICY "Users can manage messages in their sessions" ON public.chat_messages AS PERMISSIVE FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM chat_sessions cs WHERE cs.id = chat_messages.session_id AND cs.user_id = auth.uid()));

-- user_roles
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles" ON public.user_roles AS PERMISSIVE FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all roles" ON public.user_roles AS PERMISSIVE FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- emergency_cases
DROP POLICY IF EXISTS "Admins can manage all cases" ON public.emergency_cases;
DROP POLICY IF EXISTS "CHWs can view assigned cases" ON public.emergency_cases;
DROP POLICY IF EXISTS "CHWs can update assigned cases" ON public.emergency_cases;
DROP POLICY IF EXISTS "Users can create their own cases" ON public.emergency_cases;
DROP POLICY IF EXISTS "Users can view their own cases" ON public.emergency_cases;
CREATE POLICY "Admins can manage all cases" ON public.emergency_cases AS PERMISSIVE FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "CHWs can view assigned cases" ON public.emergency_cases AS PERMISSIVE FOR SELECT TO authenticated USING (is_chw(auth.uid()) AND (assigned_chw_id = auth.uid() OR assigned_chw_id IS NULL));
CREATE POLICY "CHWs can update assigned cases" ON public.emergency_cases AS PERMISSIVE FOR UPDATE TO authenticated USING (is_chw(auth.uid()) AND assigned_chw_id = auth.uid());
CREATE POLICY "Users can create their own cases" ON public.emergency_cases AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view their own cases" ON public.emergency_cases AS PERMISSIVE FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- push_subscriptions
DROP POLICY IF EXISTS "Users can manage their own subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can manage their own subscriptions" ON public.push_subscriptions AS PERMISSIVE FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- profiles
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "CHWs can view assigned user profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can create their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all profiles" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "CHWs can view assigned user profiles" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING (is_chw(auth.uid()) AND EXISTS (SELECT 1 FROM emergency_cases ec WHERE ec.user_id = profiles.user_id AND ec.assigned_chw_id = auth.uid()));
CREATE POLICY "Users can create their own profile" ON public.profiles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING (auth.uid() = user_id);