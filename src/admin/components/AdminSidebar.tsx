import React from 'react';
import {
  LayoutDashboard,
  Boxes,
  ReceiptText,
  Database,
  Fuel,
  Zap,
} from 'lucide-react';
import type { Equipment, Transaction } from '../../types';

export type AdminViewType = 'DASHBOARD' | 'ASSETS' | 'TRANSACTIONS' | 'SETTINGS';

interface AdminSidebarProps {
  currentView: AdminViewType;
  onSelectView: (view: AdminViewType) => void;
  assets: Equipment[];
  transactions: Transaction[];
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  currentView,
  onSelectView,
  assets,
  transactions,
}) => {
  const runningGenerators = assets.filter(
    (a) => a.type === 'GENERATOR' && a.poweredUpTimestamp && !a.poweredDownTimestamp
  );

  const activeKva = runningGenerators.reduce((sum, g) => sum + (g.capacity || 0), 0);

  return (
    <aside className="admin-sidebar">
      {/* Brand Header */}
      <div className="admin-sidebar-header">
        <div className="admin-logo-box">
          <Fuel size={24} />
        </div>
        <div className="admin-brand-info">
          <h1>TTD Fleet Ops</h1>
          <p>Admin Mission Control</p>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="admin-sidebar-nav">
        <button
          onClick={() => onSelectView('DASHBOARD')}
          className={`admin-nav-item ${currentView === 'DASHBOARD' ? 'active' : ''}`}
        >
          <div className="admin-nav-item-left">
            <LayoutDashboard size={18} />
            <span>Dashboard</span>
          </div>
        </button>

        <button
          onClick={() => onSelectView('ASSETS')}
          className={`admin-nav-item ${currentView === 'ASSETS' ? 'active' : ''}`}
        >
          <div className="admin-nav-item-left">
            <Boxes size={18} />
            <span>Assets Inventory</span>
          </div>
          <span className="admin-nav-badge">{assets.length}</span>
        </button>

        <button
          onClick={() => onSelectView('TRANSACTIONS')}
          className={`admin-nav-item ${currentView === 'TRANSACTIONS' ? 'active' : ''}`}
        >
          <div className="admin-nav-item-left">
            <ReceiptText size={18} />
            <span>Transactions Log</span>
          </div>
          <span className="admin-nav-badge">{transactions.length}</span>
        </button>

        <button
          onClick={() => onSelectView('SETTINGS')}
          className={`admin-nav-item ${currentView === 'SETTINGS' ? 'active' : ''}`}
        >
          <div className="admin-nav-item-left">
            <Database size={18} />
            <span>Cloud &amp; Settings</span>
          </div>
        </button>
      </nav>

      {/* Bottom Summary Snapshot */}
      <div className="admin-sidebar-footer">
        <div className="admin-sidebar-status-box">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--adm-text-muted)', fontWeight: 700 }}>
              Live Fleet Power
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span className="pulse-dot green" />
              <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600 }}>ONLINE</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <Zap size={16} color="#f59e0b" />
            <span style={{ fontFamily: 'var(--adm-font-display)', fontSize: '1.25rem', fontWeight: 800, color: '#ffffff' }}>
              {activeKva.toLocaleString()}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--adm-text-secondary)' }}>kVA Active</span>
          </div>

          <div style={{ fontSize: '0.72rem', color: 'var(--adm-text-muted)' }}>
            {runningGenerators.length} running / {assets.filter((a) => a.type === 'GENERATOR').length} total generators
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '12px',
            fontSize: '0.7rem',
            color: 'var(--adm-text-muted)',
            fontFamily: 'var(--adm-font-mono)',
          }}
        >
          <span>TTD OPS v27</span>
          <span>DESKTOP ONLY</span>
        </div>
      </div>
    </aside>
  );
};
