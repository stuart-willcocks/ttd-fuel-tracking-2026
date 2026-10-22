import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Equipment, Transaction } from '../types';
import { db } from '../db/indexedDB';
import { postRemoteTransaction } from './api';

const STORAGE_KEY_URL = 'ttd_supabase_url';
const STORAGE_KEY_ANON = 'ttd_supabase_anon_key';

let cachedClient: SupabaseClient | null = null;

export function getSupabaseConfig(): { url: string; anonKey: string } {
  const url =
    import.meta.env.VITE_SUPABASE_URL ||
    localStorage.getItem(STORAGE_KEY_URL) ||
    '';
  const anonKey =
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    localStorage.getItem(STORAGE_KEY_ANON) ||
    '';
  return { url, anonKey };
}

export function saveSupabaseConfig(url: string, anonKey: string) {
  localStorage.setItem(STORAGE_KEY_URL, url);
  localStorage.setItem(STORAGE_KEY_ANON, anonKey);
  cachedClient = null;
}

export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = getSupabaseConfig();
  return Boolean(url && anonKey && url.startsWith('http'));
}

export function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient) return cachedClient;
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey || !url.startsWith('http')) return null;

  try {
    cachedClient = createClient(url, anonKey);
    return cachedClient;
  } catch (err) {
    console.error('Failed to create Supabase client:', err);
    return null;
  }
}

/**
 * Fetch equipment list from Supabase
 */
export async function fetchEquipmentFromSupabase(): Promise<Equipment[]> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const { data, error } = await client
    .from('equipment_list')
    .select('*')
    .order('equipment_id', { ascending: true });

  if (error) throw error;

  return (data || []).map((row: any) => ({
    equipmentId: row.equipment_id,
    area: row.area,
    location: row.location,
    what3words: row.what3words,
    type: row.type,
    capacity: row.capacity ?? undefined,
    rentalSerialNumber: row.rental_serial_number,
    poweredUpTimestamp: row.powered_up_timestamp ?? undefined,
    poweredDownTimestamp: row.powered_down_timestamp ?? undefined,
    updatedAt: row.updated_at,
  }));
}

/**
 * Save/update equipment in Supabase
 */
export async function saveEquipmentToSupabase(equipment: Equipment): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const payload = {
    equipment_id: equipment.equipmentId,
    area: equipment.area,
    location: equipment.location,
    what3words: equipment.what3words,
    type: equipment.type,
    capacity: equipment.capacity ?? null,
    rental_serial_number: equipment.rentalSerialNumber,
    powered_up_timestamp: equipment.poweredUpTimestamp ?? null,
    powered_down_timestamp: equipment.poweredDownTimestamp ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await client.from('equipment_list').upsert(payload, { onConflict: 'equipment_id' });
  if (error) throw error;
}

/**
 * Delete equipment from Supabase
 */
export async function deleteEquipmentFromSupabase(equipmentId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const { error } = await client.from('equipment_list').delete().eq('equipment_id', equipmentId);
  if (error) throw error;
}

/**
 * Delete a single transaction from Supabase
 */
export async function deleteTransactionFromSupabase(transactionId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;

  const { error } = await client.from('transactions').delete().eq('id', transactionId);
  if (error) {
    console.error('Error deleting transaction from Supabase:', error);
    throw error;
  }
}

/**
 * Wipe all transactions and equipment from Supabase
 */
export async function clearAllCloudData(): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const { error: txErr } = await client
    .from('transactions')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (txErr) throw txErr;

  const { error: eqErr } = await client
    .from('equipment_list')
    .delete()
    .neq('equipment_id', '__DUMMY_NEQ_ALL__');
  if (eqErr) throw eqErr;
}

/**
 * Bulk import equipment records into Supabase in chunks
 */
export async function bulkImportEquipmentToSupabase(equipmentList: Equipment[]): Promise<number> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const rows = equipmentList.map((eq) => ({
    equipment_id: eq.equipmentId,
    area: eq.area,
    location: eq.location,
    what3words: eq.what3words,
    type: eq.type,
    capacity: eq.capacity ?? null,
    rental_serial_number: eq.rentalSerialNumber,
    powered_up_timestamp: eq.poweredUpTimestamp ?? null,
    powered_down_timestamp: eq.poweredDownTimestamp ?? null,
    updated_at: new Date().toISOString(),
  }));

  const chunkSize = 50;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await client.from('equipment_list').upsert(chunk, { onConflict: 'equipment_id' });
    if (error) throw error;
  }

  return equipmentList.length;
}

