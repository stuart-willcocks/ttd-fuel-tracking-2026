import type { Equipment, Transaction } from '../types';
import {
  isSupabaseConfigured,
  fetchEquipmentFromSupabase,
  saveEquipmentToSupabase,
  deleteEquipmentFromSupabase,
  fetchTransactionsFromSupabase,
  clearAllCloudData,
  bulkImportEquipmentToSupabase,
} from './supabase';

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
  const res = await fetch('/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tx),
  });
  if (!res.ok) throw new Error(`Failed to post transaction: ${res.statusText}`);
  return await res.json();
}

export async function resetRemoteData(): Promise<void> {
  await fetch('/api/reset', { method: 'POST' });
}

export async function wipeAndImportFleet(equipmentList: Equipment[]): Promise<number> {
  if (isSupabaseConfigured()) {
    await clearAllCloudData();
    return await bulkImportEquipmentToSupabase(equipmentList);
  }

  // Fallback to local reset and post
  await resetRemoteData();
  for (const eq of equipmentList) {
    await postRemoteEquipment(eq);
  }
  return equipmentList.length;
}
