import {
  createClient,
  type SupabaseClient,
  type Session,
  type AuthChangeEvent,
  type RealtimeChannel,
} from '@supabase/supabase-js';
import type { Equipment, Transaction, AuthorizedDevice, DeviceStatus, DeviceTelemetry } from '../types';
import { generateSecureDeviceToken, getDeviceId, getDeviceToken, saveDeviceEnrollment } from './device';
import { getReportedAppVersion } from '../version';
import { db } from '../db/indexedDB';
import { postRemoteTransaction } from './api';
import {
  normalizeWhat3Words,
  primeWhat3WordsCache,
  resolveEquipmentCoordinates,
  convertWhat3WordsToCoordinates,
} from './what3words';

const STORAGE_KEY_URL = 'ttd_supabase_url';
const STORAGE_KEY_ANON = 'ttd_supabase_anon_key';

export interface InitialAuthUrlInfo {
  isInviteOrRecovery: boolean;
  authType: string | null;
  errorDescription: string | null;
}

// Capture Supabase Auth hash/query parameters at module load time before createClient() consumes them
const initialAuthUrlInfo: InitialAuthUrlInfo = (() => {
  if (typeof window === 'undefined') {
    return { isInviteOrRecovery: false, authType: null, errorDescription: null };
  }
  const rawHash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = new URLSearchParams(rawHash);
  const searchParams = new URLSearchParams(window.location.search);
  const authType = hashParams.get('type') || searchParams.get('type');
  const errorDescription =
    hashParams.get('error_description') || searchParams.get('error_description');
  const isInviteOrRecovery =
    authType === 'invite' || authType === 'recovery' || authType === 'signup';
  return {
    isInviteOrRecovery,
    authType,
    errorDescription: errorDescription ? errorDescription.replace(/\+/g, ' ') : null,
  };
})();

export function getInitialAuthUrlInfo(): InitialAuthUrlInfo {
  return initialAuthUrlInfo;
}

let cachedClient: SupabaseClient | null = null;
let hasActiveAdminSession = false;

interface CachedDeviceTokenVerification {
  deviceId: string;
  token: string;
  valid: boolean;
  status: DeviceStatus;
  authToken?: string;
  checkedAt: number;
}

let cachedDeviceTokenAuth: CachedDeviceTokenVerification | null = null;

export function invalidateDeviceTokenCache(): void {
  cachedDeviceTokenAuth = null;
}

async function ensureFieldDeviceAuthorized(): Promise<void> {
  if (hasActiveAdminSession) return;
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const isAdminOrTestRoute = pathname.includes('admin') || pathname.includes('stress-test');
  if (isAdminOrTestRoute) {
    const session = await getAdminSession();
    if (session) return;
  }

  const currentDevId = getDeviceId();
  const currentToken = getDeviceToken();
  if (!currentDevId || !currentToken) {
    throw new Error('DEVICE_UNAUTHORIZED: Device has no active enrollment token');
  }
  const authCheck = await verifyDeviceTokenWithSupabase(currentDevId, currentToken);
  if (!authCheck.valid || authCheck.status !== 'active') {
    throw new Error('DEVICE_UNAUTHORIZED: Device registration has been deleted or revoked by an administrator');
  }
}

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
 * Map a raw Supabase `equipment_list` row to an `Equipment` domain object
 */
export function mapSupabaseRowToEquipment(row: any): Equipment {
  let latitude: number | undefined =
    typeof row.latitude === 'number' && !Number.isNaN(row.latitude) ? row.latitude : undefined;
  let longitude: number | undefined =
    typeof row.longitude === 'number' && !Number.isNaN(row.longitude) ? row.longitude : undefined;

  if ((latitude === undefined || longitude === undefined) && typeof row.device_id === 'string' && row.device_id.startsWith('{')) {
    try {
      const parsed = JSON.parse(row.device_id);
      const cleanRowW3w = normalizeWhat3Words(row.what3words);
      if (
        typeof parsed.lat === 'number' &&
        typeof parsed.lng === 'number' &&
        (!parsed.w3w || normalizeWhat3Words(parsed.w3w) === cleanRowW3w)
      ) {
        latitude = parsed.lat;
        longitude = parsed.lng;
      }
    } catch {
      // Ignore non-JSON device_id values
    }
  }

  if (latitude !== undefined && longitude !== undefined) {
    primeWhat3WordsCache(row.what3words, latitude, longitude);
  }

  return {
    equipmentId: row.equipment_id,
    area: row.area,
    location: row.location,
    what3words: row.what3words,
    latitude,
    longitude,
    type: row.type,
    capacity: row.capacity ?? undefined,
    rentalSerialNumber: row.rental_serial_number,
    poweredUpTimestamp: row.powered_up_timestamp ?? undefined,
    poweredDownTimestamp: row.powered_down_timestamp ?? undefined,
    updatedAt: row.updated_at,
  };
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

  return (data || []).map(mapSupabaseRowToEquipment);
}

/**
 * Save/update equipment in Supabase (converts what3words once on save or update)
 */
