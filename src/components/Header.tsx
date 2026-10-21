import React from 'react';
import { Wifi, WifiOff, RefreshCw, UploadCloud, Settings } from 'lucide-react';
import type { SyncState } from '../services/syncEngine';
import { APP_VERSION } from '../version';

interface HeaderProps {
  syncState: SyncState;
  isFullscreen?: boolean;
  hasUpdate?: boolean;
  onToggleSimulatedOffline: () => void;
  onTriggerSync: () => void;
  onToggleFullscreen?: () => void;
  onOpenOutbox: () => void;
  onOpenSettings?: () => void;
  onShowSplash?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  syncState,
  hasUpdate = false,
  onToggleSimulatedOffline,
  onTriggerSync,
  onOpenOutbox,
  onOpenSettings,
  onShowSplash,
}) => {
  return (
    <header className="app-header">
      {/* Top Left: App Title and Version (Vnn) */}
      <div
        className="header-title-box"
        onClick={onShowSplash}
        style={{ cursor: onShowSplash ? 'pointer' : 'default' }}
        title="The Technical Department Ltd"
      >
        <div className="header-text-col">
          <div className="header-company-name">The Technical Department Ltd</div>
          <div className="header-sub-row">
            <span className="header-app-title">Fuel Tracking</span>
            <span className="header-version-pill">V{APP_VERSION}</span>
          </div>
        </div>
      </div>

      {/* Top Right: Upload Queue, Refresh, Connection Status, Settings */}
      <div className="header-status-box">
        {/* Upload Queue Indicator (visible if items are queued) */}
        {syncState.pendingCount > 0 && (
          <button
            type="button"
            className="pending-pill"
            onClick={onOpenOutbox}
            title="Upload queue: pending sync"
          >
            <UploadCloud size={13} />
            <span>{syncState.pendingCount}</span>
          </button>
        )}

        {/* Refresh / Sync Button (circular arrows spin, square border does NOT spin) */}
        <button
          type="button"
          className="icon-btn"
          onClick={onTriggerSync}
          disabled={!syncState.isOnline || syncState.isSyncing}
          title="Refresh / Sync with server"
          aria-label="Refresh / Sync with server"
        >
          <RefreshCw
            size={14}
            className={syncState.isSyncing ? 'spinning' : ''}
          />
        </button>

        {/* Connection Status: Wifi icon only (no "online" text) */}
        <button
          type="button"
          className={`status-pill ${syncState.isOnline ? 'online' : 'offline'}`}
          onClick={onToggleSimulatedOffline}
          title={syncState.isOnline ? 'Online (Tap to toggle offline mode)' : 'Offline (Tap to reconnect)'}
          aria-label={syncState.isOnline ? 'Online' : 'Offline'}
        >
          {syncState.isOnline ? <Wifi size={15} /> : <WifiOff size={15} />}
        </button>

        {/* Settings Button: Gear icon (rendered in primary blue if update is available) */}
        {onOpenSettings && (
          <button
            type="button"
            className={`icon-btn ${hasUpdate ? 'has-update' : ''}`}
            onClick={onOpenSettings}
            title={hasUpdate ? "App update available - Settings" : "Settings"}
            aria-label="Settings"
          >
            <Settings size={15} />
          </button>
        )}
      </div>
    </header>
  );
};

