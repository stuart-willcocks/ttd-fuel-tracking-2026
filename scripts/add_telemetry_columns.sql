-- ==============================================================================
-- TTD Fuel Tracking: Add Native Telemetry Columns to public.authorized_devices
-- Run this script in the Supabase Dashboard -> SQL Editor
-- ==============================================================================

-- 1. Drop legacy device_name column and add telemetry columns to public.authorized_devices
ALTER TABLE public.authorized_devices DROP COLUMN IF EXISTS device_name;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS app_version text;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS battery_level smallint;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS is_charging boolean;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS location_accuracy real;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS last_telemetry_at timestamp with time zone;

-- 2. Ensure Realtime is enabled for authorized_devices table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'authorized_devices'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.authorized_devices;
  END IF;
END $$;
