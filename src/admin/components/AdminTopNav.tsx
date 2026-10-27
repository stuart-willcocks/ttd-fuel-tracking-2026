import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  Smartphone,
  ExternalLink,
} from 'lucide-react';
import { APP_VERSION, BUILD_NUMBER, getIsStaging } from '../../version';

export type AdminViewType = 'ASSETS' | 'TRANSACTIONS' | 'SETTINGS';

interface AdminTopNavProps {
  isSupabaseOnline: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export const AdminTopNav: React.FC<AdminTopNavProps> = ({
  isSupabaseOnline,
  isRefreshing,
  onRefresh,
}) => {
  const [hasNewVersion, setHasNewVersion] = useState(false);
  const isStaging = getIsStaging();

  useEffect(() => {
    const checkVersion = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
          const remoteData = await res.json();
          const remoteBuild = Number(remoteData.build || remoteData.version);
          if (remoteBuild && remoteBuild > BUILD_NUMBER) {
            setHasNewVersion(true);
          }
        }
      } catch {
        // Offline or network error
      }
    };

    checkVersion();
    const interval = setInterval(checkVersion, 30000);
    return () => clearInterval(interval);
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

        {/* Combined Admin Console & Version Box */}
        <div className="admin-top-badge-box">
          <span className="admin-badge-title">ADMIN CONSOLE</span>
          <span className="admin-badge-version">
            <span>V{APP_VERSION}{isStaging ? ' (STAGING)' : ''}</span>
            {hasNewVersion && (
              <span
                className="admin-version-alert-mark"
                title="A new app version is available. Click refresh to update."
              >
                !
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Right Action & Status Zone */}
      <div className="admin-top-menu-right">
        {/* Simple "Online" indicator */}
        <div
          className="admin-top-online-indicator"
          title={isSupabaseOnline ? 'Cloud Synced' : 'Local Server Mode'}
        >
          <span className={`pulse-dot ${isSupabaseOnline ? 'green' : 'amber'}`} />
          <span>{isSupabaseOnline ? 'Online' : 'Offline'}</span>
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

        {/* Link to Zebra Handheld Field Web App relabeled as "PDA app" */}
        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          className="admin-top-tool-btn"
          title="Open PDA scanner interface in new tab"
        >
          <Smartphone size={14} />
          <span>PDA App</span>
          <ExternalLink size={12} />
        </a>
      </div>
    </header>
  );
};
