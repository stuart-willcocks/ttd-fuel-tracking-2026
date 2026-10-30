import type { Equipment, Transaction, AuthorizedDevice, DeviceStatus, DeviceTelemetry } from '../types';
import { db } from '../db/indexedDB';
import {
  isSupabaseConfigured,
  fetchEquipmentFromSupabase,
  saveEquipmentToSupabase,
  deleteEquipmentFromSupabase,
  deleteTransactionFromSupabase,
  updateTransactionInSupabase,
  fetchTransactionsFromSupabase,
  clearAllCloudData,
  clearAllTransactionsFromSupabase,
  bulkImportEquipmentToSupabase,
  bulkImportTransactionsToSupabase,
  uploadTransactionToCloud,
  fetchAuthorizedDevicesFromSupabase,
  saveAuthorizedDeviceToSupabase,
  updateDeviceStatusInSupabase,
  updateDeviceTelemetryInSupabase,
  deleteAuthorizedDeviceFromSupabase,
  verifyDeviceTokenWithSupabase,
  registerDeviceRequestToSupabase,
} from './supabase';
import { generateSecureDeviceToken, broadcastDeviceAuthEvent } from './device';

export async function fetchRemoteEquipment(): Promise<Equipment[]> {
  if (isSupabaseConfigured()) {
    return await fetchEquipmentFromSupabase();
  }

  const res = await fetch(`/api/equipment?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch equipment: ${res.statusText}`);
  return await res.json();
}

export async function postRemoteEquipment(equipment: Equipment): Promise<void> {
  if (isSupabaseConfigured()) {
    await saveEquipmentToSupabase(equipment);
    return;
  }

  const res = await fetch('/api/equipment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(equipment),
  });
  if (!res.ok) throw new Error(`Failed to save equipment: ${res.statusText}`);
}

export async function deleteRemoteEquipment(equipmentId: string): Promise<void> {
  if (isSupabaseConfigured()) {
    await deleteEquipmentFromSupabase(equipmentId);
    return;
  }

  const res = await fetch(`/api/equipment?id=${encodeURIComponent(equipmentId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete equipment: ${res.statusText}`);
}

export async function fetchRemoteTransactions(): Promise<Transaction[]> {
  if (isSupabaseConfigured()) {
    return await fetchTransactionsFromSupabase();
  }

  const res = await fetch(`/api/transactions?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch transactions: ${res.statusText}`);
  return await res.json();
}

export async function postRemoteTransaction(
  tx: Transaction
): Promise<{ success: boolean; uploadTimestamp: string }> {
  if (isSupabaseConfigured()) {
    const res = await uploadTransactionToCloud(tx);
    if (!res.success) {
      throw new Error(res.error || 'Failed to post transaction to cloud');
    }
    return { success: true, uploadTimestamp: res.uploadTimestamp };
  }

  const res = await fetch('/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tx),
  });
  if (!res.ok) throw new Error(`Failed to post transaction: ${res.statusText}`);
  return await res.json();
}

export async function updateRemoteTransaction(tx: Transaction): Promise<void> {
  if (isSupabaseConfigured()) {
    await updateTransactionInSupabase(tx);
    try {
      await db.transactions.put({ ...tx, syncStatus: 'synced' });
    } catch {}
    return;
  }

  await postRemoteTransaction(tx);
  try {
    await db.transactions.put({ ...tx, syncStatus: 'synced' });
  } catch {}
}

export async function deleteRemoteTransaction(transactionId: string): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      await deleteTransactionFromSupabase(transactionId);
      return;
    } catch (err) {
      console.warn('Supabase delete transaction failed, falling back to local API:', err);
    }
  }

  const res = await fetch(`/api/transactions?id=${encodeURIComponent(transactionId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete transaction: ${res.statusText}`);
}

export async function resetRemoteData(): Promise<void> {
  await fetch('/api/reset', { method: 'POST' });
}

export async function wipeAndImportFleet(
  equipmentList: Equipment[],
  transactions: Transaction[] = []
): Promise<{ equipmentCount: number; transactionCount: number }> {
  if (isSupabaseConfigured()) {
    await clearAllCloudData();
    const equipmentCount = await bulkImportEquipmentToSupabase(equipmentList);
    let transactionCount = 0;
    if (transactions.length > 0) {
      transactionCount = await bulkImportTransactionsToSupabase(transactions);
    }
    return { equipmentCount, transactionCount };
  }

  // Fallback to local reset and post
  await resetRemoteData();
  for (const eq of equipmentList) {
    await postRemoteEquipment(eq);
  }
  for (const tx of transactions) {
    await postRemoteTransaction(tx);
  }
  return { equipmentCount: equipmentList.length, transactionCount: transactions.length };
}