export async function saveEquipmentToSupabase(equipment: Equipment, previousW3wHint?: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  await ensureFieldDeviceAuthorized();

  // Check local IndexedDB first before querying Supabase to detect what3words changes without an extra network round-trip
  let previousW3w: string | undefined = previousW3wHint;
  if (!previousW3w) {
    try {
      const localExisting = await db.equipments.get(equipment.equipmentId);
      if (localExisting?.what3words) {
        previousW3w = localExisting.what3words;
      }
    } catch {
      // Ignore local db lookup error
    }
  }

  const resolvedEq = await resolveEquipmentCoordinates(equipment, previousW3w);
  const cleanW3w = normalizeWhat3Words(resolvedEq.what3words);
  const encodedCoords =
    typeof resolvedEq.latitude === 'number' && typeof resolvedEq.longitude === 'number'
      ? JSON.stringify({ lat: resolvedEq.latitude, lng: resolvedEq.longitude, w3w: cleanW3w })
      : null;

  const payload = {
    equipment_id: resolvedEq.equipmentId,
    area: resolvedEq.area,
    location: resolvedEq.location,
    what3words: resolvedEq.what3words,
    device_id: encodedCoords,
    type: resolvedEq.type,
    capacity: resolvedEq.capacity ?? null,
    rental_serial_number: resolvedEq.rentalSerialNumber,
    powered_up_timestamp: resolvedEq.poweredUpTimestamp ?? null,
    powered_down_timestamp: resolvedEq.poweredDownTimestamp ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await client.from('equipment_list').upsert(payload, { onConflict: 'equipment_id' });
  if (error) throw error;

  try {
    await db.equipments.put(resolvedEq);
  } catch {
    // Ignore local db put error
  }
}

/**
 * Delete equipment from Supabase
 */
export async function deleteEquipmentFromSupabase(equipmentId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  await ensureFieldDeviceAuthorized();

  const { error } = await client.from('equipment_list').delete().eq('equipment_id', equipmentId);
  if (error) throw error;
}

/**
 * Delete a single transaction from Supabase
 */
export async function deleteTransactionFromSupabase(transactionId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;

  await ensureFieldDeviceAuthorized();

  // 1. Fetch transaction record prior to deletion to check if it impacts generator power state
  const { data: targetTx } = await client
    .from('transactions')
    .select('equipment_id, transaction_type')
    .eq('id', transactionId)
    .maybeSingle();

  // 2. Delete the transaction record
  const { error, count } = await client
    .from('transactions')
    .delete({ count: 'exact' })
    .eq('id', transactionId);

  if (error) {
    console.error('Error deleting transaction from Supabase:', error);
    throw error;
  }

  if (count === 0) {
    console.warn(
      `[Supabase Warning] Transaction ${transactionId} delete returned count: 0. ` +
      `Ensure the "Allow delete transactions for anon" policy exists on public.transactions in Supabase.`
    );
  }

  // 3. If this was a power event, reconcile the equipment's power state from remaining transactions
  if (targetTx && (targetTx.transaction_type === 'PoweredUp' || targetTx.transaction_type === 'PoweredDown')) {
    const { data: remainingPowerTxs } = await client
      .from('transactions')
      .select('transaction_type, transaction_timestamp')
      .eq('equipment_id', targetTx.equipment_id)
      .in('transaction_type', ['PoweredUp', 'PoweredDown'])
      .order('transaction_timestamp', { ascending: false })
      .limit(1);

    if (remainingPowerTxs && remainingPowerTxs.length > 0) {
      const latest = remainingPowerTxs[0];
      const isPoweredUp = latest.transaction_type === 'PoweredUp';
      await client
        .from('equipment_list')
        .update({
          powered_up_timestamp: isPoweredUp ? latest.transaction_timestamp : null,
          powered_down_timestamp: !isPoweredUp ? latest.transaction_timestamp : null,
          updated_at: new Date().toISOString(),
        })
        .eq('equipment_id', targetTx.equipment_id);
    } else {
      // By default, explicitly OFF when no power transactions exist
      await client
        .from('equipment_list')
        .update({
          powered_up_timestamp: null,
          powered_down_timestamp: null,
          updated_at: new Date().toISOString(),
        })
        .eq('equipment_id', targetTx.equipment_id);
    }
  }
}

/**
 * Update an existing transaction in Supabase and reconcile generator power state if applicable
 */
export async function updateTransactionInSupabase(tx: Transaction): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;

  await ensureFieldDeviceAuthorized();

  const uploadTimestamp = new Date().toISOString();
  const payload: Record<string, unknown> = {
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

  // 1. Try direct in-place UPDATE
  const { data: updatedRows, error: updateErr } = await client
    .from('transactions')
    .update(payload)
    .eq('id', tx.id)
    .select('id');

  // 2. If UPDATE RLS policy is not set or returned 0 updated rows, fallback to delete + insert for explicit edit
  if (updateErr || !updatedRows || updatedRows.length === 0) {
    await client.from('transactions').delete().eq('id', tx.id);
    const { error: insertErr } = await client.from('transactions').insert(payload);
    if (insertErr) throw insertErr;
  }

  // 3. Reconcile generator power state if this transaction is a power event
  if (tx.transactionType === 'PoweredUp' || tx.transactionType === 'PoweredDown') {
    const { data: remainingPowerTxs } = await client
      .from('transactions')
      .select('transaction_type, transaction_timestamp')
      .eq('equipment_id', tx.equipmentId)
      .in('transaction_type', ['PoweredUp', 'PoweredDown'])
      .order('transaction_timestamp', { ascending: false })
      .limit(1);

    if (remainingPowerTxs && remainingPowerTxs.length > 0) {
      const latest = remainingPowerTxs[0];
      const isPoweredUp = latest.transaction_type === 'PoweredUp';
      await client
        .from('equipment_list')
        .update({
          powered_up_timestamp: isPoweredUp ? latest.transaction_timestamp : null,
          powered_down_timestamp: !isPoweredUp ? latest.transaction_timestamp : null,
          updated_at: new Date().toISOString(),
        })
        .eq('equipment_id', tx.equipmentId);
    }
  }
}

let activeRealtimeChannel: RealtimeChannel | null = null;
const FLEET_SYNC_BROADCAST_CHANNEL = 'ttd_fleet_sync_channel';

/**
 * Broadcasts an instant bulk-delete notification over both local BroadcastChannel
 * and the shared Supabase Realtime WebSocket channel so PDAs update in <30ms
 * without waiting for hundreds of individual PostgreSQL WAL DELETE events.
 */
export function broadcastBulkTransactionDelete(payload: {
  equipmentId?: string;
  all?: boolean;
  wipeEquipment?: boolean;
}): void {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    try {
      const bc = new BroadcastChannel(FLEET_SYNC_BROADCAST_CHANNEL);
      bc.postMessage({ type: 'BULK_DELETE', ...payload });
      bc.close();
    } catch {
      // Ignore BroadcastChannel errors
    }
  }

  if (activeRealtimeChannel) {
    try {
      activeRealtimeChannel
        .send({
          type: 'broadcast',
          event: 'ttd_bulk_tx_delete',
          payload,
        })
        .catch(() => {});
    } catch {
      // Ignore Realtime send errors
    }
  }
}

/**
 * Wipe all transactions and equipment from Supabase
 */
export async function clearAllCloudData(): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  broadcastBulkTransactionDelete({ all: true, wipeEquipment: true });

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

  broadcastBulkTransactionDelete({ all: true, wipeEquipment: true });
}

/**
 * Wipe only transaction records from Supabase (leaving equipment_list intact)
 */
