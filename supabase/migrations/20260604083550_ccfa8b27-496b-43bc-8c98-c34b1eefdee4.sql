
UPDATE public.first_aid_protocols p
   SET steps = (
     SELECT COALESCE(jsonb_agg(
              jsonb_build_object(
                'order', i - 1,
                'en', COALESCE(p.steps->'en'->>(i-1), ''),
                'sw', COALESCE(p.steps->'sw'->>(i-1), '')
              ) ORDER BY i
            ), '[]'::jsonb)
       FROM generate_series(1, GREATEST(
              COALESCE(jsonb_array_length(p.steps->'en'), 0),
              COALESCE(jsonb_array_length(p.steps->'sw'), 0)
            )) AS i
   )
 WHERE jsonb_typeof(steps) = 'object'
   AND (jsonb_typeof(steps->'en') = 'array' OR jsonb_typeof(steps->'sw') = 'array');

UPDATE public.first_aid_protocols SET steps = '[]'::jsonb WHERE jsonb_typeof(steps) <> 'array';

ALTER TABLE public.first_aid_protocols
  ADD COLUMN IF NOT EXISTS red_flags_en text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS red_flags_sw text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS seek_help_en text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS seek_help_sw text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS video_provider text;

ALTER TABLE public.first_aid_protocols ALTER COLUMN reference_books SET DEFAULT '[]'::jsonb;
UPDATE public.first_aid_protocols SET reference_books = '[]'::jsonb WHERE reference_books IS NULL;
ALTER TABLE public.first_aid_protocols ALTER COLUMN reference_books SET NOT NULL;

UPDATE public.first_aid_protocols
   SET red_flags_en = COALESCE(red_flags, '{}'), red_flags_sw = COALESCE(red_flags, '{}')
 WHERE red_flags IS NOT NULL AND red_flags_en = '{}';

UPDATE public.first_aid_protocols
   SET seek_help_en = COALESCE(seek_help_when, '{}'), seek_help_sw = COALESCE(seek_help_when, '{}')
 WHERE seek_help_when IS NOT NULL AND seek_help_en = '{}';

ALTER TABLE public.first_aid_protocols
  DROP CONSTRAINT IF EXISTS first_aid_protocols_video_provider_chk,
  ADD  CONSTRAINT first_aid_protocols_video_provider_chk
       CHECK (video_provider IS NULL OR video_provider IN ('youtube','vimeo','mp4'));

ALTER TABLE public.first_aid_protocols
  DROP CONSTRAINT IF EXISTS first_aid_protocols_steps_is_array_chk,
  ADD  CONSTRAINT first_aid_protocols_steps_is_array_chk
       CHECK (jsonb_typeof(steps) = 'array');

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS onboarding_step smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_onboarding_step_chk,
  ADD  CONSTRAINT profiles_onboarding_step_chk CHECK (onboarding_step BETWEEN 0 AND 6);

UPDATE public.profiles SET onboarding_completed = false WHERE onboarding_completed IS NULL;
ALTER TABLE public.profiles ALTER COLUMN onboarding_completed SET NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN onboarding_completed SET DEFAULT false;

CREATE OR REPLACE FUNCTION public.profiles_onboarding_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _has_contact boolean;
BEGIN
  IF NEW.onboarding_completed IS TRUE AND (OLD.onboarding_completed IS DISTINCT FROM TRUE) THEN
    IF NEW.full_name IS NULL OR length(trim(NEW.full_name))=0
       OR NEW.preferred_language IS NULL
       OR NEW.region IS NULL OR length(trim(NEW.region))=0 THEN
      RAISE EXCEPTION 'onboarding_incomplete: full_name, preferred_language and region are required';
    END IF;
    SELECT EXISTS (SELECT 1 FROM public.emergency_contacts WHERE user_id = NEW.user_id) INTO _has_contact;
    IF NOT _has_contact THEN
      RAISE EXCEPTION 'onboarding_incomplete: at least one emergency contact is required';
    END IF;
    NEW.onboarding_completed_at := now();
    IF NEW.onboarding_step < 6 THEN NEW.onboarding_step := 6; END IF;
  END IF;
  RETURN NEW;
END;$$;

REVOKE ALL ON FUNCTION public.profiles_onboarding_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_onboarding_guard_trg ON public.profiles;
CREATE TRIGGER profiles_onboarding_guard_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_onboarding_guard();

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS failure_count int NOT NULL DEFAULT 0;

DELETE FROM public.push_subscriptions p
 USING public.push_subscriptions q
 WHERE p.endpoint = q.endpoint AND p.ctid <> q.ctid
   AND (p.updated_at, p.id) < (q.updated_at, q.id);

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_uniq ON public.push_subscriptions(endpoint);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_last_seen_idx ON public.push_subscriptions(user_id, last_seen_at DESC);

CREATE OR REPLACE FUNCTION public.prune_stale_push_subscriptions(_older_than interval DEFAULT '30 days')
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _deleted bigint;
BEGIN
  DELETE FROM public.push_subscriptions
   WHERE last_seen_at < now() - _older_than OR failure_count >= 5;
  GET DIAGNOSTICS _deleted = ROW_COUNT;
  RETURN _deleted;
END;$$;

REVOKE ALL ON FUNCTION public.prune_stale_push_subscriptions(interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_stale_push_subscriptions(interval) TO service_role;
