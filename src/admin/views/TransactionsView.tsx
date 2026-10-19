import React, { useState, useMemo } from 'react';
import {
  Search,
  Download,
  Filter,
  Clock,
  CheckCircle2,
  Smartphone,
  Eye,
} from 'lucide-react';
import type { Transaction, Equipment } from '../../types';

interface TransactionsViewProps {
  transactions: Transaction[];
  assets: Equipment[];
  onInspectTransaction: (tx: Transaction) => void;
  onSelectAsset: (equipmentId: string) => void;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({
  transactions,
  assets,
  onInspectTransaction,
  onSelectAsset,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('ALL');
  const [selectedDevice, setSelectedDevice] = useState<string>('ALL');
  const [selectedDateFilter, setSelectedDateFilter] = useState<'ALL' | 'TODAY' | '7DAYS'>('ALL');

  // Asset lookup map for speed
  const assetMap = useMemo(() => {
    return new Map(assets.map((a) => [a.equipmentId, a]));
  }, [assets]);

  // Unique devices
  const uniqueDevices = useMemo(() => {
    return Array.from(new Set(transactions.map((t) => t.deviceId).filter(Boolean))) as string[];
  }, [transactions]);

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    const todayStr = new Date().toISOString().substring(0, 10);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    return transactions.filter((tx) => {
      // Search text
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        tx.id.toLowerCase().includes(q) ||
        tx.equipmentId.toLowerCase().includes(q) ||
        (tx.deviceId && tx.deviceId.toLowerCase().includes(q)) ||
        tx.transactionType.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      // Type filter
      if (selectedTypeFilter !== 'ALL') {
        if (selectedTypeFilter === 'FUEL_TRANSFER' && !tx.transactionType.includes('FuelTransfer')) return false;
        if (selectedTypeFilter === 'CHECK_IN' && !tx.transactionType.includes('CheckIn')) return false;
        if (selectedTypeFilter === 'CHECK_OUT' && !tx.transactionType.includes('CheckOut')) return false;
        if (selectedTypeFilter === 'POWER' && !tx.transactionType.includes('Power')) return false;
      }

      // Device filter
      if (selectedDevice !== 'ALL' && tx.deviceId !== selectedDevice) {
        return false;
      }

      // Date filter
      if (selectedDateFilter === 'TODAY') {
        if (!tx.transactionTimestamp.startsWith(todayStr)) return false;
      } else if (selectedDateFilter === '7DAYS') {
        if (tx.transactionTimestamp < sevenDaysAgo) return false;
      }

      return true;
    });
  }, [transactions, searchQuery, selectedTypeFilter, selectedDevice, selectedDateFilter]);

  // Totals in current view
  const summaryFuelLitres = useMemo(() => {
    return filteredTransactions.reduce((acc, t) => acc + (t.fuelTransferLitres || 0), 0);
  }, [filteredTransactions]);

  const summaryDefLitres = useMemo(() => {
    return filteredTransactions.reduce((acc, t) => acc + (t.defTransferLitres || 0), 0);
  }, [filteredTransactions]);