export async function clearAllTransactionsFromSupabase(): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  broadcastBulkTransactionDelete({ all: true });

  const [{ error: txErr }, { error: eqErr }] = await Promise.all([
    client
      .from('transactions')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'),
    client
      .from('equipment_list')
      .update({
        powered_up_timestamp: null,
        powered_down_timestamp: null,
        updated_at: new Date().toISOString(),
      })
      .neq('equipment_id', '__DUMMY_NEQ_ALL__'),
  ]);
  if (txErr) throw txErr;
  if (eqErr) {
    console.warn('Could not reset equipment power timestamps after clearing transactions:', eqErr);
  }

  broadcastBulkTransactionDelete({ all: true });
}

/**
 * Wipe transaction records for a single equipment ID from Supabase
 */
export async function deleteTransactionsForEquipmentFromSupabase(equipmentId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  broadcastBulkTransactionDelete({ equipmentId });

  const [{ error: txErr }, { error: eqErr }] = await Promise.all([
    client
      .from('transactions')
      .delete()
      .eq('equipment_id', equipmentId),
    client
      .from('equipment_list')
      .update({
        powered_up_timestamp: null,
        powered_down_timestamp: null,
        updated_at: new Date().toISOString(),
      })
      .eq('equipment_id', equipmentId),
  ]);
  if (txErr) throw txErr;
  if (eqErr) {
    console.warn(`Could not reset equipment power timestamps for ${equipmentId}:`, eqErr);
  }

  broadcastBulkTransactionDelete({ equipmentId });
}

/**
 * Bulk import equipment records into Supabase in chunks (appends new IDs and overwrites duplicate IDs)
 */
export async function bulkImportEquipmentToSupabase(equipmentList: Equipment[]): Promise<number> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  // Deduplicate by equipmentId (last occurrence wins) to prevent PostgreSQL 21000 error on batch upsert
  const dedupedMap = new Map<string, Equipment>();
  for (const eq of equipmentList) {
    dedupedMap.set(eq.equipmentId.trim(), eq);
  }
  const dedupedList = Array.from(dedupedMap.values());

  // Resolve coordinates once per unique what3words address
  const uniqueW3w = Array.from(
    new Set(dedupedList.map((eq) => normalizeWhat3Words(eq.what3words)).filter(Boolean))
  );
  await Promise.all(uniqueW3w.map((w3w) => convertWhat3WordsToCoordinates(w3w)));

  const resolvedList = await Promise.all(
    dedupedList.map((eq) => resolveEquipmentCoordinates(eq))
  );

  const rows = resolvedList.map((eq) => {
    const cleanW3w = normalizeWhat3Words(eq.what3words);
    const encodedCoords =
      typeof eq.latitude === 'number' && typeof eq.longitude === 'number'
        ? JSON.stringify({ lat: eq.latitude, lng: eq.longitude, w3w: cleanW3w })
        : null;

    const payload: Record<string, unknown> = {
      equipment_id: eq.equipmentId,
      area: eq.area,
      location: eq.location,
      what3words: eq.what3words,
      device_id: encodedCoords,
      type: eq.type,
      capacity: eq.capacity ?? null,
      rental_serial_number: eq.rentalSerialNumber,
      updated_at: new Date().toISOString(),
    };

    if (eq.poweredUpTimestamp !== undefined) {
      payload.powered_up_timestamp = eq.poweredUpTimestamp;
    }
    if (eq.poweredDownTimestamp !== undefined) {
      payload.powered_down_timestamp = eq.poweredDownTimestamp;
    }

    return payload;
  });

  const chunkSize = 50;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await client.from('equipment_list').upsert(chunk, { onConflict: 'equipment_id' });
    if (error) throw error;
  }

  return dedupedList.length;
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
 * Map a raw Supabase `transactions` row to a `Transaction` domain object
 */
export function mapSupabaseRowToTransaction(row: any): Transaction {
  return {
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
  };
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

  return (data || []).map(mapSupabaseRowToTransaction);
}

/**
 * Uploads a transaction to Supabase if configured,
 * otherwise uploads to the central shared server API.
 */
