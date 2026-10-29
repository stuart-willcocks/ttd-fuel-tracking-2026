import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Boxes, ReceiptText, Smartphone } from 'lucide-react';
import './admin.css';
import { LaptopOnlyGuard } from './components/LaptopOnlyGuard';
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
import { RegisterDeviceModal } from './components/RegisterDeviceModal';
import { ToastContainer, type ToastMessage } from './components/Toast';

import type { Equipment, Transaction, AuthorizedDevice, DeviceStatus } from '../types';
import {
  fetchRemoteEquipment,
  postRemoteEquipment,
  deleteRemoteEquipment,
  fetchRemoteTransactions,
  postRemoteTransaction,
  deleteRemoteTransaction,
  resetRemoteData,
  deleteAllFleetData,
  bulkUploadEquipment,
  fetchRemoteAuthorizedDevices,
  postRemoteAuthorizedDevice,
  updateRemoteDeviceStatus,
  deleteRemoteAuthorizedDevice,
} from '../services/api';
import { isSupabaseConfigured, subscribeToCloudChanges } from '../services/supabase';
import { getGeneratorPowerState, reconcileEquipmentPowerStates } from '../utils/powerState';
import { formatErrorMessage } from '../utils/errorMessage';

export const AdminApp: React.FC = () => {
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
  const [isRegisterDeviceModalOpen, setIsRegisterDeviceModalOpen] = useState(false);
  const [registeringDevice, setRegisteringDevice] = useState<AuthorizedDevice | null>(null);

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

  useEffect(() => {
    document.body.classList.add('admin-body');
    loadFleetData();

    // Low-frequency 5-minute safety fallback poll (Supabase Realtime handles instant updates)
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (isCreateModalOpen || Boolean(editingAsset) || isRegisterDeviceModalOpen) return;
      loadFleetData(true);
    }, 300000);

    return () => {
      document.body.classList.remove('admin-body');
      clearInterval(interval);
    };
  }, [loadFleetData, isCreateModalOpen, editingAsset, isRegisterDeviceModalOpen]);

  // Real-time listener for database transactions, equipment, and telemetry logged by field PDAs
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const pendingTables = {
      equipment: false,
      transactions: false,
      devices: false,
    };

    const unsubscribe = subscribeToCloudChanges((table, eventType) => {
      // Avoid clobbering user input when an asset creation or edit modal is active
      if (isCreateModalOpen || Boolean(editingAsset) || isRegisterDeviceModalOpen) return;

      if (table === 'equipment_list') pendingTables.equipment = true;
      if (table === 'transactions') pendingTables.transactions = true;
      if (table === 'authorized_devices') pendingTables.devices = true;

      console.log(`[Realtime Sync] ${table} event (${eventType}) from field PDA - refreshing changed table(s)`);
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
    });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribe();
    };
  }, [loadFleetData, isCreateModalOpen, editingAsset, isRegisterDeviceModalOpen]);

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
    const nowIso = new Date().toISOString().replace('T', ' ').substring(0, 19);

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
  const handleSaveDevice = async (device: AuthorizedDevice) => {
    try {
      await postRemoteAuthorizedDevice(device);
      await loadFleetData(true, { equipment: false, transactions: false, devices: true });
      showToast(`Device "${device.deviceId}" authorized successfully!`, 'success');
    } catch (err: unknown) {
      const msg = formatErrorMessage(err);
      showToast(`Failed to save device: ${msg}`, 'error');
      throw err;
    }
  };

  const handleUpdateDeviceStatus = async (deviceId: string, status: DeviceStatus) => {
    try {
      await updateRemoteDeviceStatus(deviceId, status);
      await loadFleetData(true, { equipment: false, transactions: false, devices: true });
      showToast(`Device "${deviceId}" status updated to ${status}.`, 'success');
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
      <div className="admin-shell">
        {/* Full-Width Orange Top Navigation Menu */}
        <AdminTopNav
          isSupabaseOnline={isSupabaseOnline}
          isRefreshing={isRefreshing}
          onRefresh={() => loadFleetData()}
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
            <span>Equipment</span>
            <span className="admin-nav-tab-badge">{assets.length}</span>
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
            <span>PDAs</span>
            <span className="admin-nav-tab-badge">
              {devices.filter((d) => d.status === 'active').length}
            </span>
          </button>
        </div>

        {/* Main Content Viewport spanning full width */}
        <div className="admin-main-wrap">
          <main style={{ flex: 1, minWidth: 0, width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
            {currentView === 'ASSETS' && (
              <AssetsView
                assets={assets}
                transactions={transactions}
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
                onOpenRegisterModal={(dev) => {
                  setRegisteringDevice(dev || null);
                  setIsRegisterDeviceModalOpen(true);
                }}
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

        {/* Transaction Detail Inspector Modal */}
        {inspectingTransaction && (
          <TransactionDetailModal
            transaction={inspectingTransaction}
            asset={assets.find((a) => a.equipmentId === inspectingTransaction.equipmentId)}
            isOpen={Boolean(inspectingTransaction)}
            onClose={() => setInspectingTransaction(null)}
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

        {/* Device Registration & QR Code Modal */}
        {isRegisterDeviceModalOpen && (
          <RegisterDeviceModal
            isOpen={isRegisterDeviceModalOpen}
            existingDevice={registeringDevice}
            onClose={() => {
              setIsRegisterDeviceModalOpen(false);
              setRegisteringDevice(null);
            }}
            onSaveDevice={handleSaveDevice}
          />
        )}

        {/* Danger Zone Modal */}
        {isDangerZoneOpen && (
          <DangerZoneModal
            isOpen={isDangerZoneOpen}
            onClose={() => setIsDangerZoneOpen(false)}
            onDeleteAll={handleDeleteAllRecords}
            onBulkUpload={handleBulkUploadEquipment}
          />
        )}

        {/* Toast Alerts */}
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </div>
    </LaptopOnlyGuard>
  );
};

export default AdminApp;
