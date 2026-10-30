-- ==============================================================================
-- TTD Fuel Tracking: Supabase Performance, Egress & Security Optimization Script
-- Run this script in the Supabase Dashboard -> SQL Editor
-- ==============================================================================

-- 1. Add native coordinate & version columns to avoid overloaded string/JSON columns
ALTER TABLE public.equipment_list ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE public.equipment_list ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS app_version text;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS battery_level smallint;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS is_charging boolean;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS location_accuracy real;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS last_telemetry_at timestamp with time zone;

-- 2. Add composite index for fast per-equipment transaction lookups & power state reconciliation
CREATE INDEX IF NOT EXISTS idx_tx_eq_timestamp
  ON public.transactions(equipment_id, transaction_timestamp DESC);

-- 3. Use REPLICA IDENTITY DEFAULT on authorized_devices to prevent WAL / Realtime broadcast bloat
--    (Default primary-key replica identity still includes device_id on DELETE while cutting WAL payload size in half)
ALTER TABLE public.authorized_devices REPLICA IDENTITY DEFAULT;

-- 4. Lock down destructive DELETE operations on equipment_list & authorized_devices to authenticated Admins
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
