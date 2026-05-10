-- Purge log table
CREATE TABLE IF NOT EXISTS public.security_events_purge_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  deleted_count bigint NOT NULL DEFAULT 0,
  retention interval NOT NULL
);

ALTER TABLE public.security_events_purge_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view purge log" ON public.security_events_purge_log;
CREATE POLICY "Admins view purge log"
  ON public.security_events_purge_log
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Deny purge log writes auth" ON public.security_events_purge_log;
CREATE POLICY "Deny purge log writes auth"
  ON public.security_events_purge_log
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "Deny purge log writes anon" ON public.security_events_purge_log;
CREATE POLICY "Deny purge log writes anon"
  ON public.security_events_purge_log
  AS PERMISSIVE
  FOR INSERT
  TO anon
  WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_security_events_purge_log_ran_at
  ON public.security_events_purge_log (ran_at DESC);

-- Wrapper that purges and logs
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
  RETURN _deleted;
END;
$$;

-- Retention status reporter for the admin dashboard
CREATE OR REPLACE FUNCTION public.security_events_retention_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _last_ran_at timestamptz;
  _last_deleted bigint;
  _last_retention interval;
  _oldest timestamptz;
  _total bigint;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT ran_at, deleted_count, retention
    INTO _last_ran_at, _last_deleted, _last_retention
    FROM public.security_events_purge_log
    ORDER BY ran_at DESC
    LIMIT 1;

  SELECT MIN(created_at), COUNT(*) INTO _oldest, _total FROM public.security_events;

  RETURN jsonb_build_object(
    'retention_days', COALESCE(EXTRACT(EPOCH FROM _last_retention) / 86400, 90),
    'last_run_at', _last_ran_at,
    'last_deleted', COALESCE(_last_deleted, 0),
    'oldest_event_at', _oldest,
    'total_rows', COALESCE(_total, 0)
  );
END;
$$;