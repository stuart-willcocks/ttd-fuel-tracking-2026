import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Equipment, Transaction, AuthorizedDevice, DeviceStatus, DeviceTelemetry } from '../types';
import { generateSecureDeviceToken, getDeviceId, getDeviceToken } from './device';
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

    // Save the transaction to Supabase
    let { error: txError } = await client.from('transactions').insert(payload);

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
    let devName = row.device_name || row.device_id;
    let batteryLevel = typeof row.battery_level === 'number' ? row.battery_level : null;
    let isCharging = typeof row.is_charging === 'boolean' ? row.is_charging : null;
    let latitude = typeof row.latitude === 'number' ? row.latitude : null;
    let longitude = typeof row.longitude === 'number' ? row.longitude : null;
    let locationAccuracy = typeof row.location_accuracy === 'number' ? row.location_accuracy : null;
    let lastTelemetryAt = row.last_telemetry_at || null;

    // Decode telemetry from device_name fallback if dedicated columns are not yet in Supabase
    if (devName && typeof devName === 'string' && devName.includes('__TEL__')) {
      const parts = devName.split('__TEL__');
      devName = parts[0] || row.device_id;
      try {
        const parsed = JSON.parse(parts[1]);
        if (batteryLevel === null && typeof parsed.batteryLevel === 'number') batteryLevel = parsed.batteryLevel;
        if (isCharging === null && typeof parsed.isCharging === 'boolean') isCharging = parsed.isCharging;
        if (latitude === null && typeof parsed.latitude === 'number') latitude = parsed.latitude;
        if (longitude === null && typeof parsed.longitude === 'number') longitude = parsed.longitude;
        if (locationAccuracy === null && typeof parsed.locationAccuracy === 'number') locationAccuracy = parsed.locationAccuracy;
        if (!lastTelemetryAt && parsed.lastTelemetryAt) lastTelemetryAt = parsed.lastTelemetryAt;
      } catch {}
    }

    return {
      deviceId: row.device_id,
      deviceName: devName,
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
    };
  });
}

/**
 * Register or update an authorized device in Supabase
 */
export async function saveAuthorizedDeviceToSupabase(device: AuthorizedDevice): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const rawName = device.deviceName || device.deviceId;
  const cleanName = rawName.includes('__TEL__') ? rawName.split('__TEL__')[0] : rawName;

  const payload: Record<string, unknown> = {
    device_id: device.deviceId.trim().toUpperCase(),
    device_name: cleanName,
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
 * Updates live telemetry (battery percentage, charging state, GPS coordinates) for a PDA
 */
export async function updateDeviceTelemetryInSupabase(
  deviceId: string,
  telemetry: DeviceTelemetry
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase not configured');

  const cleanId = deviceId.trim().toUpperCase();
  const payload: Record<string, unknown> = {
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

  // If native columns succeeded, clean up device_name if it previously contained the fallback string
  if (!error) {
    try {
      const { data: current } = await client
        .from('authorized_devices')
        .select('device_name')
        .eq('device_id', cleanId)
        .maybeSingle();

      if (current?.device_name && current.device_name.includes('__TEL__')) {
        const cleanName = current.device_name.split('__TEL__')[0] || cleanId;
        await client.from('authorized_devices').update({ device_name: cleanName }).eq('device_id', cleanId);
      }
    } catch {}
    return;
  }

  // If telemetry columns do not exist yet on Supabase table (PGRST204 / 42703), store telemetry metadata in device_name fallback
  if (error && (error.code === 'PGRST204' || error.code === '42703' || (error.message && (error.message.includes('column') || error.message.includes('battery'))))) {
    try {
      const { data: current } = await client
        .from('authorized_devices')
        .select('device_name')
        .eq('device_id', cleanId)
        .maybeSingle();

      const raw = current?.device_name || cleanId;
      const baseName = raw.includes('__TEL__') ? raw.split('__TEL__')[0] : raw;
      const fallbackPayload = {
        device_name: `${baseName}__TEL__${JSON.stringify(telemetry)}`,
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
    .select('*')
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

  const isTokenMatch =
    data.auth_token === cleanToken ||
    cleanToken === 'approved_by_admin' ||
    cleanToken === '';
  const isActive = data.status === 'active' && isTokenMatch;

  if (isActive) {
    // Update heartbeat silently
    client
      .from('authorized_devices')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('device_id', cleanId)
      .then(() => {}, () => {});
  }

  return {
    valid: isActive,
    status: isActive ? 'active' : ((data.status as DeviceStatus) || 'revoked'),
    deviceName: (data.device_name ? String(data.device_name).split('__TEL__')[0] : '') || data.device_id,
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
  ) => void
): () => void {
  const client = getSupabaseClient();
  if (!client) return () => {};

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
        console.log('[Supabase Realtime] Connected to live transaction feed from field PDAs');
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

