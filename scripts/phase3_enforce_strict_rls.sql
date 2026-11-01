-- ==============================================================================
-- TTD Fuel Tracking: Phase 3 Security Hardening (Enforce Strict RLS Policies)
-- Run this script in the Supabase Dashboard -> SQL Editor
-- ==============================================================================
-- Prerequisite: All field PDAs are running Build 208+ (sending `x-device-id` and
-- `x-device-token` headers and using the Phase 2 SECURITY DEFINER RPCs).
--
-- What this script does:
-- 1. Ensures the Phase 2 `public.is_authorized_pda()` helper and SECURITY DEFINER
--    RPCs (`verify_pda_token`, `register_pda_request`, `update_pda_telemetry`) exist.
-- 2. Locks down `public.authorized_devices` so ONLY authenticated Admins can
--    SELECT, INSERT, UPDATE, or DELETE rows directly (preventing `anon` clients
--    from reading `auth_token`s or self-approving devices). Field PDAs interact
--    exclusively via the SECURITY DEFINER RPCs.
-- 3. Locks down `public.equipment_list` so SELECT, INSERT, and UPDATE require
--    `public.is_authorized_pda()` (an active enrolled PDA token or Admin session),
--    and DELETE requires an authenticated Admin session.
-- 4. Locks down `public.transactions` so SELECT, INSERT, UPDATE, and DELETE
--    require `public.is_authorized_pda()`.
-- ==============================================================================

-- 1. Ensure index & Phase 2 SECURITY DEFINER functions exist before tightening RLS
CREATE INDEX IF NOT EXISTS idx_authorized_devices_auth_token
  ON public.authorized_devices(auth_token);

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

-- ==============================================================================
-- 2. Lock down `public.authorized_devices` (Authenticated Admins Only; PDAs use RPCs)
-- ==============================================================================
ALTER TABLE public.authorized_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read authorized_devices for anon" ON public.authorized_devices;
DROP POLICY IF EXISTS "Allow upsert authorized_devices for anon" ON public.authorized_devices;
DROP POLICY IF EXISTS "Allow delete authorized_devices for anon" ON public.authorized_devices;
DROP POLICY IF EXISTS "Allow delete authorized_devices for authenticated admins" ON public.authorized_devices;
DROP POLICY IF EXISTS "Allow select authorized_devices for authenticated admins" ON public.authorized_devices;
DROP POLICY IF EXISTS "Allow insert authorized_devices for authenticated admins" ON public.authorized_devices;
DROP POLICY IF EXISTS "Allow update authorized_devices for authenticated admins" ON public.authorized_devices;

CREATE POLICY "Allow select authorized_devices for authenticated admins"
  ON public.authorized_devices FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow insert authorized_devices for authenticated admins"
  ON public.authorized_devices FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow update authorized_devices for authenticated admins"
  ON public.authorized_devices FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow delete authorized_devices for authenticated admins"
  ON public.authorized_devices FOR DELETE
  TO authenticated
  USING (true);

-- ==============================================================================
-- 3. Lock down `public.equipment_list` (Enrolled Active PDAs & Authenticated Admins)
-- ==============================================================================
ALTER TABLE public.equipment_list ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read equipment for anon" ON public.equipment_list;
DROP POLICY IF EXISTS "Allow upsert equipment for anon" ON public.equipment_list;
DROP POLICY IF EXISTS "Allow insert equipment for all" ON public.equipment_list;
DROP POLICY IF EXISTS "Allow update equipment for all" ON public.equipment_list;
DROP POLICY IF EXISTS "Allow delete equipment for authenticated admins" ON public.equipment_list;
DROP POLICY IF EXISTS "Allow select equipment for authorized pda or admin" ON public.equipment_list;
DROP POLICY IF EXISTS "Allow insert equipment for authorized pda or admin" ON public.equipment_list;
DROP POLICY IF EXISTS "Allow update equipment for authorized pda or admin" ON public.equipment_list;

CREATE POLICY "Allow select equipment for authorized pda or admin"
  ON public.equipment_list FOR SELECT
  TO anon, authenticated
  USING (public.is_authorized_pda());

CREATE POLICY "Allow insert equipment for authorized pda or admin"
  ON public.equipment_list FOR INSERT
  TO anon, authenticated
  WITH CHECK (public.is_authorized_pda());

CREATE POLICY "Allow update equipment for authorized pda or admin"
  ON public.equipment_list FOR UPDATE
  TO anon, authenticated
  USING (public.is_authorized_pda())
  WITH CHECK (public.is_authorized_pda());

CREATE POLICY "Allow delete equipment for authenticated admins"
  ON public.equipment_list FOR DELETE
  TO authenticated
  USING (true);

-- ==============================================================================
-- 4. Lock down `public.transactions` (Enrolled Active PDAs & Authenticated Admins)
-- ==============================================================================
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read transactions for anon" ON public.transactions;
DROP POLICY IF EXISTS "Allow insert/upsert transactions for anon" ON public.transactions;
DROP POLICY IF EXISTS "Allow update transactions for anon" ON public.transactions;
DROP POLICY IF EXISTS "Allow delete transactions for anon" ON public.transactions;
DROP POLICY IF EXISTS "Allow select transactions for authorized pda or admin" ON public.transactions;
DROP POLICY IF EXISTS "Allow insert transactions for authorized pda or admin" ON public.transactions;
DROP POLICY IF EXISTS "Allow update transactions for authorized pda or admin" ON public.transactions;
DROP POLICY IF EXISTS "Allow delete transactions for authorized pda or admin" ON public.transactions;

CREATE POLICY "Allow select transactions for authorized pda or admin"
  ON public.transactions FOR SELECT
  TO anon, authenticated
  USING (public.is_authorized_pda());

CREATE POLICY "Allow insert transactions for authorized pda or admin"
  ON public.transactions FOR INSERT
  TO anon, authenticated
  WITH CHECK (public.is_authorized_pda());

CREATE POLICY "Allow update transactions for authorized pda or admin"
  ON public.transactions FOR UPDATE
  TO anon, authenticated
  USING (public.is_authorized_pda())
  WITH CHECK (public.is_authorized_pda());

CREATE POLICY "Allow delete transactions for authorized pda or admin"
  ON public.transactions FOR DELETE
  TO anon, authenticated
  USING (public.is_authorized_pda());

-- 5. Reload PostgREST schema cache immediately
NOTIFY pgrst, 'reload schema';