export async function deleteAllFleetData(): Promise<void> {
  if (isSupabaseConfigured()) {
    await clearAllCloudData();
  }

  try {
    await fetch('/api/clear', { method: 'POST' });
  } catch {
    // Ignore in static hosting environments
  }

  // Clear local IndexedDB and outbox
  try {
    await db.transactions.clear();
    await db.equipments.clear();
    await db.outbox.clear();
  } catch (err) {
    console.warn('Local indexedDB clear error:', err);
  }

  // Clear tombstone cache
  try {
    localStorage.removeItem('ttd_deleted_tx_ids');
  } catch {
    // Ignore
  }
}

export async function deleteAllTransactionsOnly(): Promise<void> {
  if (isSupabaseConfigured()) {
    await clearAllTransactionsFromSupabase();
  }

  try {
    await fetch('/api/transactions?all=true', { method: 'DELETE' });
  } catch {
    // Ignore in static hosting environments
  }

  // Clear local IndexedDB transactions and outbox (leaving equipments intact)
  try {
    await db.transactions.clear();
    await db.outbox.clear();
  } catch (err) {
    console.warn('Local indexedDB clear transactions error:', err);
  }

  // Clear tombstone cache
  try {
    localStorage.removeItem('ttd_deleted_tx_ids');
  } catch {
    // Ignore
  }
}

export async function bulkUploadEquipment(equipmentList: Equipment[]): Promise<number> {
  const dedupedMap = new Map<string, Equipment>();
  for (const eq of equipmentList) {
    dedupedMap.set(eq.equipmentId.trim(), eq);
  }
  const dedupedList = Array.from(dedupedMap.values());

  if (isSupabaseConfigured()) {
    const count = await bulkImportEquipmentToSupabase(dedupedList);
    try {
      await db.equipments.bulkPut(dedupedList);
    } catch (err) {
      console.warn('Local indexedDB bulkPut error:', err);
    }
    return count;
  }

  // Fallback to local API and local IndexedDB
  for (const eq of dedupedList) {
    await postRemoteEquipment(eq);
  }
  try {
    await db.equipments.bulkPut(dedupedList);
  } catch (err) {
    console.warn('Local indexedDB bulkPut error:', err);
  }
  return dedupedList.length;
}

const MOCK_DEVICES_KEY = 'ttd_mock_authorized_devices';