  // CSV Export
  const handleExportCsv = () => {
    const headers = [
      'TransactionUUID',
      'EquipmentId',
      'AssetType',
      'TransactionType',
      'TransactionTimestamp',
      'UploadTimestamp',
      'FuelTransferLitres',
      'DefTransferLitres',
      'CheckInFuelPercentage',
      'CheckOutFuelPercentage',
      'CheckInFuelEighths',
      'CheckOutFuelEighths',
      'CheckInDefPercentage',
      'CheckOutDefPercentage',
      'CheckInKWH',
      'CheckOutKWH',
      'DeviceId',
      'SyncStatus',
    ];

    const rows = filteredTransactions.map((t) => {
      const eq = assetMap.get(t.equipmentId);
      return [
        `"${t.id}"`,
        `"${t.equipmentId}"`,
        `"${eq?.type || 'UNKNOWN'}"`,
        `"${t.transactionType}"`,
        `"${t.transactionTimestamp}"`,
        `"${t.uploadTimestamp || ''}"`,
        t.fuelTransferLitres ?? '""',
        t.defTransferLitres ?? '""',
        t.checkInFuelPercentage ?? '""',
        t.checkOutFuelPercentage ?? '""',
        t.checkInFuelEighths ?? '""',
        t.checkOutFuelEighths ?? '""',
        t.checkInDefPercentage ?? '""',
        t.checkOutDefPercentage ?? '""',
        t.checkInKWH ?? '""',
        t.checkOutKWH ?? '""',
        `"${t.deviceId || ''}"`,
        `"${t.syncStatus}"`,
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `TTD_Transactions_Audit_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="admin-page-container">
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--adm-font-display)', fontSize: '1.65rem', fontWeight: 800, color: '#ffffff' }}>
            Master Transactions Audit Log
          </h1>
          <p style={{ fontSize: '0.86rem', color: 'var(--adm-text-secondary)', marginTop: '2px' }}>
            Complete historical audit trail of fuel transfers, gauge inspections, and generator energizations
          </p>
        </div>

        <button onClick={handleExportCsv} className="admin-btn admin-btn-secondary">
          <Download size={15} />
          <span>Export Transactions CSV</span>
        </button>
      </div>

      {/* Quick Summary Pill Bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '14px',
          marginBottom: '22px',
        }}
      >
        <div style={{ background: 'var(--adm-surface-1)', padding: '14px 18px', borderRadius: '10px', border: '1px solid var(--adm-border-subtle)' }}>
          <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--adm-text-muted)', fontWeight: 700 }}>
            Filtered Records
          </span>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ffffff', fontFamily: 'var(--adm-font-mono)' }}>
            {filteredTransactions.length}
          </div>
        </div>

        <div style={{ background: 'var(--adm-surface-1)', padding: '14px 18px', borderRadius: '10px', border: '1px solid var(--adm-border-subtle)' }}>
          <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--adm-text-muted)', fontWeight: 700 }}>
            Diesel Transferred
          </span>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#06b6d4', fontFamily: 'var(--adm-font-mono)' }}>
            {summaryFuelLitres.toLocaleString()} L
          </div>
        </div>

        <div style={{ background: 'var(--adm-surface-1)', padding: '14px 18px', borderRadius: '10px', border: '1px solid var(--adm-border-subtle)' }}>
          <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--adm-text-muted)', fontWeight: 700 }}>
            DEF Transferred
          </span>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#3b82f6', fontFamily: 'var(--adm-font-mono)' }}>
            {summaryDefLitres.toLocaleString()} L
          </div>
        </div>
      </div>

      {/* Control Bar: Filters & Search */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '14px',
          marginBottom: '20px',
          background: 'var(--adm-surface-1)',
          padding: '16px 20px',
          borderRadius: 'var(--adm-radius-lg)',
          border: '1px solid var(--adm-border-subtle)',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
          {/* Search Box */}
          <div className="admin-search-box">
            <Search size={16} className="admin-search-icon" />
            <input
              type="text"
              className="admin-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search UUID, asset ID, PDA..."
            />
          </div>

          {/* Action Type Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Filter size={14} color="#94a3b8" />
            <select
              className="admin-select"
              style={{ width: '180px', padding: '9px 12px', fontSize: '0.84rem' }}
              value={selectedTypeFilter}
              onChange={(e) => setSelectedTypeFilter(e.target.value)}
            >
              <option value="ALL">All Actions</option>
              <option value="FUEL_TRANSFER">⛽ Fuel Transfers</option>
              <option value="CHECK_IN">📥 Check-Ins</option>
              <option value="CHECK_OUT">📤 Check-Outs</option>
              <option value="POWER">⚡ Power Events</option>
            </select>
          </div>

          {/* Device Filter */}
          {uniqueDevices.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Smartphone size={14} color="#94a3b8" />
              <select
                className="admin-select"
                style={{ width: '180px', padding: '9px 12px', fontSize: '0.84rem' }}
                value={selectedDevice}
                onChange={(e) => setSelectedDevice(e.target.value)}
              >
                <option value="ALL">All Field Devices</option>
                {uniqueDevices.map((dev) => (
                  <option key={dev} value={dev}>
                    {dev}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Date Filters */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {[
            { key: 'ALL', label: 'All Time' },
            { key: '7DAYS', label: 'Past 7 Days' },
            { key: 'TODAY', label: 'Today Only' },
          ].map((d) => (
            <button
              key={d.key}
              onClick={() => setSelectedDateFilter(d.key as any)}
              className={`admin-btn ${selectedDateFilter === d.key ? 'admin-btn-secondary' : 'admin-btn-outline'} admin-btn-sm`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table */}
      {filteredTransactions.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '60px 20px',
            background: 'var(--adm-surface-1)',
            borderRadius: 'var(--adm-radius-lg)',
            border: '1px solid var(--adm-border-subtle)',
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📋</div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ffffff', marginBottom: '6px' }}>
            No transactions match current filters
          </h3>
          <p style={{ color: 'var(--adm-text-secondary)', fontSize: '0.9rem', marginBottom: '18px' }}>
            Try resetting your search query, action type filter, or date range.
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedTypeFilter('ALL');
              setSelectedDevice('ALL');
              setSelectedDateFilter('ALL');
            }}
            className="admin-btn admin-btn-secondary"
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Timestamp (Local)</th>
                <th>Target Asset ID</th>
                <th>Classification</th>
                <th>Transaction Action</th>
                <th>Telemetry Readout</th>
                <th>Field PDA Device</th>
                <th>Sync Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map((tx) => {
                const eq = assetMap.get(tx.equipmentId);
                const isPower = tx.transactionType.includes('Power');
                const isFuel = tx.transactionType.includes('Fuel');

                return (
                  <tr key={tx.id}>
                    {/* Timestamp */}
                    <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }} className="admin-mono">
                      <Clock size={12} style={{ display: 'inline', marginRight: '6px', color: '#64748b' }} />
                      {tx.transactionTimestamp}
                    </td>

                    {/* Equipment ID */}
                    <td>
                      <button
                        onClick={() => onSelectAsset(tx.equipmentId)}
                        style={{
                          background: 'none',
                          border: 'none',
                          fontFamily: 'var(--adm-font-mono)',
                          fontWeight: 800,
                          color: '#fbbf24',
                          cursor: 'pointer',
                          fontSize: '0.88rem',
                        }}
                      >
                        {tx.equipmentId}
                      </button>
                    </td>

                    {/* Asset Type */}
                    <td>
                      {eq ? (
                        <span className={`admin-badge admin-badge-${eq.type.toLowerCase()}`}>
                          {eq.type}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--adm-text-muted)' }}>Unknown</span>
                      )}
                    </td>

                    {/* Action Type */}
                    <td>
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: '0.84rem',
                          color: isFuel ? '#06b6d4' : isPower ? '#10b981' : '#f59e0b',
                        }}
                      >
                        {tx.transactionType}
                      </span>
                    </td>

                    {/* Telemetry Readout */}
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
                        <span>{tx.checkInFuelPercentage}% in </span>
                      )}
                      {tx.checkOutFuelPercentage !== undefined && (
                        <span>{tx.checkOutFuelPercentage}% out </span>
                      )}
                      {tx.checkInFuelEighths !== undefined && (
                        <span>{tx.checkInFuelEighths}/8 in </span>
                      )}
                      {tx.checkOutFuelEighths !== undefined && (
                        <span>{tx.checkOutFuelEighths}/8 out </span>
                      )}
                      {tx.checkInKWH !== undefined && (
                        <span style={{ color: '#10b981' }}>{tx.checkInKWH.toLocaleString()} kWh </span>
                      )}
                      {!tx.fuelTransferLitres &&
                        tx.checkInFuelPercentage === undefined &&
                        tx.checkInFuelEighths === undefined &&
                        tx.checkInKWH === undefined && (
                          <span style={{ color: 'var(--adm-text-muted)' }}>Status Recorded</span>
                        )}
                    </td>

                    {/* Device ID */}
                    <td style={{ fontSize: '0.78rem', color: 'var(--adm-text-secondary)' }} className="admin-mono">
                      {tx.deviceId || 'PDA-Zebra'}
                    </td>

                    {/* Sync Status */}
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.74rem', color: '#10b981' }}>
                        <CheckCircle2 size={12} />
                        <span>Synced</span>
                      </span>
                    </td>

                    {/* Actions */}
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => onInspectTransaction(tx)}
                        className="admin-btn admin-btn-outline admin-btn-sm"
                        style={{ padding: '4px 8px' }}
                      >
                        <Eye size={13} />
                        <span>Inspect</span>
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
  );
};
