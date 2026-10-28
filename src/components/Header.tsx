import React from 'react';
import { Wifi, WifiOff, RefreshCw, UploadCloud, Settings } from 'lucide-react';
import type { SyncState } from '../services/syncEngine';
import { APP_VERSION, getIsStaging } from '../version';

interface HeaderProps {
  syncState: SyncState;
  isFullscreen?: boolean;
  hasUpdate?: boolean;
  availableVersion?: string | null;
  settingsRequiresAttention?: boolean;
  onToggleSimulatedOffline: () => void;
  onTriggerSync: () => void;
  onToggleFullscreen?: () => void;
  onOpenOutbox: () => void;
  onOpenSettings?: () => void;
  onOpenUpdate?: () => void;
  onShowSplash?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  syncState,
  hasUpdate = false,
  availableVersion,
  settingsRequiresAttention,
  onToggleSimulatedOffline,
  onTriggerSync,
  onOpenOutbox,
  onOpenSettings,
  onOpenUpdate,
  onShowSplash,
}) => {
  const requiresAttention = settingsRequiresAttention ?? hasUpdate;
  const isStaging = getIsStaging();
  return (
    <header className="app-header">
      {/* Top Left: TTD Logo, App Title ("TTD Fuel Tracking" in white), and Version Chip */}
      <div
        className="header-title-box"
        onClick={onShowSplash}
        style={{ cursor: onShowSplash ? 'pointer' : 'default' }}
        title="TTD Fuel Tracking"
      >
        <img
          src="/logo-01.png"
          alt="The Technical Department Ltd"
          className="header-logo"
        />
        <span className="header-app-title">TTD Fuel Tracking</span>
        {hasUpdate ? (
          <span
            className="header-version-pill"
            onClick={(e) => {
              e.stopPropagation();
              if (onOpenUpdate) {
                onOpenUpdate();
              } else {
                onOpenSettings?.();
              }
            }}
            title={`Update available: ${availableVersion ? `V${availableVersion}` : 'New version'}. Tap to update.`}
            style={{
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span>V{APP_VERSION}{isStaging ? ' STAGING' : ''}</span>
            <span className="header-version-alert-mark">!</span>
          </span>
        ) : (
          <span className="header-version-pill">V{APP_VERSION}{isStaging ? ' STAGING' : ''}</span>
        )}
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

        {/* Settings Button: Gear icon (displays orange exclamation mark in front when attention is required) */}
        {onOpenSettings && (
          <button
            type="button"
            className={`icon-btn settings-btn ${requiresAttention ? 'has-attention' : ''}`}
            onClick={onOpenSettings}
            title={requiresAttention ? "Settings require attention (App update available)" : "Settings"}
            aria-label={requiresAttention ? "Settings (requires attention)" : "Settings"}
          >
            {requiresAttention && (
              <svg
                width="5"
                height="15"
                viewBox="0 0 5 15"
                fill="none"
                className="settings-attention-mark"
                aria-hidden="true"
              >
                <line x1="2.5" y1="1.5" x2="2.5" y2="9.5" stroke="#EC721E" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="2.5" cy="13.2" r="1.3" fill="#EC721E" />
              </svg>
            )}
            <Settings size={15} />
          </button>
        )}
      </div>
    </header>
  );
};

