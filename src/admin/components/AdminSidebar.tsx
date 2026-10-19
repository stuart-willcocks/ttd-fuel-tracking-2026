import React from 'react';
import { Boxes, ReceiptText, Database, Fuel } from 'lucide-react';
import type { Equipment, Transaction } from '../../types';

export type AdminViewType = 'ASSETS' | 'TRANSACTIONS' | 'SETTINGS';

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
  return (
    <aside className="admin-sidebar">
      {/* Brand Header */}
      <div className="admin-sidebar-header">
        <div className="admin-logo-box">
          <Fuel size={22} />
        </div>
        <div className="admin-brand-info">
          <h1>TTD Fleet Ops</h1>
          <p>Admin Portal</p>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="admin-sidebar-nav">
        <button
          onClick={() => onSelectView('ASSETS')}
          className={`admin-nav-item ${currentView === 'ASSETS' ? 'active' : ''}`}
        >
          <div className="admin-nav-item-left">
            <Boxes size={18} />
            <span>Fleet Assets</span>
          </div>
          <span className="admin-nav-badge">{assets.length}</span>
        </button>

        <button
          onClick={() => onSelectView('TRANSACTIONS')}
          className={`admin-nav-item ${currentView === 'TRANSACTIONS' ? 'active' : ''}`}
        >
          <div className="admin-nav-item-left">
            <ReceiptText size={18} />
            <span>All Transactions</span>
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

      {/* Clean Minimalist Footer */}
      <div className="admin-sidebar-footer">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.72rem',
            color: 'var(--adm-text-muted)',
            fontFamily: 'var(--adm-font-mono)',
          }}
        >
          <span>TTD OPS</span>
          <span>LAPTOP ONLY</span>
        </div>
      </div>
    </aside>
  );
};
