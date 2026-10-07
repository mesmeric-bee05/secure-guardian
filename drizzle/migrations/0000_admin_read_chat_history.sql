CREATE POLICY "Admins can read all chat sessions" ON public.chat_sessions AS PERMISSIVE FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can read all chat messages" ON public.chat_messages AS PERMISSIVE FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
GRANT SELECT ON public.chat_sessions TO authenticated;
GRANT SELECT ON public.chat_messages TO authenticated;