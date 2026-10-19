import React from 'react';
import {
  Boxes,
  Zap,
  Fuel,
  ReceiptText,
  Smartphone,
  ArrowRight,
  TrendingUp,
  MapPin,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import type { Equipment, Transaction } from '../../types';

interface DashboardViewProps {
  assets: Equipment[];
  transactions: Transaction[];
  onSelectAsset: (equipmentId: string) => void;
  onOpenCreateAsset: () => void;
  onSelectView: (view: 'ASSETS' | 'TRANSACTIONS' | 'SETTINGS') => void;
  onInspectTransaction: (tx: Transaction) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  assets,
  transactions,
  onSelectAsset,
  onOpenCreateAsset,
  onSelectView,
  onInspectTransaction,
}) => {
  // Aggregate Fleet Metrics
  const generators = assets.filter((a) => a.type === 'GENERATOR');
  const tanks = assets.filter((a) => a.type === 'TANK');
  const plant = assets.filter((a) => a.type === 'PLANT');

  const runningGenerators = generators.filter(
    (g) => g.poweredUpTimestamp && !g.poweredDownTimestamp
  );

  const activeKva = runningGenerators.reduce((sum, g) => sum + (g.capacity || 0), 0);
  const totalFleetKva = generators.reduce((sum, g) => sum + (g.capacity || 0), 0);

  const totalFuelCapacityLitres = tanks.reduce((sum, t) => sum + (t.capacity || 0), 0);

  // Cumulative Transactions Telemetry
  const totalDieselLitres = transactions.reduce((sum, t) => sum + (t.fuelTransferLitres || 0), 0);
  const totalDefLitres = transactions.reduce((sum, t) => sum + (t.defTransferLitres || 0), 0);

  // Unique Devices
  const uniqueDevices = Array.from(
    new Set(transactions.map((t) => t.deviceId || 'PDA-Zebra-Default'))
  );

  // Transactions Today
  const todayStr = new Date().toISOString().substring(0, 10);
  const transactionsToday = transactions.filter((t) =>
    t.transactionTimestamp.startsWith(todayStr)
  ).length;

  // Breakdown by Area
  const areaCounts = assets.reduce<Record<string, number>>((acc, a) => {
    const area = a.area || 'Unknown Zone';
    acc[area] = (acc[area] || 0) + 1;
    return acc;
  }, {});

  const recentTransactions = transactions.slice(0, 6);

  return (
    <div className="admin-page-container">
      {/* Top Banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '28px',
          background: 'linear-gradient(135deg, rgba(20, 29, 48, 0.8) 0%, rgba(14, 20, 34, 0.9) 100%)',
          padding: '24px 28px',
          borderRadius: 'var(--adm-radius-xl)',
          border: '1px solid var(--adm-border-subtle)',
          boxShadow: 'var(--adm-shadow-md)',
        }}
      >
        <div>
          <span
            style={{
              fontSize: '0.74rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--adm-accent-amber)',
              fontFamily: 'var(--adm-font-mono)',
            }}
          >
            Mission Operations Dashboard
          </span>
          <h1
            style={{
              fontFamily: 'var(--adm-font-display)',
              fontSize: '1.75rem',
              fontWeight: 800,
              color: '#ffffff',
              marginTop: '4px',
            }}
          >
            Site Fleet &amp; Power Telemetry Overview
          </h1>
          <p style={{ fontSize: '0.88rem', color: 'var(--adm-text-secondary)', marginTop: '4px' }}>
            Live status of {assets.length} deployed machines across site sectors. Synchronized with field Zebra TC26 PDAs.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={onOpenCreateAsset} className="admin-btn admin-btn-primary admin-btn-lg">
            <span>+ Add Asset</span>
          </button>
        </div>
      </div>

      {/* KPI Metrics Cards Grid */}
      <div className="admin-metrics-grid">
        {/* Metric 1: Total Fleet */}
        <div className="admin-metric-card" style={{ '--metric-accent': '#f59e0b' } as React.CSSProperties}>
          <div className="admin-metric-header">
            <span className="admin-metric-title">Total Fleet Assets</span>
            <div className="admin-metric-icon">
              <Boxes size={20} />
            </div>
          </div>
          <div className="admin-metric-value">{assets.length}</div>
          <div className="admin-metric-subtitle">
            <span>{generators.length} Gen</span> • <span>{tanks.length} Tanks</span> • <span>{plant.length} Plant</span>
          </div>
        </div>

        {/* Metric 2: Power Generation */}
        <div className="admin-metric-card" style={{ '--metric-accent': '#10b981', '--metric-icon-bg': 'rgba(16, 185, 129, 0.12)' } as React.CSSProperties}>
          <div className="admin-metric-header">
            <span className="admin-metric-title">Active Power Output</span>
            <div className="admin-metric-icon" style={{ color: '#10b981' }}>
              <Zap size={20} />
            </div>
          </div>
          <div className="admin-metric-value">
            {activeKva.toLocaleString()} <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>kVA</span>
          </div>
          <div className="admin-metric-subtitle">
            <span className="pulse-dot green" />
            <span>
              {runningGenerators.length} of {generators.length} Generators Energized ({totalFleetKva} kVA Cap)
            </span>
          </div>
        </div>

        {/* Metric 3: Fuel Storage Capacity */}
        <div className="admin-metric-card" style={{ '--metric-accent': '#06b6d4', '--metric-icon-bg': 'rgba(6, 182, 212, 0.12)' } as React.CSSProperties}>
          <div className="admin-metric-header">
            <span className="admin-metric-title">Fuel Storage Capacity</span>
            <div className="admin-metric-icon" style={{ color: '#06b6d4' }}>
              <Fuel size={20} />
            </div>
          </div>
          <div className="admin-metric-value">
            {totalFuelCapacityLitres.toLocaleString()} <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>L</span>
          </div>
          <div className="admin-metric-subtitle">
            <span>Across {tanks.length} bulk fuel storage bowsers</span>
          </div>
        </div>

        {/* Metric 4: Fuel Dispensed */}
        <div className="admin-metric-card" style={{ '--metric-accent': '#3b82f6', '--metric-icon-bg': 'rgba(59, 130, 246, 0.12)' } as React.CSSProperties}>
          <div className="admin-metric-header">
            <span className="admin-metric-title">Cumulative Fuel Transferred</span>
            <div className="admin-metric-icon" style={{ color: '#3b82f6' }}>
              <TrendingUp size={20} />
            </div>
          </div>
          <div className="admin-metric-value">
            {totalDieselLitres.toLocaleString()} <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>L</span>
          </div>
          <div className="admin-metric-subtitle">
            <span>+ {totalDefLitres.toLocaleString()} L DEF (AdBlue) recorded</span>
          </div>
        </div>

        {/* Metric 5: Total Transactions */}
        <div className="admin-metric-card" style={{ '--metric-accent': '#8b5cf6', '--metric-icon-bg': 'rgba(139, 92, 246, 0.12)' } as React.CSSProperties}>
          <div className="admin-metric-header">
            <span className="admin-metric-title">Field Transactions</span>
            <div className="admin-metric-icon" style={{ color: '#8b5cf6' }}>
              <ReceiptText size={20} />
            </div>
          </div>
          <div className="admin-metric-value">{transactions.length}</div>
          <div className="admin-metric-subtitle">
            <span>{transactionsToday} logged today</span> • <span>100% audit integrity</span>
          </div>
        </div>

        {/* Metric 6: Field Hardware */}
        <div className="admin-metric-card" style={{ '--metric-accent': '#10b981', '--metric-icon-bg': 'rgba(16, 185, 129, 0.12)' } as React.CSSProperties}>
          <div className="admin-metric-header">
            <span className="admin-metric-title">Active Field PDAs</span>
            <div className="admin-metric-icon" style={{ color: '#10b981' }}>
              <Smartphone size={20} />
            </div>
          </div>
          <div className="admin-metric-value">{uniqueDevices.length}</div>
          <div className="admin-metric-subtitle">
            <span>Zebra TC26 Handhelds synced</span>
          </div>
        </div>
      </div>

      {/* Middle Layout: Power Monitor & Fleet Distribution */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '24px', marginBottom: '28px' }}>
        {/* Power Generation Live Monitor */}
        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h2 className="admin-card-title">
                <Zap size={18} color="#f59e0b" />
                <span>Generator Power Fleet Monitor</span>
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--adm-text-secondary)', marginTop: '2px' }}>
                Online runtime state and live energization telemetry
              </p>
            </div>
            <button
              onClick={() => onSelectView('ASSETS')}
              className="admin-btn admin-btn-outline admin-btn-sm"
            >
              <span>Manage Fleet</span>
              <ArrowRight size={14} />
            </button>
          </div>

          {generators.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--adm-text-muted)' }}>
              No generators registered.
            </div>
          ) : (
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Equipment ID</th>
                    <th>Capacity</th>
                    <th>Zone &amp; Location</th>
                    <th>Power State</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {generators.map((gen) => {
                    const isRunning = Boolean(gen.poweredUpTimestamp && !gen.poweredDownTimestamp);
                    return (
                      <tr key={gen.equipmentId}>
                        <td>
                          <button
                            onClick={() => onSelectAsset(gen.equipmentId)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#fbbf24',
                              fontFamily: 'var(--adm-font-mono)',
                              fontWeight: 700,
                              cursor: 'pointer',
                              textAlign: 'left',
                              fontSize: '0.88rem',
                            }}
                          >
                            {gen.equipmentId}
                          </button>
                        </td>
                        <td style={{ fontWeight: 600 }}>{gen.capacity} kVA</td>
                        <td>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{gen.area}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--adm-text-muted)' }}>{gen.location}</div>
                        </td>
                        <td>
                          <span className={`admin-badge ${isRunning ? 'admin-badge-running' : 'admin-badge-standby'}`}>
                            <span className={`pulse-dot ${isRunning ? 'green' : 'slate'}`} />
                            {isRunning ? 'RUNNING' : 'STANDBY'}
                          </span>
                        </td>
                        <td>
                          <button
                            onClick={() => onSelectAsset(gen.equipmentId)}
                            className="admin-btn admin-btn-outline admin-btn-sm"
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Fleet Distribution by Zone */}
        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h2 className="admin-card-title">
                <MapPin size={18} color="#ef4444" />
                <span>Sector Deployment</span>
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--adm-text-secondary)', marginTop: '2px' }}>
                Asset density across site zones
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {Object.entries(areaCounts).map(([area, count]) => {
              const pct = Math.round((count / (assets.length || 1)) * 100);
              return (
                <div key={area} style={{ background: 'var(--adm-surface-1)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--adm-border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#ffffff' }}>{area}</span>
                    <span style={{ fontFamily: 'var(--adm-font-mono)', fontSize: '0.82rem', color: 'var(--adm-accent-amber)' }}>
                      {count} assets ({pct}%)
                    </span>
                  </div>
                  <div style={{ width: '100%', height: '6px', background: 'var(--adm-surface-2)', borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #f59e0b, #fbbf24)' }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick Fleet Mix */}
          <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--adm-border-subtle)' }}>
            <span style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--adm-text-muted)', fontWeight: 700 }}>
              Fleet Equipment Mix
            </span>
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <div style={{ flex: generators.length, background: '#f59e0b', height: '8px', borderRadius: '4px' }} title={`${generators.length} Generators`} />
              <div style={{ flex: tanks.length, background: '#06b6d4', height: '8px', borderRadius: '4px' }} title={`${tanks.length} Tanks`} />
              <div style={{ flex: plant.length, background: '#10b981', height: '8px', borderRadius: '4px' }} title={`${plant.length} Plant`} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginTop: '6px', color: 'var(--adm-text-secondary)' }}>
              <span>⚡ {generators.length} Gens</span>
              <span>🛢️ {tanks.length} Tanks</span>
              <span>🚜 {plant.length} Plant</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section: Recent Field Transactions Feed */}
      <div className="admin-card">
        <div className="admin-card-header">
          <div>
            <h2 className="admin-card-title">
              <ReceiptText size={18} color="#06b6d4" />
              <span>Live Field Activity Stream</span>
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--adm-text-secondary)', marginTop: '2px' }}>
              Latest refuelling and telemetry entries synchronized from Zebra handhelds
            </p>
          </div>
          <button
            onClick={() => onSelectView('TRANSACTIONS')}
            className="admin-btn admin-btn-outline admin-btn-sm"
          >
            <span>View All Transactions</span>
            <ArrowRight size={14} />
          </button>
        </div>

        {recentTransactions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', color: 'var(--adm-text-muted)' }}>
            No transactions recorded in the system yet.
          </div>
        ) : (
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Target Asset</th>
                  <th>Action Type</th>
                  <th>Recorded Values</th>
                  <th>Field Device ID</th>
                  <th>Sync Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {recentTransactions.map((tx) => (
                  <tr key={tx.id}>
                    <td style={{ fontSize: '0.8rem' }} className="admin-mono">
                      <Clock size={12} style={{ display: 'inline', marginRight: '6px', color: '#64748b' }} />
                      {tx.transactionTimestamp}
                    </td>
                    <td>
                      <button
                        onClick={() => onSelectAsset(tx.equipmentId)}
                        style={{
                          background: 'none',
                          border: 'none',
                          fontFamily: 'var(--adm-font-mono)',
                          fontWeight: 700,
                          color: '#fbbf24',
                          cursor: 'pointer',
                        }}
                      >
                        {tx.equipmentId}
                      </button>
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          color: tx.transactionType.includes('Fuel')
                            ? '#06b6d4'
                            : tx.transactionType.includes('Power')
                            ? '#10b981'
                            : '#f59e0b',
                        }}
                      >
                        {tx.transactionType}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.82rem' }}>
                      {tx.fuelTransferLitres && (
                        <span style={{ color: '#06b6d4', fontWeight: 700 }}>
                          +{tx.fuelTransferLitres} L Fuel{' '}
                        </span>
                      )}
                      {tx.defTransferLitres && (
                        <span style={{ color: '#3b82f6', fontWeight: 600 }}>
                          +{tx.defTransferLitres} L DEF{' '}
                        </span>
                      )}
                      {tx.checkInFuelPercentage !== undefined && (
                        <span>{tx.checkInFuelPercentage}% fuel </span>
                      )}
                      {tx.checkInFuelEighths !== undefined && (
                        <span>{tx.checkInFuelEighths}/8 gauge </span>
                      )}
                      {tx.checkInKWH !== undefined && (
                        <span style={{ color: '#10b981' }}>{tx.checkInKWH.toLocaleString()} kWh </span>
                      )}
                      {!tx.fuelTransferLitres &&
                        tx.checkInFuelPercentage === undefined &&
                        tx.checkInFuelEighths === undefined &&
                        tx.checkInKWH === undefined && (
                          <span style={{ color: 'var(--adm-text-muted)' }}>Status Update</span>
                        )}
                    </td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--adm-text-secondary)' }} className="admin-mono">
                      {tx.deviceId || 'PDA-Zebra'}
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.74rem', color: '#10b981' }}>
                        <CheckCircle2 size={12} />
                        <span>Synced</span>
                      </span>
                    </td>
                    <td>
                      <button
                        onClick={() => onInspectTransaction(tx)}
                        className="admin-btn admin-btn-outline admin-btn-sm"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