function getMockDevices(): AuthorizedDevice[] {
  try {
    const raw = localStorage.getItem(MOCK_DEVICES_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveMockDevices(devices: AuthorizedDevice[]) {
  try {
    localStorage.setItem(MOCK_DEVICES_KEY, JSON.stringify(devices));
  } catch {}
}

export async function fetchRemoteAuthorizedDevices(): Promise<AuthorizedDevice[]> {
  if (isSupabaseConfigured()) {
    try {
      return await fetchAuthorizedDevicesFromSupabase();
    } catch (err) {
      console.warn('Supabase fetch devices failed:', err);
    }
  }
  return getMockDevices();
}

export async function postRemoteAuthorizedDevice(device: AuthorizedDevice): Promise<void> {
  const cleanDevice: AuthorizedDevice = {
    ...device,
    deviceId: device.deviceId.trim().toUpperCase(),
    authToken: device.authToken.trim(),
  };

  if (isSupabaseConfigured()) {
    await saveAuthorizedDeviceToSupabase(cleanDevice);
  }
  const current = getMockDevices().filter((d) => d.deviceId.toUpperCase() !== cleanDevice.deviceId);
  current.unshift(cleanDevice);
  saveMockDevices(current);
}

export async function updateRemoteDeviceStatus(
  deviceId: string,
  status: DeviceStatus,
  assignedDeviceId?: string
): Promise<void> {
  const cleanId = deviceId.trim().toUpperCase();
  const cleanAssignedId = assignedDeviceId?.trim().toUpperCase();
  // Broadcast immediately to any active tabs/listeners
  broadcastDeviceAuthEvent({
    type: 'STATUS_CHANGED',
    deviceId: cleanAssignedId || cleanId,
    status,
  });

  if (isSupabaseConfigured()) {
    await updateDeviceStatusInSupabase(cleanId, status, cleanAssignedId);
  }
  const current = getMockDevices();
  const target = current.find((d) => d.deviceId.toUpperCase() === cleanId);
  if (target) {
    if (cleanAssignedId && cleanAssignedId !== cleanId) {
      target.deviceId = cleanAssignedId;
    }
    target.status = status;
    target.lastSeenAt = new Date().toISOString();
    saveMockDevices(current);
  }
}

export async function deleteRemoteAuthorizedDevice(deviceId: string): Promise<void> {
  const cleanId = deviceId.trim().toUpperCase();
  // Broadcast revocation immediately
  broadcastDeviceAuthEvent({ type: 'REVOKED', deviceId: cleanId, status: 'revoked' });

  if (isSupabaseConfigured()) {
    await deleteAuthorizedDeviceFromSupabase(cleanId);
  }
  const current = getMockDevices().filter((d) => d.deviceId.toUpperCase() !== cleanId);
  saveMockDevices(current);
}

export async function verifyRemoteDeviceToken(
  deviceId: string,
  token: string,
  forceRefresh = false
): Promise<{ valid: boolean; status: DeviceStatus; deviceId?: string; authToken?: string }> {
  const cleanId = deviceId.trim().toUpperCase();
  const cleanToken = token.trim();

  if (isSupabaseConfigured()) {
    // When Supabase is configured, Supabase is the authoritative source!
    // Do NOT fall back to local mock devices, which would mask revocations.
    return await verifyDeviceTokenWithSupabase(cleanId, cleanToken, forceRefresh);
  }

  const current = getMockDevices();
  let target = current.find((d) => d.deviceId.toUpperCase() === cleanId);
  if (!target && cleanToken) {
    target = current.find((d) => d.authToken === cleanToken);
  }
  if (!target) {
    return { valid: false, status: 'revoked' };
  }
  const match = Boolean(cleanToken) && target.authToken === cleanToken;
  if (match && target.status === 'active') {
    target.lastSeenAt = new Date().toISOString();
    saveMockDevices(current);
  }
  return {
    valid: match && target.status === 'active',
    status: match ? target.status : 'revoked',
    deviceId: target.deviceId,
    authToken: match && target.status === 'active' ? target.authToken : undefined,
  };
}

export async function registerRemoteDeviceRequest(
  deviceId: string,
  token?: string
): Promise<{ status: DeviceStatus; token: string }> {
  if (isSupabaseConfigured()) {
    return await registerDeviceRequestToSupabase(deviceId, token);
  }
  const current = getMockDevices();
  const cleanId = deviceId.trim().toUpperCase();
  const finalToken = token || generateSecureDeviceToken();
  const now = new Date().toISOString();
  const existing = current.find((d) => d.deviceId === cleanId);
  if (existing) {
    existing.authToken = finalToken;
    existing.status = 'pending';
    existing.lastSeenAt = now;
    saveMockDevices(current);
    return { status: 'pending', token: finalToken };
  }
  current.unshift({
    deviceId: cleanId,
    authToken: finalToken,
    status: 'pending',
    registeredAt: now,
    lastSeenAt: now,
  });
  saveMockDevices(current);
  return { status: 'pending', token: finalToken };
}

export async function updateRemoteDeviceTelemetry(
  deviceId: string,
  telemetry: DeviceTelemetry
): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      await updateDeviceTelemetryInSupabase(deviceId, telemetry);
      return;
    } catch (err) {
      console.warn('Supabase update telemetry failed, saving locally:', err);
    }
  }

  const current = getMockDevices();
  const cleanId = deviceId.trim().toUpperCase();
  const target = current.find((d) => d.deviceId.toUpperCase() === cleanId);
  if (target) {
    if (typeof telemetry.batteryLevel === 'number') target.batteryLevel = telemetry.batteryLevel;
    if (typeof telemetry.isCharging === 'boolean') target.isCharging = telemetry.isCharging;
    if (typeof telemetry.latitude === 'number') target.latitude = telemetry.latitude;
    if (typeof telemetry.longitude === 'number') target.longitude = telemetry.longitude;
    if (typeof telemetry.locationAccuracy === 'number') target.locationAccuracy = telemetry.locationAccuracy;
    if (telemetry.appVersion) target.appVersion = telemetry.appVersion;
    target.lastTelemetryAt = telemetry.lastTelemetryAt || new Date().toISOString();
    target.lastSeenAt = new Date().toISOString();
    saveMockDevices(current);
  }
}