/**
 * Bulk import transaction records into Supabase in chunks
 */
export async function bulkImportTransactionsToSupabase(transactions: Transaction[]): Promise<number> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const rows = transactions.map((tx) => ({
    id: tx.id,
    equipment_id: tx.equipmentId,
    transaction_timestamp: tx.transactionTimestamp,
    upload_timestamp: tx.uploadTimestamp || new Date().toISOString(),
    transaction_type: tx.transactionType,
    device_id: tx.deviceId || 'IMPORT',
    check_in_fuel_eighths: tx.checkInFuelEighths ?? null,
    check_out_fuel_eighths: tx.checkOutFuelEighths ?? null,
    check_in_fuel_percentage: tx.checkInFuelPercentage !== undefined ? Math.min(100, Math.max(0, tx.checkInFuelPercentage)) : null,
    check_out_fuel_percentage: tx.checkOutFuelPercentage !== undefined ? Math.min(100, Math.max(0, tx.checkOutFuelPercentage)) : null,
    check_in_def_percentage: tx.checkInDefPercentage !== undefined ? Math.min(100, Math.max(0, tx.checkInDefPercentage)) : null,
    check_out_def_percentage: tx.checkOutDefPercentage !== undefined ? Math.min(100, Math.max(0, tx.checkOutDefPercentage)) : null,
    fuel_transfer_litres: tx.fuelTransferLitres ?? null,
    def_transfer_litres: tx.defTransferLitres ?? null,
    check_in_kwh: tx.checkInKWH ?? null,
    check_out_kwh: tx.checkOutKWH ?? null,
  }));

  const chunkSize = 50;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await client.from('transactions').insert(chunk);
    if (error) throw error;
  }

  return transactions.length;
}

/**
 * Fetch transactions from Supabase
 */
export async function fetchTransactionsFromSupabase(): Promise<Transaction[]> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const { data, error } = await client
    .from('transactions')
    .select('*')
    .order('transaction_timestamp', { ascending: false });

  if (error) throw error;

  return (data || []).map((row: any) => ({
    id: row.id,
    equipmentId: row.equipment_id,
    transactionTimestamp: row.transaction_timestamp,
    uploadTimestamp: row.upload_timestamp,
    transactionType: row.transaction_type,
    checkInFuelEighths: row.check_in_fuel_eighths ?? undefined,
    checkOutFuelEighths: row.check_out_fuel_eighths ?? undefined,
    checkInFuelPercentage: row.check_in_fuel_percentage ?? undefined,
    checkOutFuelPercentage: row.check_out_fuel_percentage ?? undefined,
    checkInDefPercentage: row.check_in_def_percentage ?? undefined,
    checkOutDefPercentage: row.check_out_def_percentage ?? undefined,
    fuelTransferLitres: row.fuel_transfer_litres ?? undefined,
    defTransferLitres: row.def_transfer_litres ?? undefined,
    checkInKWH: row.check_in_kwh ?? undefined,
    checkOutKWH: row.check_out_kwh ?? undefined,
    syncStatus: 'synced' as const,
    deviceId: row.device_id ?? undefined,
    createdAt: row.created_at,
  }));
}

/**
 * Uploads a transaction to Supabase if configured,
 * otherwise uploads to the central shared server API.
 */
