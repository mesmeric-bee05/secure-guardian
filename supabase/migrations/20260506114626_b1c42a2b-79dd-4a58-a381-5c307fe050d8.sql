
CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  bucket_key TEXT PRIMARY KEY,
  tokens NUMERIC NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny all to authenticated"
  ON public.rate_limit_buckets AS PERMISSIVE FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "Deny all to anon"
  ON public.rate_limit_buckets AS PERMISSIVE FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_updated_at
  ON public.rate_limit_buckets (updated_at);

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  _key TEXT,
  _capacity INTEGER,
  _refill_per_sec NUMERIC,
  _cost INTEGER DEFAULT 1
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _now TIMESTAMPTZ := now();
  _tokens NUMERIC;
  _last TIMESTAMPTZ;
  _elapsed NUMERIC;
  _new_tokens NUMERIC;
  _allowed BOOLEAN;
  _retry NUMERIC := 0;
BEGIN
  -- Lazy cleanup (cheap, runs ~1% of calls)
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limit_buckets
      WHERE updated_at < _now - interval '1 hour';
  END IF;

  INSERT INTO public.rate_limit_buckets (bucket_key, tokens, updated_at)
    VALUES (_key, _capacity, _now)
    ON CONFLICT (bucket_key) DO NOTHING;

  SELECT tokens, updated_at INTO _tokens, _last
    FROM public.rate_limit_buckets WHERE bucket_key = _key FOR UPDATE;

  _elapsed := GREATEST(0, EXTRACT(EPOCH FROM (_now - _last)));
  _new_tokens := LEAST(_capacity::numeric, _tokens + _elapsed * _refill_per_sec);

  IF _new_tokens >= _cost THEN
    _new_tokens := _new_tokens - _cost;
    _allowed := true;
  ELSE
    _allowed := false;
    IF _refill_per_sec > 0 THEN
      _retry := CEIL((_cost - _new_tokens) / _refill_per_sec);
    ELSE
      _retry := 60;
    END IF;
  END IF;

  UPDATE public.rate_limit_buckets
    SET tokens = _new_tokens, updated_at = _now
    WHERE bucket_key = _key;

  RETURN jsonb_build_object(
    'allowed', _allowed,
    'remaining', FLOOR(_new_tokens),
    'retry_after_seconds', _retry
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, NUMERIC, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, NUMERIC, INTEGER) TO service_role;
