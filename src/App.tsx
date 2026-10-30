import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db, initializeDatabase } from './db/indexedDB';
import { syncEngine, type SyncState } from './services/syncEngine';
import { type Equipment, type Transaction, type ActionType, generateUUID } from './types';
import { checkRemoteAppVersion, performAppUpdate } from './services/appUpdate';
import { Header } from './components/Header';
import { ScannerView } from './components/ScannerView';
import { AssetDetailView } from './components/AssetDetailView';
import { SplashScreen } from './components/SplashScreen';
import { TransactionForm } from './components/TransactionForm';
import { ConfirmationModal } from './components/ConfirmationModal';
import { EditAssetModal } from './components/EditAssetModal';
import { OutboxModal } from './components/OutboxModal';
import { SettingsModal } from './components/SettingsModal';
import { PowerEventModal } from './components/PowerEventModal';
import { getDeviceName, isDeviceEnrolled, getDeviceId, onDeviceAuthBroadcast } from './services/device';
import { startTelemetryMonitoring } from './services/telemetry';
import { DeviceEnrollmentView } from './components/DeviceEnrollmentView';
import { Smartphone, ExternalLink } from 'lucide-react';
import { DesktopLaunchpad } from './components/DesktopLaunchpad';
import { isMobileDevice, isDesktopOrSurface } from './utils/deviceDetector';
import { resolveEquipmentCoordinates } from './services/what3words';
import { postRemoteEquipment } from './services/api';

export type AppView = 'SPLASH_SCREEN' | 'SCAN_SCREEN' | 'ASSET_DETAIL_VIEW';

