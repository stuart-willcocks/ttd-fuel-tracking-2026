import React, { useState, useEffect, useCallback } from 'react';
import './admin.css';
import { LaptopOnlyGuard } from './components/LaptopOnlyGuard';
import { AdminTopNav, type AdminViewType } from './components/AdminTopNav';
import { AssetsView } from './views/AssetsView';
import { TransactionsView } from './views/TransactionsView';
import { SettingsView } from './views/SettingsView';
import { AssetFormModal } from './components/AssetFormModal';
import { DeleteAssetModal } from './components/DeleteAssetModal';
import { AssetQRLabelModal } from './components/AssetQRLabelModal';
import { TransactionDetailModal } from './components/TransactionDetailModal';
import { ToastContainer, type ToastMessage } from './components/Toast';

import type { Equipment, Transaction } from '../types';
import {
  fetchRemoteEquipment,
  postRemoteEquipment,
  deleteRemoteEquipment,
  fetchRemoteTransactions,
  postRemoteTransaction,
  deleteRemoteTransaction,
  resetRemoteData,
} from '../services/api';
import { isSupabaseConfigured, subscribeToCloudChanges } from '../services/supabase';
import { getGeneratorPowerState, reconcileEquipmentPowerStates } from '../utils/powerState';

export const AdminApp: React.FC = () => {
  const [currentView, setCurrentView] = useState<AdminViewType>('ASSETS');
  const [assets, setAssets] = useState<Equipment[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSupabaseOnline, setIsSupabaseOnline] = useState(false);

  // Modals & Drawers state
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Equipment | null>(null);
  const [assetPendingDelete, setAssetPendingDelete] = useState<Equipment | null>(null);
  const [qrAsset, setQrAsset] = useState<Equipment | null>(null);
  const [inspectingTransaction, setInspectingTransaction] = useState<Transaction | null>(null);

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

  // Fetch initial data
  const loadFleetData = useCallback(async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      const [fetchedAssets, fetchedTxs] = await Promise.all([
        fetchRemoteEquipment(),
        fetchRemoteTransactions(),
      ]);

      // Power state of any generator is determined by its most recent power transaction (OFF by default)
      const reconciledAssets = reconcileEquipmentPowerStates(fetchedAssets, fetchedTxs);
      setAssets(reconciledAssets);
      setTransactions(fetchedTxs);
      setIsSupabaseOnline(isSupabaseConfigured());
    } catch (err: unknown) {
      console.error('Failed to load fleet data:', err);
      const msg = err instanceof Error ? err.message : String(err);
      if (!silent) showToast(`Data sync warning: ${msg}`, 'error');
    } finally {
      if (!silent) setIsRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    document.body.classList.add('admin-body');
    loadFleetData();

    // Auto-refresh interval every 30 seconds for live operations (pauses if editing modal is open)
    const interval = setInterval(() => {
      if (isCreateModalOpen || Boolean(editingAsset)) return;
      loadFleetData(true);
    }, 30000);

    return () => {
      document.body.classList.remove('admin-body');
      clearInterval(interval);
    };
  }, [loadFleetData, isCreateModalOpen, editingAsset]);

  // Real-time listener for database transactions and telemetry logged by field PDAs
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeToCloudChanges((table, eventType) => {
      // Avoid clobbering user input when an asset creation or edit modal is active
      if (isCreateModalOpen || Boolean(editingAsset)) return;

      console.log(`[Realtime Sync] ${table} event (${eventType}) from field PDA - refreshing`);
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadFleetData(true);
      }, 300);
    });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribe();
    };
  }, [loadFleetData, isCreateModalOpen, editingAsset]);

  // Create / Update Asset Handler
  const handleSaveAsset = async (savedAsset: Equipment) => {
    try {
      await postRemoteEquipment(savedAsset);
      await loadFleetData(true);
      showToast(`Asset "${savedAsset.equipmentId}" saved successfully!`, 'success');
      setEditingAsset(null);
      setIsCreateModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Failed to save asset: ${msg}`, 'error');
      throw err;
    }
  };

  // Delete Asset Handler
  const handleDeleteAsset = async (equipmentId: string) => {
    try {
      await deleteRemoteEquipment(equipmentId);
      await loadFleetData(true);
      showToast(`Asset "${equipmentId}" decommissioned and removed.`, 'success');
      setAssetPendingDelete(null);
      if (selectedAssetId === equipmentId) {
        setSelectedAssetId(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Failed to delete asset: ${msg}`, 'error');
      throw err;
    }
  };

  // Delete Transaction Handler (reconciles generator power state automatically)
  const handleDeleteTransaction = async (transactionId: string) => {
    try {
      await deleteRemoteTransaction(transactionId);
      await loadFleetData(true);
      showToast('Transaction deleted. Generator power states recalculated.', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
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
      await loadFleetData(true);
      showToast(
        `${asset.equipmentId} is now ${isRunning ? 'OFF' : 'ON'}`,
        'success'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Failed to toggle power state: ${msg}`, 'error');
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
        const msg = err instanceof Error ? err.message : String(err);
        showToast(`Failed to reset data: ${msg}`, 'error');
      }
    }
  };


  return (
    <LaptopOnlyGuard>
      <div className="admin-shell">
        {/* Full-Width Orange Top Navigation Menu */}
        <AdminTopNav
          currentView={currentView}
          onSelectView={(view) => {
            if (view === 'TRANSACTIONS') {
              setSelectedAssetId(null);
            }
            setCurrentView(view);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          assetCount={assets.length}
          transactionCount={transactions.length}
          isSupabaseOnline={isSupabaseOnline}
          isRefreshing={isRefreshing}
          onRefresh={() => loadFleetData()}
        />

        {/* Main Content Viewport spanning full width */}
        <div className="admin-main-wrap">
          <main style={{ flex: 1 }}>
            {currentView === 'ASSETS' && (
              <AssetsView
                assets={assets}
                transactions={transactions}
                onOpenCreateModal={() => setIsCreateModalOpen(true)}
                onOpenEditModal={(asset) => setEditingAsset(asset)}
                onOpenDeleteModal={(asset) => setAssetPendingDelete(asset)}
                onOpenQRModal={(asset) => setQrAsset(asset)}
                onSelectAsset={(id) => {
                  setSelectedAssetId(id);
                  setCurrentView('TRANSACTIONS');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                onTogglePower={handleTogglePower}
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
                onBackToAssets={() => {
                  setSelectedAssetId(null);
                  setCurrentView('ASSETS');
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

        {/* Toast Alerts */}
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </div>
    </LaptopOnlyGuard>
  );
};

export default AdminApp;