export async function uploadTransactionToCloud(
  tx: Transaction
): Promise<{ success: boolean; uploadTimestamp: string; error?: string }> {
  const uploadTimestamp = new Date().toISOString();
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
        uploadTimestamp,
        error: errorMsg,
      };
    }
  }

  // Supabase cloud path (wrapped in try/catch so transient network/DNS errors during Airplane mode transitions never throw unhandled exceptions)
  try {
    // 1. FAIL-CLOSED DEVICE AUTHORIZATION GUARD (uses 60s cached token verification to prevent redundant SELECT queries during batch flushes)
    await ensureFieldDeviceAuthorized();

    // Step 1: Build transaction payload
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

    // Save the transaction to Supabase:
    // 1. Try standard insert first (fast path for new transactions; requires only INSERT RLS policy)
    let { error: txError } = await client
      .from('transactions')
      .insert(payload);

    // Only upsert parent equipment if foreign key constraint (23503) failed (avoids redundant equipment_list write + Realtime event on every tx)
    if (txError && txError.code === '23503') {
      try {
        const localEq = await db.equipments.get(tx.equipmentId);
        if (localEq) {
          const cleanW3w = normalizeWhat3Words(localEq.what3words);
          const encodedCoords =
            typeof localEq.latitude === 'number' && typeof localEq.longitude === 'number'
              ? JSON.stringify({ lat: localEq.latitude, lng: localEq.longitude, w3w: cleanW3w })
              : undefined;
          const eqPayload: Record<string, unknown> = {
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
          if (encodedCoords !== undefined) {
            eqPayload.device_id = encodedCoords;
          }
          await client.from('equipment_list').upsert(eqPayload, { onConflict: 'equipment_id' });
          const retryAfterEq = await client
            .from('transactions')
            .insert(payload);
          txError = retryAfterEq.error;
        }
      } catch (eqErr) {
        console.warn('Equipment FK recovery warning before transaction upload:', eqErr);
      }
    }

    // If device_id column does not exist yet on remote Supabase table, retry without device_id
    if (txError && (txError as any).code === 'PGRST204' && (txError as any).message?.includes('device_id')) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.device_id;
      const retryRes = await client
        .from('transactions')
        .insert(fallbackPayload);
      txError = retryRes.error;
    }

    // 2. If row with this UUID already exists in Supabase (23505):
    //    Check whether the existing row already has the exact same values (Airplane mode retry)
    //    or if the user edited the transaction values and the row needs to be updated.
    if (
      txError &&
      (txError.code === '23505' ||
        (txError as any).message?.includes('duplicate key') ||
        (txError as any).message?.includes('already exists'))
    ) {
      const { data: existingRow } = await client
        .from('transactions')
        .select('*')
        .eq('id', tx.id)
        .maybeSingle();

      const isSameAsExisting = Boolean(
        existingRow &&
        existingRow.transaction_type === payload.transaction_type &&
        (existingRow.check_in_fuel_percentage ?? null) === (payload.check_in_fuel_percentage ?? null) &&
        (existingRow.check_out_fuel_percentage ?? null) === (payload.check_out_fuel_percentage ?? null) &&
        (existingRow.check_in_def_percentage ?? null) === (payload.check_in_def_percentage ?? null) &&
        (existingRow.check_out_def_percentage ?? null) === (payload.check_out_def_percentage ?? null) &&
        (existingRow.check_in_kwh ?? null) === (payload.check_in_kwh ?? null) &&
        (existingRow.check_out_kwh ?? null) === (payload.check_out_kwh ?? null) &&
        (existingRow.check_in_fuel_eighths ?? null) === (payload.check_in_fuel_eighths ?? null) &&
        (existingRow.check_out_fuel_eighths ?? null) === (payload.check_out_fuel_eighths ?? null) &&
        (existingRow.fuel_transfer_litres ?? null) === (payload.fuel_transfer_litres ?? null) &&
        (existingRow.def_transfer_litres ?? null) === (payload.def_transfer_litres ?? null)
      );

      if (isSameAsExisting) {
        // Row in Supabase is already identical — do not delete or touch it
        txError = null;
      } else {
        // Transaction was edited! Try in-place UPDATE first; if 0 rows affected (e.g. no UPDATE RLS policy), replace via DELETE + INSERT
        const { data: updatedRows, error: updateErr } = await client
          .from('transactions')
          .update(payload)
          .eq('id', tx.id)
          .select('id');

        if (!updateErr && updatedRows && updatedRows.length > 0) {
          txError = null;
        } else {
          await client.from('transactions').delete().eq('id', tx.id);
          const replaceRes = await client.from('transactions').insert(payload);
          txError = replaceRes.error;
        }
      }
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
    return { success: false, uploadTimestamp, error: errorMsg };
  }
}

/**
 * Map a raw Supabase `authorized_devices` row to an `AuthorizedDevice` domain object
 */
export function mapSupabaseRowToAuthorizedDevice(row: any): AuthorizedDevice {
  const batteryLevel = typeof row.battery_level === 'number' ? row.battery_level : null;
  const isCharging = typeof row.is_charging === 'boolean' ? row.is_charging : null;
  const latitude = typeof row.latitude === 'number' ? row.latitude : null;
  const longitude = typeof row.longitude === 'number' ? row.longitude : null;
  const locationAccuracy = typeof row.location_accuracy === 'number' ? row.location_accuracy : null;
  const lastTelemetryAt = row.last_telemetry_at || null;
  let appVersion: string | null = row.app_version ? String(row.app_version) : null;
  if (!appVersion && typeof row.device_name === 'string' && row.device_name.includes('__VER__')) {
    const vPart = row.device_name.split('__VER__')[1]?.split('__TEL__')[0]?.trim();
    if (vPart) appVersion = vPart;
  }

  return {
    deviceId: row.device_id,
    authToken: row.auth_token,
    status: row.status as DeviceStatus,
    registeredAt: row.registered_at,
    lastSeenAt: row.last_seen_at,
    batteryLevel,
    isCharging,
    latitude,
    longitude,
    locationAccuracy,
    lastTelemetryAt,
    appVersion,
  };
}

/**
 * Fetch all authorized devices from Supabase
 */
export async function fetchAuthorizedDevicesFromSupabase(): Promise<AuthorizedDevice[]> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const { data, error } = await client
    .from('authorized_devices')
    .select('*')
    .order('registered_at', { ascending: false });

  if (error) {
    if (error.code === 'PGRST205' || (error.message && error.message.includes('authorized_devices'))) {
      console.warn("[Supabase] Table 'public.authorized_devices' does not exist yet. Please run the SQL migration.");
      return [];
    }
    throw new Error(error.message || error.details || error.hint || `Supabase error (${error.code || 'unknown'})`);
  }

  return (data || []).map(mapSupabaseRowToAuthorizedDevice);
}

/**
 * Register or update an authorized device in Supabase
 */
export async function saveAuthorizedDeviceToSupabase(device: AuthorizedDevice): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const cleanId = device.deviceId.trim().toUpperCase();
  const ver = device.appVersion || getReportedAppVersion();

  const payload: Record<string, unknown> = {
    device_id: cleanId,
    auth_token: device.authToken.trim(),
    status: device.status,
    app_version: ver,
    registered_at: device.registeredAt || new Date().toISOString(),
    last_seen_at: device.lastSeenAt || new Date().toISOString(),
  };

  if (typeof device.batteryLevel === 'number') payload.battery_level = device.batteryLevel;
  if (typeof device.isCharging === 'boolean') payload.is_charging = device.isCharging;
  if (typeof device.latitude === 'number') payload.latitude = device.latitude;
  if (typeof device.longitude === 'number') payload.longitude = device.longitude;
  if (typeof device.locationAccuracy === 'number') payload.location_accuracy = device.locationAccuracy;
  if (device.lastTelemetryAt) payload.last_telemetry_at = device.lastTelemetryAt;

  const { error } = await client
    .from('authorized_devices')
    .upsert(payload, { onConflict: 'device_id' });

  if (error) {
    if (error.code === 'PGRST205' || (error.message && error.message.includes('authorized_devices'))) {
      throw new Error(
        "Table 'public.authorized_devices' does not exist in Supabase yet. Please execute the SQL migration in your Supabase SQL Editor."
      );
    }
    throw new Error(error.message || error.details || error.hint || `Supabase error (${error.code || 'unknown'})`);
  }
}

/**
 * Updates live telemetry (battery percentage, charging state, GPS coordinates, and running app version) for a PDA
 */
