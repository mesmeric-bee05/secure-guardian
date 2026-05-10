-- Admin-callable wrapper that runs purge + writes audit log
CREATE OR REPLACE FUNCTION public.admin_run_security_events_purge(_older_than interval DEFAULT '90 days'::interval)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _deleted bigint;
  _uid uuid := auth.uid();
BEGIN
  IF NOT public.is_admin(_uid) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  _deleted := public.run_security_events_purge(_older_than);
  INSERT INTO public.audit_logs (user_id, action, resource_type, details)
    VALUES (_uid, 'security_events_purge_manual', 'security_events',
            jsonb_build_object('deleted_count', _deleted, 'retention_seconds', EXTRACT(EPOCH FROM _older_than)));
  RETURN jsonb_build_object('deleted_count', _deleted, 'ran_at', now());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_run_security_events_purge(interval) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_run_security_events_purge(interval) TO authenticated;

-- Admin-only audit logger callable from the client (used for export attempts/cancels)
CREATE OR REPLACE FUNCTION public.log_admin_action(
  _action text,
  _resource_type text DEFAULT NULL,
  _resource_id uuid DEFAULT NULL,
  _ip_address text DEFAULT NULL,
  _details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _id uuid;
BEGIN
  IF _uid IS NULL OR NOT public.is_admin(_uid) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _action IS NULL OR length(_action) = 0 OR length(_action) > 80 THEN
    RAISE EXCEPTION 'invalid action';
  END IF;
  INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id, ip_address, details)
    VALUES (_uid, _action, _resource_type, _resource_id, _ip_address, COALESCE(_details, '{}'::jsonb))
    RETURNING id INTO _id;
  RETURN _id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_admin_action(text, text, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_admin_action(text, text, uuid, text, jsonb) TO authenticated;

-- Make the cron purge wrapper write an audit log too (system-initiated, NULL user_id)
CREATE OR REPLACE FUNCTION public.run_security_events_purge(_older_than interval DEFAULT '90 days'::interval)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _deleted bigint;
BEGIN
  _deleted := public.purge_security_events(_older_than);
  INSERT INTO public.security_events_purge_log (deleted_count, retention)
    VALUES (_deleted, _older_than);
  INSERT INTO public.audit_logs (user_id, action, resource_type, details)
    VALUES (NULL, 'security_events_purge_scheduled', 'security_events',
            jsonb_build_object('deleted_count', _deleted,
                               'retention_seconds', EXTRACT(EPOCH FROM _older_than)));
  RETURN _deleted;
END;
$$;

-- Harden SECURITY DEFINER permissions
-- Internal helpers used only via service role from edge functions or by triggers/cron:
REVOKE EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, numeric, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_security_events(interval) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_security_events_purge(interval) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM PUBLIC, anon, authenticated;

-- Add internal admin gates to dashboard reporters (defence-in-depth)
CREATE OR REPLACE FUNCTION public.security_top_ips(_since timestamptz, _limit integer DEFAULT 20)
RETURNS TABLE(ip_address text, total bigint, rate_limit_hits bigint, validation_failures bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT COALESCE(se.ip_address,'(unknown)'), COUNT(*)::bigint,
      COUNT(*) FILTER (WHERE se.event_type='rate_limit_429')::bigint,
      COUNT(*) FILTER (WHERE se.event_type='validation_failed')::bigint
    FROM public.security_events se WHERE se.created_at >= _since
    GROUP BY 1 ORDER BY 2 DESC LIMIT _limit;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.security_top_ips(timestamptz, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_top_ips(timestamptz, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.security_events_summary(_since timestamptz)
RETURNS TABLE(event_type text, scope text, count bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT se.event_type, COALESCE(se.scope,'(unknown)'), COUNT(*)::bigint
    FROM public.security_events se WHERE se.created_at >= _since
    GROUP BY 1,2 ORDER BY 3 DESC;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.security_events_summary(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_events_summary(timestamptz) TO authenticated;

-- find_nearest_chw used by edge functions via service role; lock down public callers
REVOKE EXECUTE ON FUNCTION public.find_nearest_chw(numeric, numeric, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_nearest_chw(numeric, numeric, integer) TO authenticated;

-- Role helpers: revoke from anon, keep authenticated (used in RLS policies)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_chw(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_chw(uuid) TO authenticated;