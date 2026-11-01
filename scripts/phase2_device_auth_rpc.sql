-- ==============================================================================
-- TTD Fuel Tracking: Phase 2 Security Hardening (Non-Breaking RPCs & Header Auth)
-- Run this script in the Supabase Dashboard -> SQL Editor
-- ==============================================================================
-- This migration is 100% forward- and backward-compatible:
-- 1. Creates SECURITY DEFINER helper `public.is_authorized_pda()` that validates
--    `x-device-token` request headers from enrolled Zebra TC26 PDAs (or Admin JWTs).
-- 2. Creates SECURITY DEFINER RPC functions (`verify_pda_token`, `register_pda_request`,
--    `update_pda_telemetry`) so PDAs can authenticate, enroll, and report telemetry
--    without needing direct SELECT/UPDATE privileges on `public.authorized_devices`.
-- 3. Does NOT drop existing RLS policies yet, allowing active field PDAs to update
--    to Build 208+ without interruption before Phase 3 locks down RLS.
-- ==============================================================================

-- 1. Index on auth_token for fast header & RPC token verification
CREATE INDEX IF NOT EXISTS idx_authorized_devices_auth_token
  ON public.authorized_devices(auth_token);

-- 2. Helper function for RLS policies: returns true if caller is an authenticated Admin
--    OR an active enrolled PDA presenting a valid `x-device-token` HTTP header.
CREATE OR REPLACE FUNCTION public.is_authorized_pda()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_headers json;
  v_token text;
BEGIN
  IF auth.role() = 'authenticated' THEN
    RETURN true;
  END IF;

  BEGIN
    v_headers := current_setting('request.headers', true)::json;
    v_token := nullif(trim(coalesce(v_headers->>'x-device-token', '')), '');
  EXCEPTION WHEN OTHERS THEN
    v_token := NULL;
  END;

  IF v_token IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.authorized_devices
    WHERE auth_token = v_token
      AND status = 'active'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_authorized_pda() TO anon, authenticated;

