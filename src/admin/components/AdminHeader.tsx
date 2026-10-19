import React, { useState, useEffect } from 'react';
import {
  Clock,
  Plus,
  RefreshCw,
  Smartphone,
  Database,
  ExternalLink,
} from 'lucide-react';

interface AdminHeaderProps {
  title: string;
  isSupabaseOnline: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  onOpenCreateAsset: () => void;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  title,
  isSupabaseOnline,
  isRefreshing,
  onRefresh,
  onOpenCreateAsset,
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
    <header className="admin-topbar">
      <div className="admin-topbar-left">
        <h2 className="admin-page-title">{title}</h2>
        <div className="admin-clock-chip">
          <Clock size={13} />
          <span>{currentTime || 'Synchronizing...'}</span>
        </div>
      </div>

      <div className="admin-topbar-right">
        {/* Supabase status badge */}
        <div className={`admin-sync-pill ${isSupabaseOnline ? 'online' : 'offline'}`} title="Cloud Sync Provider Status">
          <span className={`pulse-dot ${isSupabaseOnline ? 'green' : 'amber'}`} />
          <Database size={13} />
          <span>{isSupabaseOnline ? 'Supabase Cloud: Connected' : 'Central Server: Local API'}</span>
        </div>

        {/* Refresh button */}
        <button
          onClick={onRefresh}
          className="admin-btn admin-btn-secondary admin-btn-sm"
          disabled={isRefreshing}
          title="Reload fresh assets & transactions"
        >
          <RefreshCw size={14} className={isRefreshing ? 'admin-spin' : ''} />
          <span>{isRefreshing ? 'Syncing...' : 'Refresh'}</span>
        </button>

        {/* Create Asset CTA */}
        <button
          onClick={onOpenCreateAsset}
          className="admin-btn admin-btn-primary admin-btn-sm"
        >
          <Plus size={15} />
          <span>New Asset</span>
        </button>

        {/* Quick link to Zebra Handheld Field Web App */}
        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          className="admin-btn admin-btn-outline admin-btn-sm"
          title="Open handheld scanner interface in new tab"
        >
          <Smartphone size={14} />
          <span>Handheld App</span>
          <ExternalLink size={12} />
        </a>
      </div>
    </header>
  );
};
