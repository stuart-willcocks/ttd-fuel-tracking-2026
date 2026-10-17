import { db } from '../db/indexedDB';
import { uploadTransactionToCloud } from './supabase';
import { fetchRemoteEquipment, fetchRemoteTransactions } from './api';
import type { Transaction } from '../types';

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

class SyncEngine {
  private listeners: Set<SyncListener> = new Set();
  private dataListeners: Set<RemoteDataListener> = new Set();
  private isSimulatedOffline: boolean = false;
  private isSyncing: boolean = false;
  private isFlushing: boolean = false;
  private lastSyncTime: string | null = null;
  private lastError: string | null = null;
  private syncTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
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
   * Full two-way sync:
   * 1. Flush any pending outbox items from this device to the central server.
   * 2. Pull remote transactions & equipment from the central server and update local IndexedDB.
   */
  public async syncWithRemote(): Promise<void> {
    if (!this.isEffectivelyOnline() || this.isSyncing) return;

    this.isSyncing = true;
    await this.notify();

    try {
      // Step 1: Upload any pending outbox items from this device
      const flushRes = await this.flushOutboxInternal();
      let hadUpdates = flushRes.processed > 0;

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

      // Step 3: Mirror server state & delete any records that were removed from the server
      if (remoteTransactions && Array.isArray(remoteTransactions)) {
        const remoteIdSet = new Set(remoteTransactions.map((t) => t.id));
        const outboxItems = await db.outbox.toArray();
        const pendingOutboxIdSet = new Set(outboxItems.map((o) => o.id));

        // Delete local transactions that were removed from Supabase/server
        // (unless they are new items currently waiting in the offline outbox)
        const allLocal = await db.transactions.toArray();
        const idsToDelete = allLocal
          .filter((tx) => !remoteIdSet.has(tx.id) && !pendingOutboxIdSet.has(tx.id))
          .map((tx) => tx.id);

        if (idsToDelete.length > 0) {
          await db.transactions.bulkDelete(idsToDelete);
          hadUpdates = true;
        }

        if (remoteTransactions.length > 0) {
          await db.transactions.bulkPut(remoteTransactions);
          hadUpdates = true;
        } else if (allLocal.length > 0 && idsToDelete.length === allLocal.length) {
          await db.transactions.clear();
          hadUpdates = true;
        }
      }

      if (remoteEquipment && Array.isArray(remoteEquipment) && remoteEquipment.length > 0) {
        await db.equipments.bulkPut(remoteEquipment);
        hadUpdates = true;
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
        if (res.processed > 0) {
          this.notifyDataChange();
        }
      }
      return res;
    } finally {
      this.isFlushing = false;
    }
  }
}

export const syncEngine = new SyncEngine();