export async function uploadTransactionToCloud(
  tx: Transaction
): Promise<{ success: boolean; uploadTimestamp: string; error?: string }> {
  const client = getSupabaseClient();

  if (!client) {
    // Post to central shared local server API
    try {
      const res = await postRemoteTransaction(tx);
      return { success: true, uploadTimestamp: res.uploadTimestamp };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn('Central API upload failed (offline):', errorMsg);
      return {
        success: false,
        uploadTimestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        error: errorMsg,
      };
    }
  }

  // Supabase cloud path
  const uploadTimestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  try {
    // Step 1: Ensure parent equipment exists in Supabase equipment_list to satisfy Foreign Key constraint
    try {
      const localEq = await db.equipments.get(tx.equipmentId);
      if (localEq) {
        const eqPayload = {
          equipment_id: localEq.equipmentId,
          area: localEq.area || 'Site Area',
          location: localEq.location || 'Field Grid',
          what3words: localEq.what3words || '///field.power.setup',
          type: localEq.type || 'GENERATOR',
          capacity: localEq.capacity ?? null,
          rental_serial_number: localEq.rentalSerialNumber || 'RSN-UNKNOWN',
          powered_up_timestamp: localEq.poweredUpTimestamp ?? null,
          powered_down_timestamp: localEq.poweredDownTimestamp ?? null,
          updated_at: new Date().toISOString(),
        };
        await client.from('equipment_list').upsert(eqPayload, { onConflict: 'equipment_id' });
      }
    } catch (eqErr) {
      console.warn('Equipment pre-check warning before transaction upload:', eqErr);
    }

    // Step 2: Upsert the transaction
    const payload: Record<string, any> = {
      id: tx.id,
      equipment_id: tx.equipmentId,
      transaction_timestamp: tx.transactionTimestamp,
      upload_timestamp: uploadTimestamp,
      transaction_type: tx.transactionType,
      check_in_fuel_eighths: tx.checkInFuelEighths ?? null,
      check_out_fuel_eighths: tx.checkOutFuelEighths ?? null,
      check_in_fuel_percentage: tx.checkInFuelPercentage ?? null,
      check_out_fuel_percentage: tx.checkOutFuelPercentage ?? null,
      check_in_def_percentage: tx.checkInDefPercentage ?? null,
      check_out_def_percentage: tx.checkOutDefPercentage ?? null,
      fuel_transfer_litres: tx.fuelTransferLitres ?? null,
      def_transfer_litres: tx.defTransferLitres ?? null,
      check_in_kwh: tx.checkInKWH ?? null,
      check_out_kwh: tx.checkOutKWH ?? null,
      device_id: tx.deviceId ?? null,
    };

    let { error: txError } = await client.from('transactions').upsert(payload, { onConflict: 'id' });

    // If device_id column does not exist yet on remote Supabase table, retry without device_id
    if (txError && (txError as any).code === 'PGRST204' && (txError as any).message?.includes('device_id')) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.device_id;
      const retryRes = await client.from('transactions').upsert(fallbackPayload, { onConflict: 'id' });
      txError = retryRes.error;
    }

    if (txError) throw txError;

    // Step 3: Update equipment power state in Supabase if PoweredUp / PoweredDown
    if (tx.transactionType === 'PoweredUp') {
      const { error: pwrErr } = await client
        .from('equipment_list')
        .update({
          powered_up_timestamp: tx.transactionTimestamp,
          powered_down_timestamp: null,
          updated_at: new Date().toISOString(),
        })
        .eq('equipment_id', tx.equipmentId);
      if (pwrErr) console.warn('Supabase equipment PoweredUp update warning:', pwrErr);
    } else if (tx.transactionType === 'PoweredDown') {
      const { error: pwrErr } = await client
        .from('equipment_list')
        .update({
          powered_down_timestamp: tx.transactionTimestamp,
          updated_at: new Date().toISOString(),
        })
        .eq('equipment_id', tx.equipmentId);
      if (pwrErr) console.warn('Supabase equipment PoweredDown update warning:', pwrErr);
    }

    return { success: true, uploadTimestamp };
  } catch (err: unknown) {
    let errorMsg = 'Unknown upload error';
    if (err instanceof Error) {
      errorMsg = err.message;
    } else if (typeof err === 'object' && err !== null) {
      const e = err as any;
      errorMsg = e.message || e.details || e.hint || JSON.stringify(err);
    } else {
      errorMsg = String(err);
    }
    console.error('Supabase upload error:', errorMsg);

    // If Supabase upload fails, attempt fallback to local server API
    try {
      const fallbackRes = await postRemoteTransaction(tx);
      if (fallbackRes.success) {
        console.log('Successfully saved to local API as fallback for tx:', tx.id);
        return { success: true, uploadTimestamp: fallbackRes.uploadTimestamp };
      }
    } catch {
      // Ignore fallback error and report original Supabase error
    }

    return { success: false, uploadTimestamp, error: errorMsg };
  }
}

