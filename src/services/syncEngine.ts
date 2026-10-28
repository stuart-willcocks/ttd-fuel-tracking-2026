import { db } from '../db/indexedDB';
import { uploadTransactionToCloud, isSupabaseConfigured, subscribeToCloudChanges } from './supabase';
import { fetchRemoteEquipment, fetchRemoteTransactions, deleteRemoteTransaction } from './api';
import type { Transaction } from '../types';
import { getGeneratorPowerState, reconcileEquipmentPowerStates } from '../utils/powerState';
import { isDeviceEnrolled, getDeviceId, getDeviceToken, clearDeviceEnrollment } from './device';
import { verifyRemoteDeviceToken } from './api';

export interface SyncState {
  isOnline: boolean;
  isSimulatedOffline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncTime: string | null;
  lastError: string | null;
}

type SyncListener = (state: SyncState) => void;
type RemoteDataListener = () => void;
type DeviceRevocationListener = () => void;

class SyncEngine {
  private listeners: Set<SyncListener> = new Set();
  private dataListeners: Set<RemoteDataListener> = new Set();
  private revocationListeners: Set<DeviceRevocationListener> = new Set();
  private deletedTxIds: Set<string> = new Set();
  private isSimulatedOffline: boolean = false;
  private isSyncing: boolean = false;
  private isFlushing: boolean = false;
  private lastSyncTime: string | null = null;
  private lastError: string | null = null;
  private syncTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('ttd_deleted_tx_ids');
        if (stored) {
          this.deletedTxIds = new Set(JSON.parse(stored));
        }
      } catch {
        // Ignore localStorage errors
      }

      window.addEventListener('online', () => this.handleNetworkChange());
      window.addEventListener('offline', () => this.handleNetworkChange());
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.isEffectivelyOnline()) {
          this.syncWithRemote();
        }
      });

      // Poll every 3 seconds to keep all PDAs and PCs synchronized
      this.syncTimer = setInterval(() => {
        if (this.isEffectivelyOnline() && !this.isSyncing) {
          this.syncWithRemote();
        }
      }, 3000);

      // Subscribe to real-time cloud changes so PDAs update immediately
      if (isSupabaseConfigured()) {
        try {
          subscribeToCloudChanges(() => {
            if (this.isEffectivelyOnline() && !this.isSyncing) {
              this.syncWithRemote();
            }
          });
        } catch (e) {
          console.warn('Realtime subscription error in syncEngine:', e);
        }
      }
    }
  }

  public destroy() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  public subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    this.notify();
    return () => this.listeners.delete(listener);
  }

  public onRemoteDataUpdated(listener: RemoteDataListener): () => void {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  public onDeviceRevoked(listener: DeviceRevocationListener): () => void {
    this.revocationListeners.add(listener);
    return () => this.revocationListeners.delete(listener);
  }

  private notifyDeviceRevoked() {
    this.revocationListeners.forEach((listener) => listener());
  }

  public isEffectivelyOnline(): boolean {
    if (this.isSimulatedOffline) return false;
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  public setSimulatedOffline(offline: boolean) {
    this.isSimulatedOffline = offline;
    this.notify();
    if (!offline && this.isEffectivelyOnline()) {
      this.syncWithRemote();
    }
  }

  public toggleSimulatedOffline() {
    this.setSimulatedOffline(!this.isSimulatedOffline);
  }

  private handleNetworkChange() {
    this.notify();
    if (this.isEffectivelyOnline()) {
      this.syncWithRemote();
    }
  }

  public async getPendingCount(): Promise<number> {
    try {
      return await db.outbox.count();
    } catch {
      return 0;
    }
  }

  public async getState(): Promise<SyncState> {
    const pendingCount = await this.getPendingCount();
    return {
      isOnline: this.isEffectivelyOnline(),
      isSimulatedOffline: this.isSimulatedOffline,
      isSyncing: this.isSyncing,
      pendingCount,
      lastSyncTime: this.lastSyncTime,
      lastError: this.lastError,
    };
  }

  private async notify() {
    const state = await this.getState();
    this.listeners.forEach((listener) => listener(state));
  }

  private notifyDataChange() {
    this.dataListeners.forEach((listener) => listener());
  }

  private saveDeletedTxIds() {
    try {
      localStorage.setItem('ttd_deleted_tx_ids', JSON.stringify(Array.from(this.deletedTxIds)));
    } catch {
      // Ignore localStorage errors
    }
  }

  /**
   * Deletes a transaction from local IndexedDB, outbox queue, and remote database.
   * If the transaction affected equipment power status, recomputes the equipment's power state.
   */
  public async deleteTransaction(transactionId: string): Promise<void> {
    const tx = await db.transactions.get(transactionId);

    // 1. Delete from local database and outbox
    await db.transactions.delete(transactionId);
    await db.outbox.delete(transactionId);

    // 2. Track in tombstones so background sync doesn't resurrect it
    this.deletedTxIds.add(transactionId);
    this.saveDeletedTxIds();

    // 3. Recalculate equipment power state from remaining transactions
    if (tx && (tx.transactionType === 'PoweredUp' || tx.transactionType === 'PoweredDown')) {
      const remainingTxs = (await db.transactions
        .where('equipmentId')
        .equals(tx.equipmentId)
        .toArray()).filter((t) => t.id !== transactionId);

      const eq = await db.equipments.get(tx.equipmentId);
      if (eq) {
        const powerState = getGeneratorPowerState(tx.equipmentId, remainingTxs);
        if (powerState.isOn) {
          eq.poweredUpTimestamp = powerState.poweredUpTimestamp;
          delete eq.poweredDownTimestamp;
        } else {
          eq.poweredDownTimestamp = powerState.poweredDownTimestamp;
          delete eq.poweredUpTimestamp;
        }
        eq.updatedAt = new Date().toISOString();
        await db.equipments.put(eq);
      }
    }

    // 4. Notify UI of local update immediately
    await this.notify();
    this.notifyDataChange();

    // 5. Delete from remote server / Supabase in background if online
    if (this.isEffectivelyOnline()) {
      try {
        await deleteRemoteTransaction(transactionId);
      } catch (err) {
        console.warn('Could not delete transaction remotely immediately, queued for next sync:', err);
      }
    }
  }

  /**
   * Enqueues a newly created transaction into local IndexedDB and the outbox queue.
   * Immediately attempts upload to the shared server.
   */
  public async queueTransaction(tx: Transaction): Promise<void> {
    // 1. Write to local IndexedDB
    await db.transactions.put(tx);

    // 2. Put in outbox
    await db.outbox.put({
      id: tx.id,
      equipmentId: tx.equipmentId,
      createdAt: tx.createdAt,
      attempts: 0,
    });

    // 3. Update local equipment state cleanly
    const currentEq = await db.equipments.get(tx.equipmentId);
    if (currentEq) {
      if (tx.transactionType === 'PoweredUp') {
        currentEq.poweredUpTimestamp = tx.transactionTimestamp;
        delete currentEq.poweredDownTimestamp;
      } else if (tx.transactionType === 'PoweredDown') {
        currentEq.poweredDownTimestamp = tx.transactionTimestamp;
        delete currentEq.poweredUpTimestamp;
      }
      currentEq.updatedAt = new Date().toISOString();
      await db.equipments.put(currentEq);
    }

    await this.notify();
    this.notifyDataChange();

    // 4. Immediately trigger flush in background if online
    if (this.isEffectivelyOnline()) {
      this.flushOutbox().catch((err) => {
        console.error('Immediate flush error after queueing transaction:', err);
      });
    }
  }

  /**
   * Updates an existing transaction in local IndexedDB and adds it to the outbox queue.
   * If online, immediately triggers an outbox flush to update the record in Supabase.
   */
  public async updateTransaction(tx: Transaction): Promise<void> {
    const updatedTx: Transaction = {
      ...tx,
      syncStatus: 'pending',
      uploadTimestamp: undefined,
    };

    // If it was previously in tombstones, remove it
    if (this.deletedTxIds.has(tx.id)) {
      this.deletedTxIds.delete(tx.id);
      this.saveDeletedTxIds();
    }

    // 1. Write to local IndexedDB
    await db.transactions.put(updatedTx);

    // 2. Put in outbox
    await db.outbox.put({
      id: updatedTx.id,
      equipmentId: updatedTx.equipmentId,
      createdAt: new Date().toISOString(),
      attempts: 0,
    });

    // 3. Update local equipment power state cleanly if this was a power event
    const currentEq = await db.equipments.get(updatedTx.equipmentId);
    if (currentEq && currentEq.type === 'GENERATOR') {
      const allTxForEq = await db.transactions.where('equipmentId').equals(updatedTx.equipmentId).toArray();
      const powerState = getGeneratorPowerState(updatedTx.equipmentId, allTxForEq);
      if (powerState.isOn) {
        currentEq.poweredUpTimestamp = powerState.poweredUpTimestamp;
        delete currentEq.poweredDownTimestamp;
      } else {
        currentEq.poweredDownTimestamp = powerState.poweredDownTimestamp;
        delete currentEq.poweredUpTimestamp;
      }
      currentEq.updatedAt = new Date().toISOString();
      await db.equipments.put(currentEq);
    }

    await this.notify();
    this.notifyDataChange();

    // 4. Immediately trigger flush in background if online
    if (this.isEffectivelyOnline()) {
      this.flushOutbox().catch((err) => {
        console.error('Immediate flush error after updating transaction:', err);
      });
    }
  }

  /**
   * Full two-way sync:
   * 1. Flush any pending outbox items from this device to the central server.
   * 2. Pull remote transactions & equipment from the central server and update local IndexedDB.
   */
  public async syncWithRemote(): Promise<void> {
    if (!this.isEffectivelyOnline() || this.isSyncing) return;

    // Check device authorization status
    if (isDeviceEnrolled()) {
      try {
        const currentDevId = getDeviceId();
        const currentToken = getDeviceToken();
        if (currentDevId && currentToken) {
          const check = await verifyRemoteDeviceToken(currentDevId, currentToken);
          if (!check.valid && check.status === 'revoked') {
            console.warn(`[SyncEngine] Device ${currentDevId} has been revoked by an administrator.`);
            clearDeviceEnrollment();
            await db.equipments.clear();
            await db.transactions.clear();
            await db.outbox.clear();
            this.notifyDeviceRevoked();
            return;
          }
        }
      } catch (e) {
        // Silently preserve offline functionality if network error occurs
      }
    }

    this.isSyncing = true;
    await this.notify();

    try {
      // Step 1: Upload any pending outbox items from this device
      const flushRes = await this.flushOutboxInternal();
      let hadUpdates = flushRes.processed > 0;

      // Attempt remote deletion for all active tombstones
      if (this.deletedTxIds.size > 0 && this.isEffectivelyOnline()) {
        for (const delId of Array.from(this.deletedTxIds)) {
          try {
            await deleteRemoteTransaction(delId);
          } catch {
            // Keep in tombstone set and retry on next sync
          }
        }
      }

      // Step 2: Download latest transactions and equipment from central server
      const [remoteEquipment, remoteTransactions] = await Promise.all([
        fetchRemoteEquipment().catch((err) => {
          console.warn('Could not fetch remote equipment:', err);
          return null;
        }),
        fetchRemoteTransactions().catch((err) => {
          console.warn('Could not fetch remote transactions:', err);
          return null;
        }),
      ]);

      // Step 3: Mirror server state & ensure deleted transactions are never re-inserted
      if (remoteTransactions && Array.isArray(remoteTransactions)) {
        // Exclude all tombstoned transactions so they CANNOT be re-inserted into IndexedDB
        const filteredRemote = remoteTransactions.filter((t) => !this.deletedTxIds.has(t.id));
        const remoteIdSet = new Set(filteredRemote.map((t) => t.id));
        const outboxItems = await db.outbox.toArray();
        const pendingOutboxIdSet = new Set(outboxItems.map((o) => o.id));

        // Delete local transactions that were removed from Supabase/server or marked deleted locally
        const allLocal = await db.transactions.toArray();
        const idsToDelete = allLocal
          .filter((tx) => (!remoteIdSet.has(tx.id) && !pendingOutboxIdSet.has(tx.id)) || this.deletedTxIds.has(tx.id))
          .map((tx) => tx.id);

        if (idsToDelete.length > 0) {
          await db.transactions.bulkDelete(idsToDelete);
          hadUpdates = true;
        }

        // Protect locally pending outbox transactions from being overwritten by stale remote copies
        const transactionsToApply = filteredRemote.filter((t) => !pendingOutboxIdSet.has(t.id));

        if (transactionsToApply.length > 0) {
          await db.transactions.bulkPut(transactionsToApply);
          hadUpdates = true;
        } else if (allLocal.length > 0 && idsToDelete.length === allLocal.length) {
          await db.transactions.clear();
          hadUpdates = true;
        }

        // Retire tombstones ONLY when the remote server confirms it no longer returns the record
        const actualRemoteIds = new Set(remoteTransactions.map((t) => t.id));
        let tombstonesChanged = false;
        for (const delId of Array.from(this.deletedTxIds)) {
          if (!actualRemoteIds.has(delId)) {
            this.deletedTxIds.delete(delId);
            tombstonesChanged = true;
          }
        }
        if (tombstonesChanged) {
          this.saveDeletedTxIds();
        }
      }

      if (remoteEquipment && Array.isArray(remoteEquipment)) {
        const remoteEqIdSet = new Set(remoteEquipment.map((e) => e.equipmentId));
        const allLocalEq = await db.equipments.toArray();
        const eqIdsToDelete = allLocalEq
          .filter((e) => !remoteEqIdSet.has(e.equipmentId))
          .map((e) => e.equipmentId);

        if (eqIdsToDelete.length > 0) {
          await db.equipments.bulkDelete(eqIdsToDelete);
          hadUpdates = true;
        }

        if (remoteEquipment.length > 0) {
          const allLocalTxs = await db.transactions.toArray();
          const reconciled = reconcileEquipmentPowerStates(remoteEquipment, allLocalTxs);
          await db.equipments.bulkPut(reconciled);
          hadUpdates = true;
        }
      }

      this.lastSyncTime = new Date().toLocaleTimeString();
      this.lastError = null;

      if (hadUpdates) {
        this.notifyDataChange();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.lastError = msg;
    } finally {
      this.isSyncing = false;
      await this.notify();
    }
  }

  private async flushOutboxInternal(): Promise<{ processed: number; errors: number }> {
    let processed = 0;
    let errors = 0;

    const items = await db.outbox.orderBy('createdAt').toArray();

    for (const item of items) {
      if (!this.isEffectivelyOnline()) break;

      const tx = await db.transactions.get(item.id);
      if (!tx) {
        await db.outbox.delete(item.id);
        continue;
      }

      const result = await uploadTransactionToCloud(tx);

      if (result.success) {
        await db.transactions.update(item.id, {
          syncStatus: 'synced',
          uploadTimestamp: result.uploadTimestamp,
          syncError: undefined,
        });
        await db.outbox.delete(item.id);
        processed++;
      } else {
        errors++;
        this.lastError = result.error || 'Failed to upload transaction';
        await db.outbox.update(item.id, {
          attempts: item.attempts + 1,
          lastAttempt: new Date().toISOString(),
          error: result.error,
        });
        await db.transactions.update(item.id, {
          syncStatus: 'failed',
          syncError: result.error,
        });
      }
    }

    if (processed > 0) {
      this.lastSyncTime = new Date().toLocaleTimeString();
      this.lastError = null;
    }

    return { processed, errors };
  }

  public async flushOutbox(): Promise<{ processed: number; errors: number }> {
    if (this.isFlushing) return { processed: 0, errors: 0 };
    this.isFlushing = true;
    try {
      const res = await this.flushOutboxInternal();
      if (res.processed > 0 || res.errors > 0) {
        await this.notify();
        this.notifyDataChange();
      }
      return res;
    } finally {
      this.isFlushing = false;
    }
  }
}

export const syncEngine = new SyncEngine();
