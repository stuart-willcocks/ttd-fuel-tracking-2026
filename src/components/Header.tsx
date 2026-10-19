import React from 'react';
import { Wifi, WifiOff, RefreshCw, UploadCloud } from 'lucide-react';
import type { SyncState } from '../services/syncEngine';
import { APP_VERSION, BUILD_NUMBER } from '../version';

interface HeaderProps {
  syncState: SyncState;
  isFullscreen?: boolean;
  onToggleSimulatedOffline: () => void;
  onTriggerSync: () => void;
  onToggleFullscreen?: () => void;
  onOpenOutbox: () => void;
  onOpenSettings?: () => void;
  onShowSplash?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  syncState,
  onToggleSimulatedOffline,
  onTriggerSync,
  onOpenOutbox,
  onShowSplash,
}) => {
  return (
    <header className="app-header">
      {/* Top Left: App Title and Version */}
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
            <span className="header-version-pill">v{APP_VERSION} ({BUILD_NUMBER})</span>
          </div>
        </div>
      </div>

      {/* Top Right: Online Indicator & Refresh / Upload Queue Indicator */}
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

        {/* Refresh / Sync Button */}
        <button
          type="button"
          className={`icon-btn ${syncState.isSyncing ? 'spinning' : ''}`}
          onClick={onTriggerSync}
          disabled={!syncState.isOnline || syncState.isSyncing}
          title="Refresh / Sync with server"
        >
          <RefreshCw size={14} />
        </button>

        {/* Online Indicator */}
        <button
          type="button"
          className={`status-pill ${syncState.isOnline ? 'online' : 'offline'}`}
          onClick={onToggleSimulatedOffline}
          title={syncState.isOnline ? 'Online (Tap to toggle offline mode)' : 'Offline (Tap to reconnect)'}
        >
          {syncState.isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
          <span className="status-label">{syncState.isOnline ? 'ONLINE' : 'OFFLINE'}</span>
        </button>
      </div>
    </header>
  );
};