export async function updateDeviceTelemetryInSupabase(
  deviceId: string,
  telemetry: DeviceTelemetry
): Promise<{ updated: boolean }> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const cleanId = deviceId.trim().toUpperCase();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  lastSeenWriteByDevice.set(cleanId, now);

  const runningVersion = getReportedAppVersion(telemetry.appVersion);

  const telemetryPayload: Record<string, unknown> = {
    app_version: runningVersion,
    last_seen_at: nowIso,
    last_telemetry_at: telemetry.lastTelemetryAt || nowIso,
  };

  if (typeof telemetry.batteryLevel === 'number') telemetryPayload.battery_level = telemetry.batteryLevel;
  if (typeof telemetry.isCharging === 'boolean') telemetryPayload.is_charging = telemetry.isCharging;
  if (typeof telemetry.latitude === 'number') telemetryPayload.latitude = telemetry.latitude;
  if (typeof telemetry.longitude === 'number') telemetryPayload.longitude = telemetry.longitude;
  if (typeof telemetry.locationAccuracy === 'number') telemetryPayload.location_accuracy = telemetry.locationAccuracy;

  const { data, error } = await client
    .from('authorized_devices')
    .update(telemetryPayload)
    .eq('device_id', cleanId)
    .select('device_id, status');

  if (error) {
    if (error.code === 'PGRST205') return { updated: true }; // Table not created yet, skip silently
    console.debug('[Supabase] Telemetry update warning:', error);
    return { updated: true };
  }

  const matchedActive = Array.isArray(data) && data.length > 0 && data[0]?.status === 'active';
  return { updated: matchedActive };
}

/**
 * Update the status of a device (active, pending, revoked) and optionally assign a persistent Device ID
 */
export async function updateDeviceStatusInSupabase(
  deviceId: string,
  status: DeviceStatus,
  assignedDeviceId?: string
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');
  invalidateDeviceTokenCache();

  const cleanId = deviceId.trim().toUpperCase();
  const cleanAssignedId = assignedDeviceId?.trim().toUpperCase();
  const nowIso = new Date().toISOString();

  if (cleanAssignedId && cleanAssignedId !== cleanId) {
    // Fetch existing row so we preserve auth_token and telemetry when assigning the persistent Device ID
    const { data: existingRow, error: fetchError } = await client
      .from('authorized_devices')
      .select('*')
      .eq('device_id', cleanId)
      .maybeSingle();

    if (fetchError) {
      throw new Error(fetchError.message || fetchError.details || fetchError.hint || `Supabase error (${fetchError.code || 'unknown'})`);
    }

    if (!existingRow) {
      throw new Error(`Device request '${cleanId}' was not found in Supabase.`);
    }

    const upsertRow: Record<string, unknown> = {
      ...existingRow,
      device_id: cleanAssignedId,
      status,
      last_seen_at: nowIso,
    };

    const { error: upsertError } = await client
      .from('authorized_devices')
      .upsert(upsertRow, { onConflict: 'device_id' });

    if (upsertError) {
      throw new Error(upsertError.message || upsertError.details || upsertError.hint || `Supabase error (${upsertError.code || 'unknown'})`);
    }

    // Delete the old temporary device ID row
    const { error: deleteError } = await client
      .from('authorized_devices')
      .delete()
      .eq('device_id', cleanId);

    if (deleteError) {
      console.warn('[Supabase] Failed to delete old temporary device ID row:', deleteError);
    }
    return;
  }

  const { error } = await client
    .from('authorized_devices')
    .update({ status, last_seen_at: nowIso })
    .eq('device_id', cleanId);

  if (error) {
    if (error.code === 'PGRST205' || (error.message && error.message.includes('authorized_devices'))) {
      throw new Error(
        "Table 'public.authorized_devices' does not exist in Supabase yet. Please execute the SQL migration in your Supabase SQL Editor."
      );
    }
    throw new Error(error.message || error.details || error.hint || `Supabase error (${error.code || 'unknown'})`);
  }
}

/**
 * Delete a device from the authorized devices whitelist
 */
export async function deleteAuthorizedDeviceFromSupabase(deviceId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');
  invalidateDeviceTokenCache();

  const cleanId = deviceId.trim().toUpperCase();
  const { error } = await client
    .from('authorized_devices')
    .delete()
    .eq('device_id', cleanId);

  if (error) {
    if (error.code === 'PGRST205' || (error.message && error.message.includes('authorized_devices'))) {
      throw new Error(
        "Table 'public.authorized_devices' does not exist in Supabase yet. Please execute the SQL migration in your Supabase SQL Editor."
      );
    }
    throw new Error(error.message || error.details || error.hint || `Supabase error (${error.code || 'unknown'})`);
  }
}

// Throttle last_seen_at database writes to once every 15 minutes per device (since telemetry already updates last_seen_at every 5 min)
const lastSeenWriteByDevice = new Map<string, number>();

/**
 * Verify device credentials against Supabase (with 60s in-memory cache for active tokens to eliminate redundant SELECTs during batch operations)
 */