export const App: React.FC = () => {
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    return isDesktopOrSurface();
  });

  // Check if this window is the dedicated detached PDA popup
  const [isDetachedWindow] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.name === 'TTD_PDA_WINDOW' ||
      new URLSearchParams(window.location.search).get('pda_window') === '1'
    );
  });

  const [stayInTab, setStayInTab] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return sessionStorage.getItem('ttd_stay_in_tab') === '1';
    } catch {
      return false;
    }
  });

  const [popupState, setPopupState] = useState<'launched' | 'blocked' | 'idle'>(() => {
    if (typeof window === 'undefined') return 'idle';
    const anyWindow = window as unknown as { __TTD_POPUP_LAUNCHED__?: boolean };
    return anyWindow.__TTD_POPUP_LAUNCHED__ ? 'launched' : 'idle';
  });

  const openDetachedWindow = useCallback(() => {
    if (typeof window === 'undefined') return;
    const pdaUrl = new URL(window.location.href);
    pdaUrl.searchParams.set('pda_window', '1');
    try {
      const pop = window.open(
        pdaUrl.toString(),
        'TTD_PDA_WINDOW',
        'width=430,height=800,menubar=no,toolbar=no,location=no,status=no,resizable=no,scrollbars=no'
      );
      if (pop && !pop.closed) {
        setPopupState('launched');
        pop.focus?.();
      } else {
        setPopupState('blocked');
      }
    } catch {
      setPopupState('blocked');
    }
  }, []);

  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const toggleFullscreen = useCallback(async () => {
    // NEVER make browser fullscreen on desktop workstations
    if (!isMobileDevice()) return;

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
    // If running on a desktop browser, ensure we NEVER enter fullscreen mode
    if (!isMobileDevice()) {
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
      return;
    }

    // On mobile/PDA, ensure we exit any HTML5 fullscreen mode to prevent Android's
    // intrusive "To exit full screen, swipe down..." system prompt from covering "Choose from list".
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }

    const handleFsChange = () => {
      const doc = document as unknown as {
        fullscreenElement?: Element;
        webkitFullscreenElement?: Element;
      };
      setIsFullscreen(Boolean(doc.fullscreenElement || doc.webkitFullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  // Detect desktop browser to constrain UI to PDA screen display and lock window dimensions
  useEffect(() => {
    const isMobile = isMobileDevice();
    const isDesk = !isMobile;
    setIsDesktop(isDesk);

    if (isDesk) {
      document.documentElement.classList.add('is-desktop-browser');
      // Ensure browser never stays in fullscreen on desktop
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
    } else {
      document.documentElement.classList.remove('is-desktop-browser');
      return;
    }

    const LOCK_WIDTH = 430;
    const LOCK_HEIGHT = 800;

    const getLockedDimensions = () => {
      const chromeW = (window.outerWidth && window.innerWidth && window.outerWidth > window.innerWidth)
        ? (window.outerWidth - window.innerWidth)
        : 16;
      const chromeH = (window.outerHeight && window.innerHeight && window.outerHeight > window.innerHeight)
        ? (window.outerHeight - window.innerHeight)
        : 60;
      return {
        targetW: Math.max(LOCK_WIDTH, 410 + chromeW),
        targetH: Math.max(LOCK_HEIGHT, 720 + chromeH),
      };
    };

    // Attempt initial resize to locked dimensions
    try {
      const { targetW, targetH } = getLockedDimensions();
      window.resizeTo(targetW, targetH);
    } catch {
      // Normal security restriction on primary tabs
    }

    // Actively snap window dimensions back if resized by user (supported in popup windows)
    let lockTimer: ReturnType<typeof setTimeout> | null = null;
    const handleResize = () => {
      const isStillDesk = !isMobileDevice();
      setIsDesktop(isStillDesk);
      if (!isStillDesk) return;

      if (lockTimer) clearTimeout(lockTimer);
      lockTimer = setTimeout(() => {
        try {
          const { targetW, targetH } = getLockedDimensions();
          if (Math.abs(window.outerWidth - targetW) > 6 || Math.abs(window.outerHeight - targetH) > 6) {
            window.resizeTo(targetW, targetH);
          }
        } catch {
          // Normal security restriction on primary tabs
        }
      }, 80);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      if (lockTimer) clearTimeout(lockTimer);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // On desktop workstations in a normal browser tab, attempt to launch detached window automatically
  useEffect(() => {
    if (!isDesktop || isDetachedWindow || stayInTab) return;
    if (popupState === 'idle') {
      openDetachedWindow();
    }
  }, [isDesktop, isDetachedWindow, stayInTab, popupState, openDetachedWindow]);

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
  const [powerModalType, setPowerModalType] = useState<'PoweredUp' | 'PoweredDown' | null>(null);

  const [availableAssets, setAvailableAssets] = useState<Equipment[]>([]);
  const [currentAsset, setCurrentAsset] = useState<Equipment | null>(null);
  const [currentAssetTransactions, setCurrentAssetTransactions] = useState<Transaction[]>([]);

  const [isEnrolled, setIsEnrolled] = useState<boolean>(() => isDeviceEnrolled());

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
    if (typeof document !== 'undefined' && document.hidden) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    const res = await checkRemoteAppVersion();
    if (res.hasUpdate) {
      setHasUpdate(true);
      if (res.remoteVersion) {
        setAvailableVersion(res.remoteVersion);
      }
    }
  }, []);

  useEffect(() => {
    checkForAppUpdate();
    // Poll every 5 minutes and on visibility/online events to minimize Vercel CDN requests
    const interval = setInterval(checkForAppUpdate, 300000);
    const handleVisibilityOrOnline = () => {
      if (!document.hidden && navigator.onLine) {
        checkForAppUpdate();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityOrOnline);
    window.addEventListener('online', handleVisibilityOrOnline);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityOrOnline);
      window.removeEventListener('online', handleVisibilityOrOnline);
    };
  }, [checkForAppUpdate]);

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

    let txs: Transaction[] = [];
    try {
      txs = await db.transactions
        .where('[equipmentId+transactionTimestamp]')
        .between([asset.equipmentId, ''], [asset.equipmentId, '\uffff'])
        .reverse()
        .toArray();
    } catch {
      txs = await db.transactions
        .where('equipmentId')
        .equals(asset.equipmentId)
        .reverse()
        .sortBy('transactionTimestamp');
    }
    setCurrentAssetTransactions(txs);
    return asset;
  }, [refreshAssetsList]);

  const isLaunchpadOnly = isDesktop && !isDetachedWindow && !stayInTab;

  // Automatic low-power battery & location telemetry tracking for enrolled PDAs
  useEffect(() => {
    if (isEnrolled && !isLaunchpadOnly) {
      const stop = startTelemetryMonitoring();
      return () => stop();
    }
  }, [isEnrolled, isLaunchpadOnly]);

  // Boot & synchronization listeners
  useEffect(() => {
    if (isLaunchpadOnly) return;
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

    const unsubRevoke = syncEngine.onDeviceRevoked(() => {
      setIsEnrolled(false);
      setActiveAssetId(null);
      setCurrentAsset(null);
      setCurrentAssetTransactions([]);
      setCurrentView('SPLASH_SCREEN');
    });

    // Instant cross-tab/window event listener
    const unsubBroadcast = onDeviceAuthBroadcast((event) => {
      const myId = getDeviceId();
      if (event.deviceId && myId && event.deviceId.toUpperCase() === myId.toUpperCase()) {
        if (event.status !== 'active') {
          syncEngine.lockdownRevokedDevice();
        }
      }
    });

    const handleStorageChange = (e: StorageEvent) => {
      if (
        e.key === 'ttd_pda_device_status' ||
        e.key === 'ttd_pda_device_token' ||
        e.key === 'ttd_mock_authorized_devices'
      ) {
        if (!isDeviceEnrolled()) {
          setIsEnrolled(false);
        } else {
          syncEngine.verifyDeviceAuthorization();
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);

    const handleVisibility = () => {
      if (!document.hidden) {
        if (!isDeviceEnrolled()) {
          setIsEnrolled(false);
        } else {
          syncEngine.verifyDeviceAuthorization();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    return () => {
      unsubState();
      unsubData();
      unsubRevoke();
      unsubBroadcast();
      window.removeEventListener('storage', handleStorageChange);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
    };
  }, [refreshAssetsList, loadAssetDetails, isLaunchpadOnly]);

  const handleAssetScannedOrSelected = async (equipmentId: string) => {
    if (!isDeviceEnrolled()) {
      setIsEnrolled(false);
      return;
    }
    syncEngine.verifyDeviceAuthorization().then((ok) => {
      if (!ok) setIsEnrolled(false);
    });
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

  const handleFormSubmitValues = async (data: Partial<Transaction>) => {
    if (!isDeviceEnrolled()) {
      setIsEnrolled(false);
      return;
    }
    syncEngine.verifyDeviceAuthorization().then((ok) => {
      if (!ok) setIsEnrolled(false);
    });
    setPendingTxData(data);
    setIsConfirmModalOpen(true);
  };

  const handleConfirmTransaction = async () => {
    if (!isDeviceEnrolled()) {
      setIsEnrolled(false);
      return;
    }
    syncEngine.verifyDeviceAuthorization().then((ok) => {
      if (!ok) setIsEnrolled(false);
    });
    if (!currentAsset || !pendingTxData) return;

    const nowIso = new Date().toISOString();
    const newTx: Transaction = {
      id: generateUUID(),
      equipmentId: currentAsset.equipmentId,
      transactionTimestamp: nowIso,
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
      createdAt: nowIso,
    };

    // Store in IndexedDB immediately for instant offline-first responsiveness
    await syncEngine.queueTransaction(newTx);

    // Close modal and update view immediately (< 15ms)
    setIsConfirmModalOpen(false);
    setPendingTxData(null);
    setActiveAction(null);

    await loadAssetDetails(currentAsset.equipmentId);

    // Drain outbox in the background without freezing the UI
    if (syncEngine.isEffectivelyOnline()) {
      syncEngine.flushOutbox().catch((err) => {
        console.warn('Background outbox flush error:', err);
      });
    }
  };

  const handleSelectAction = (action: ActionType) => {
    if (action === 'power-up') {
      setPowerModalType('PoweredUp');
    } else if (action === 'power-down') {
      setPowerModalType('PoweredDown');
    } else {
      setActiveAction(action);
    }
  };

  const handleConfirmPowerEvent = async (timestamp: string) => {
    if (!isDeviceEnrolled()) {
      setIsEnrolled(false);
      return;
    }
    syncEngine.verifyDeviceAuthorization().then((ok) => {
      if (!ok) setIsEnrolled(false);
    });
    if (!currentAsset || !powerModalType) return;

    const nowIso = new Date().toISOString();
    const newTx: Transaction = {
      id: generateUUID(),
      equipmentId: currentAsset.equipmentId,
      transactionTimestamp: timestamp,
      transactionType: powerModalType,
      syncStatus: 'pending',
      deviceId: getDeviceName(),
      createdAt: nowIso,
    };

    // Store in IndexedDB and close modal immediately
    await syncEngine.queueTransaction(newTx);
    setPowerModalType(null);
    await loadAssetDetails(currentAsset.equipmentId);

    // Drain outbox in the background
    if (syncEngine.isEffectivelyOnline()) {
      syncEngine.flushOutbox().catch((err) => {
        console.warn('Background outbox flush error:', err);
      });
    }
  };

  const handleSaveEditedAsset = async (updated: Equipment) => {
    const isAuth = await syncEngine.verifyDeviceAuthorization();
    if (!isAuth) {
      setIsEnrolled(false);
      return;
    }
    const resolved = await resolveEquipmentCoordinates(updated, currentAsset?.what3words);
    await db.equipments.put(resolved);
    setCurrentAsset(resolved);
    setIsEditingAsset(false);
    await refreshAssetsList();
    await postRemoteEquipment(resolved).catch(() => {});
  };

  const handleUpdateTransaction = async (updatedTx: Transaction) => {
    const isAuth = await syncEngine.verifyDeviceAuthorization();
    if (!isAuth) {
      setIsEnrolled(false);
      return;
    }
    try {
      await syncEngine.updateTransaction(updatedTx);
      if (currentAsset) {
        await loadAssetDetails(currentAsset.equipmentId);
      }
    } catch (err) {
      console.error('Error updating transaction:', err);
    }
  };

  const handleDeleteTransaction = async (transactionId: string) => {
    const isAuth = await syncEngine.verifyDeviceAuthorization();
    if (!isAuth) {
      setIsEnrolled(false);
      return;
    }
    try {
      await syncEngine.deleteTransaction(transactionId);
      if (currentAsset) {
        await loadAssetDetails(currentAsset.equipmentId);
      }
    } catch (err) {
      console.error('Error deleting transaction:', err);
    }
  };

  const renderDesktopToolbar = () => {
    if (!isDesktop) return null;
    return (
      <div className="desktop-pda-toolbar">
        <span className="desktop-pda-badge">
          <Smartphone size={13} />
          <span>Zebra TC26 Display Locked (360 × 640)</span>
        </span>
        {!isDetachedWindow ? (
          <button
            type="button"
            className="desktop-pda-popout-btn"
            onClick={openDetachedWindow}
            title="Open in dedicated locked PDA window"
          >
            <ExternalLink size={12} />
            <span>Open in Locked PDA Window</span>
          </button>
        ) : (
          <a
            href="/admin.html"
            target="_blank"
            rel="noreferrer"
            className="desktop-pda-popout-btn"
            title="Open Fleet Admin Portal in new tab"
          >
            <ExternalLink size={12} />
            <span>Admin Portal</span>
          </a>
        )}
      </div>
    );
  };

  // If viewing on desktop workstation in standard browser tab and not detached or opted to stay, show launchpad
  if (isDesktop && !isDetachedWindow && !stayInTab) {
    return (
      <DesktopLaunchpad
        popupState={popupState}
        onLaunch={openDetachedWindow}
        onContinueInTab={() => {
          try {
            sessionStorage.setItem('ttd_stay_in_tab', '1');
          } catch {}
          setStayInTab(true);
        }}
      />
    );
  }

  // 0. DEVICE ENROLLMENT LOCK SCREEN (If scanner has no active token)
  if (!isEnrolled) {
    const enrollContent = (
      <DeviceEnrollmentView
        onEnrolled={async () => {
          setIsEnrolled(true);
          await refreshAssetsList();
          await syncEngine.syncWithRemote();
        }}
      />
    );

    return isDesktop ? (
      <div className="desktop-pda-frame">
        {renderDesktopToolbar()}
        {enrollContent}
      </div>
    ) : (
      enrollContent
    );
  }

  // 1. SPLASH SCREEN
  if (currentView === 'SPLASH_SCREEN') {
    const splashContent = (
      <div className="app-root splash-screen-root">
        <SplashScreen onContinue={() => setCurrentView('SCAN_SCREEN')} />
      </div>
    );

    return isDesktop ? (
      <div className="desktop-pda-frame">
        {renderDesktopToolbar()}
        {splashContent}
      </div>
    ) : (
      splashContent
    );
  }

  // 2. MAIN APP CONTAINER (SCAN_SCREEN or ASSET_DETAIL_VIEW)
  const mainContent = (
    <div className="app-root">
      <Header
        syncState={syncState}
        isFullscreen={isFullscreen}
        hasUpdate={hasUpdate}
        availableVersion={availableVersion}
        onToggleSimulatedOffline={() => syncEngine.toggleSimulatedOffline()}
        onTriggerSync={() => syncEngine.syncWithRemote()}
        onToggleFullscreen={toggleFullscreen}
        onOpenOutbox={() => setIsOutboxModalOpen(true)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
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
              isEditingAsset ||
              Boolean(powerModalType)
            }
          />
        ) : (
          /* ASSET_DETAIL_VIEW */
          currentAsset && (
            !activeAction ? (
              <AssetDetailView
                asset={currentAsset}
                transactions={currentAssetTransactions}
                onSelectAction={handleSelectAction}
                onBack={handleBackToScanner}
                onUpdateTransaction={handleUpdateTransaction}
                onDeleteTransaction={handleDeleteTransaction}
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

      {/* Power Event Modal (Calendar and Time Picker) */}
      {currentAsset && powerModalType && (
        <PowerEventModal
          asset={currentAsset}
          type={powerModalType}
          isOpen={Boolean(powerModalType)}
          onCancel={() => setPowerModalType(null)}
          onConfirm={handleConfirmPowerEvent}
        />
      )}

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
          performAppUpdate(availableVersion || undefined);
        }}
        onDeregister={() => {
          syncEngine.lockdownRevokedDevice();
        }}
        onOpenEnrollment={() => {
          setIsSettingsModalOpen(false);
          setIsEnrolled(false);
        }}
      />
    </div>
  );

  return isDesktop ? (
    <div className="desktop-pda-frame">
      {renderDesktopToolbar()}
      {mainContent}
    </div>
  ) : (
    mainContent
  );
};

export default App;