-- 3. RPC: Verify PDA token & return enrollment status without exposing other devices' tokens
CREATE OR REPLACE FUNCTION public.verify_pda_token(
  p_device_id text,
  p_auth_token text,
  p_app_version text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_id text := upper(trim(coalesce(p_device_id, '')));
  v_clean_token text := trim(coalesce(p_auth_token, ''));
  v_clean_ver text := nullif(trim(coalesce(p_app_version, '')), '');
  v_row public.authorized_devices%ROWTYPE;
  v_found boolean := false;
BEGIN
  IF v_clean_id = '' OR v_clean_token = '' THEN
    RETURN jsonb_build_object('valid', false, 'status', 'revoked');
  END IF;

  SELECT * INTO v_row
  FROM public.authorized_devices
  WHERE device_id = v_clean_id
  LIMIT 1;

  IF FOUND THEN
    v_found := true;
  ELSE
    -- Fallback lookup by auth_token in case Admin assigned a new persistent Device ID
    SELECT * INTO v_row
    FROM public.authorized_devices
    WHERE auth_token = v_clean_token
    ORDER BY last_seen_at DESC
    LIMIT 1;
    IF FOUND THEN
      v_found := true;
    END IF;
  END IF;

  IF NOT v_found OR v_row.auth_token IS DISTINCT FROM v_clean_token THEN
    RETURN jsonb_build_object('valid', false, 'status', 'revoked');
  END IF;

  IF v_row.status = 'active' THEN
    IF (v_clean_ver IS NOT NULL AND v_row.app_version IS DISTINCT FROM v_clean_ver)
       OR (v_row.last_seen_at IS NULL OR v_row.last_seen_at < (now() - interval '15 minutes')) THEN
      UPDATE public.authorized_devices
      SET last_seen_at = timezone('utc'::text, now()),
          app_version = coalesce(v_clean_ver, app_version)
      WHERE device_id = v_row.device_id;
    END IF;

    RETURN jsonb_build_object(
      'valid', true,
      'status', 'active',
      'device_id', v_row.device_id,
      'auth_token', v_row.auth_token
    );
  ELSIF v_row.status = 'pending' THEN
    RETURN jsonb_build_object(
      'valid', false,
      'status', 'pending',
      'device_id', v_row.device_id
    );
  ELSE
    RETURN jsonb_build_object('valid', false, 'status', 'revoked');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_pda_token(text, text, text) TO anon, authenticated;

-- 4. RPC: Submit a PDA enrollment request (places device in 'pending' status;
--    refuses to overwrite an already-active device that has a different token)
CREATE OR REPLACE FUNCTION public.register_pda_request(
  p_device_id text,
  p_auth_token text,
  p_app_version text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_id text := upper(trim(coalesce(p_device_id, '')));
  v_clean_token text := trim(coalesce(p_auth_token, ''));
  v_clean_ver text := nullif(trim(coalesce(p_app_version, '')), '');
  v_existing public.authorized_devices%ROWTYPE;
  v_now timestamptz := timezone('utc'::text, now());
BEGIN
  IF v_clean_id = '' OR v_clean_token = '' THEN
    RAISE EXCEPTION 'Device ID and authentication token are required';
  END IF;

  SELECT * INTO v_existing
  FROM public.authorized_devices
  WHERE device_id = v_clean_id
  LIMIT 1;

  IF FOUND AND v_existing.status = 'active' AND v_existing.auth_token IS DISTINCT FROM v_clean_token THEN
    RAISE EXCEPTION 'Device ID % is already enrolled and active', v_clean_id;
  END IF;

  INSERT INTO public.authorized_devices (
    device_id,
    auth_token,
    status,
    app_version,
    registered_at,
    last_seen_at
  ) VALUES (
    v_clean_id,
    v_clean_token,
    'pending',
    v_clean_ver,
    v_now,
    v_now
  )
  ON CONFLICT (device_id) DO UPDATE
  SET auth_token = EXCLUDED.auth_token,
      status = 'pending',
      app_version = coalesce(EXCLUDED.app_version, public.authorized_devices.app_version),
      registered_at = EXCLUDED.registered_at,
      last_seen_at = EXCLUDED.last_seen_at;

  RETURN jsonb_build_object(
    'status', 'pending',
    'device_id', v_clean_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_pda_request(text, text, text) TO anon, authenticated;

-- 5. RPC: Update PDA telemetry (validates caller's auth_token before updating)
CREATE OR REPLACE FUNCTION public.update_pda_telemetry(
  p_device_id text,
  p_auth_token text,
  p_app_version text DEFAULT NULL,
  p_battery_level smallint DEFAULT NULL,
  p_is_charging boolean DEFAULT NULL,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL,
  p_location_accuracy real DEFAULT NULL,
  p_last_telemetry_at timestamp with time zone DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_id text := upper(trim(coalesce(p_device_id, '')));
  v_clean_token text := trim(coalesce(p_auth_token, ''));
  v_clean_ver text := nullif(trim(coalesce(p_app_version, '')), '');
  v_now timestamptz := timezone('utc'::text, now());
  v_row public.authorized_devices%ROWTYPE;
  v_found boolean := false;
BEGIN
  IF v_clean_id = '' OR v_clean_token = '' THEN
    RETURN jsonb_build_object('updated', false, 'status', 'revoked');
  END IF;

  SELECT * INTO v_row
  FROM public.authorized_devices
  WHERE device_id = v_clean_id
    AND auth_token = v_clean_token
  LIMIT 1;

  IF FOUND THEN
    v_found := true;
  ELSE
    SELECT * INTO v_row
    FROM public.authorized_devices
    WHERE auth_token = v_clean_token
    ORDER BY last_seen_at DESC
    LIMIT 1;
    IF FOUND THEN
      v_found := true;
    END IF;
  END IF;

  IF NOT v_found THEN
    RETURN jsonb_build_object('updated', false, 'status', 'revoked');
  END IF;

  UPDATE public.authorized_devices
  SET app_version = coalesce(v_clean_ver, app_version),
      battery_level = coalesce(p_battery_level, battery_level),
      is_charging = coalesce(p_is_charging, is_charging),
      latitude = coalesce(p_latitude, latitude),
      longitude = coalesce(p_longitude, longitude),
      location_accuracy = coalesce(p_location_accuracy, location_accuracy),
      last_telemetry_at = coalesce(p_last_telemetry_at, v_now),
      last_seen_at = v_now
  WHERE device_id = v_row.device_id;

  RETURN jsonb_build_object(
    'updated', (v_row.status = 'active'),
    'status', v_row.status,
    'device_id', v_row.device_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_pda_telemetry(
  text, text, text, smallint, boolean, double precision, double precision, real, timestamp with time zone
) TO anon, authenticated;

-- 6. Reload PostgREST schema cache immediately
NOTIFY pgrst, 'reload schema';
