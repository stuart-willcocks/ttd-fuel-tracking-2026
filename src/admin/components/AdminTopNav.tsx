import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  Smartphone,
  ExternalLink,
  LogOut,
} from 'lucide-react';
import { APP_VERSION, getIsStaging } from '../../version';
import { checkRemoteAppVersion, performAppUpdate } from '../../services/appUpdate';

export type AdminViewType = 'ASSETS' | 'TRANSACTIONS' | 'SETTINGS' | 'DEVICES';

interface AdminTopNavProps {
  isSupabaseOnline: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  adminEmail?: string | null;
  onSignOut?: () => void;
}

export const AdminTopNav: React.FC<AdminTopNavProps> = ({
  isSupabaseOnline,
  isRefreshing,
  onRefresh,
  adminEmail,
  onSignOut,
}) => {
  const [hasNewVersion, setHasNewVersion] = useState(false);
  const [newVersionTag, setNewVersionTag] = useState<string | null>(null);
  const isStaging = getIsStaging();

  useEffect(() => {
    // Clean up any cache-busting ?v= query param from the address bar after an update reload
    if (typeof window !== 'undefined' && window.location.search.includes('v=')) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('v');
        const cleanSearch = url.searchParams.toString();
        window.history.replaceState({}, '', url.pathname + (cleanSearch ? `?${cleanSearch}` : '') + url.hash);
      } catch {}
    }

    const checkVersion = async () => {
      const res = await checkRemoteAppVersion();
      if (res.hasUpdate) {
        setHasNewVersion(true);
        if (res.remoteVersion) setNewVersionTag(res.remoteVersion);

        // Automatically bust cache and reload into the new version whenever a newer build is live.
        // Uses a 12-second cooldown per version so if an edge cache wasn't warm on the first reload, it retries cleanly.
        if (res.remoteVersion) {
          try {
            const rawAttempt = sessionStorage.getItem('ttd_admin_auto_update_target');
            let shouldAutoUpdate = true;
            if (rawAttempt) {
              try {
                const parsed = JSON.parse(rawAttempt) as { version?: string; ts?: number };
                if (parsed.version === res.remoteVersion && parsed.ts && Date.now() - parsed.ts < 12000) {
                  shouldAutoUpdate = false;
                }
              } catch {
                // Legacy string value: allow retry
              }
            }
            if (shouldAutoUpdate) {
              sessionStorage.setItem(
                'ttd_admin_auto_update_target',
                JSON.stringify({ version: res.remoteVersion, ts: Date.now() })
              );
              performAppUpdate(res.remoteVersion);
              return;
            }
          } catch {}
        }
      } else {
        setHasNewVersion(false);
        try {
          sessionStorage.removeItem('ttd_admin_auto_update_target');
        } catch {}
      }
    };

    checkVersion();
    const interval = setInterval(() => checkVersion(), 15000);
    const onFocusOrVisible = () => {
      if (typeof document === 'undefined' || !document.hidden) {
        checkVersion();
      }
    };
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, []);

  return (
    <header className="admin-top-menu-bar">
      {/* Left Navigation Zone */}
      <div className="admin-top-menu-left">
        {/* TTD Brand Logo top left - 2.5x current size (80px) */}
        <img
          src="/logo-01.png"
          alt="The Technical Department Ltd"
          className="admin-top-logo"
        />

        {/* Brand Name */}
        <span className="admin-top-brand-title">TTD Fuel Tracking</span>

        {/* Admin Console Label */}
        <span className="admin-console-label">ADMIN CONSOLE</span>

        {/* Version number with optional (STAGING) and update exclamation mark */}
        <span
          className="admin-version-tag"
          onClick={() => {
            if (hasNewVersion) {
              performAppUpdate(newVersionTag || undefined);
            }
          }}
          style={{ cursor: hasNewVersion ? 'pointer' : 'default' }}
          title={hasNewVersion ? `Update to V${newVersionTag || ''} available. Click to reload with latest version.` : undefined}
        >
          <span>V{APP_VERSION}{isStaging ? ' (STAGING)' : ''}</span>
          {hasNewVersion && (
            <span
              className="admin-version-alert-mark"
              title="A new app version is available. Click to update now."
            >
              !
            </span>
          )}
        </span>
      </div>

      {/* Right Action & Status Zone */}
      <div className="admin-top-menu-right">
        {/* Database connection indicator */}
        <div
          className="admin-top-online-indicator"
          title={isSupabaseOnline ? 'Cloud Synced' : 'Local Server Mode'}
        >
          <span className={`pulse-dot ${isSupabaseOnline ? 'green' : 'amber'}`} />
          <span>{isSupabaseOnline ? 'DATABASE CONNECTED' : 'OFFLINE'}</span>
        </div>

        {/* Narrow Refresh button (icon only, no word "refresh") */}
        <button
          type="button"
          onClick={onRefresh}
          className="admin-top-tool-btn admin-top-refresh-btn"
          disabled={isRefreshing}
          title="Reload fresh equipment & transactions"
        >
          <RefreshCw size={15} className={isRefreshing ? 'admin-spin' : ''} />
        </button>

        {/* Link to Zebra Handheld Field Web App */}
        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          className="admin-top-tool-btn"
          title="Open PDA scanner interface in new tab"
        >
          <Smartphone size={14} />
          <span>LAUNCH PDA APP</span>
          <ExternalLink size={12} />
        </a>

        {/* Signed-in Admin User & Sign Out */}
        {onSignOut && (
          <button
            type="button"
            onClick={onSignOut}
            className="admin-top-tool-btn"
            title={adminEmail ? `Signed in as ${adminEmail} — Click to sign out` : 'Sign out of Admin Console'}
          >
            <LogOut size={14} />
            <span>SIGN OUT</span>
          </button>
        )}
      </div>
    </header>
  );
};
