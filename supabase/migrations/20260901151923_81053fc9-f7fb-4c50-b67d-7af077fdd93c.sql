CREATE TABLE public.mpesa_callback_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  checkout_request_id text NOT NULL,
  reference_id text NOT NULL,
  donation_id uuid,
  result_code integer,
  status text,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mpesa_callback_events_ref_unique UNIQUE (checkout_request_id, reference_id)
);

GRANT ALL ON public.mpesa_callback_events TO service_role;
GRANT SELECT ON public.mpesa_callback_events TO authenticated;

ALTER TABLE public.mpesa_callback_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view callback events"
  ON public.mpesa_callback_events FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Deny client writes anon"
  ON public.mpesa_callback_events FOR INSERT TO anon WITH CHECK (false);

CREATE POLICY "Deny client writes auth"
  ON public.mpesa_callback_events FOR INSERT TO authenticated WITH CHECK (false);

CREATE INDEX idx_mpesa_callback_events_received_at
  ON public.mpesa_callback_events (received_at DESC);

CREATE OR REPLACE FUNCTION public.purge_mpesa_callback_events(_older_than interval DEFAULT '180 days'::interval)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _deleted bigint;
BEGIN
  DELETE FROM public.mpesa_callback_events WHERE received_at < now() - _older_than;
  GET DIAGNOSTICS _deleted = ROW_COUNT;
  RETURN _deleted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_mpesa_callback_events(interval) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mpesa_denial_spike_check(_window interval DEFAULT '15 minutes'::interval, _threshold integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _since timestamptz := now() - _window;
  _count bigint;
  _reasons jsonb;
BEGIN
  SELECT count(*) INTO _count
    FROM public.audit_logs
    WHERE action = 'mpesa_callback_rejected' AND created_at >= _since;

  SELECT COALESCE(jsonb_object_agg(reason, n), '{}'::jsonb) INTO _reasons
    FROM (
      SELECT COALESCE(details->>'reason','unknown') AS reason, count(*) AS n
        FROM public.audit_logs
       WHERE action = 'mpesa_callback_rejected' AND created_at >= _since
       GROUP BY 1 ORDER BY 2 DESC LIMIT 10
    ) t;

  RETURN jsonb_build_object(
    'window_seconds', EXTRACT(EPOCH FROM _window),
    'threshold', _threshold,
    'denial_count', _count,
    'spike', _count >= _threshold,
    'reasons', _reasons,
    'since', _since,
    'checked_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mpesa_denial_spike_check(interval, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mpesa_denial_spike_check(interval, integer) TO service_role;