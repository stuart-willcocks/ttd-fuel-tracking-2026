import React from 'react';
import { Wifi, WifiOff, RefreshCw, Settings, Maximize2, Minimize2 } from 'lucide-react';
import type { SyncState } from '../services/syncEngine';

import { APP_VERSION } from '../version';

interface HeaderProps {
  syncState: SyncState;
  isFullscreen: boolean;
  onToggleSimulatedOffline: () => void;
  onTriggerSync: () => void;
  onToggleFullscreen: () => void;
  onOpenOutbox: () => void;
  onOpenSettings: () => void;
  onShowSplash?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  syncState,
  isFullscreen,
  onToggleSimulatedOffline,
  onTriggerSync,
  onToggleFullscreen,
  onOpenOutbox,
  onOpenSettings,
  onShowSplash,
}) => {
  return (
    <header className="app-header">
      <div
        className="header-title-box"
        onClick={onShowSplash}
        style={{ cursor: onShowSplash ? 'pointer' : 'default' }}
        title={onShowSplash ? 'Click to view Splash Screen' : undefined}
      >
        <div className="header-company-name">The Technical Department Ltd</div>
        <div className="header-sub-row">
          <span className="header-app-title">Fuel Tracking App</span>
          <span className="header-version-pill">v{APP_VERSION}</span>
        </div>
      </div>

      <div className="header-status-box">
        {/* Network status pill */}
        <button
          className={`status-pill ${syncState.isOnline ? 'online' : 'offline'}`}
          onClick={onToggleSimulatedOffline}
          title={syncState.isOnline ? 'Tap to simulate offline' : 'Tap to reconnect'}
        >
          {syncState.isOnline ? <Wifi size={13} /> : <WifiOff size={13} />}
          <span>{syncState.isOnline ? 'Online' : 'Offline'}</span>
          {syncState.isSimulatedOffline && <span className="sim-label">SIM</span>}
        </button>

        {/* Pending outbox count pill */}
        {syncState.pendingCount > 0 && (
          <button className="pending-pill" onClick={onOpenOutbox} title="View offline queue">
            <span>{syncState.pendingCount} pending</span>
          </button>
        )}

        {/* Sync button */}
        <button
          className={`icon-btn ${syncState.isSyncing ? 'spinning' : ''}`}
          onClick={onTriggerSync}
          disabled={!syncState.isOnline || syncState.isSyncing}
          title="Sync now"
        >
          <RefreshCw size={15} />
        </button>

        {/* Fullscreen toggle button */}
        <button
          className="icon-btn"
          onClick={onToggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen (hide address bar)'}
        >
          {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>

        {/* Settings button */}
        <button
          className="icon-btn"
          onClick={onOpenSettings}
          title="Settings & Schema"
        >
          <Settings size={15} />
        </button>
      </div>
    </header>
  );
};
