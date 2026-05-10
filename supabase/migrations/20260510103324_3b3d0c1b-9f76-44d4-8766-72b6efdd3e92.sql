REVOKE EXECUTE ON FUNCTION public.run_security_events_purge(interval) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.security_events_retention_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_events_retention_status() TO authenticated;