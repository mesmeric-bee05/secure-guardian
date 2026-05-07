
DROP POLICY IF EXISTS "Deny client writes auth" ON public.security_events;
DROP POLICY IF EXISTS "Deny client writes anon" ON public.security_events;
DROP POLICY IF EXISTS "Admins view security events" ON public.security_events;
CREATE POLICY "Admins view security events" ON public.security_events AS PERMISSIVE FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Deny client writes auth" ON public.security_events AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "Deny client writes anon" ON public.security_events AS PERMISSIVE FOR INSERT TO anon WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.security_events_summary(_since TIMESTAMPTZ)
RETURNS TABLE(event_type TEXT, scope TEXT, count BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT event_type, COALESCE(scope,'(unknown)'), COUNT(*)::bigint
  FROM public.security_events WHERE created_at >= _since
  GROUP BY 1,2 ORDER BY 3 DESC
$$;
CREATE OR REPLACE FUNCTION public.security_top_ips(_since TIMESTAMPTZ, _limit INT DEFAULT 20)
RETURNS TABLE(ip_address TEXT, total BIGINT, rate_limit_hits BIGINT, validation_failures BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(ip_address,'(unknown)'), COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE event_type='rate_limit_429')::bigint,
    COUNT(*) FILTER (WHERE event_type='validation_failed')::bigint
  FROM public.security_events WHERE created_at >= _since
  GROUP BY 1 ORDER BY 2 DESC LIMIT _limit
$$;
REVOKE ALL ON FUNCTION public.security_events_summary(TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.security_events_summary(TIMESTAMPTZ) TO authenticated;
REVOKE ALL ON FUNCTION public.security_top_ips(TIMESTAMPTZ, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.security_top_ips(TIMESTAMPTZ, INT) TO authenticated;

DELETE FROM public.first_aid_protocols WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY title_en ORDER BY created_at ASC) AS rn
    FROM public.first_aid_protocols
  ) t WHERE rn > 1
);
