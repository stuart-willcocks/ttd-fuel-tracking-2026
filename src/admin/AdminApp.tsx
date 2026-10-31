import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Boxes, Map as MapIcon, ReceiptText, Smartphone } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import './admin.css';
import { LaptopOnlyGuard } from './components/LaptopOnlyGuard';
import { AdminLoginView } from './components/AdminLoginView';
import { AdminTopNav, type AdminViewType } from './components/AdminTopNav';
import { AssetsView } from './views/AssetsView';
import { TransactionsView } from './views/TransactionsView';
import { DevicesView } from './views/DevicesView';
import { SettingsView } from './views/SettingsView';
import { AssetFormModal } from './components/AssetFormModal';
import { DeleteAssetModal } from './components/DeleteAssetModal';
import { AssetQRLabelModal } from './components/AssetQRLabelModal';
import { TransactionDetailModal } from './components/TransactionDetailModal';
import { DangerZoneModal } from './components/DangerZoneModal';
import { ToastContainer, type ToastMessage } from './components/Toast';

import type { Equipment, Transaction, AuthorizedDevice, DeviceStatus } from '../types';
import {
  fetchRemoteEquipment,
  postRemoteEquipment,
  deleteRemoteEquipment,
  fetchRemoteTransactions,
  postRemoteTransaction,
  updateRemoteTransaction,
  deleteRemoteTransaction,
  resetRemoteData,
  deleteAllFleetData,
  deleteAllTransactionsOnly,
  deleteTransactionsForEquipment,
  bulkUploadEquipment,
  fetchRemoteAuthorizedDevices,
  updateRemoteDeviceStatus,
  deleteRemoteAuthorizedDevice,
} from '../services/api';
import {
  isSupabaseConfigured,
  subscribeToCloudChanges,
  getAdminSession,
  onAdminAuthStateChange,
  signOutAdmin,
  getInitialAuthUrlInfo,
  mapSupabaseRowToEquipment,
  mapSupabaseRowToTransaction,
  mapSupabaseRowToAuthorizedDevice,
} from '../services/supabase';
import { getGeneratorPowerState, reconcileEquipmentPowerStates } from '../utils/powerState';
import { formatErrorMessage } from '../utils/errorMessage';