export async function verifyDeviceTokenWithSupabase(
  deviceId: string,
  token: string,
  forceRefresh = false
): Promise<{ valid: boolean; status: DeviceStatus; deviceId?: string; authToken?: string }> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const cleanId = deviceId.trim().toUpperCase();
  const cleanToken = token.trim();
  const now = Date.now();

  if (
    !forceRefresh &&
    cachedDeviceTokenAuth &&
    cachedDeviceTokenAuth.deviceId === cleanId &&
    cachedDeviceTokenAuth.token === cleanToken &&
    cachedDeviceTokenAuth.valid &&
    now - cachedDeviceTokenAuth.checkedAt < 60000
  ) {
    return {
      valid: cachedDeviceTokenAuth.valid,
      status: cachedDeviceTokenAuth.status,
      deviceId: cachedDeviceTokenAuth.deviceId,
      authToken: cachedDeviceTokenAuth.authToken,
    };
  }

  let { data, error } = await client
    .from('authorized_devices')
    .select('device_id, auth_token, status, app_version')
    .eq('device_id', cleanId)
    .maybeSingle();

  // If the temporary Device ID was replaced by an Admin-assigned persistent Device ID,
  // look up the row by the device's cryptographic auth_token.
  if (!error && !data && cleanToken) {
    const tokenLookup = await client
      .from('authorized_devices')
      .select('device_id, auth_token, status, app_version')
      .eq('auth_token', cleanToken)
      .order('last_seen_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!tokenLookup.error && tokenLookup.data) {
      data = tokenLookup.data;
    }
  }

  if (error) {
    if (error.code === 'PGRST116') {
      invalidateDeviceTokenCache();
      return { valid: false, status: 'revoked' };
    }
    if (error.code === 'PGRST205' || (error.message && error.message.includes('authorized_devices'))) {
      console.warn("[Supabase] Table 'public.authorized_devices' does not exist in Supabase yet.");
      invalidateDeviceTokenCache();
      return { valid: false, status: 'revoked' };
    }
    console.warn('[Supabase] verifyDeviceToken query error:', error);
    throw new Error(error.message || error.details || error.hint || `Supabase error (${error.code || 'unknown'})`);
  }

  if (!data) {
    invalidateDeviceTokenCache();
    return { valid: false, status: 'revoked' };
  }

  const resolvedDeviceId = String(data.device_id || cleanId).trim().toUpperCase();
  const storedVersion = data.app_version ? String(data.app_version) : null;

  // Strict cryptographic token match (no hardcoded bypass strings)
  const isTokenMatch = Boolean(cleanToken) && data.auth_token === cleanToken;
  const isActive = data.status === 'active' && isTokenMatch;

  if (isActive) {
    // If the Admin assigned a persistent Device ID different from the PDA's temporary ID,
    // immediately write the persistent Device ID back to the PDA's localStorage.
    const isAdminRoute = typeof window !== 'undefined' && window.location.pathname.includes('admin');
    if (!isAdminRoute && resolvedDeviceId !== cleanId) {
      saveDeviceEnrollment({
        deviceId: resolvedDeviceId,
        authToken: data.auth_token,
        status: 'active',
      });
    }

    cachedDeviceTokenAuth = {
      deviceId: resolvedDeviceId,
      token: cleanToken,
      valid: true,
      status: 'active',
      authToken: data.auth_token,
      checkedAt: now,
    };

    const lastWrite = lastSeenWriteByDevice.get(resolvedDeviceId) || 0;
    const reportedVer = getReportedAppVersion();
    const versionMismatch = !isAdminRoute && storedVersion !== reportedVer;

    // Only write last_seen_at if appVersion changed or if no telemetry write occurred in the last 15 minutes
    if (versionMismatch || now - lastWrite >= 900000) {
      lastSeenWriteByDevice.set(resolvedDeviceId, now);
      const nowIso = new Date(now).toISOString();
      const updateFields: Record<string, unknown> = {
        last_seen_at: nowIso,
      };
      if (!isAdminRoute) {
        updateFields.app_version = reportedVer;
      }
      client
        .from('authorized_devices')
        .update(updateFields)
        .eq('device_id', resolvedDeviceId)
        .then(() => {}, () => {});
    }
  } else {
    invalidateDeviceTokenCache();
  }

  return {
    valid: isActive,
    status: isActive ? 'active' : data.status === 'pending' && isTokenMatch ? 'pending' : 'revoked',
    deviceId: resolvedDeviceId,
    authToken: isActive ? data.auth_token : undefined,
  };
}

/**
 * Submit a device registration request from a PDA.
 * Always places the device in 'pending' status awaiting explicit Admin Console approval.
 */
export async function registerDeviceRequestToSupabase(
  deviceId: string,
  authToken?: string
): Promise<{ status: DeviceStatus; token: string }> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const cleanId = deviceId.trim().toUpperCase();
  const token = authToken || generateSecureDeviceToken();
  const now = new Date().toISOString();
  const reportedVer = getReportedAppVersion();

  const { error } = await client.from('authorized_devices').upsert(
    {
      device_id: cleanId,
      auth_token: token,
      status: 'pending',
      app_version: reportedVer,
      registered_at: now,
      last_seen_at: now,
    },
    { onConflict: 'device_id' }
  );

  if (error) throw error;
  return { status: 'pending', token };
}

/**
 * Subscribes to real-time database changes in Supabase (e.g. transactions logged by PDAs).
 * Invokes callback whenever rows in `transactions`, `equipment_list`, or `authorized_devices` change.
 * Returns an unsubscribe teardown function.
 */
export function subscribeToCloudChanges(
  onDataChange: (
    table: 'transactions' | 'equipment_list' | 'authorized_devices',
    eventType: string,
    payload?: { new?: Record<string, unknown>; old?: Record<string, unknown> }
  ) => void,
  onReconnect?: () => void,
  _options?: { deviceIdFilter?: string; includeAllDevices?: boolean }
): () => void {
  const client = getSupabaseClient();
  if (!client) return () => {};

  let hasConnectedOnce = false;
  let wasDisconnected = false;

  // Use a single shared Realtime channel name across Admin Console and all PDAs
  // so Supabase Realtime Broadcast events ('ttd_bulk_tx_delete') reach all connected devices immediately
  const channelName = 'ttd-cloud-realtime';

  let localBc: BroadcastChannel | null = null;
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    try {
      localBc = new BroadcastChannel(FLEET_SYNC_BROADCAST_CHANNEL);
      localBc.onmessage = (ev) => {
        if (ev.data && ev.data.type === 'BULK_DELETE') {
          onDataChange('transactions', 'BULK_DELETE', { old: ev.data });
        }
      };
    } catch {
      localBc = null;
    }
  }

  // Do NOT apply a column filter (device_id=eq.X) on authorized_devices because:
  // 1) Under PostgreSQL REPLICA IDENTITY DEFAULT, verify/ check filters on DELETE events may drop or omit events
  // 2) When an Admin assigns a new persistent Device ID to a PDA, the new row has a different device_id than the PDA's temporary ID
  const authDeviceFilterConfig: {
    event: '*';
    schema: 'public';
    table: 'authorized_devices';
  } = {
    event: '*',
    schema: 'public',
    table: 'authorized_devices',
  };

  const channel = client
    .channel(channelName, {
      config: {
        broadcast: { self: false },
      },
    })
    .on(
      'broadcast',
      { event: 'ttd_bulk_tx_delete' },
      (msg) => {
        const data = (msg?.payload || {}) as Record<string, unknown>;
        onDataChange('transactions', 'BULK_DELETE', { old: data });
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'transactions' },
      (payload) => {
        onDataChange('transactions', payload.eventType, payload as { new?: Record<string, unknown>; old?: Record<string, unknown> });
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'equipment_list' },
      (payload) => {
        onDataChange('equipment_list', payload.eventType, payload as { new?: Record<string, unknown>; old?: Record<string, unknown> });
      }
    )
    .on(
      'postgres_changes',
      authDeviceFilterConfig,
      (payload) => {
        onDataChange('authorized_devices', payload.eventType, payload as { new?: Record<string, unknown>; old?: Record<string, unknown> });
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        activeRealtimeChannel = channel;
        if (hasConnectedOnce && wasDisconnected) {
          wasDisconnected = false;
          console.log('[Supabase Realtime] Reconnected after WebSocket drop — syncing missed changes');
          onReconnect?.();
        } else {
          hasConnectedOnce = true;
          console.log('[Supabase Realtime] Connected to live transaction feed from field PDAs');
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        if (hasConnectedOnce) {
          wasDisconnected = true;
        }
      }
    });

  activeRealtimeChannel = channel;

  return () => {
    if (localBc) {
      try {
        localBc.close();
      } catch {
        // Ignore
      }
      localBc = null;
    }
    if (activeRealtimeChannel === channel) {
      activeRealtimeChannel = null;
    }
    try {
      client.removeChannel(channel);
    } catch (err) {
      console.warn('Error removing Supabase realtime channel:', err);
    }
  };
}

