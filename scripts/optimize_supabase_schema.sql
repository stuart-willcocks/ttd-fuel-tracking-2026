-- ==============================================================================
-- TTD Fuel Tracking: Supabase Performance, Egress & Security Optimization Script
-- Run this script in the Supabase Dashboard -> SQL Editor
-- ==============================================================================

-- 1. Add native telemetry & app_version columns to public.authorized_devices
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS app_version text;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS battery_level smallint;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS is_charging boolean;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS location_accuracy real;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS last_telemetry_at timestamp with time zone;

-- 2. Backfill app_version from legacy device_name (if device_name still exists), then drop device_name
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'authorized_devices' AND column_name = 'device_name'
  ) THEN
    UPDATE public.authorized_devices
    SET app_version = split_part(split_part(device_name, '__VER__', 2), '__TEL__', 1)
    WHERE app_version IS NULL AND device_name LIKE '%__VER__%';

    ALTER TABLE public.authorized_devices DROP COLUMN device_name;
  END IF;
END $$;

-- 3. Add native coordinate columns to public.equipment_list
ALTER TABLE public.equipment_list ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE public.equipment_list ADD COLUMN IF NOT EXISTS longitude double precision;

-- 4. Add composite index for fast per-equipment transaction lookups & power state reconciliation
CREATE INDEX IF NOT EXISTS idx_tx_eq_timestamp
  ON public.transactions(equipment_id, transaction_timestamp DESC);

-- 5. Use REPLICA IDENTITY DEFAULT on authorized_devices to prevent WAL / Realtime broadcast bloat
ALTER TABLE public.authorized_devices REPLICA IDENTITY DEFAULT;

-- 6. Lock down destructive DELETE operations on equipment_list & authorized_devices to authenticated Admins
DROP POLICY IF EXISTS "Allow upsert equipment for anon" ON public.equipment_list;
DROP POLICY IF EXISTS "Allow insert equipment for all" ON public.equipment_list;
DROP POLICY IF EXISTS "Allow update equipment for all" ON public.equipment_list;
DROP POLICY IF EXISTS "Allow delete equipment for authenticated admins" ON public.equipment_list;

CREATE POLICY "Allow insert equipment for all"
  ON public.equipment_list FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update equipment for all"
  ON public.equipment_list FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete equipment for authenticated admins"
  ON public.equipment_list FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow delete authorized_devices for anon" ON public.authorized_devices;
DROP POLICY IF EXISTS "Allow delete authorized_devices for authenticated admins" ON public.authorized_devices;
CREATE POLICY "Allow delete authorized_devices for authenticated admins"
  ON public.authorized_devices FOR DELETE TO authenticated USING (true);

-- 7. Notify PostgREST to reload schema cache immediately
NOTIFY pgrst, 'reload schema';
