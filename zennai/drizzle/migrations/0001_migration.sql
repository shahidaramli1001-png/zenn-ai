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

  DELETE FROM rate_buckets WHERE window_start < now() - interval '2 days'
     OR ((bucket_key LIKE 'u:%' OR bucket_key LIKE 'k:%') AND window_start < now() - interval '10 minutes');
  RETURN jsonb_build_object('ok', true, 'used', _n, 'limit', _daily_limit);
END; $$;
REVOKE ALL ON FUNCTION public.consume_quota(uuid, uuid, int, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_quota(uuid, uuid, int, int, int) TO service_role;