export const SUPABASE_SQL_MIGRATION = `-- TTD Fuel Tracking: Migration to enable transaction deletion, device tracking, authorized devices & Realtime
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS device_id text;
ALTER TABLE public.equipment_list ADD COLUMN IF NOT EXISTS device_id text;
ALTER TABLE public.equipment_list ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE public.equipment_list ADD COLUMN IF NOT EXISTS longitude double precision;

-- Create Authorized Devices Table (PDA Whitelist)
CREATE TABLE IF NOT EXISTS public.authorized_devices (
  device_id text PRIMARY KEY,
  auth_token text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'pending')),
  app_version text,
  battery_level smallint,
  is_charging boolean,
  latitude double precision,
  longitude double precision,
  location_accuracy real,
  last_telemetry_at timestamp with time zone,
  registered_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  last_seen_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Drop legacy device_name column & add telemetry columns to existing table if already created
ALTER TABLE public.authorized_devices DROP COLUMN IF EXISTS device_name;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS app_version text;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS battery_level smallint;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS is_charging boolean;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS location_accuracy real;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS last_telemetry_at timestamp with time zone;

-- Composite index for fast per-equipment transaction lookups & power state reconciliation
CREATE INDEX IF NOT EXISTS idx_tx_eq_timestamp ON public.transactions(equipment_id, transaction_timestamp DESC);

ALTER TABLE public.authorized_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authorized_devices REPLICA IDENTITY DEFAULT;
DROP POLICY IF EXISTS "Allow read authorized_devices for anon" ON public.authorized_devices;
CREATE POLICY "Allow read authorized_devices for anon" ON public.authorized_devices FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow upsert authorized_devices for anon" ON public.authorized_devices;
CREATE POLICY "Allow upsert authorized_devices for anon" ON public.authorized_devices FOR ALL USING (true);
DROP POLICY IF EXISTS "Allow delete authorized_devices for anon" ON public.authorized_devices;
CREATE POLICY "Allow delete authorized_devices for anon" ON public.authorized_devices FOR DELETE USING (true);

-- Enable delete and update policies so transactions deleted on PDAs are deleted from Supabase
DROP POLICY IF EXISTS "Allow delete transactions for anon" ON public.transactions;
CREATE POLICY "Allow delete transactions for anon" ON public.transactions FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow update transactions for anon" ON public.transactions;
CREATE POLICY "Allow update transactions for anon" ON public.transactions FOR UPDATE USING (true) WITH CHECK (true);

-- Enable Realtime publication so Admin console updates instantly when PDAs write transactions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'equipment_list'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.equipment_list;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'authorized_devices'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.authorized_devices;
  END IF;
END $$;
`;

export const SUPABASE_SQL_SCHEMA = `-- TTD Fuel Tracking 2026 - Supabase PostgreSQL Schema
-- 1. Create Equipment List Table (with device_id & coordinate tracking)
create table if not exists public.equipment_list (
  equipment_id text primary key,
  area text not null,
  location text not null,
  what3words text not null,
  latitude double precision,
  longitude double precision,
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

-- 3. Create Authorized Devices Table (Zebra TC26 PDA Whitelist & Enrollment)
create table if not exists public.authorized_devices (
  device_id text primary key,
  auth_token text not null,
  status text not null check (status in ('active', 'pending')),
  app_version text,
  battery_level smallint,
  is_charging boolean,
  latitude double precision,
  longitude double precision,
  location_accuracy real,
  last_telemetry_at timestamp with time zone,
  registered_at timestamp with time zone default timezone('utc'::text, now()) not null,
  last_seen_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Indexes for fast query performance across multiple PDAs
create index if not exists idx_tx_equipment_id on public.transactions(equipment_id);
create index if not exists idx_tx_timestamp on public.transactions(transaction_timestamp desc);
create index if not exists idx_tx_eq_timestamp on public.transactions(equipment_id, transaction_timestamp desc);
create index if not exists idx_dev_status on public.authorized_devices(status);

-- 5. Enable Row Level Security (RLS)
alter table public.equipment_list enable row level security;
alter table public.transactions enable row level security;
alter table public.authorized_devices enable row level security;
alter table public.authorized_devices replica identity default;

-- 6. Policies: Devices can read, write, and delete records
create policy "Allow read equipment for anon" on public.equipment_list for select using (true);
create policy "Allow upsert equipment for anon" on public.equipment_list for all using (true);

create policy "Allow read transactions for anon" on public.transactions for select using (true);
create policy "Allow insert/upsert transactions for anon" on public.transactions for all using (true);
create policy "Allow update transactions for anon" on public.transactions for update using (true) with check (true);
create policy "Allow delete transactions for anon" on public.transactions for delete using (true);

create policy "Allow read authorized_devices for anon" on public.authorized_devices for select using (true);
create policy "Allow upsert authorized_devices for anon" on public.authorized_devices for all using (true);
create policy "Allow delete authorized_devices for anon" on public.authorized_devices for delete using (true);

-- 7. Enable Supabase Realtime for instant Admin console auto-refresh
alter publication supabase_realtime add table public.transactions;
alter publication supabase_realtime add table public.equipment_list;
alter publication supabase_realtime add table public.authorized_devices;
`;

