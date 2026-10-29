import { createClient, type SupabaseClient, type Session, type AuthChangeEvent } from '@supabase/supabase-js';
import type { Equipment, Transaction, AuthorizedDevice, DeviceStatus, DeviceTelemetry } from '../types';
import { generateSecureDeviceToken, getDeviceId, getDeviceName, getDeviceToken } from './device';
import { APP_VERSION } from '../version';
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

  return (data || []).map((row: any) => {
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
  });
}

/**
 * Save/update equipment in Supabase (converts what3words once on save or update)
 */
export async function saveEquipmentToSupabase(equipment: Equipment): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  // Verify device authorization for field handheld client modifications
  const isAdminPortal = typeof window !== 'undefined' && window.location.pathname.includes('admin');
  if (!isAdminPortal) {
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

  // Check existing what3words in Supabase to detect changes on update
  let previousW3w: string | undefined;
  try {
    const { data: existingRow } = await client
      .from('equipment_list')
      .select('what3words')
      .eq('equipment_id', equipment.equipmentId)
      .maybeSingle();
    if (existingRow?.what3words) {
      previousW3w = existingRow.what3words;
    }
  } catch {
    // Ignore lookup error
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
}

/**
 * Delete equipment from Supabase
 */
export async function deleteEquipmentFromSupabase(equipmentId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const isAdminPortal = typeof window !== 'undefined' && window.location.pathname.includes('admin');
  if (!isAdminPortal) {
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

  const { error } = await client.from('equipment_list').delete().eq('equipment_id', equipmentId);
  if (error) throw error;
}

/**
 * Delete a single transaction from Supabase
 */
export async function deleteTransactionFromSupabase(transactionId: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;

  const isAdminPortal = typeof window !== 'undefined' && window.location.pathname.includes('admin');
  if (!isAdminPortal) {
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

  // Resolve coordinates once per unique what3words address
  const uniqueW3w = Array.from(
    new Set(equipmentList.map((eq) => normalizeWhat3Words(eq.what3words)).filter(Boolean))
  );
  await Promise.all(uniqueW3w.map((w3w) => convertWhat3WordsToCoordinates(w3w)));

  const resolvedList = await Promise.all(
    equipmentList.map((eq) => resolveEquipmentCoordinates(eq))
  );

  const rows = resolvedList.map((eq) => {
    const cleanW3w = normalizeWhat3Words(eq.what3words);
    const encodedCoords =
      typeof eq.latitude === 'number' && typeof eq.longitude === 'number'
        ? JSON.stringify({ lat: eq.latitude, lng: eq.longitude, w3w: cleanW3w })
        : null;

    return {
      equipment_id: eq.equipmentId,
      area: eq.area,
      location: eq.location,
      what3words: eq.what3words,
      device_id: encodedCoords,
      type: eq.type,
      capacity: eq.capacity ?? null,
      rental_serial_number: eq.rentalSerialNumber,
      powered_up_timestamp: eq.poweredUpTimestamp ?? null,
      powered_down_timestamp: eq.poweredDownTimestamp ?? null,
      updated_at: new Date().toISOString(),
    };
  });

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
  const uploadTimestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
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

  // 1. FAIL-CLOSED DEVICE AUTHORIZATION GUARD
  const isAdminPortal = typeof window !== 'undefined' && (
    window.location.pathname.includes('admin') ||
    tx.deviceId === 'Admin-Workstation'
  );

  if (!isAdminPortal) {
    const currentDevId = getDeviceId();
    const currentToken = getDeviceToken();
    if (!currentDevId || !currentToken) {
      return {
        success: false,
        uploadTimestamp,
        error: 'DEVICE_UNAUTHORIZED: Device has no active enrollment token',
      };
    }

    const authCheck = await verifyDeviceTokenWithSupabase(currentDevId, currentToken);
    if (!authCheck.valid || authCheck.status !== 'active') {
      console.warn(`[Supabase Upload Blocked] Device ${currentDevId} is not active (status: ${authCheck.status}).`);
      return {
        success: false,
        uploadTimestamp,
        error: 'DEVICE_UNAUTHORIZED: Device registration has been deleted or revoked by an administrator',
      };
    }
  }

  // Supabase cloud path
  try {
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

    // Save the transaction to Supabase
    let { error: txError } = await client.from('transactions').insert(payload);

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
          const retryAfterEq = await client.from('transactions').insert(payload);
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
      const retryRes = await client.from('transactions').insert(fallbackPayload);
      txError = retryRes.error;
    }

    // If duplicate key (code 23505) or RLS policy violation on existing row (code 42501):
    // Delete the existing row and insert the updated payload to preserve the exact transaction ID.
    if (
      txError &&
      (txError.code === '23505' ||
        txError.code === '42501' ||
        (txError as any).message?.includes('duplicate key') ||
        (txError as any).message?.includes('already exists') ||
        (txError as any).message?.includes('row-level security'))
    ) {
      await client.from('transactions').delete().eq('id', tx.id);

      const reinsertRes = await client.from('transactions').insert(payload);
      txError = reinsertRes.error;

      if (txError && (txError as any).code === 'PGRST204' && (txError as any).message?.includes('device_id')) {
        const fallbackPayload = { ...payload };
        delete fallbackPayload.device_id;
        const retryRes = await client.from('transactions').insert(fallbackPayload);
        txError = retryRes.error;
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

// Cache of clean device labels by device_id so telemetry updates never need an extra SELECT query
const knownDeviceNamesById = new Map<string, string>();

function parseDeviceNameAndVersion(
  rawName: string | null | undefined,
  fallbackId: string
): { cleanName: string; appVersion: string | null } {
  if (!rawName || typeof rawName !== 'string') {
    return { cleanName: fallbackId, appVersion: null };
  }
  let working = rawName;
  let appVersion: string | null = null;

  if (working.includes('__TEL__')) {
    const parts = working.split('__TEL__');
    working = parts[0] || fallbackId;
    try {
      const parsed = JSON.parse(parts[1]);
      if (parsed && parsed.appVersion) {
        appVersion = String(parsed.appVersion);
      }
    } catch {}
  }

  if (working.includes('__VER__')) {
    const vParts = working.split('__VER__');
    working = vParts[0] || fallbackId;
    if (vParts[1] && vParts[1].trim()) {
      appVersion = vParts[1].trim();
    }
  }

  return {
    cleanName: working.trim() || fallbackId,
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

  return (data || []).map((row: any) => {
    const rawName: string = row.device_name || row.device_id;
    const { cleanName, appVersion: encodedVer } = parseDeviceNameAndVersion(rawName, row.device_id);
    if (row.device_id) {
      knownDeviceNamesById.set(String(row.device_id).toUpperCase(), cleanName);
    }

    let batteryLevel = typeof row.battery_level === 'number' ? row.battery_level : null;
    let isCharging = typeof row.is_charging === 'boolean' ? row.is_charging : null;
    let latitude = typeof row.latitude === 'number' ? row.latitude : null;
    let longitude = typeof row.longitude === 'number' ? row.longitude : null;
    let locationAccuracy = typeof row.location_accuracy === 'number' ? row.location_accuracy : null;
    let lastTelemetryAt = row.last_telemetry_at || null;
    let appVersion: string | null = row.app_version ? String(row.app_version) : encodedVer;

    // Decode telemetry from device_name fallback if dedicated columns are not yet in Supabase
    if (rawName && typeof rawName === 'string' && rawName.includes('__TEL__')) {
      const parts = rawName.split('__TEL__');
      try {
        const parsed = JSON.parse(parts[1]);
        if (batteryLevel === null && typeof parsed.batteryLevel === 'number') batteryLevel = parsed.batteryLevel;
        if (isCharging === null && typeof parsed.isCharging === 'boolean') isCharging = parsed.isCharging;
        if (latitude === null && typeof parsed.latitude === 'number') latitude = parsed.latitude;
        if (longitude === null && typeof parsed.longitude === 'number') longitude = parsed.longitude;
        if (locationAccuracy === null && typeof parsed.locationAccuracy === 'number') locationAccuracy = parsed.locationAccuracy;
        if (!lastTelemetryAt && parsed.lastTelemetryAt) lastTelemetryAt = parsed.lastTelemetryAt;
        if (!appVersion && parsed.appVersion) appVersion = String(parsed.appVersion);
      } catch {}
    }

    return {
      deviceId: row.device_id,
      deviceName: cleanName,
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
  });
}

/**
 * Register or update an authorized device in Supabase
 */
export async function saveAuthorizedDeviceToSupabase(device: AuthorizedDevice): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const cleanId = device.deviceId.trim().toUpperCase();
  const rawName = device.deviceName || cleanId;
  const { cleanName, appVersion: existingVer } = parseDeviceNameAndVersion(rawName, cleanId);
  knownDeviceNamesById.set(cleanId, cleanName);

  const versionToStore = device.appVersion || existingVer || null;
  const storedName = versionToStore ? `${cleanName}__VER__${versionToStore}` : cleanName;

  const payload: Record<string, unknown> = {
    device_id: cleanId,
    device_name: storedName,
    auth_token: device.authToken.trim(),
    status: device.status,
    registered_at: device.registeredAt || new Date().toISOString(),
    last_seen_at: device.lastSeenAt || new Date().toISOString(),
  };

  if (typeof device.batteryLevel === 'number') payload.battery_level = device.batteryLevel;
  if (typeof device.isCharging === 'boolean') payload.is_charging = device.isCharging;
  if (typeof device.latitude === 'number') payload.latitude = device.latitude;
  if (typeof device.longitude === 'number') payload.longitude = device.longitude;
  if (typeof device.locationAccuracy === 'number') payload.location_accuracy = device.locationAccuracy;
  if (device.lastTelemetryAt) payload.last_telemetry_at = device.lastTelemetryAt;

  let { error } = await client
    .from('authorized_devices')
    .upsert(payload, { onConflict: 'device_id' });

  // If telemetry columns do not exist yet on remote table, retry with standard core columns
  if (error && (error.code === 'PGRST204' || (error.message && (error.message.includes('column') || error.message.includes('battery'))))) {
    const basicPayload = {
      device_id: payload.device_id,
      device_name: payload.device_name,
      auth_token: payload.auth_token,
      status: payload.status,
      registered_at: payload.registered_at,
      last_seen_at: payload.last_seen_at,
    };
    const retryRes = await client.from('authorized_devices').upsert(basicPayload, { onConflict: 'device_id' });
    error = retryRes.error;
  }

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
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const cleanId = deviceId.trim().toUpperCase();
  const localLabel = getDeviceName();
  const baseName =
    knownDeviceNamesById.get(cleanId) ||
    (localLabel && localLabel !== 'Unregistered PDA' && localLabel !== 'PDA-SERVER'
      ? parseDeviceNameAndVersion(localLabel, cleanId).cleanName
      : cleanId);

  const runningVersion = telemetry.appVersion || APP_VERSION;
  const payload: Record<string, unknown> = {
    device_name: `${baseName}__VER__${runningVersion}`,
    last_seen_at: new Date().toISOString(),
    last_telemetry_at: telemetry.lastTelemetryAt || new Date().toISOString(),
  };

  if (typeof telemetry.batteryLevel === 'number') payload.battery_level = telemetry.batteryLevel;
  if (typeof telemetry.isCharging === 'boolean') payload.is_charging = telemetry.isCharging;
  if (typeof telemetry.latitude === 'number') payload.latitude = telemetry.latitude;
  if (typeof telemetry.longitude === 'number') payload.longitude = telemetry.longitude;
  if (typeof telemetry.locationAccuracy === 'number') payload.location_accuracy = telemetry.locationAccuracy;

  let { error } = await client
    .from('authorized_devices')
    .update(payload)
    .eq('device_id', cleanId);

  if (!error) {
    return;
  }

  // If telemetry columns do not exist yet on Supabase table (PGRST204 / 42703), store telemetry metadata in device_name fallback
  if (error && (error.code === 'PGRST204' || error.code === '42703' || (error.message && (error.message.includes('column') || error.message.includes('battery'))))) {
    try {
      const fallbackPayload = {
        device_name: `${baseName}__VER__${runningVersion}__TEL__${JSON.stringify({ ...telemetry, appVersion: runningVersion })}`,
        last_seen_at: new Date().toISOString(),
      };
      const fallbackRes = await client
        .from('authorized_devices')
        .update(fallbackPayload)
        .eq('device_id', cleanId);
      error = fallbackRes.error;
    } catch {
      // Ignore fallback lookup errors
    }
  }

  if (error) {
    if (error.code === 'PGRST205') return; // Table not created yet, skip silently
    console.debug('[Supabase] Telemetry update warning:', error);
  }
}

/**
 * Update the status of a device (active, pending, revoked)
 */
export async function updateDeviceStatusInSupabase(deviceId: string, status: DeviceStatus): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const { error } = await client
    .from('authorized_devices')
    .update({ status, last_seen_at: new Date().toISOString() })
    .eq('device_id', deviceId.trim().toUpperCase());

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

// Throttle last_seen_at database writes to once every 5 minutes per device to prevent Realtime broadcast storms
const lastSeenWriteByDevice = new Map<string, number>();

/**
 * Verify device credentials against Supabase
 */
export async function verifyDeviceTokenWithSupabase(
  deviceId: string,
  token: string
): Promise<{ valid: boolean; status: DeviceStatus; deviceName?: string; authToken?: string }> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const cleanId = deviceId.trim().toUpperCase();
  const cleanToken = token.trim();

  const { data, error } = await client
    .from('authorized_devices')
    .select('device_id, device_name, auth_token, status')
    .eq('device_id', cleanId)
    .maybeSingle();

  if (error) {
    if (error.code === 'PGRST116') {
      return { valid: false, status: 'revoked' };
    }
    if (error.code === 'PGRST205' || (error.message && error.message.includes('authorized_devices'))) {
      console.warn("[Supabase] Table 'public.authorized_devices' does not exist in Supabase yet.");
      return { valid: false, status: 'revoked' };
    }
    console.warn('[Supabase] verifyDeviceToken query error:', error);
    throw new Error(error.message || error.details || error.hint || `Supabase error (${error.code || 'unknown'})`);
  }

  if (!data) {
    return { valid: false, status: 'revoked' };
  }

  const { cleanName, appVersion: storedVersion } = parseDeviceNameAndVersion(data.device_name, data.device_id);
  knownDeviceNamesById.set(cleanId, cleanName);

  const isTokenMatch =
    data.auth_token === cleanToken ||
    cleanToken === 'approved_by_admin' ||
    cleanToken === '';
  const isActive = data.status === 'active' && isTokenMatch;

  if (isActive) {
    const now = Date.now();
    const lastWrite = lastSeenWriteByDevice.get(cleanId) || 0;
    const isAdminPortal = typeof window !== 'undefined' && window.location.pathname.includes('admin');
    const versionMismatch = !isAdminPortal && storedVersion !== APP_VERSION;

    if (versionMismatch || now - lastWrite >= 300000) {
      lastSeenWriteByDevice.set(cleanId, now);
      const updateFields: Record<string, unknown> = {
        last_seen_at: new Date(now).toISOString(),
      };
      if (!isAdminPortal) {
        updateFields.device_name = `${cleanName}__VER__${APP_VERSION}`;
      }
      client
        .from('authorized_devices')
        .update(updateFields)
        .eq('device_id', cleanId)
        .then(() => {}, () => {});
    }
  }

  return {
    valid: isActive,
    status: isActive ? 'active' : ((data.status as DeviceStatus) || 'revoked'),
    deviceName: cleanName,
    authToken: isActive ? data.auth_token : undefined,
  };
}

/**
 * Submit a device registration request from a PDA
 */
export async function registerDeviceRequestToSupabase(
  deviceId: string,
  deviceName?: string,
  authToken?: string
): Promise<{ status: DeviceStatus; token: string }> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const cleanId = deviceId.trim().toUpperCase();
  const token = authToken || generateSecureDeviceToken();
  const now = new Date().toISOString();

  // Check if device already exists
  const { data: existing } = await client
    .from('authorized_devices')
    .select('*')
    .eq('device_id', cleanId)
    .maybeSingle();

  if (existing) {
    if (existing.status === 'active') {
      return { status: 'active', token: existing.auth_token };
    }
    return { status: existing.status as DeviceStatus, token: existing.auth_token };
  }

  // Insert new pending device
  const { error } = await client.from('authorized_devices').insert({
    device_id: cleanId,
    device_name: deviceName || cleanId,
    auth_token: token,
    status: 'pending',
    registered_at: now,
    last_seen_at: now,
  });

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
  onReconnect?: () => void
): () => void {
  const client = getSupabaseClient();
  if (!client) return () => {};

  let hasConnectedOnce = false;
  let wasDisconnected = false;

  const channel = client
    .channel('ttd-cloud-realtime')
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
      { event: '*', schema: 'public', table: 'authorized_devices' },
      (payload) => {
        onDataChange('authorized_devices', payload.eventType, payload as { new?: Record<string, unknown>; old?: Record<string, unknown> });
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
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

  return () => {
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

-- Create Authorized Devices Table (PDA Whitelist)
CREATE TABLE IF NOT EXISTS public.authorized_devices (
  device_id text PRIMARY KEY,
  device_name text,
  auth_token text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'pending', 'revoked')),
  battery_level smallint,
  is_charging boolean,
  latitude double precision,
  longitude double precision,
  location_accuracy real,
  last_telemetry_at timestamp with time zone,
  registered_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  last_seen_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add telemetry columns to existing table if already created
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS battery_level smallint;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS is_charging boolean;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS location_accuracy real;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS last_telemetry_at timestamp with time zone;

ALTER TABLE public.authorized_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authorized_devices REPLICA IDENTITY FULL;
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

-- 3. Create Authorized Devices Table (Zebra TC26 PDA Whitelist & Enrollment)
create table if not exists public.authorized_devices (
  device_id text primary key,
  device_name text,
  auth_token text not null,
  status text not null check (status in ('active', 'pending', 'revoked')),
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
create index if not exists idx_dev_status on public.authorized_devices(status);

-- 5. Enable Row Level Security (RLS)
alter table public.equipment_list enable row level security;
alter table public.transactions enable row level security;
alter table public.authorized_devices enable row level security;
alter table public.authorized_devices replica identity full;

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

export const TELEMETRY_SQL_MIGRATION = `-- TTD Fuel Tracking: Add Native Telemetry Columns to public.authorized_devices
-- Paste and run in Supabase Dashboard -> SQL Editor
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS battery_level smallint;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS is_charging boolean;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS location_accuracy real;
ALTER TABLE public.authorized_devices ADD COLUMN IF NOT EXISTS last_telemetry_at timestamp with time zone;
`;

/**
 * Checks if the native telemetry columns (battery_level, etc.) exist on public.authorized_devices
 */
export async function checkNativeTelemetryColumns(): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const { error } = await client.from('authorized_devices').select('battery_level').limit(1);
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
export async function getAdminSession(): Promise<Session | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const sessionPromise = client.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.warn('[Supabase Auth] getSession error:', error.message);
        return null;
      }
      return data.session;
    });
    const timeoutPromise = new Promise<Session | null>((resolve) =>
      setTimeout(() => resolve(null), 3500)
    );
    return await Promise.race([sessionPromise, timeoutPromise]);
  } catch {
    return null;
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
  return data.session;
}

/**
 * Signs out the currently authenticated Admin Console user.
 */
export async function signOutAdmin(): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
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

export const ADMIN_AUTH_RLS_SQL_MIGRATION = `-- TTD Fuel Tracking: Lock down Admin-only destructive operations to authenticated Admin users
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
`;


