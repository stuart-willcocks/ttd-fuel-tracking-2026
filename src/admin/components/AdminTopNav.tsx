import React, { useState, useEffect } from 'react';
import {
  Boxes,
  ReceiptText,
  Clock,
  RefreshCw,
  Smartphone,
  ExternalLink,
} from 'lucide-react';
import { APP_VERSION } from '../../version';

export type AdminViewType = 'ASSETS' | 'TRANSACTIONS' | 'SETTINGS';

interface AdminTopNavProps {
  currentView: AdminViewType;
  onSelectView: (view: AdminViewType) => void;
  assetCount: number;
  transactionCount: number;
  isSupabaseOnline: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export const AdminTopNav: React.FC<AdminTopNavProps> = ({
  currentView,
  onSelectView,
  assetCount,
  transactionCount,
  isSupabaseOnline,
  isRefreshing,
  onRefresh,
}) => {
  const [currentTime, setCurrentTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      const dateStr = now.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      setCurrentTime(`${dateStr} • ${timeStr}`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="admin-top-menu-bar">
      {/* Left Navigation Zone */}
      <div className="admin-top-menu-left">
        {/* Version tag */}
        <span className="admin-version-tag">V{APP_VERSION}</span>

        {/* TTD Brand Logo top left */}
        <img
          src="/logo-01.png"
          alt="The Technical Department Ltd"
          className="admin-top-logo"
        />

        {/* Brand Name */}
        <span className="admin-top-brand-title">TTD Fuel Tracking</span>

        {/* Admin Console Label */}
        <span className="admin-console-label">Admin console</span>

        {/* Menu Buttons Divider */}
        <div className="admin-top-nav-divider" />

        {/* Equipment Menu Button */}
        <button
          type="button"
          onClick={() => onSelectView('ASSETS')}
          className={`admin-top-nav-btn ${currentView === 'ASSETS' ? 'active' : ''}`}
        >
          <Boxes size={16} />
          <span>Equipment</span>
          <span className="admin-top-nav-counter">{assetCount}</span>
        </button>

        {/* Transactions Menu Button */}
        <button
          type="button"
          onClick={() => onSelectView('TRANSACTIONS')}
          className={`admin-top-nav-btn ${currentView === 'TRANSACTIONS' ? 'active' : ''}`}
        >
          <ReceiptText size={16} />
          <span>Transactions</span>
          <span className="admin-top-nav-counter">{transactionCount}</span>
        </button>
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

        {/* Refresh button */}
        <button
          type="button"
          onClick={onRefresh}
          className="admin-top-tool-btn"
          disabled={isRefreshing}
          title="Reload fresh equipment & transactions"
        >
          <RefreshCw size={13} className={isRefreshing ? 'admin-spin' : ''} />
          <span>{isRefreshing ? 'Syncing...' : 'Refresh'}</span>
        </button>

        {/* Live Clock */}
        <div className="admin-top-clock-chip">
          <Clock size={12} />
          <span>{currentTime || 'Syncing...'}</span>
        </div>

        {/* Link to Zebra Handheld Field Web App */}
        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          className="admin-top-tool-btn"
          title="Open handheld scanner interface in new tab"
        >
          <Smartphone size={13} />
          <span>Handheld App</span>
          <ExternalLink size={11} />
        </a>
      </div>
    </header>
  );
};