export const TELEMETRY_SQL_MIGRATION = `-- TTD Fuel Tracking: Add Native Telemetry & Optimization Columns
-- Paste and run in Supabase Dashboard -> SQL Editor
ALTER TABLE public.authorized_devices DROP COLUMN IF EXISTS device_name;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS app_version text;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS battery_level smallint;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS is_charging boolean;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS location_accuracy real;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS last_telemetry_at timestamp with time zone;
ALTER TABLE public.authorized_devices REPLICA IDENTITY DEFAULT;
CREATE INDEX IF NOT EXISTS idx_tx_eq_timestamp ON public.transactions(equipment_id, transaction_timestamp DESC);
`;

/**
 * Checks if the native telemetry columns (battery_level, etc.) exist on public.authorized_devices
 */
export async function checkNativeTelemetryColumns(): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const { error } = await client.from('authorized_devices').select('app_version, battery_level').limit(1);
    if (error && (error.code === '42703' || error.message?.includes('does not exist') || error.code === 'PGRST204')) {
      return false;
    }
    return !error;
  } catch {
    return false;
  }
}

/**
 * Retrieves the currently active Supabase Auth session for the Admin Console.
 */
function readCachedSupabaseSessionFromStorage(): Session | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const raw = window.localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed.access_token) {
          // Ensure user object is attached if GoTrue v2 stored it in the companion -user key
          if (!parsed.user) {
            const rawUser = window.localStorage.getItem(`${key}-user`);
            if (rawUser) {
              try {
                const parsedUser = JSON.parse(rawUser);
                if (parsedUser?.user) parsed.user = parsedUser.user;
              } catch {}
            }
          }
          if (parsed.user) {
            return parsed as Session;
          }
        }
      }
    }
  } catch {}
  return null;
}

export async function getAdminSession(): Promise<Session | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const cachedFallback = readCachedSupabaseSessionFromStorage();
  try {
    const sessionPromise = client.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.warn('[Supabase Auth] getSession error:', error.message);
        hasActiveAdminSession = Boolean(cachedFallback);
        return cachedFallback;
      }
      const resolvedSession = data.session ?? cachedFallback;
      hasActiveAdminSession = Boolean(resolvedSession);
      return resolvedSession;
    });
    const timeoutPromise = new Promise<Session | null>((resolve) =>
      setTimeout(() => {
        hasActiveAdminSession = Boolean(cachedFallback);
        resolve(cachedFallback);
      }, 2500)
    );
    return await Promise.race([sessionPromise, timeoutPromise]);
  } catch {
    hasActiveAdminSession = Boolean(cachedFallback);
    return cachedFallback;
  }
}

/**
 * Subscribes to Supabase Auth state changes (sign in, sign out, token refresh, password recovery).
 */
export function onAdminAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void
): () => void {
  const client = getSupabaseClient();
  if (!client) return () => {};
  const { data } = client.auth.onAuthStateChange((event, session) => {
    hasActiveAdminSession = Boolean(session);
    callback(event, session);
  });
  return () => {
    data.subscription.unsubscribe();
  };
}

/**
 * Signs in an Admin Console user with email and password via Supabase Auth.
 */
export async function signInAdminWithPassword(email: string, password: string): Promise<Session> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured');

  const { data, error } = await client.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    throw new Error(error.message || 'Invalid login credentials');
  }
  if (!data.session) {
    throw new Error('Authentication failed: no active session returned');
  }
  hasActiveAdminSession = true;
  return data.session;
}

/**
 * Signs out the currently authenticated Admin Console user.
 */
export async function signOutAdmin(): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  hasActiveAdminSession = false;
  const { error } = await client.auth.signOut();
  if (error) {
    throw new Error(error.message || 'Failed to sign out');
  }
}

/**
 * Sends a password reset email for an Admin Console user.
 */
export async function sendAdminPasswordResetEmail(email: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured');

  const redirectTo =
    typeof window !== 'undefined' ? `${window.location.origin}/admin` : undefined;

  const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
    redirectTo,
  });
  if (error) {
    throw new Error(error.message || 'Failed to send password reset email');
  }
}

/**
 * Updates the password for the currently authenticated Admin Console user (e.g. after password recovery).
 */
export async function updateAdminPassword(newPassword: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured');

  const { error } = await client.auth.updateUser({
    password: newPassword,
  });
  if (error) {
    throw new Error(error.message || 'Failed to update password');
  }
}

export const ADMIN_AUTH_RLS_SQL_MIGRATION = `-- TTD Fuel Tracking: Lock down Admin-only destructive operations & optimize schema
-- Paste and run in Supabase Dashboard -> SQL Editor

-- 1. Equipment List: Allow read/upsert for enrolled PDAs & Admins, but restrict DELETE to authenticated Admins only
DROP POLICY IF EXISTS "Allow upsert equipment for anon" ON public.equipment_list;
DROP POLICY IF EXISTS "Allow insert equipment for all" ON public.equipment_list;
DROP POLICY IF EXISTS "Allow update equipment for all" ON public.equipment_list;
DROP POLICY IF EXISTS "Allow delete equipment for authenticated admins" ON public.equipment_list;

CREATE POLICY "Allow insert equipment for all" ON public.equipment_list FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow update equipment for all" ON public.equipment_list FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete equipment for authenticated admins" ON public.equipment_list FOR DELETE TO authenticated USING (true);

-- 2. Authorized Devices: Restrict DELETE from whitelist to authenticated Admins only
DROP POLICY IF EXISTS "Allow delete authorized_devices for anon" ON public.authorized_devices;
DROP POLICY IF EXISTS "Allow delete authorized_devices for authenticated admins" ON public.authorized_devices;
CREATE POLICY "Allow delete authorized_devices for authenticated admins" ON public.authorized_devices FOR DELETE TO authenticated USING (true);

-- 3. Reduce WAL / Realtime Egress on authorized_devices & add composite index on transactions
ALTER TABLE public.authorized_devices REPLICA IDENTITY DEFAULT;
CREATE INDEX IF NOT EXISTS idx_tx_eq_timestamp ON public.transactions(equipment_id, transaction_timestamp DESC);
`;