export const AdminApp: React.FC = () => {
  const initialAuthInfo = getInitialAuthUrlInfo();
  const [adminSession, setAdminSession] = useState<Session | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(() => isSupabaseConfigured());
  const [isPasswordRecovery, setIsPasswordRecovery] = useState<boolean>(
    () => initialAuthInfo.isInviteOrRecovery
  );

  const [currentView, setCurrentView] = useState<AdminViewType>('ASSETS');
  const [assets, setAssets] = useState<Equipment[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [devices, setDevices] = useState<AuthorizedDevice[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSupabaseOnline, setIsSupabaseOnline] = useState(false);

  // Modals & Drawers state
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Equipment | null>(null);
  const [assetPendingDelete, setAssetPendingDelete] = useState<Equipment | null>(null);
  const [qrAsset, setQrAsset] = useState<Equipment | null>(null);
  const [inspectingTransaction, setInspectingTransaction] = useState<Transaction | null>(null);
  const [isDangerZoneOpen, setIsDangerZoneOpen] = useState(false);

  // Toast Notifications
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = `${Date.now()}_${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const assetsRef = useRef<Equipment[]>(assets);
  const transactionsRef = useRef<Transaction[]>(transactions);
  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);
  useEffect(() => {
    transactionsRef.current = transactions;
  }, [transactions]);

  // Fetch initial or table-scoped data & animate refresh icon on every database sync
  const loadFleetData = useCallback(
    async (
      silent = false,
      scope?: { equipment?: boolean; transactions?: boolean; devices?: boolean }
    ) => {
      const fetchEq = scope?.equipment ?? true;
      const fetchTx = scope?.transactions ?? true;
      const fetchDev = scope?.devices ?? true;

      const startTime = Date.now();
      setIsRefreshing(true);
      try {
        const [fetchedAssets, fetchedTxs, fetchedDevices] = await Promise.all([
          fetchEq ? fetchRemoteEquipment() : Promise.resolve(null),
          fetchTx ? fetchRemoteTransactions() : Promise.resolve(null),
          fetchDev ? fetchRemoteAuthorizedDevices() : Promise.resolve(null),
        ]);

        const nextTxs = fetchedTxs ?? transactionsRef.current;
        const baseAssets = fetchedAssets ?? assetsRef.current;

        if (fetchedTxs) {
          setTransactions(fetchedTxs);
        }
        if (fetchedAssets || fetchedTxs) {
          const reconciledAssets = reconcileEquipmentPowerStates(baseAssets, nextTxs);
          setAssets(reconciledAssets);
        }
        if (fetchedDevices) {
          setDevices(fetchedDevices);
        }
        setIsSupabaseOnline(isSupabaseConfigured());
      } catch (err: unknown) {
        console.error('Failed to load fleet data:', err);
        const msg = formatErrorMessage(err);
        if (!silent) showToast(`Data sync warning: ${msg}`, 'error');
      } finally {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 600 - elapsed);
        if (remaining > 0) {
          setTimeout(() => setIsRefreshing(false), remaining);
        } else {
          setIsRefreshing(false);
        }
      }
    },
    [showToast]
  );

  const isAuthenticated = !isSupabaseConfigured() || (Boolean(adminSession) && !isPasswordRecovery);

  useEffect(() => {
    document.body.classList.add('admin-body');
    return () => {
      document.body.classList.remove('admin-body');
    };
  }, []);

  // Supabase Auth session check & listener for Admin Console
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setIsAuthChecking(false);
      return;
    }

    let mounted = true;
    getAdminSession()
      .then((session) => {
        if (mounted) {
          setAdminSession(session);
          setIsAuthChecking(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setIsAuthChecking(false);
        }
      });

    const unsubscribe = onAdminAuthStateChange((event, session) => {
      if (!mounted) return;
      setAdminSession(session);
      setIsAuthChecking(false);
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadFleetData();

    // Deep 60-minute safety fallback poll (Supabase Realtime + reconnect handler handle instant updates)
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (isCreateModalOpen || Boolean(editingAsset)) return;
      loadFleetData(true);
    }, 3600000);

    return () => {
      clearInterval(interval);
    };
  }, [isAuthenticated, loadFleetData, isCreateModalOpen, editingAsset]);

  // Real-time listener for database transactions, equipment, and telemetry logged by field PDAs
  useEffect(() => {
    if (!isSupabaseConfigured() || !isAuthenticated) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const pendingTables = {
      equipment: false,
      transactions: false,
      devices: false,
    };

    const scheduleFallbackRefresh = (table: string) => {
      if (table === 'equipment_list') pendingTables.equipment = true;
      if (table === 'transactions') pendingTables.transactions = true;
      if (table === 'authorized_devices') pendingTables.devices = true;

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const scope = {
          equipment: pendingTables.equipment,
          transactions: pendingTables.transactions,
          devices: pendingTables.devices,
        };
        pendingTables.equipment = false;
        pendingTables.transactions = false;
        pendingTables.devices = false;
        loadFleetData(true, scope);
      }, 300);
    };

    const unsubscribe = subscribeToCloudChanges(
      (table, eventType, payload) => {
        // Avoid clobbering user input when an asset creation or edit modal is active
        if (isCreateModalOpen || Boolean(editingAsset)) return;

        const newRec = payload?.new as Record<string, unknown> | undefined;
        const oldRec = payload?.old as Record<string, unknown> | undefined;

        if (table === 'transactions') {
          if ((eventType === 'INSERT' || eventType === 'UPDATE') && newRec && newRec.id) {
            const mappedTx = mapSupabaseRowToTransaction(newRec);
            setTransactions((prevTxs) => {
              const exists = prevTxs.some((t) => t.id === mappedTx.id);
              const nextTxs = exists
                ? prevTxs.map((t) => (t.id === mappedTx.id ? mappedTx : t))
                : [mappedTx, ...prevTxs];
              nextTxs.sort(
                (a, b) =>
                  new Date(b.transactionTimestamp).getTime() -
                  new Date(a.transactionTimestamp).getTime()
              );
              setAssets((prevAssets) => reconcileEquipmentPowerStates(prevAssets, nextTxs));
              return nextTxs;
            });
            return;
          }
          if (eventType === 'BULK_DELETE' && oldRec) {
            const eqId = oldRec.equipmentId ? String(oldRec.equipmentId) : null;
            const wipeAll = Boolean(oldRec.all);
            if (wipeAll) {
              setTransactions([]);
              setAssets((prevAssets) => reconcileEquipmentPowerStates(prevAssets, []));
              return;
            }
            if (eqId) {
              setTransactions((prevTxs) => {
                if (!prevTxs.some((t) => t.equipmentId === eqId)) return prevTxs;
                const nextTxs = prevTxs.filter((t) => t.equipmentId !== eqId);
                setAssets((prevAssets) => reconcileEquipmentPowerStates(prevAssets, nextTxs));
                return nextTxs;
              });
              return;
            }
            return;
          }
          if (eventType === 'DELETE' && oldRec && oldRec.id) {
            const delId = String(oldRec.id);
            setTransactions((prevTxs) => {
              if (!prevTxs.some((t) => t.id === delId)) return prevTxs;
              const nextTxs = prevTxs.filter((t) => t.id !== delId);
              setAssets((prevAssets) => reconcileEquipmentPowerStates(prevAssets, nextTxs));
              return nextTxs;
            });
            return;
          }
        }

        if (table === 'equipment_list') {
          if ((eventType === 'INSERT' || eventType === 'UPDATE') && newRec && newRec.equipment_id) {
            const mappedEq = mapSupabaseRowToEquipment(newRec);
            setAssets((prevAssets) => {
              const exists = prevAssets.some((a) => a.equipmentId === mappedEq.equipmentId);
              const nextAssets = exists
                ? prevAssets.map((a) => (a.equipmentId === mappedEq.equipmentId ? mappedEq : a))
                : [...prevAssets, mappedEq];
              return reconcileEquipmentPowerStates(nextAssets, transactionsRef.current);
            });
            return;
          }
          if (eventType === 'DELETE' && oldRec && oldRec.equipment_id) {
            const delId = String(oldRec.equipment_id);
            setAssets((prevAssets) => prevAssets.filter((a) => a.equipmentId !== delId));
            return;
          }
        }

        if (table === 'authorized_devices') {
          if ((eventType === 'INSERT' || eventType === 'UPDATE') && newRec && newRec.device_id) {
            const mappedDev = mapSupabaseRowToAuthorizedDevice(newRec);
            setDevices((prevDevs) => {
              const exists = prevDevs.some(
                (d) => d.deviceId.toUpperCase() === mappedDev.deviceId.toUpperCase()
              );
              const nextDevs = exists
                ? prevDevs.map((d) =>
                    d.deviceId.toUpperCase() === mappedDev.deviceId.toUpperCase() ? mappedDev : d
                  )
                : [mappedDev, ...prevDevs];
              return nextDevs.sort(
                (a, b) => new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime()
              );
            });
            return;
          }
          if (eventType === 'DELETE' && oldRec && oldRec.device_id) {
            const delId = String(oldRec.device_id).toUpperCase();
            setDevices((prevDevs) =>
              prevDevs.filter((d) => d.deviceId.toUpperCase() !== delId)
            );
            return;
          }
        }

        // Fallback if payload primary key was omitted
        scheduleFallbackRefresh(table);
      },
      () => {
        // Automatically refresh if Realtime WebSocket disconnected and reconnected
        if (isCreateModalOpen || Boolean(editingAsset)) return;
        loadFleetData(true);
      },
      { includeAllDevices: true }
    );

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribe();
    };
  }, [isAuthenticated, loadFleetData, isCreateModalOpen, editingAsset]);

  const handleSignOut = async () => {
    try {
      await signOutAdmin();
      setAdminSession(null);
    } catch (err: unknown) {
      const msg = formatErrorMessage(err);
      showToast(`Sign out failed: ${msg}`, 'error');
    }
  };

  // Create / Update Asset Handler
  const handleSaveAsset = async (savedAsset: Equipment) => {
    try {
      await postRemoteEquipment(savedAsset);
      await loadFleetData(true, { equipment: true, transactions: false, devices: false });
      showToast(`Asset "${savedAsset.equipmentId}" saved successfully!`, 'success');
      setEditingAsset(null);
      setIsCreateModalOpen(false);
    } catch (err: unknown) {
      const msg = formatErrorMessage(err);
      showToast(`Failed to save asset: ${msg}`, 'error');
      throw err;
    }
  };

  // Delete Asset Handler
  const handleDeleteAsset = async (equipmentId: string) => {
    try {
      await deleteRemoteEquipment(equipmentId);
      await loadFleetData(true, { equipment: true, transactions: true, devices: false });
      showToast(`Asset "${equipmentId}" decommissioned and removed.`, 'success');
      setAssetPendingDelete(null);
      if (selectedAssetId === equipmentId) {
        setSelectedAssetId(null);
      }
    } catch (err: unknown) {
      const msg = formatErrorMessage(err);
      showToast(`Failed to delete asset: ${msg}`, 'error');
      throw err;
    }
  };

  // Update Transaction Handler (reconciles generator power state automatically)
  const handleUpdateTransaction = async (updatedTx: Transaction) => {
    try {
      await updateRemoteTransaction(updatedTx);
      await loadFleetData(true, { equipment: true, transactions: true, devices: false });
      showToast(`Transaction for "${updatedTx.equipmentId}" updated successfully!`, 'success');
    } catch (err: unknown) {
      const msg = formatErrorMessage(err);
      showToast(`Failed to update transaction: ${msg}`, 'error');
      throw err;
    }
  };

  // Delete Transaction Handler (reconciles generator power state automatically)
  const handleDeleteTransaction = async (transactionId: string) => {
    try {
      await deleteRemoteTransaction(transactionId);
      await loadFleetData(true, { equipment: false, transactions: true, devices: false });
      showToast('Transaction deleted. Generator power states recalculated.', 'success');
    } catch (err: unknown) {
      const msg = formatErrorMessage(err);
      showToast(`Failed to delete transaction: ${msg}`, 'error');
      throw err;
    }
  };

  // Power Toggle for Generator
  const handleTogglePower = async (asset: Equipment) => {
    if (asset.type !== 'GENERATOR') return;

    // Power state is determined strictly by the most recent power transaction for this equipment ID
    const powerState = getGeneratorPowerState(asset.equipmentId, transactions);
    const isRunning = powerState.isOn;
    const newAction = isRunning ? 'PoweredDown' : 'PoweredUp';
    const nowIso = new Date().toISOString();

    const updated: Equipment = {
      ...asset,
      poweredUpTimestamp: isRunning ? undefined : nowIso,
      poweredDownTimestamp: isRunning ? nowIso : undefined,
      updatedAt: new Date().toISOString(),
    };

    try {
      await postRemoteEquipment(updated);

      // Also log the transaction
      const newTx: Transaction = {
        id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `adm-tx-${Date.now()}`,
        equipmentId: asset.equipmentId,
        transactionTimestamp: nowIso,
        transactionType: newAction,
        syncStatus: 'synced',
        deviceId: 'Admin-Workstation',
        createdAt: new Date().toISOString(),
      };

      await postRemoteTransaction(newTx);
      await loadFleetData(true, { equipment: false, transactions: true, devices: false });
      showToast(
        `${asset.equipmentId} is now ${isRunning ? 'OFF' : 'ON'}`,
        'success'
      );
    } catch (err: unknown) {
      const msg = formatErrorMessage(err);
      showToast(`Failed to toggle power state: ${msg}`, 'error');
    }
  };

  // Device Handlers
  const handleUpdateDeviceStatus = async (
    deviceId: string,
    status: DeviceStatus,
    assignedDeviceId?: string
  ) => {
    try {
      await updateRemoteDeviceStatus(deviceId, status, assignedDeviceId);
      await loadFleetData(true, { equipment: false, transactions: false, devices: true });
      const finalId = assignedDeviceId ? assignedDeviceId.trim().toUpperCase() : deviceId;
      showToast(
        status === 'active'
          ? `Device authorized as "${finalId}".`
          : `Device "${finalId}" status updated to ${status}.`,
        'success'
      );
    } catch (err: unknown) {
      const msg = formatErrorMessage(err);
      showToast(`Failed to update device status: ${msg}`, 'error');
      throw err;
    }
  };

  const handleDeleteDevice = async (deviceId: string) => {
    try {
      await deleteRemoteAuthorizedDevice(deviceId);
      await loadFleetData(true, { equipment: false, transactions: false, devices: true });
      showToast(`Device "${deviceId}" deleted from authorized devices.`, 'success');
    } catch (err: unknown) {
      const msg = formatErrorMessage(err);
      showToast(`Failed to delete device: ${msg}`, 'error');
      throw err;
    }
  };

  // Reset database handler
  const handleResetDatabase = async () => {
    if (window.confirm('Reset all equipment and transactions to initial seed defaults?')) {
      try {
        await resetRemoteData();
        await loadFleetData();
        showToast('Database reset to factory default seed data.', 'info');
      } catch (err: unknown) {
        const msg = formatErrorMessage(err);
        showToast(`Failed to reset data: ${msg}`, 'error');
      }
    }
  };

  // Delete all equipment and transactions handler (Danger Zone)
  const handleDeleteAllRecords = async () => {
    try {
      await deleteAllFleetData();
      setAssets([]);
      setTransactions([]);
      setSelectedAssetId(null);
      await loadFleetData(true);
      showToast('All equipment IDs and transactions have been deleted.', 'success');
    } catch (err: unknown) {
      const msg = formatErrorMessage(err);
      console.error('Failed to delete all records:', err);
      showToast(`Failed to delete records: ${msg}`, 'error');
      throw err;
    }
  };

  // Delete all transactions only handler (Danger Zone — leaves equipment list intact)
  const handleDeleteAllTransactions = async () => {
    try {
      await deleteAllTransactionsOnly();
      setTransactions([]);
      await loadFleetData(true);
      showToast('All transaction records have been deleted.', 'success');
    } catch (err: unknown) {
      const msg = formatErrorMessage(err);
      console.error('Failed to delete all transactions:', err);
      showToast(`Failed to delete transactions: ${msg}`, 'error');
      throw err;
    }
  };

  // Delete transactions for one equipment ID handler (Danger Zone)
  const handleDeleteTransactionsForEquipment = async (equipmentId: string) => {
    try {
      await deleteTransactionsForEquipment(equipmentId);
      setTransactions((prev) => prev.filter((tx) => tx.equipmentId !== equipmentId));
      await loadFleetData(true, { equipment: true, transactions: true, devices: false });
      showToast(`All transactions for "${equipmentId}" have been deleted.`, 'success');
    } catch (err: unknown) {
      const msg = formatErrorMessage(err);
      console.error(`Failed to delete transactions for ${equipmentId}:`, err);
      showToast(`Failed to delete transactions for "${equipmentId}": ${msg}`, 'error');
      throw err;
    }
  };

  // Bulk upload equipment handler (Danger Zone)
  const handleBulkUploadEquipment = async (uploadedAssets: Equipment[]) => {
    try {
      await bulkUploadEquipment(uploadedAssets);
      await loadFleetData(true);
      showToast(`Successfully uploaded ${uploadedAssets.length} equipment records.`, 'success');
    } catch (err: unknown) {
      const msg = formatErrorMessage(err);
      console.error('Failed to bulk upload equipment:', err);
      showToast(`Bulk upload failed: ${msg}`, 'error');
      throw err;
    }
  };


  return (
    <LaptopOnlyGuard>
      {isAuthChecking ? (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0F172A',
            color: '#94A3B8',
            fontSize: '0.875rem',
            fontWeight: 600,
          }}
        >
          Verifying administrator session...
        </div>
      ) : isSupabaseConfigured() && (!adminSession || isPasswordRecovery) ? (
        <AdminLoginView
          isPasswordRecovery={isPasswordRecovery}
          initialError={initialAuthInfo.errorDescription}
          onPasswordRecoveryComplete={() => {
            setIsPasswordRecovery(false);
            showToast('Password saved successfully.', 'success');
          }}
        />
      ) : (
        <div className="admin-shell">
          {/* Full-Width Orange Top Navigation Menu */}
          <AdminTopNav
            isSupabaseOnline={isSupabaseOnline}
            isRefreshing={isRefreshing}
            onRefresh={() => loadFleetData()}
            adminEmail={adminSession?.user?.email}
            onSignOut={isSupabaseConfigured() ? handleSignOut : undefined}
          />

        {/* Navigation Tabs Bar directly below top banner */}
        <div className="admin-nav-tabs-bar">
          <button
            type="button"
            onClick={() => {
              setCurrentView('ASSETS');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`admin-nav-tab ${currentView === 'ASSETS' ? 'active' : ''}`}
          >
            <Boxes size={18} />
            <span>Equipment list</span>
            <span className="admin-nav-tab-badge">{assets.length}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCurrentView('MAP');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`admin-nav-tab ${currentView === 'MAP' ? 'active' : ''}`}
          >
            <MapIcon size={18} />
            <span>Map</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedAssetId(null);
              setCurrentView('TRANSACTIONS');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`admin-nav-tab ${currentView === 'TRANSACTIONS' ? 'active' : ''}`}
          >
            <ReceiptText size={18} />
            <span>Transactions</span>
            <span className="admin-nav-tab-badge">{transactions.length}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedAssetId(null);
              setCurrentView('DEVICES');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`admin-nav-tab ${currentView === 'DEVICES' ? 'active' : ''}`}
          >
            <Smartphone size={18} />
            <span>Devices</span>
            <span className="admin-nav-tab-badge">
              {devices.filter((d) => d.status === 'active').length}
            </span>
          </button>
        </div>

        {/* Main Content Viewport spanning full width */}
        <div className="admin-main-wrap">
          <main style={{ flex: 1, minWidth: 0, width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
            {(currentView === 'ASSETS' || currentView === 'MAP') && (
              <AssetsView
                assets={assets}
                transactions={transactions}
                devices={devices}
                viewMode={currentView === 'MAP' ? 'MAP' : 'TABLE'}
                onOpenCreateModal={() => setIsCreateModalOpen(true)}
                onOpenEditModal={(asset) => setEditingAsset(asset)}
                onOpenQRModal={(asset) => setQrAsset(asset)}
                onOpenDangerZone={() => setIsDangerZoneOpen(true)}
                onSelectAsset={(id) => {
                  setSelectedAssetId(id);
                  setCurrentView('TRANSACTIONS');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            )}

            {currentView === 'TRANSACTIONS' && (
              <TransactionsView
                transactions={transactions}
                assets={assets}
                selectedAssetId={selectedAssetId}
                onSelectAsset={(id) => {
                  setSelectedAssetId(id);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                onInspectTransaction={(tx) => setInspectingTransaction(tx)}
                onDeleteTransaction={handleDeleteTransaction}
                onOpenEditModal={(asset) => setEditingAsset(asset)}
                onOpenDeleteModal={(asset) => setAssetPendingDelete(asset)}
                onOpenQRModal={(asset) => setQrAsset(asset)}
                onTogglePower={handleTogglePower}
              />
            )}

            {currentView === 'DEVICES' && (
              <DevicesView
                devices={devices}
                onUpdateStatus={handleUpdateDeviceStatus}
                onDeleteDevice={handleDeleteDevice}
                onRefresh={() => loadFleetData()}
                isRefreshing={isRefreshing}
              />
            )}

            {currentView === 'SETTINGS' && (
              <SettingsView
                onTriggerSync={() => loadFleetData()}
                onResetDatabase={handleResetDatabase}
              />
            )}
          </main>
        </div>

        {/* Modals & Dialogs */}

        {/* Create / Edit Asset Modal */}
        {(isCreateModalOpen || editingAsset) && (
          <AssetFormModal
            key={editingAsset ? `edit-${editingAsset.equipmentId}` : 'create-asset'}
            isOpen={isCreateModalOpen || Boolean(editingAsset)}
            initialAsset={editingAsset}
            existingAssets={assets}
            onClose={() => {
              setIsCreateModalOpen(false);
              setEditingAsset(null);
            }}
            onSave={handleSaveAsset}
            onTogglePower={handleTogglePower}
            onDelete={(asset) => {
              setEditingAsset(null);
              setAssetPendingDelete(asset);
            }}
            isPowerOn={editingAsset ? getGeneratorPowerState(editingAsset.equipmentId, transactions).isOn : false}
          />
        )}

        {/* Delete Asset Modal */}
        {assetPendingDelete && (
          <DeleteAssetModal
            asset={assetPendingDelete}
            transactions={transactions}
            isOpen={Boolean(assetPendingDelete)}
            onClose={() => setAssetPendingDelete(null)}
            onConfirmDelete={handleDeleteAsset}
          />
        )}

        {/* QR Code Printable Label Modal */}
        {qrAsset && (
          <AssetQRLabelModal
            asset={qrAsset}
            isOpen={Boolean(qrAsset)}
            onClose={() => setQrAsset(null)}
          />
        )}

        {/* Transaction Edit / Delete Modal */}
        {inspectingTransaction && (
          <TransactionDetailModal
            transaction={inspectingTransaction}
            asset={assets.find((a) => a.equipmentId === inspectingTransaction.equipmentId)}
            isOpen={Boolean(inspectingTransaction)}
            onClose={() => setInspectingTransaction(null)}
            onUpdateTransaction={async (updatedTx) => {
              await handleUpdateTransaction(updatedTx);
              setInspectingTransaction(null);
            }}
            onDeleteTransaction={async (id) => {
              await handleDeleteTransaction(id);
              setInspectingTransaction(null);
            }}
            onSelectAsset={(id) => {
              setSelectedAssetId(id);
              setCurrentView('TRANSACTIONS');
              setInspectingTransaction(null);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {/* Danger Zone Modal */}
        {isDangerZoneOpen && (
          <DangerZoneModal
            isOpen={isDangerZoneOpen}
            existingAssets={assets}
            onClose={() => setIsDangerZoneOpen(false)}
            onDeleteAll={handleDeleteAllRecords}
            onDeleteAllTransactions={handleDeleteAllTransactions}
            onDeleteTransactionsForEquipment={handleDeleteTransactionsForEquipment}
            onBulkUpload={handleBulkUploadEquipment}
          />
        )}
      </div>
      )}

      {/* Toast Alerts */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </LaptopOnlyGuard>
  );
};

export default AdminApp;
