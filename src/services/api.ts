import type { Equipment, Transaction, AuthorizedDevice, DeviceStatus } from '../types';
import { db } from '../db/indexedDB';
import {
  isSupabaseConfigured,
  fetchEquipmentFromSupabase,
  saveEquipmentToSupabase,
  deleteEquipmentFromSupabase,
  deleteTransactionFromSupabase,
  fetchTransactionsFromSupabase,
  clearAllCloudData,
  bulkImportEquipmentToSupabase,
  bulkImportTransactionsToSupabase,
  uploadTransactionToCloud,
  fetchAuthorizedDevicesFromSupabase,
  saveAuthorizedDeviceToSupabase,
  updateDeviceStatusInSupabase,
  deleteAuthorizedDeviceFromSupabase,
  verifyDeviceTokenWithSupabase,
  registerDeviceRequestToSupabase,
} from './supabase';
import { generateSecureDeviceToken, broadcastDeviceAuthEvent } from './device';

export async function fetchRemoteEquipment(): Promise<Equipment[]> {
  if (isSupabaseConfigured()) {
    try {
      return await fetchEquipmentFromSupabase();
    } catch (err) {
      console.warn('Supabase fetch equipment failed, falling back to local API:', err);
    }
  }

  const res = await fetch(`/api/equipment?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch equipment: ${res.statusText}`);
  return await res.json();
}

export async function postRemoteEquipment(equipment: Equipment): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      await saveEquipmentToSupabase(equipment);
      return;
    } catch (err) {
      console.warn('Supabase save equipment failed, falling back to local API:', err);
    }
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
    try {
      await deleteEquipmentFromSupabase(equipmentId);
      return;
    } catch (err) {
      console.warn('Supabase delete equipment failed, falling back to local API:', err);
    }
  }

  const res = await fetch(`/api/equipment?id=${encodeURIComponent(equipmentId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete equipment: ${res.statusText}`);
}

export async function fetchRemoteTransactions(): Promise<Transaction[]> {
  if (isSupabaseConfigured()) {
    try {
      return await fetchTransactionsFromSupabase();
    } catch (err) {
      console.warn('Supabase fetch transactions failed, falling back to local API:', err);
    }
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

export async function bulkUploadEquipment(equipmentList: Equipment[]): Promise<number> {
  if (isSupabaseConfigured()) {
    const count = await bulkImportEquipmentToSupabase(equipmentList);
    try {
      await db.equipments.bulkPut(equipmentList);
    } catch (err) {
      console.warn('Local indexedDB bulkPut error:', err);
    }
    return count;
  }

  // Fallback to local API and local IndexedDB
  for (const eq of equipmentList) {
    await postRemoteEquipment(eq);
  }
  try {
    await db.equipments.bulkPut(equipmentList);
  } catch (err) {
    console.warn('Local indexedDB bulkPut error:', err);
  }
  return equipmentList.length;
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
    deviceName: device.deviceName ? device.deviceName.trim() : device.deviceId.trim().toUpperCase(),
  };

  if (isSupabaseConfigured()) {
    await saveAuthorizedDeviceToSupabase(cleanDevice);
  }
  const current = getMockDevices().filter((d) => d.deviceId.toUpperCase() !== cleanDevice.deviceId);
  current.unshift(cleanDevice);
  saveMockDevices(current);
}

export async function updateRemoteDeviceStatus(deviceId: string, status: DeviceStatus): Promise<void> {
  const cleanId = deviceId.trim().toUpperCase();
  // Broadcast immediately to any active tabs/listeners
  broadcastDeviceAuthEvent({ type: 'STATUS_CHANGED', deviceId: cleanId, status });

  if (isSupabaseConfigured()) {
    await updateDeviceStatusInSupabase(cleanId, status);
  }
  const current = getMockDevices();
  const target = current.find((d) => d.deviceId.toUpperCase() === cleanId);
  if (target) {
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
  token: string
): Promise<{ valid: boolean; status: DeviceStatus; deviceName?: string }> {
  const cleanId = deviceId.trim().toUpperCase();
  const cleanToken = token.trim();

  if (isSupabaseConfigured()) {
    // When Supabase is configured, Supabase is the authoritative source!
    // Do NOT fall back to local mock devices, which would mask revocations.
    return await verifyDeviceTokenWithSupabase(cleanId, cleanToken);
  }

  const current = getMockDevices();
  const target = current.find((d) => d.deviceId.toUpperCase() === cleanId);
  if (!target) {
    return { valid: false, status: 'revoked' };
  }
  const match = target.authToken === cleanToken;
  if (match && target.status === 'active') {
    target.lastSeenAt = new Date().toISOString();
    saveMockDevices(current);
  }
  return {
    valid: match && target.status === 'active',
    status: match ? target.status : 'revoked',
    deviceName: target.deviceName || target.deviceId,
  };
}

export async function registerRemoteDeviceRequest(
  deviceId: string,
  deviceName?: string,
  token?: string
): Promise<{ status: DeviceStatus; token: string }> {
  if (isSupabaseConfigured()) {
    try {
      return await registerDeviceRequestToSupabase(deviceId, deviceName, token);
    } catch (err) {
      console.warn('Supabase register device request failed:', err);
    }
  }
  const current = getMockDevices();
  const cleanId = deviceId.trim().toUpperCase();
  const existing = current.find((d) => d.deviceId === cleanId);
  if (existing) {
    return { status: existing.status, token: existing.authToken };
  }
  const finalToken = token || generateSecureDeviceToken();
  const now = new Date().toISOString();
  current.unshift({
    deviceId: cleanId,
    deviceName: deviceName || cleanId,
    authToken: finalToken,
    status: 'pending',
    registeredAt: now,
    lastSeenAt: now,
  });
  saveMockDevices(current);
  return { status: 'pending', token: finalToken };
}

