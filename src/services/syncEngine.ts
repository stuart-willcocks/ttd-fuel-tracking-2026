import { db } from '../db/indexedDB';
import {
  uploadTransactionToCloud,
  isSupabaseConfigured,
  subscribeToCloudChanges,
  mapSupabaseRowToEquipment,
  mapSupabaseRowToTransaction,
  invalidateDeviceTokenCache,
} from './supabase';
import { fetchRemoteEquipment, fetchRemoteTransactions, deleteRemoteTransaction } from './api';
import type { Transaction } from '../types';
import { getGeneratorPowerState, reconcileEquipmentPowerStates } from '../utils/powerState';
import {
  isDeviceEnrolled,
  getDeviceId,
  getDeviceToken,
  markDeviceRevoked,
  saveDeviceEnrollment,
  onDeviceAuthBroadcast,
} from './device';
import { verifyRemoteDeviceToken } from './api';
import { pushDeviceTelemetry } from './telemetry';

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
  private activeFlushPromise: Promise<{ processed: number; errors: number }> | null = null;
  private needsAnotherFlush: boolean = false;
  private outboxRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSyncTime: string | null = null;
  private lastError: string | null = null;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private outboxTimer: ReturnType<typeof setInterval> | null = null;
  private authTimer: ReturnType<typeof setInterval> | null = null;
  private realtimeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingRealtimeTables: { equipment: boolean; transactions: boolean } = {
    equipment: false,
    transactions: false,
  };
  private lastAuthCheckResult: boolean = false;
  private lastAuthCheckTime: number = 0;

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
          this.verifyDeviceAuthorization();
          this.syncWithRemote();
        }
      });

      // 1-minute local outbox check (0 bytes of network traffic unless local pending transactions exist)
      this.outboxTimer = setInterval(async () => {
        if (typeof document !== 'undefined' && document.hidden) return;
        if (!this.isEffectivelyOnline() || this.isSyncing || this.isFlushing) return;
        const pendingCount = await this.getPendingCount();
        if (pendingCount > 0) {
          this.flushOutbox();
        } else if (this.deletedTxIds.size > 0) {
          this.syncWithRemote({ equipment: false, transactions: false });
        }
      }, 60000);

      // Deep 60-minute safety fallback poll (Supabase Realtime + reconnect handler handle instant updates)
      this.syncTimer = setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return;
        if (this.isEffectivelyOnline() && !this.isSyncing) {
          this.syncWithRemote();
        }
      }, 3600000);

      // Periodic 5-minute safety check for device status (Supabase Realtime handles instant revocations)
      this.authTimer = setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return;
        if (this.isEffectivelyOnline() && isDeviceEnrolled()) {
          this.verifyDeviceAuthorization();
        }
      }, 300000);

      // Listen to cross-tab / cross-window instant authorization events
      onDeviceAuthBroadcast((event) => {
        const myId = getDeviceId();
        if (event.deviceId && myId && event.deviceId.toUpperCase() === myId.toUpperCase()) {
          if (event.status !== 'active') {
            console.warn(`[SyncEngine Broadcast] Device ${myId} revoked via local event.`);
            this.lockdownRevokedDevice();
          }
        }
      });

      // Subscribe to real-time cloud changes so PDAs update immediately without polling or full-table refetches
      if (isSupabaseConfigured()) {
        try {
          subscribeToCloudChanges(
            (table, eventType, payload) => {
              if (table === 'authorized_devices') {
                const myId = getDeviceId();
                const myToken = getDeviceToken();
                const newRow = payload?.new as { device_id?: string; auth_token?: string; status?: string } | undefined;
                const oldRow = payload?.old as { device_id?: string; status?: string } | undefined;
                const affectedId = (newRow?.device_id || oldRow?.device_id || '').toUpperCase();

                // If the Admin assigned a new persistent Device ID to our token, persist it immediately
                if (
                  newRow?.auth_token &&
                  myToken &&
                  newRow.auth_token === myToken &&
                  newRow.status === 'active' &&
                  newRow.device_id
                ) {
                  saveDeviceEnrollment({
                    deviceId: String(newRow.device_id).trim().toUpperCase(),
                    authToken: newRow.auth_token,
                    status: 'active',
                  });
                  return;
                }

                if (affectedId && myId && affectedId === myId.toUpperCase()) {
                  if (eventType === 'DELETE') {
                    // Verify with Supabase first (in case this temporary ID was just replaced by a persistent ID)
                    this.verifyDeviceAuthorization(true);
                    return;
                  }
                  if (newRow?.status !== 'active') {
                    console.warn(`[SyncEngine Realtime] PDA ${myId} status changed to ${newRow?.status || 'revoked'}. Locking down.`);
                    this.lockdownRevokedDevice();
                    return;
                  }
                } else if (eventType === 'DELETE' && !affectedId) {
                  // Only hit Supabase if a DELETE event lacked the old row's device_id
                  this.verifyDeviceAuthorization(true);
                }
                return;
              }

              if (!this.isEffectivelyOnline()) return;

              // Apply Realtime INSERT/UPDATE/DELETE payloads directly to IndexedDB (0 network egress!)
              this.applyRealtimePayload(table, eventType, payload).catch((err) => {
                console.warn('[SyncEngine Realtime] Direct payload apply fallback:', err);
              });
            },
            () => {
              // Automatically catch up if Realtime WebSocket disconnected and reconnected
              if (this.isEffectivelyOnline() && !this.isSyncing) {
                this.syncWithRemote();
              }
            },
            {
              deviceIdFilter: getDeviceId() || undefined,
              includeAllDevices: false,
            }
          );
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
    if (this.outboxTimer) {
      clearInterval(this.outboxTimer);
      this.outboxTimer = null;
    }
    if (this.authTimer) {
      clearInterval(this.authTimer);
      this.authTimer = null;
    }
    if (this.outboxRetryTimer) {
      clearTimeout(this.outboxRetryTimer);
      this.outboxRetryTimer = null;
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
      // Android/PDA radios often take 2-6 seconds after exiting Airplane Mode before DNS/internet is ready;
      // schedule follow-up outbox checks so queued transactions always flush as soon as routing comes up.
      this.scheduleOutboxRetry(2500);
    }
  }

  private scheduleOutboxRetry(delayMs: number = 3000) {
    if (this.outboxRetryTimer) {
      clearTimeout(this.outboxRetryTimer);
    }
    this.outboxRetryTimer = setTimeout(async () => {
      this.outboxRetryTimer = null;
      if (!this.isEffectivelyOnline()) return;
      const pending = await this.getPendingCount();
      if (pending > 0) {
        const res = await this.flushOutbox();
        const remaining = await this.getPendingCount();
        if (remaining > 0 && this.isEffectivelyOnline()) {
          const nextDelay = Math.min(delayMs * 2, 15000);
          this.scheduleOutboxRetry(nextDelay);
        } else if (res.processed > 0) {
          this.syncWithRemote({ equipment: false, transactions: true });
        }
      }
    }, delayMs);
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
    const isAuth = await this.verifyDeviceAuthorization();
    if (!isAuth) {
      throw new Error('DEVICE_UNAUTHORIZED: This device has been deleted or revoked');
    }

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
    const isAuth = await this.verifyDeviceAuthorization();
    if (!isAuth) {
      throw new Error('DEVICE_UNAUTHORIZED: This device has been deleted or revoked');
    }

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
        console.warn('Immediate background flush error after queueing transaction:', err);
      });
    }
  }

  /**
   * Updates an existing transaction in local IndexedDB and adds it to the outbox queue.
   * If online, immediately triggers an outbox flush to update the record in Supabase.
   */
  public async updateTransaction(tx: Transaction): Promise<void> {
    const isAuth = await this.verifyDeviceAuthorization();
    if (!isAuth) {
      throw new Error('DEVICE_UNAUTHORIZED: This device has been deleted or revoked');
    }

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
   * Applies a Supabase Realtime `postgres_changes` payload directly to local IndexedDB
   * without issuing a full-table `SELECT *` network query.
   */
  private async applyRealtimePayload(
    table: 'transactions' | 'equipment_list',
    eventType: string,
    payload?: { new?: Record<string, unknown>; old?: Record<string, unknown> }
  ): Promise<void> {
    if (table === 'transactions') {
      if ((eventType === 'INSERT' || eventType === 'UPDATE') && payload?.new && payload.new.id) {
        const incomingTx = mapSupabaseRowToTransaction(payload.new);
        if (this.deletedTxIds.has(incomingTx.id)) return;

        // Do not overwrite a transaction that is currently pending local upload unless identical
        const pendingOutbox = await db.outbox.get(incomingTx.id);
        if (pendingOutbox) {
          const localTx = await db.transactions.get(incomingTx.id);
          const isSame = Boolean(
            localTx &&
            localTx.transactionType === incomingTx.transactionType &&
            (localTx.checkInFuelPercentage ?? null) === (incomingTx.checkInFuelPercentage ?? null) &&
            (localTx.checkOutFuelPercentage ?? null) === (incomingTx.checkOutFuelPercentage ?? null) &&
            (localTx.checkInDefPercentage ?? null) === (incomingTx.checkInDefPercentage ?? null) &&
            (localTx.checkOutDefPercentage ?? null) === (incomingTx.checkOutDefPercentage ?? null) &&
            (localTx.checkInKWH ?? null) === (incomingTx.checkInKWH ?? null) &&
            (localTx.checkOutKWH ?? null) === (incomingTx.checkOutKWH ?? null) &&
            (localTx.checkInFuelEighths ?? null) === (incomingTx.checkInFuelEighths ?? null) &&
            (localTx.checkOutFuelEighths ?? null) === (incomingTx.checkOutFuelEighths ?? null) &&
            (localTx.fuelTransferLitres ?? null) === (incomingTx.fuelTransferLitres ?? null) &&
            (localTx.defTransferLitres ?? null) === (incomingTx.defTransferLitres ?? null)
          );
          if (!isSame) return;
          await db.outbox.delete(incomingTx.id);
        }

        await db.transactions.put(incomingTx);

        if (incomingTx.transactionType === 'PoweredUp' || incomingTx.transactionType === 'PoweredDown') {
          const eq = await db.equipments.get(incomingTx.equipmentId);
          if (eq && eq.type === 'GENERATOR') {
            const allTxForEq = await db.transactions.where('equipmentId').equals(incomingTx.equipmentId).toArray();
            const powerState = getGeneratorPowerState(incomingTx.equipmentId, allTxForEq);
            if (powerState.isOn) {
              eq.poweredUpTimestamp = powerState.poweredUpTimestamp;
              delete eq.poweredDownTimestamp;
            } else {
              eq.poweredDownTimestamp = powerState.poweredDownTimestamp;
              delete eq.poweredUpTimestamp;
            }
            await db.equipments.put(eq);
          }
        }

        this.lastSyncTime = new Date().toLocaleTimeString();
        await this.notify();
        this.notifyDataChange();
        return;
      }

      if (eventType === 'DELETE') {
        const delId = payload?.old?.id ? String(payload.old.id) : null;
        if (delId) {
          const existingTx = await db.transactions.get(delId);
          await db.transactions.delete(delId);
          await db.outbox.delete(delId);
          if (this.deletedTxIds.has(delId)) {
            this.deletedTxIds.delete(delId);
            this.saveDeletedTxIds();
          }

          if (existingTx && (existingTx.transactionType === 'PoweredUp' || existingTx.transactionType === 'PoweredDown')) {
            const eq = await db.equipments.get(existingTx.equipmentId);
            if (eq && eq.type === 'GENERATOR') {
              const allTxForEq = await db.transactions.where('equipmentId').equals(existingTx.equipmentId).toArray();
              const powerState = getGeneratorPowerState(existingTx.equipmentId, allTxForEq);
              if (powerState.isOn) {
                eq.poweredUpTimestamp = powerState.poweredUpTimestamp;
                delete eq.poweredDownTimestamp;
              } else {
                eq.poweredDownTimestamp = powerState.poweredDownTimestamp;
                delete eq.poweredUpTimestamp;
              }
              await db.equipments.put(eq);
            }
          }

          this.lastSyncTime = new Date().toLocaleTimeString();
          await this.notify();
          this.notifyDataChange();
          return;
        }
        // Fallback if DELETE event had no old.id (e.g. bulk clear)
        this.scheduleDebouncedTableSync({ equipment: false, transactions: true });
      }
      return;
    }

    if (table === 'equipment_list') {
      if ((eventType === 'INSERT' || eventType === 'UPDATE') && payload?.new && payload.new.equipment_id) {
        const incomingEq = mapSupabaseRowToEquipment(payload.new);
        if (incomingEq.type === 'GENERATOR') {
          const allTxForEq = await db.transactions.where('equipmentId').equals(incomingEq.equipmentId).toArray();
          const powerState = getGeneratorPowerState(incomingEq.equipmentId, allTxForEq);
          if (powerState.isOn) {
            incomingEq.poweredUpTimestamp = powerState.poweredUpTimestamp;
            delete incomingEq.poweredDownTimestamp;
          } else {
            incomingEq.poweredDownTimestamp = powerState.poweredDownTimestamp;
            delete incomingEq.poweredUpTimestamp;
          }
        }
        await db.equipments.put(incomingEq);
        this.lastSyncTime = new Date().toLocaleTimeString();
        await this.notify();
        this.notifyDataChange();
        return;
      }

      if (eventType === 'DELETE') {
        const delEqId = payload?.old?.equipment_id ? String(payload.old.equipment_id) : null;
        if (delEqId) {
          await db.equipments.delete(delEqId);
          this.lastSyncTime = new Date().toLocaleTimeString();
          await this.notify();
          this.notifyDataChange();
          return;
        }
        this.scheduleDebouncedTableSync({ equipment: true, transactions: false });
      }
    }
  }

  private scheduleDebouncedTableSync(opts: { equipment: boolean; transactions: boolean }) {
    if (opts.equipment) this.pendingRealtimeTables.equipment = true;
    if (opts.transactions) this.pendingRealtimeTables.transactions = true;
    if (this.realtimeDebounceTimer) {
      clearTimeout(this.realtimeDebounceTimer);
    }
    this.realtimeDebounceTimer = setTimeout(() => {
      const nextOpts = {
        equipment: this.pendingRealtimeTables.equipment,
        transactions: this.pendingRealtimeTables.transactions,
      };
      this.pendingRealtimeTables = { equipment: false, transactions: false };
      this.syncWithRemote(nextOpts);
    }, 300);
  }

  /**
   * Immediately clears local cached fleet data, marks device status as revoked,
   * and notifies all listeners to lock down the UI.
   */
  public async lockdownRevokedDevice(): Promise<void> {
    this.lastAuthCheckResult = false;
    this.lastAuthCheckTime = 0;
    invalidateDeviceTokenCache();
    const currentDevId = getDeviceId();
    console.warn(`[SyncEngine] Locking down device "${currentDevId}". Active token revoked.`);
    markDeviceRevoked();
    try {
      await db.equipments.clear();
      await db.transactions.clear();
      await db.outbox.clear();
    } catch (e) {
      console.warn('Error clearing local db on revocation:', e);
    }
    this.notifyDeviceRevoked();
  }

  /**
   * Verifies that this physical device has a valid active token on the central server.
   * If token is revoked or missing, triggers lockdown immediately.
   * Caches positive verification for 60 seconds and gracefully allows offline operation when in Airplane mode.
   */
  public async verifyDeviceAuthorization(force: boolean = false): Promise<boolean> {
    if (!isDeviceEnrolled()) {
      return false;
    }
    const currentDevId = getDeviceId();
    const currentToken = getDeviceToken();
    if (!currentDevId || !currentToken) {
      await this.lockdownRevokedDevice();
      return false;
    }

    // When offline / in Airplane mode, immediately trust local active enrollment without stalling on network calls
    if (!this.isEffectivelyOnline()) {
      return true;
    }

    const now = Date.now();
    if (!force && this.lastAuthCheckResult && now - this.lastAuthCheckTime < 60000) {
      return true;
    }

    try {
      const check = await verifyRemoteDeviceToken(currentDevId, currentToken, force);
      if (!check.valid || check.status !== 'active') {
        console.warn(`[SyncEngine] Device ${currentDevId} validation failed (valid=${check.valid}, status=${check.status}). Locking down.`);
        this.lastAuthCheckResult = false;
        await this.lockdownRevokedDevice();
        return false;
      }
      const finalDeviceId = check.deviceId ? check.deviceId.trim().toUpperCase() : currentDevId;
      if (finalDeviceId !== currentDevId || (check.authToken && check.authToken !== currentToken)) {
        saveDeviceEnrollment({
          deviceId: finalDeviceId,
          authToken: check.authToken || currentToken,
          status: 'active',
        });
      }
      this.lastAuthCheckResult = true;
      this.lastAuthCheckTime = now;
      return true;
    } catch (e) {
      // Transient network error (e.g. Wi-Fi still associating right after turning off Airplane mode):
      // never lock down or reject an enrolled device on a network error.
      console.warn('[SyncEngine] Network error during device verification; allowing enrolled device:', e);
      return isDeviceEnrolled();
    }
  }

  /**
   * Two-way sync:
   * 1. Flush any pending outbox items from this device to the central server.
   * 2. Pull remote transactions and/or equipment from the central server and update local IndexedDB.
   */
  public async syncWithRemote(options?: { equipment?: boolean; transactions?: boolean }): Promise<void> {
    if (!this.isEffectivelyOnline() || this.isSyncing) return;

    const fetchEq = options?.equipment ?? true;
    const fetchTx = options?.transactions ?? true;

    // Lock isSyncing synchronously BEFORE any await so concurrent 'online' + 'visibilitychange' events cannot race
    this.isSyncing = true;
    await this.notify();

    try {
      // Strict Device Authorization: If device has no active token, lock down immediately
      if (isDeviceEnrolled()) {
        const isAuthorized = await this.verifyDeviceAuthorization();
        if (!isAuthorized) {
          return;
        }
      } else {
        return;
      }

      // Step 1: Upload any pending outbox items from this device (serialized via flushOutbox)
      const flushRes = await this.flushOutbox();
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

      // Step 2: Download only the requested tables from central server (protects Supabase egress quota)
      const [remoteEquipment, remoteTransactions] = await Promise.all([
        fetchEq
          ? fetchRemoteEquipment().catch((err) => {
              console.warn('Could not fetch remote equipment:', err);
              return null;
            })
          : Promise.resolve(null),
        fetchTx
          ? fetchRemoteTransactions().catch((err) => {
              console.warn('Could not fetch remote transactions:', err);
              return null;
            })
          : Promise.resolve(null),
      ]);

      // Step 3: Mirror server state & ensure deleted transactions are never re-inserted
      if (remoteTransactions && Array.isArray(remoteTransactions)) {
        // Exclude all tombstoned transactions so they CANNOT be re-inserted into IndexedDB
        const filteredRemote = remoteTransactions.filter((t) => !this.deletedTxIds.has(t.id));
        const remoteIdSet = new Set(filteredRemote.map((t) => t.id));
        const remoteTxById = new Map(filteredRemote.map((t) => [t.id, t]));
        const outboxItems = await db.outbox.toArray();
        const pendingOutboxIdSet = new Set(outboxItems.map((o) => o.id));

        const allLocal = await db.transactions.toArray();

        // Ensure any local transaction that is still marked 'pending' or 'failed' is protected
        // (and re-queued in outbox if needed) so it can NEVER be deleted or overwritten by stale server values
        // before the server confirms the exact updated values
        for (const localTx of allLocal) {
          if (
            (localTx.syncStatus === 'pending' || localTx.syncStatus === 'failed') &&
            !this.deletedTxIds.has(localTx.id)
          ) {
            const remoteMatch = remoteTxById.get(localTx.id);
            const isIdenticalOnServer = Boolean(
              remoteMatch &&
              remoteMatch.transactionType === localTx.transactionType &&
              (remoteMatch.checkInFuelPercentage ?? null) === (localTx.checkInFuelPercentage ?? null) &&
              (remoteMatch.checkOutFuelPercentage ?? null) === (localTx.checkOutFuelPercentage ?? null) &&
              (remoteMatch.checkInDefPercentage ?? null) === (localTx.checkInDefPercentage ?? null) &&
              (remoteMatch.checkOutDefPercentage ?? null) === (localTx.checkOutDefPercentage ?? null) &&
              (remoteMatch.checkInKWH ?? null) === (localTx.checkInKWH ?? null) &&
              (remoteMatch.checkOutKWH ?? null) === (localTx.checkOutKWH ?? null) &&
              (remoteMatch.checkInFuelEighths ?? null) === (localTx.checkInFuelEighths ?? null) &&
              (remoteMatch.checkOutFuelEighths ?? null) === (localTx.checkOutFuelEighths ?? null) &&
              (remoteMatch.fuelTransferLitres ?? null) === (localTx.fuelTransferLitres ?? null) &&
              (remoteMatch.defTransferLitres ?? null) === (localTx.defTransferLitres ?? null)
            );

            if (isIdenticalOnServer) {
              // Server already has this exact transaction (including any edits)! Mark synced and remove from outbox
              pendingOutboxIdSet.delete(localTx.id);
              await db.outbox.delete(localTx.id);
            } else {
              pendingOutboxIdSet.add(localTx.id);
              const existingOutbox = await db.outbox.get(localTx.id);
              if (!existingOutbox) {
                await db.outbox.put({
                  id: localTx.id,
                  equipmentId: localTx.equipmentId,
                  createdAt: localTx.createdAt || localTx.transactionTimestamp,
                  attempts: 0,
                });
              }
            }
          }
        }

        // Delete local transactions that were removed from Supabase/server or marked deleted locally
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
          const localTxById = new Map(allLocal.map((l) => [l.id, l]));
          const changedTransactions = transactionsToApply.filter((remoteTx) => {
            const loc = localTxById.get(remoteTx.id);
            if (!loc || loc.syncStatus !== 'synced') return true;
            return (
              loc.transactionType !== remoteTx.transactionType ||
              loc.transactionTimestamp !== remoteTx.transactionTimestamp ||
              (loc.checkInFuelPercentage ?? null) !== (remoteTx.checkInFuelPercentage ?? null) ||
              (loc.checkOutFuelPercentage ?? null) !== (remoteTx.checkOutFuelPercentage ?? null) ||
              (loc.checkInDefPercentage ?? null) !== (remoteTx.checkInDefPercentage ?? null) ||
              (loc.checkOutDefPercentage ?? null) !== (remoteTx.checkOutDefPercentage ?? null) ||
              (loc.checkInKWH ?? null) !== (remoteTx.checkInKWH ?? null) ||
              (loc.checkOutKWH ?? null) !== (remoteTx.checkOutKWH ?? null) ||
              (loc.checkInFuelEighths ?? null) !== (remoteTx.checkInFuelEighths ?? null) ||
              (loc.checkOutFuelEighths ?? null) !== (remoteTx.checkOutFuelEighths ?? null) ||
              (loc.fuelTransferLitres ?? null) !== (remoteTx.fuelTransferLitres ?? null) ||
              (loc.defTransferLitres ?? null) !== (remoteTx.defTransferLitres ?? null)
            );
          });

          if (changedTransactions.length > 0) {
            await db.transactions.bulkPut(changedTransactions);
            hadUpdates = true;
          }
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

        // If we only fetched transactions (not equipment), reconcile local equipment power states in-place
        if (!remoteEquipment && hadUpdates) {
          const allLocalEq = await db.equipments.toArray();
          if (allLocalEq.length > 0) {
            const allLocalTxs = await db.transactions.toArray();
            const reconciled = reconcileEquipmentPowerStates(allLocalEq, allLocalTxs);
            await db.equipments.bulkPut(reconciled);
          }
        }
      }

      if (remoteEquipment && Array.isArray(remoteEquipment)) {
        const remoteEqIdSet = new Set(remoteEquipment.map((e) => e.equipmentId));
        const allLocalEq = await db.equipments.toArray();
        const localEqById = new Map(allLocalEq.map((e) => [e.equipmentId, e]));
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
          const changedEquipment = reconciled.filter((remEq) => {
            const loc = localEqById.get(remEq.equipmentId);
            if (!loc) return true;
            return (
              loc.area !== remEq.area ||
              loc.location !== remEq.location ||
              loc.what3words !== remEq.what3words ||
              loc.type !== remEq.type ||
              (loc.capacity ?? null) !== (remEq.capacity ?? null) ||
              loc.rentalSerialNumber !== remEq.rentalSerialNumber ||
              (loc.poweredUpTimestamp ?? null) !== (remEq.poweredUpTimestamp ?? null) ||
              (loc.poweredDownTimestamp ?? null) !== (remEq.poweredDownTimestamp ?? null) ||
              (loc.latitude ?? null) !== (remEq.latitude ?? null) ||
              (loc.longitude ?? null) !== (remEq.longitude ?? null)
            );
          });

          if (changedEquipment.length > 0) {
            await db.equipments.bulkPut(changedEquipment);
            hadUpdates = true;
          }
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

    if (!this.isEffectivelyOnline()) {
      return { processed: 0, errors: 0 };
    }

    const isAuth = await this.verifyDeviceAuthorization();
    if (!isAuth) {
      if (!isDeviceEnrolled()) {
        await this.lockdownRevokedDevice();
      }
      return { processed: 0, errors: 1 };
    }

    const items = await db.outbox.orderBy('createdAt').toArray();

    for (const item of items) {
      if (!this.isEffectivelyOnline()) break;

      // Re-verify the item is still in outbox (guards against any earlier flush having processed it)
      const stillQueued = await db.outbox.get(item.id);
      if (!stillQueued) continue;

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
        if (result.error && result.error.includes('DEVICE_UNAUTHORIZED')) {
          console.warn('[SyncEngine] Outbox flush blocked: Device unauthorized. Locking down.');
          await this.lockdownRevokedDevice();
          return { processed, errors: errors + 1 };
        }

        errors++;
        this.lastError = result.error || 'Failed to upload transaction';
        const isTransientNetworkError =
          !this.isEffectivelyOnline() ||
          Boolean(
            result.error &&
              (result.error.includes('Failed to fetch') ||
                result.error.includes('NetworkError') ||
                result.error.includes('Load failed') ||
                result.error.includes('network'))
          );

        await db.outbox.update(item.id, {
          attempts: item.attempts + 1,
          lastAttempt: new Date().toISOString(),
          error: result.error,
        });
        await db.transactions.update(item.id, {
          syncStatus: isTransientNetworkError ? 'pending' : 'failed',
          syncError: result.error,
        });
      }
    }

    if (processed > 0) {
      this.lastSyncTime = new Date().toLocaleTimeString();
      this.lastError = null;
      pushDeviceTelemetry(false).catch(() => {});
    }

    if (errors > 0 && this.isEffectivelyOnline()) {
      this.scheduleOutboxRetry(3000);
    }

    return { processed, errors };
  }

  public async flushOutbox(): Promise<{ processed: number; errors: number }> {
    if (this.activeFlushPromise) {
      this.needsAnotherFlush = true;
      return this.activeFlushPromise;
    }

    this.isFlushing = true;
    this.activeFlushPromise = (async () => {
      let totalProcessed = 0;
      let totalErrors = 0;
      try {
        do {
          this.needsAnotherFlush = false;
          const res = await this.flushOutboxInternal();
          totalProcessed += res.processed;
          totalErrors += res.errors;
          if (res.processed > 0 || res.errors > 0) {
            await this.notify();
            this.notifyDataChange();
          }
        } while (this.needsAnotherFlush && this.isEffectivelyOnline());
        return { processed: totalProcessed, errors: totalErrors };
      } finally {
        this.isFlushing = false;
        this.activeFlushPromise = null;
      }
    })();

    return this.activeFlushPromise;
  }
}

export const syncEngine = new SyncEngine();
