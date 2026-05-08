-- Indexes for security_events fast filtering
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON public.security_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_type_created ON public.security_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_scope_created ON public.security_events (scope, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_ip_created ON public.security_events (ip_address, created_at DESC) WHERE ip_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_security_events_user_created ON public.security_events (user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_security_events_severity_created ON public.security_events (severity, created_at DESC);

-- Retention function
CREATE OR REPLACE FUNCTION public.purge_security_events(_older_than interval DEFAULT interval '90 days')
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deleted bigint;
BEGIN
  DELETE FROM public.security_events
    WHERE created_at < now() - _older_than;
  GET DIAGNOSTICS _deleted = ROW_COUNT;
  RETURN _deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_security_events(interval) FROM public, anon, authenticated;

-- Schedule daily purge at 03:00 UTC if pg_cron is available
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('purge-security-events-daily')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-security-events-daily');
    PERFORM cron.schedule(
      'purge-security-events-daily',
      '0 3 * * *',
      $cron$ SELECT public.purge_security_events(interval '90 days'); $cron$
    );
  END IF;
END $$;