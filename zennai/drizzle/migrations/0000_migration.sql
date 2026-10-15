-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text CHECK (display_name IS NULL OR char_length(display_name) <= 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, left(coalesce(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)), 80))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Conversations
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'New chat' CHECK (char_length(title) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conversations_user_updated_idx ON public.conversations (user_id, updated_at DESC);
GRANT SELECT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own conversations read" ON public.conversations FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own conversations update" ON public.conversations FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own conversations delete" ON public.conversations FOR DELETE TO authenticated USING (auth.uid() = user_id);
-- Only allow renaming from the client: block changes to user_id
CREATE OR REPLACE FUNCTION public.conversations_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.user_id <> OLD.user_id THEN RAISE EXCEPTION 'user_id is immutable'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER conversations_guard BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.conversations_guard();

-- Messages
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'complete' CHECK (status IN ('complete', 'incomplete', 'error')),
  client_message_id text,
  provider_usage jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, client_message_id)
);
CREATE INDEX messages_conversation_created_idx ON public.messages (conversation_id, created_at);
GRANT SELECT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own messages read" ON public.messages FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- API keys
CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 60),
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX api_keys_user_idx ON public.api_keys (user_id, created_at DESC);
GRANT ALL ON public.api_keys TO service_role;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
-- Clients read through a view that hides the hash
CREATE VIEW public.api_keys_public WITH (security_invoker = true) AS
  SELECT id, user_id, label, key_prefix, created_at, last_used_at, revoked_at FROM public.api_keys;
GRANT SELECT (id, user_id, label, key_prefix, created_at, last_used_at, revoked_at) ON public.api_keys TO authenticated;
GRANT SELECT ON public.api_keys_public TO authenticated;
CREATE POLICY "own keys read" ON public.api_keys FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Usage records
CREATE TABLE public.usage_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  api_key_id uuid REFERENCES public.api_keys(id) ON DELETE SET NULL,
  request_id text NOT NULL UNIQUE,
  source text NOT NULL CHECK (source IN ('web', 'api')),
  model_alias text NOT NULL,
  status text NOT NULL CHECK (status IN ('success', 'error', 'cancelled', 'rejected')),
  input_tokens integer,
  output_tokens integer,
  tokens_estimated boolean NOT NULL DEFAULT false,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX usage_records_user_created_idx ON public.usage_records (user_id, created_at DESC);
GRANT SELECT ON public.usage_records TO authenticated;
GRANT ALL ON public.usage_records TO service_role;
ALTER TABLE public.usage_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own usage read" ON public.usage_records FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Daily quota counters (UTC day)
CREATE TABLE public.usage_daily (
  user_id uuid NOT NULL,
  day date NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
GRANT SELECT ON public.usage_daily TO authenticated;
GRANT ALL ON public.usage_daily TO service_role;
ALTER TABLE public.usage_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own daily read" ON public.usage_daily FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Per-minute rate buckets (server only)
CREATE TABLE public.rate_buckets (
  bucket_key text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key, window_start)
);
GRANT ALL ON public.rate_buckets TO service_role;
ALTER TABLE public.rate_buckets ENABLE ROW LEVEL SECURITY;

-- Atomic quota consumption. Returns {ok, reason, used, limit}
CREATE OR REPLACE FUNCTION public.consume_quota(
  _user_id uuid, _api_key_id uuid, _daily_limit int, _user_per_minute int, _key_per_minute int
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _win timestamptz := date_trunc('minute', now());
  _n int;
  _today date := (now() AT TIME ZONE 'utc')::date;
BEGIN
  INSERT INTO rate_buckets (bucket_key, window_start, count) VALUES ('u:' || _user_id, _win, 1)
  ON CONFLICT (bucket_key, window_start) DO UPDATE SET count = rate_buckets.count + 1
  WHERE rate_buckets.count < _user_per_minute
  RETURNING count INTO _n;
  IF _n IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited'); END IF;

  IF _api_key_id IS NOT NULL THEN
    _n := NULL;
    INSERT INTO rate_buckets (bucket_key, window_start, count) VALUES ('k:' || _api_key_id, _win, 1)
    ON CONFLICT (bucket_key, window_start) DO UPDATE SET count = rate_buckets.count + 1
    WHERE rate_buckets.count < _key_per_minute
    RETURNING count INTO _n;
    IF _n IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited'); END IF;
  END IF;

  _n := NULL;
  INSERT INTO usage_daily (user_id, day, request_count) VALUES (_user_id, _today, 1)
  ON CONFLICT (user_id, day) DO UPDATE SET request_count = usage_daily.request_count + 1
  WHERE usage_daily.request_count < _daily_limit
  RETURNING request_count INTO _n;
  IF _n IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'quota_exceeded', 'limit', _daily_limit); END IF;

  DELETE FROM rate_buckets WHERE window_start < now() - interval '10 minutes';
  RETURN jsonb_build_object('ok', true, 'used', _n, 'limit', _daily_limit);
END; $$;
REVOKE ALL ON FUNCTION public.consume_quota(uuid, uuid, int, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_quota(uuid, uuid, int, int, int) TO service_role;

-- Generic counter limiter for key creation etc.
CREATE OR REPLACE FUNCTION public.hit_rate_limit(_bucket text, _limit int, _window_seconds int) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _win timestamptz := to_timestamp(floor(extract(epoch FROM now()) / _window_seconds) * _window_seconds); _n int;
BEGIN
  INSERT INTO rate_buckets (bucket_key, window_start, count) VALUES (_bucket, _win, 1)
  ON CONFLICT (bucket_key, window_start) DO UPDATE SET count = rate_buckets.count + 1
  WHERE rate_buckets.count < _limit
  RETURNING count INTO _n;
  RETURN _n IS NOT NULL;
END; $$;
REVOKE ALL ON FUNCTION public.hit_rate_limit(text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hit_rate_limit(text, int, int) TO service_role;