export const SUPABASE_SQL_MIGRATION = `-- TTD Fuel Tracking: Add device_id tracking to existing tables
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS device_id text;
ALTER TABLE public.equipment_list ADD COLUMN IF NOT EXISTS device_id text;
`;

export const SUPABASE_SQL_SCHEMA = `-- TTD Fuel Tracking 2026 - Supabase PostgreSQL Schema
-- 1. Create Equipment List Table (with device_id tracking)
create table if not exists public.equipment_list (
  equipment_id text primary key,
  area text not null,
  location text not null,
  what3words text not null,
  type text not null check (type in ('GENERATOR', 'TANK', 'PLANT')),
  capacity integer,
  rental_serial_number text not null,
  device_id text,
  powered_up_timestamp timestamp with time zone,
  powered_down_timestamp timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Create Transactions Table (with PDA device_id)
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  equipment_id text not null references public.equipment_list(equipment_id) on delete cascade,
  transaction_timestamp timestamp with time zone not null,
  upload_timestamp timestamp with time zone default timezone('utc'::text, now()) not null,
  transaction_type text not null,
  device_id text,
  check_in_fuel_eighths smallint check (check_in_fuel_eighths between 0 and 8),
  check_out_fuel_eighths smallint check (check_out_fuel_eighths between 0 and 8),
  check_in_fuel_percentage smallint check (check_in_fuel_percentage between 0 and 100),
  check_out_fuel_percentage smallint check (check_out_fuel_percentage between 0 and 100),
  check_in_def_percentage smallint check (check_in_def_percentage between 0 and 100),
  check_out_def_percentage smallint check (check_out_def_percentage between 0 and 100),
  fuel_transfer_litres integer check (fuel_transfer_litres >= 0),
  def_transfer_litres integer check (def_transfer_litres >= 0),
  check_in_kwh integer check (check_in_kwh >= 0),
  check_out_kwh integer check (check_out_kwh >= 0),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Migration for existing databases:
-- ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS device_id text;
-- ALTER TABLE public.equipment_list ADD COLUMN IF NOT EXISTS device_id text;

-- 3. Indexes for fast query performance across multiple PDAs
create index if not exists idx_tx_equipment_id on public.transactions(equipment_id);
create index if not exists idx_tx_timestamp on public.transactions(transaction_timestamp desc);

-- 4. Enable Row Level Security (RLS)
alter table public.equipment_list enable row level security;
alter table public.transactions enable row level security;

-- 5. Policies: Devices can read and write records
create policy "Allow read equipment for anon" on public.equipment_list for select using (true);
create policy "Allow upsert equipment for anon" on public.equipment_list for all using (true);

create policy "Allow read transactions for anon" on public.transactions for select using (true);
create policy "Allow insert/upsert transactions for anon" on public.transactions for all using (true);

-- 6. Insert initial fleet equipment
insert into public.equipment_list (equipment_id, area, location, what3words, type, capacity, rental_serial_number, powered_up_timestamp)
values
  ('TTD-MAT-0001', 'North Zone', 'Stage Alpha Power Compound', '///puzzle.stages.daring', 'GENERATOR', 100, 'RSN-40291', '2026-10-14 08:30:00Z'),
  ('TTD-MAT-0002', 'Main Arena', 'Main Sound & Light Generator', '///barks.flesh.gravel', 'GENERATOR', 250, 'RSN-40295', null),
  ('TTD-MAT-0003', 'North Zone', 'Bulk Fuel Farm Alpha', '///tracks.sparks.silver', 'TANK', 3000, 'TNK-99211', null),
  ('TTD-MAT-0004', 'Logistics Hub', 'Vehicle Refuel Station Tank 2', '///launch.bright.solid', 'TANK', 5000, 'TNK-88320', null),
  ('TTD-MAT-0005', 'South Gate', 'Tower Light Unit 04', '///amber.tower.cliff', 'PLANT', null, 'PLT-11422', null),
  ('TTD-MAT-0006', 'West Gate', 'Telehandler 02 - Rigging Team', '///cables.signal.entry', 'PLANT', null, 'PLT-77401', null)
on conflict (equipment_id) do nothing;
`;
