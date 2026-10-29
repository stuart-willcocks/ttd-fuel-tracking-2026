import React, { useRef, useCallback } from 'react';
import { Wifi, WifiOff, RefreshCw, UploadCloud } from 'lucide-react';
import type { SyncState } from '../services/syncEngine';
import { APP_VERSION, getIsStaging } from '../version';

interface HeaderProps {
  syncState: SyncState;
  isFullscreen?: boolean;
  hasUpdate?: boolean;
  availableVersion?: string | null;
  settingsRequiresAttention?: boolean;
  onToggleSimulatedOffline?: () => void;
  onTriggerSync: () => void;
  onToggleFullscreen?: () => void;
  onOpenOutbox: () => void;
  onOpenSettings?: () => void;
}

const LONG_PRESS_DURATION_MS = 600;

export const Header: React.FC<HeaderProps> = ({
  syncState,
  hasUpdate = false,
  onTriggerSync,
  onOpenOutbox,
  onOpenSettings,
}) => {
  const isStaging = getIsStaging();
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      // Ignore presses on interactive buttons inside the status box (Refresh, Wifi, Outbox)
      const target = e.target as HTMLElement | null;
      if (target && target.closest('button')) {
        return;
      }
      clearLongPress();
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        onOpenSettings?.();
      }, LONG_PRESS_DURATION_MS);
    },
    [clearLongPress, onOpenSettings]
  );

  return (
    <header
      className="app-header"
      onPointerDown={handlePointerDown}
      onPointerUp={clearLongPress}
      onPointerLeave={clearLongPress}
      onPointerCancel={clearLongPress}
      onContextMenu={(e) => {
        // Prevent Android/browser context menu from interrupting a long-press on the banner
        e.preventDefault();
      }}
    >
      {/* Top Left: TTD Logo and App Title ("TTD Fuel Tracking" in white) */}
      <div className="header-title-box" title="TTD Fuel Tracking">
        <img
          src="/logo-01.png"
          alt="The Technical Department Ltd"
          className="header-logo"
          draggable={false}
        />
        <span className="header-app-title">TTD Fuel Tracking</span>
      </div>

      {/* Top Right: Upload Queue, Version Chip, Refresh, Connection Status */}
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

        {/* Version Chip positioned to the left of the Refresh icon */}
        <span
          className="header-version-pill"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span>V{APP_VERSION}{isStaging ? ' STAGING' : ''}</span>
          {hasUpdate && <span className="header-version-alert-mark">!</span>}
        </span>

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

        {/* Connection Status: Wifi icon only (read-only indicator) */}
        <span
          className={`status-pill ${syncState.isOnline ? 'online' : 'offline'}`}
          title={syncState.isOnline ? 'Online' : 'Offline'}
          aria-label={syncState.isOnline ? 'Online' : 'Offline'}
        >
          {syncState.isOnline ? <Wifi size={15} /> : <WifiOff size={15} />}
        </span>
      </div>
    </header>
  );
};

