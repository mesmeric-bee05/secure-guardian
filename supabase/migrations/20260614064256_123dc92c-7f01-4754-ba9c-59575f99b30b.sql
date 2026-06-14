-- 1) Columns
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS chain_index BIGINT,
  ADD COLUMN IF NOT EXISTS prev_hash  TEXT,
  ADD COLUMN IF NOT EXISTS entry_hash TEXT;

-- 2) Sequence + default for chain_index
CREATE SEQUENCE IF NOT EXISTS public.audit_logs_chain_index_seq OWNED BY public.audit_logs.chain_index;
ALTER TABLE public.audit_logs
  ALTER COLUMN chain_index SET DEFAULT nextval('public.audit_logs_chain_index_seq');

-- 3) Canonical-JSON helper
CREATE OR REPLACE FUNCTION public.audit_logs_canonical_json(_row public.audit_logs)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id',            _row.id,
    'user_id',       _row.user_id,
    'action',        _row.action,
    'resource_type', _row.resource_type,
    'resource_id',   _row.resource_id,
    'details',       COALESCE(_row.details, '{}'::jsonb),
    'ip_address',    _row.ip_address,
    'created_at',    to_char(_row.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'chain_index',   _row.chain_index
  )::text
$$;

-- 4) BEFORE INSERT trigger using built-in sha256(bytea)
CREATE OR REPLACE FUNCTION public.audit_logs_chain_bi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prev TEXT;
BEGIN
  IF NEW.chain_index IS NULL THEN
    NEW.chain_index := nextval('public.audit_logs_chain_index_seq');
  END IF;
  IF NEW.created_at IS NULL THEN
    NEW.created_at := now();
  END IF;

  SELECT entry_hash
    INTO _prev
    FROM public.audit_logs
    WHERE chain_index < NEW.chain_index
      AND entry_hash IS NOT NULL
    ORDER BY chain_index DESC
    LIMIT 1;

  NEW.prev_hash  := COALESCE(_prev, repeat('0', 64));
  NEW.entry_hash := encode(
    sha256(convert_to(NEW.prev_hash || public.audit_logs_canonical_json(NEW), 'UTF8')),
    'hex'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_chain_bi ON public.audit_logs;
CREATE TRIGGER audit_logs_chain_bi
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_logs_chain_bi();

-- 5) Backfill any pre-existing rows
DO $$
DECLARE
  _r public.audit_logs%ROWTYPE;
  _prev TEXT := repeat('0', 64);
  _hash TEXT;
BEGIN
  FOR _r IN
    SELECT * FROM public.audit_logs
     WHERE entry_hash IS NULL
     ORDER BY created_at NULLS FIRST, id
  LOOP
    IF _r.chain_index IS NULL THEN
      _r.chain_index := nextval('public.audit_logs_chain_index_seq');
    END IF;
    _hash := encode(
      sha256(convert_to(_prev || public.audit_logs_canonical_json(_r), 'UTF8')),
      'hex'
    );
    UPDATE public.audit_logs
       SET chain_index = _r.chain_index,
           prev_hash   = _prev,
           entry_hash  = _hash
     WHERE id = _r.id;
    _prev := _hash;
  END LOOP;
END$$;

-- 6) Indexes
CREATE UNIQUE INDEX IF NOT EXISTS audit_logs_chain_index_uniq ON public.audit_logs(chain_index);
CREATE UNIQUE INDEX IF NOT EXISTS audit_logs_entry_hash_uniq ON public.audit_logs(entry_hash);

-- 7) Verification function
CREATE OR REPLACE FUNCTION public.verify_audit_chain(_from bigint DEFAULT 0, _to bigint DEFAULT NULL)
RETURNS TABLE(ok boolean, broken_at bigint, total bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _r public.audit_logs%ROWTYPE;
  _prev TEXT := repeat('0', 64);
  _expected TEXT;
  _count bigint := 0;
  _bad bigint := NULL;
BEGIN
  IF _from > 0 THEN
    SELECT entry_hash INTO _prev
      FROM public.audit_logs
      WHERE chain_index < _from
      ORDER BY chain_index DESC LIMIT 1;
    _prev := COALESCE(_prev, repeat('0', 64));
  END IF;

  FOR _r IN
    SELECT * FROM public.audit_logs
     WHERE chain_index >= _from
       AND (_to IS NULL OR chain_index <= _to)
     ORDER BY chain_index ASC
  LOOP
    _count := _count + 1;
    _expected := encode(
      sha256(convert_to(_prev || public.audit_logs_canonical_json(_r), 'UTF8')),
      'hex'
    );
    IF _r.prev_hash IS DISTINCT FROM _prev OR _r.entry_hash IS DISTINCT FROM _expected THEN
      _bad := _r.chain_index;
      EXIT;
    END IF;
    _prev := _r.entry_hash;
  END LOOP;

  ok := (_bad IS NULL);
  broken_at := _bad;
  total := _count;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_audit_chain(bigint, bigint) FROM PUBLIC;

-- 8) Admin-gated RPC wrapper
CREATE OR REPLACE FUNCTION public.admin_verify_audit_chain(_from bigint DEFAULT 0, _to bigint DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ok boolean;
  _bad bigint;
  _total bigint;
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL OR NOT public.is_admin(_uid) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT v.ok, v.broken_at, v.total
    INTO _ok, _bad, _total
    FROM public.verify_audit_chain(_from, _to) v;

  INSERT INTO public.security_events (event_type, scope, ip_address, details)
    VALUES ('audit_chain_verify', 'admin', NULL,
            jsonb_build_object('ok', _ok, 'broken_at', _bad, 'total', _total,
                               'from', _from, 'to', _to));

  RETURN jsonb_build_object(
    'ok', _ok,
    'broken_at', _bad,
    'total', _total,
    'verified_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_verify_audit_chain(bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_verify_audit_chain(bigint, bigint) TO authenticated;
