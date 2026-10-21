import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db, initializeDatabase } from './db/indexedDB';
import { syncEngine, type SyncState } from './services/syncEngine';
import { type Equipment, type Transaction, type ActionType, generateUUID } from './types';
import { BUILD_NUMBER } from './version';
import { Header } from './components/Header';
import { ScannerView } from './components/ScannerView';
import { AssetDetailView } from './components/AssetDetailView';
import { SplashScreen } from './components/SplashScreen';
import { TransactionForm } from './components/TransactionForm';
import { ConfirmationModal } from './components/ConfirmationModal';
import { EditAssetModal } from './components/EditAssetModal';
import { OutboxModal } from './components/OutboxModal';
import { SettingsModal } from './components/SettingsModal';
import { getDeviceName } from './services/device';

export type AppView = 'SPLASH_SCREEN' | 'SCAN_SCREEN' | 'ASSET_DETAIL_VIEW';

export const App: React.FC = () => {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => {
    return Boolean(
      document.fullscreenElement ||
      (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement
    );
  });

  const toggleFullscreen = useCallback(async () => {
    try {
      const doc = document as unknown as {
        fullscreenElement?: Element;
        webkitFullscreenElement?: Element;
        exitFullscreen?: () => Promise<void>;
        webkitExitFullscreen?: () => Promise<void>;
      };
      const docEl = document.documentElement as unknown as {
        requestFullscreen?: () => Promise<void>;
        webkitRequestFullscreen?: () => Promise<void>;
      };

      const isFs = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);

      if (!isFs) {
        if (docEl.requestFullscreen) {
          await docEl.requestFullscreen();
        } else if (docEl.webkitRequestFullscreen) {
          await docEl.webkitRequestFullscreen();
        }
      } else {
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        }
      }
    } catch (err) {
      console.warn('Fullscreen toggle failed:', err);
    }
  }, []);

  useEffect(() => {
    const handleFsChange = () => {
      const doc = document as unknown as {
        fullscreenElement?: Element;
        webkitFullscreenElement?: Element;
      };
      setIsFullscreen(Boolean(doc.fullscreenElement || doc.webkitFullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);

    const handleFirstGesture = () => {
      const doc = document as unknown as {
        fullscreenElement?: Element;
        webkitFullscreenElement?: Element;
      };
      if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
        const docEl = document.documentElement as unknown as {
          requestFullscreen?: () => Promise<void>;
          webkitRequestFullscreen?: () => Promise<void>;
        };
        if (docEl.requestFullscreen) {
          docEl.requestFullscreen().catch(() => {});
        } else if (docEl.webkitRequestFullscreen) {
          docEl.webkitRequestFullscreen().catch(() => {});
        }
      }
    };

    window.addEventListener('click', handleFirstGesture, { once: true });
    window.addEventListener('touchend', handleFirstGesture, { once: true });

    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
      window.removeEventListener('click', handleFirstGesture);
      window.removeEventListener('touchend', handleFirstGesture);
    };
  }, []);

  const [activeAssetId, setActiveAssetId] = useState<string | null>(null);
  const activeAssetIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeAssetIdRef.current = activeAssetId;
  }, [activeAssetId]);

  const [currentView, setCurrentView] = useState<AppView>(() => {
    try {
      const saved = sessionStorage.getItem('ttd_initial_view');
      if (saved === 'SCAN_SCREEN' || saved === 'ASSET_DETAIL_VIEW') {
        sessionStorage.removeItem('ttd_initial_view');
        return saved as AppView;
      }
    } catch {
      // Ignore sessionStorage access errors
    }
    return 'SPLASH_SCREEN';
  });
  const [activeAction, setActiveAction] = useState<ActionType | null>(null);
  const [isEditingAsset, setIsEditingAsset] = useState<boolean>(false);

  const [pendingTxData, setPendingTxData] = useState<Partial<Transaction> | null>(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isOutboxModalOpen, setIsOutboxModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  const [availableAssets, setAvailableAssets] = useState<Equipment[]>([]);
  const [currentAsset, setCurrentAsset] = useState<Equipment | null>(null);
  const [currentAssetTransactions, setCurrentAssetTransactions] = useState<Transaction[]>([]);

  const [syncState, setSyncState] = useState<SyncState>({
    isOnline: true,
    isSimulatedOffline: false,
    isSyncing: false,
    pendingCount: 0,
    lastSyncTime: null,
    lastError: null,
  });

  // App Update Polling State
  const [hasUpdate, setHasUpdate] = useState<boolean>(false);
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);

  const checkForAppUpdate = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`/version.json?t=${Date.now()}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const remoteData = await res.json();
        const remoteBuild = Number(remoteData.build);
        if (remoteBuild && remoteBuild > BUILD_NUMBER) {
          const remoteVer = String(remoteData.version || remoteData.build);
          setAvailableVersion(remoteVer);
          setHasUpdate(true);
          return;
        }
      }
    } catch {
      // Offline / network failure
    }

    // Check service worker for waiting updates
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.update();
          if (reg.waiting || reg.installing) {
            setHasUpdate(true);
            setAvailableVersion((prev) => prev || String(BUILD_NUMBER + 1));
          }
        }
      } catch {
        // Ignore SW check error
      }
    }
  }, []);

  useEffect(() => {
    checkForAppUpdate();
    const interval = setInterval(checkForAppUpdate, 15000);
    return () => clearInterval(interval);
  }, [checkForAppUpdate]);

  const getLocalFormattedTimestamp = (): string => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  const refreshAssetsList = useCallback(async () => {
    const all = await db.equipments.toArray();
    setAvailableAssets(all);
  }, []);

  const loadAssetDetails = useCallback(async (equipmentId: string) => {
    let asset = await db.equipments.get(equipmentId);

    if (!asset) {
      const altId = equipmentId.includes('-')
        ? equipmentId.replace(/-/g, '_')
        : equipmentId.replace(/_/g, '-');
      const altAsset = await db.equipments.get(altId);
      if (altAsset) {
        asset = altAsset;
      }
    }

    if (!asset) {
      const isTank = equipmentId.includes('TNK') || equipmentId.includes('TANK');
      const isPlant = equipmentId.includes('PLT') || equipmentId.includes('PLANT');
      const inferredType = isTank ? 'TANK' : isPlant ? 'PLANT' : 'GENERATOR';

      asset = {
        equipmentId,
        area: 'Site Area',
        location: 'Field Grid',
        what3words: '///field.power.setup',
        type: inferredType,
        capacity: inferredType === 'GENERATOR' ? 100 : inferredType === 'TANK' ? 2500 : undefined,
        rentalSerialNumber: `RSN-${Math.floor(10000 + Math.random() * 90000)}`,
      };
      await db.equipments.put(asset);
      await refreshAssetsList();
    }

    setCurrentAsset(asset);

    const txs = await db.transactions
      .where('equipmentId')
      .equals(asset.equipmentId)
      .reverse()
      .sortBy('transactionTimestamp');
    setCurrentAssetTransactions(txs);
    return asset;
  }, [refreshAssetsList]);

  // Boot & synchronization listeners
  useEffect(() => {
    const init = async () => {
      await initializeDatabase();
      await refreshAssetsList();
      await syncEngine.syncWithRemote();
    };
    init();

    const unsubState = syncEngine.subscribe((state) => {
      setSyncState(state);
    });

    const unsubData = syncEngine.onRemoteDataUpdated(async () => {
      await refreshAssetsList();
      if (activeAssetIdRef.current) {
        await loadAssetDetails(activeAssetIdRef.current);
      }
    });

    return () => {
      unsubState();
      unsubData();
    };
  }, [refreshAssetsList, loadAssetDetails]);

  const handleAssetScannedOrSelected = async (equipmentId: string) => {
    setActiveAssetId(equipmentId);
    setActiveAction(null);
    await loadAssetDetails(equipmentId);
    setCurrentView('ASSET_DETAIL_VIEW');
  };

  const handleBackToScanner = () => {
    setActiveAssetId(null);
    setCurrentAsset(null);
    setCurrentAssetTransactions([]);
    setActiveAction(null);
    setCurrentView('SCAN_SCREEN');
  };

  const handleFormSubmitValues = (data: Partial<Transaction>) => {
    setPendingTxData(data);
    setIsConfirmModalOpen(true);
  };

  const handleConfirmTransaction = async () => {
    if (!currentAsset || !pendingTxData) return;

    const newTx: Transaction = {
      id: generateUUID(),
      equipmentId: currentAsset.equipmentId,
      transactionTimestamp: getLocalFormattedTimestamp(),
      transactionType: pendingTxData.transactionType!,
      checkInFuelEighths: pendingTxData.checkInFuelEighths,
      checkOutFuelEighths: pendingTxData.checkOutFuelEighths,
      checkInFuelPercentage: pendingTxData.checkInFuelPercentage,
      checkOutFuelPercentage: pendingTxData.checkOutFuelPercentage,
      checkInDefPercentage: pendingTxData.checkInDefPercentage,
      checkOutDefPercentage: pendingTxData.checkOutDefPercentage,
      fuelTransferLitres: pendingTxData.fuelTransferLitres,
      defTransferLitres: pendingTxData.defTransferLitres,
      checkInKWH: pendingTxData.checkInKWH,
      checkOutKWH: pendingTxData.checkOutKWH,
      syncStatus: 'pending',
      deviceId: getDeviceName(),
      createdAt: new Date().toISOString(),
    };

    // Store in IndexedDB and upload to shared central server
    await syncEngine.queueTransaction(newTx);
    if (syncEngine.isEffectivelyOnline()) {
      await syncEngine.flushOutbox();
    }

    setIsConfirmModalOpen(false);
    setPendingTxData(null);
    setActiveAction(null);

    await loadAssetDetails(currentAsset.equipmentId);
  };

  const handleSaveEditedAsset = async (updated: Equipment) => {
    await db.equipments.put(updated);
    setCurrentAsset(updated);
    setIsEditingAsset(false);
    await refreshAssetsList();
    await syncEngine.syncWithRemote();
  };

  // 1. SPLASH SCREEN
  if (currentView === 'SPLASH_SCREEN') {
    return (
      <div className="app-root splash-screen-root">
        <SplashScreen onContinue={() => setCurrentView('SCAN_SCREEN')} />
      </div>
    );
  }

  // 2. MAIN APP CONTAINER (SCAN_SCREEN or ASSET_DETAIL_VIEW)
  return (
    <div className="app-root">
      <Header
        syncState={syncState}
        isFullscreen={isFullscreen}
        hasUpdate={hasUpdate}
        onToggleSimulatedOffline={() => syncEngine.toggleSimulatedOffline()}
        onTriggerSync={() => syncEngine.syncWithRemote()}
        onToggleFullscreen={toggleFullscreen}
        onOpenOutbox={() => setIsOutboxModalOpen(true)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onShowSplash={() => setCurrentView('SPLASH_SCREEN')}
      />

      <main className="app-main">
        {currentView === 'SCAN_SCREEN' ? (
          <ScannerView
            availableAssets={availableAssets}
            onAssetSelected={handleAssetScannedOrSelected}
            isAnyModalOpen={
              isSettingsModalOpen ||
              isOutboxModalOpen ||
              isConfirmModalOpen ||
              isEditingAsset
            }
          />
        ) : (
          /* ASSET_DETAIL_VIEW */
          currentAsset && (
            !activeAction ? (
              <AssetDetailView
                asset={currentAsset}
                transactions={currentAssetTransactions}
                onSelectAction={(action) => setActiveAction(action)}
                onBack={handleBackToScanner}
              />
            ) : (
              <TransactionForm
                asset={currentAsset}
                action={activeAction}
                onCancel={() => setActiveAction(null)}
                onSubmitValues={handleFormSubmitValues}
              />
            )
          )
        )}
      </main>

      {/* Confirmation Modal */}
      {currentAsset && pendingTxData && (
        <ConfirmationModal
          asset={currentAsset}
          transactionData={pendingTxData}
          isOpen={isConfirmModalOpen}
          onCancel={() => setIsConfirmModalOpen(false)}
          onConfirm={handleConfirmTransaction}
        />
      )}

      {/* Edit Equipment Modal */}
      {currentAsset && (
        <EditAssetModal
          asset={currentAsset}
          isOpen={isEditingAsset}
          onClose={() => setIsEditingAsset(false)}
          onSave={handleSaveEditedAsset}
        />
      )}

      {/* Offline Outbox Modal */}
      <OutboxModal
        isOpen={isOutboxModalOpen}
        onClose={() => setIsOutboxModalOpen(false)}
        syncState={syncState}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        hasUpdate={hasUpdate}
        availableVersion={availableVersion}
        onUpdate={() => {
          setIsSettingsModalOpen(false);
          setCurrentView('SPLASH_SCREEN');
        }}
      />
    </div>
  );
};

export default App;
