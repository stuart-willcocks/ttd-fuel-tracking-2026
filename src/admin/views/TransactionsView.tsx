import React, { useState, useMemo } from 'react';
import {
  Search,
  Download,
  Filter,
  Clock,
  CheckCircle2,
  Smartphone,
  X,
  Edit,
  QrCode,
  Zap,
  Trash2,
  MapPin,
  Boxes,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import type { Transaction, Equipment } from '../../types';
import { formatAdminTimestamp } from '../../utils/dateFormat';
import { getGeneratorPowerState } from '../../utils/powerState';

interface TransactionsViewProps {
  transactions: Transaction[];
  assets: Equipment[];
  selectedAssetId?: string | null;
  onSelectAsset: (equipmentId: string | null) => void;
  onInspectTransaction?: (tx: Transaction) => void;
  onOpenEditModal?: (asset: Equipment) => void;
  onOpenDeleteModal?: (asset: Equipment) => void;
  onOpenQRModal?: (asset: Equipment) => void;
  onTogglePower?: (asset: Equipment) => void;
  onDeleteTransaction?: (transactionId: string) => Promise<void>;
}

const isSet = (v: unknown): v is number =>
  v !== undefined && v !== null && v !== '' && !isNaN(Number(v));

const renderTransactionValues = (tx: Transaction, eq?: Equipment) => {
  // PoweredUp and PoweredDown transactions: leave Transaction values blank
  if (
    tx.transactionType === 'PoweredUp' ||
    tx.transactionType === 'PoweredDown' ||
    tx.transactionType.toLowerCase().includes('power')
  ) {
    return null;
  }

  const isCheckOut = tx.transactionType.includes('CheckOut');
  const fuelPct = isCheckOut
    ? (tx.checkOutFuelPercentage ?? tx.checkInFuelPercentage)
    : (tx.checkInFuelPercentage ?? tx.checkOutFuelPercentage);
  const defPct = isCheckOut
    ? (tx.checkOutDefPercentage ?? tx.checkInDefPercentage)
    : (tx.checkInDefPercentage ?? tx.checkOutDefPercentage);
  const kwhVal = isCheckOut
    ? (tx.checkOutKWH ?? tx.checkInKWH)
    : (tx.checkInKWH ?? tx.checkOutKWH);
  const fuelEighths = isCheckOut
    ? (tx.checkOutFuelEighths ?? tx.checkInFuelEighths)
    : (tx.checkInFuelEighths ?? tx.checkOutFuelEighths);

  const hasTransfer = isSet(tx.fuelTransferLitres) || isSet(tx.defTransferLitres);
  const hasTelemetry =
    hasTransfer ||
    isSet(fuelPct) ||
    isSet(defPct) ||
    isSet(kwhVal) ||
    isSet(fuelEighths);

  if (!hasTelemetry) {
    return <span style={{ color: 'var(--adm-text-muted)' }}>Status Recorded</span>;
  }

  // 1. Fuel Transfer
  if (hasTransfer) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        {isSet(tx.fuelTransferLitres) && (
          <span>
            <span style={{ color: '#000000', fontWeight: 600 }}>Fuel: </span>
            <span style={{ color: '#2563EB', fontWeight: 600 }}>{tx.fuelTransferLitres} L</span>
          </span>
        )}
        {isSet(tx.defTransferLitres) && (
          <span>
            <span style={{ color: '#000000', fontWeight: 600 }}>DEF: </span>
            <span style={{ color: '#2563EB', fontWeight: 600 }}>{tx.defTransferLitres} L</span>
          </span>
        )}
      </span>
    );
  }

  // Determine equipment type: GENERATOR, TANK, PLANT
  const rawType = eq?.type || (
    tx.transactionType.includes('Tank') ? 'TANK' :
    tx.transactionType.includes('Plant') ? 'PLANT' :
    'GENERATOR'
  );

  // 2. TANK Check-In / Check-Out
  if (rawType === 'TANK') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        {isSet(fuelEighths) ? (
          <span>
            <span style={{ color: '#000000', fontWeight: 600 }}>Fuel: </span>
            <span style={{ color: '#2563EB', fontWeight: 600 }}>{fuelEighths}/8</span>
          </span>
        ) : isSet(fuelPct) ? (
          <span>
            <span style={{ color: '#000000', fontWeight: 600 }}>Fuel: </span>
            <span style={{ color: '#2563EB', fontWeight: 600 }}>{fuelPct}%</span>
          </span>
        ) : null}
      </span>
    );
  }

  // 3. PLANT Check-In / Check-Out
  if (rawType === 'PLANT') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        {isSet(fuelPct) && (
          <span>
            <span style={{ color: '#000000', fontWeight: 600 }}>Fuel: </span>
            <span style={{ color: '#2563EB', fontWeight: 600 }}>{fuelPct}%</span>
          </span>
        )}
      </span>
    );
  }

  // 4. GENERATOR Check-In / Check-Out: Fuel: {fuel_percentage}% DEF: {def_percentage}% kWh: {kWh_value}
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      {isSet(fuelPct) && (
        <span>
          <span style={{ color: '#000000', fontWeight: 600 }}>Fuel: </span>
          <span style={{ color: '#2563EB', fontWeight: 600 }}>{fuelPct}%</span>
        </span>
      )}
      {isSet(defPct) && (
        <span>
          <span style={{ color: '#000000', fontWeight: 600 }}>DEF: </span>
          <span style={{ color: '#2563EB', fontWeight: 600 }}>{defPct}%</span>
        </span>
      )}
      {isSet(kwhVal) && (
        <span>
          <span style={{ color: '#000000', fontWeight: 600 }}>kWh: </span>
          <span style={{ color: '#2563EB', fontWeight: 600 }}>{typeof kwhVal === 'number' ? kwhVal.toLocaleString() : kwhVal}</span>
        </span>
      )}
    </span>
  );
};

export const TransactionsView: React.FC<TransactionsViewProps> = ({
  transactions,
  assets,
  selectedAssetId,
  onSelectAsset,
  onOpenEditModal,
  onOpenDeleteModal,
  onOpenQRModal,
  onTogglePower,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('ALL');
  const [selectedDevice, setSelectedDevice] = useState<string>('ALL');
  const [selectedDateFilter, setSelectedDateFilter] = useState<'ALL' | 'TODAY' | '7DAYS'>('ALL');

  // Asset lookup map for speed
  const assetMap = useMemo(() => {
    return new Map(assets.map((a) => [a.equipmentId, a]));
  }, [assets]);

  // Selected asset object
  const currentAsset = useMemo(() => {
    if (!selectedAssetId) return null;
    return assetMap.get(selectedAssetId) || null;
  }, [selectedAssetId, assetMap]);

  // Transaction counts per asset
  const txCountsByAsset = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of transactions) {
      map[t.equipmentId] = (map[t.equipmentId] || 0) + 1;
    }
    return map;
  }, [transactions]);

  // Unique devices
  const uniqueDevices = useMemo(() => {
    return Array.from(new Set(transactions.map((t) => t.deviceId).filter(Boolean))) as string[];
  }, [transactions]);

  // Reference date values initialized on mount
  const [dateReferences] = useState(() => {
    const d = new Date();
    return {
      todayStr: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      sevenDaysAgoTime: d.getTime() - 7 * 24 * 60 * 60 * 1000,
    };
  });
  const { todayStr, sevenDaysAgoTime } = dateReferences;

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      // Asset filter
      if (selectedAssetId && tx.equipmentId !== selectedAssetId) {
        return false;
      }

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
        const txTime = new Date(tx.transactionTimestamp).getTime();
        if (txTime < sevenDaysAgoTime) return false;
      }

      return true;
    });
  }, [transactions, selectedAssetId, searchQuery, selectedTypeFilter, selectedDevice, selectedDateFilter, todayStr, sevenDaysAgoTime]);

  // Sorting State
  type TxSortField = 'timestamp' | 'equipmentId' | 'type' | 'transactionType' | 'values' | 'deviceId' | 'syncStatus';
  type SortDirection = 'asc' | 'desc';

  const [sortField, setSortField] = useState<TxSortField>('timestamp');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (field: TxSortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(field === 'timestamp' ? 'desc' : 'asc');
    }
  };

  const renderSortIndicator = (field: TxSortField) => {
    if (sortField !== field) {
      return <ArrowUpDown size={12} style={{ opacity: 0.35, marginLeft: '6px' }} />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp size={12} style={{ color: 'var(--adm-accent-yellow)', marginLeft: '6px' }} />
    ) : (
      <ArrowDown size={12} style={{ color: 'var(--adm-accent-yellow)', marginLeft: '6px' }} />
    );
  };

  // Sorted Transactions
  const sortedTransactions = useMemo(() => {
    return [...filteredTransactions].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'timestamp': {
          const timeA = new Date(a.transactionTimestamp).getTime();
          const timeB = new Date(b.transactionTimestamp).getTime();
          comparison = timeA - timeB;
          break;
        }
        case 'equipmentId':
          comparison = a.equipmentId.localeCompare(b.equipmentId, undefined, { numeric: true, sensitivity: 'base' });
          break;
        case 'type': {
          const typeA = assetMap.get(a.equipmentId)?.type || '';
          const typeB = assetMap.get(b.equipmentId)?.type || '';
          comparison = typeA.localeCompare(typeB);
          break;
        }
        case 'transactionType':
          comparison = a.transactionType.localeCompare(b.transactionType);
          break;
        case 'values': {
          const valA = (a.fuelTransferLitres || 0) + (a.defTransferLitres || 0) + (a.checkInFuelPercentage || a.checkOutFuelPercentage || 0) + (a.checkInKWH || a.checkOutKWH || 0);
          const valB = (b.fuelTransferLitres || 0) + (b.defTransferLitres || 0) + (b.checkInFuelPercentage || b.checkOutFuelPercentage || 0) + (b.checkInKWH || b.checkOutKWH || 0);
          comparison = valA - valB;
          break;
        }
        case 'deviceId':
          comparison = (a.deviceId || '').localeCompare(b.deviceId || '');
          break;
        case 'syncStatus':
          comparison = (a.syncStatus || '').localeCompare(b.syncStatus || '');
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredTransactions, sortField, sortDirection, assetMap]);

  // Fuel telemetry totals for currently filtered transactions
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

    const rows = sortedTransactions.map((t) => {
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
    const filenameAssetPart = selectedAssetId ? `_${selectedAssetId}` : '';
    link.setAttribute('download', `TTD_Transactions${filenameAssetPart}_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isCurrentAssetRunning = Boolean(
    currentAsset &&
      currentAsset.type === 'GENERATOR' &&
      getGeneratorPowerState(currentAsset.equipmentId, transactions).isOn
  );

  return (
    <div className="admin-page-container" style={{ width: '100%', maxWidth: '100%' }}>
      {/* Top Action Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: currentAsset ? 'space-between' : 'flex-end', marginBottom: '20px', flexWrap: 'wrap', gap: '14px' }}>
        {currentAsset && (
          <div>
            <h2 style={{ fontFamily: 'var(--adm-font-display)', fontSize: '1.35rem', fontWeight: 800, color: 'var(--adm-text-primary)', margin: 0 }}>
              Transactions: {currentAsset.equipmentId}
            </h2>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {selectedAssetId && (
            <button
              onClick={() => onSelectAsset(null)}
              className="admin-btn admin-btn-outline"
              title="View transactions for all equipment"
            >
              <X size={15} />
              <span>Show All Assets</span>
            </button>
          )}

          <button onClick={handleExportCsv} className="admin-btn admin-btn-secondary">
            <Download size={15} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Asset Context Banner (When an asset is selected) */}
      {currentAsset && (
        <div
          className="admin-card"
          style={{
            marginBottom: '22px',
            padding: '20px 24px',
            borderTop: `2px solid ${
              currentAsset.type === 'GENERATOR' ? 'var(--adm-accent-yellow)' : 'var(--adm-border-subtle)'
            }`,
          }}
        >
          {/* Top Row: Identity & Action Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className={`admin-badge admin-badge-${currentAsset.type.toLowerCase()}`} style={{ fontSize: '0.82rem', padding: '4px 10px' }}>
                {currentAsset.type}
              </span>

              {currentAsset.type === 'GENERATOR' && (
                <span className={`admin-badge ${isCurrentAssetRunning ? 'admin-badge-running' : 'admin-badge-standby'}`}>
                  <span className={`pulse-dot ${isCurrentAssetRunning ? 'green' : 'slate'}`} />
                  {isCurrentAssetRunning ? 'ON' : 'OFF'}
                </span>
              )}

              <span
                style={{
                  fontFamily: 'var(--adm-font-mono)',
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  color: 'var(--adm-text-primary)',
                }}
              >
                {currentAsset.equipmentId}
              </span>
            </div>

            {/* Direct Asset Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {onOpenEditModal && (
                <button
                  onClick={() => onOpenEditModal(currentAsset)}
                  className="admin-btn admin-btn-outline admin-btn-sm"
                  title="Edit asset specifications"
                >
                  <Edit size={14} />
                  <span>Edit Asset</span>
                </button>
              )}

              {onOpenQRModal && (
                <button
                  onClick={() => onOpenQRModal(currentAsset)}
                  className="admin-btn admin-btn-outline admin-btn-sm"
                  title="Generate & print physical QR label tag"
                >
                  <QrCode size={14} />
                  <span>Print QR Tag</span>
                </button>
              )}

              {currentAsset.type === 'GENERATOR' && onTogglePower && (
                <button
                  onClick={() => onTogglePower(currentAsset)}
                  className="admin-btn admin-btn-outline admin-btn-sm"
                  title={isCurrentAssetRunning ? 'Turn OFF' : 'Turn ON'}
                  style={{ color: isCurrentAssetRunning ? '#F87171' : '#4ADE80' }}
                >
                  <Zap size={14} />
                  <span>{isCurrentAssetRunning ? 'Turn OFF' : 'Turn ON'}</span>
                </button>
              )}

              {onOpenDeleteModal && (
                <button
                  onClick={() => onOpenDeleteModal(currentAsset)}
                  className="admin-btn admin-btn-outline admin-btn-sm"
                  title="Decommission & delete asset"
                  style={{ color: '#F87171' }}
                >
                  <Trash2 size={14} />
                  <span>Decommission</span>
                </button>
              )}
            </div>
          </div>

          {/* Bottom Row: Specifications Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '16px',
              padding: '14px 18px',
              background: 'var(--adm-surface-1)',
              borderRadius: 'var(--adm-radius-md)',
              border: '1px solid var(--adm-border-subtle)',
            }}
          >
            <div>
              <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--adm-text-muted)', fontWeight: 700 }}>
                Zone &amp; Location
              </span>
              <p style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--adm-text-primary)', margin: '3px 0 0' }}>
                {currentAsset.area}
              </p>
              <p style={{ fontSize: '0.78rem', color: 'var(--adm-text-secondary)', margin: '1px 0 0' }}>
                {currentAsset.location}
              </p>
            </div>

            <div>
              <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--adm-text-muted)', fontWeight: 700 }}>
                Capacity / Rating
              </span>
              <p style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--adm-text-primary)', margin: '3px 0 0' }}>
                {currentAsset.type === 'GENERATOR' && currentAsset.capacity ? `${currentAsset.capacity} kVA` : null}
                {currentAsset.type === 'TANK' && currentAsset.capacity ? `${currentAsset.capacity.toLocaleString()} Litres` : null}
                {currentAsset.type === 'PLANT' ? 'Unrated' : null}
              </p>
            </div>

            <div>
              <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--adm-text-muted)', fontWeight: 700 }}>
                What3Words
              </span>
              <p style={{ fontFamily: 'var(--adm-font-mono)', fontWeight: 600, fontSize: '0.82rem', margin: '3px 0 0' }}>
                <a
                  href={`https://what3words.com/${currentAsset.what3words.replace(/^\/\/\//, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--adm-accent-yellow)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                >
                  <MapPin size={11} />
                  <span>{currentAsset.what3words}</span>
                </a>
              </p>
            </div>

            <div>
              <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--adm-text-muted)', fontWeight: 700 }}>
                Rental Serial #
              </span>
              <p style={{ fontFamily: 'var(--adm-font-mono)', fontWeight: 600, fontSize: '0.82rem', color: 'var(--adm-text-primary)', margin: '3px 0 0' }}>
                {currentAsset.rentalSerialNumber || '—'}
              </p>
            </div>

            <div>
              <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--adm-text-muted)', fontWeight: 700 }}>
                Transferred Telemetry
              </span>
              <p style={{ fontSize: '0.85rem', fontWeight: 600, margin: '3px 0 0', color: 'var(--adm-text-primary)' }}>
                {summaryFuelLitres > 0 ? `${summaryFuelLitres.toLocaleString()} L Diesel` : '0 L Diesel'}
                {summaryDefLitres > 0 && ` • ${summaryDefLitres.toLocaleString()} L DEF`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Control Bar: Full-Width Search & Filter Toolbar */}
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
              placeholder="Search"
            />
          </div>

          {/* Asset Dropdown Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Boxes size={15} color="#94a3b8" />
            <select
              className="admin-select"
              style={{ width: '220px', padding: '9px 12px', fontSize: '0.84rem' }}
              value={selectedAssetId || 'ALL'}
              onChange={(e) => onSelectAsset(e.target.value === 'ALL' ? null : e.target.value)}
            >
              <option value="ALL">All equipment IDs</option>
              {assets.map((a) => (
                <option key={a.equipmentId} value={a.equipmentId}>
                  {a.equipmentId} • {a.area} ({txCountsByAsset[a.equipmentId] || 0})
                </option>
              ))}
            </select>
          </div>

          {/* Action Type Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Filter size={14} color="#94a3b8" />
            <select
              className="admin-select"
              style={{ width: '175px', padding: '9px 12px', fontSize: '0.84rem' }}
              value={selectedTypeFilter}
              onChange={(e) => setSelectedTypeFilter(e.target.value)}
            >
              <option value="ALL">All transaction types</option>
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
                style={{ width: '160px', padding: '9px 12px', fontSize: '0.84rem' }}
                value={selectedDevice}
                onChange={(e) => setSelectedDevice(e.target.value)}
              >
                <option value="ALL">All devices</option>
                {uniqueDevices.map((dev) => (
                  <option key={dev} value={dev}>
                    {dev}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Date Filter Pills */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {[
            { key: 'ALL', label: 'All Time' },
            { key: '7DAYS', label: 'Past 7 Days' },
            { key: 'TODAY', label: 'Today Only' },
          ].map((d) => (
            <button
              key={d.key}
              onClick={() => setSelectedDateFilter(d.key as 'ALL' | 'TODAY' | '7DAYS')}
              className={`admin-btn ${selectedDateFilter === d.key ? 'admin-btn-secondary' : 'admin-btn-outline'} admin-btn-sm`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Full-Width Table */}
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
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--adm-text-primary)', marginBottom: '6px' }}>
            No transactions match current filters
          </h3>
          <p style={{ color: 'var(--adm-text-secondary)', fontSize: '0.9rem', marginBottom: '18px' }}>
            {selectedAssetId
              ? `No transactions recorded yet for asset ${selectedAssetId}.`
              : 'Try resetting your search query, action type filter, or date range.'}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
            {selectedAssetId && (
              <button onClick={() => onSelectAsset(null)} className="admin-btn admin-btn-primary">
                Show All Assets
              </button>
            )}
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedTypeFilter('ALL');
                setSelectedDevice('ALL');
                setSelectedDateFilter('ALL');
              }}
              className="admin-btn admin-btn-secondary"
            >
              Clear Search Filters
            </button>
          </div>
        </div>
      ) : (
        <div className="admin-table-container" style={{ width: '100%' }}>
          <table className="admin-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('timestamp')}>
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span>Timestamp (Local)</span>
                    {renderSortIndicator('timestamp')}
                  </div>
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('equipmentId')}>
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span>Equipment ID</span>
                    {renderSortIndicator('equipmentId')}
                  </div>
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('type')}>
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span>Equipment type</span>
                    {renderSortIndicator('type')}
                  </div>
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('transactionType')}>
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span>Transaction type</span>
                    {renderSortIndicator('transactionType')}
                  </div>
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('values')}>
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span>Transaction values</span>
                    {renderSortIndicator('values')}
                  </div>
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('deviceId')}>
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span>Device ID</span>
                    {renderSortIndicator('deviceId')}
                  </div>
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('syncStatus')}>
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span>Sync to database</span>
                    {renderSortIndicator('syncStatus')}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedTransactions.map((tx) => {
                const eq = assetMap.get(tx.equipmentId);

                return (
                  <tr key={tx.id}>
                    {/* Timestamp */}
                    <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }} className="admin-mono">
                      <Clock size={12} style={{ display: 'inline', marginRight: '6px', color: '#64748b' }} />
                      {formatAdminTimestamp(tx.transactionTimestamp)}
                    </td>

                    {/* Equipment ID */}
                    <td>
                      <button
                        onClick={() => onSelectAsset(tx.equipmentId)}
                        style={{
                          background: 'none',
                          border: 'none',
                          fontFamily: 'var(--adm-font-mono)',
                          fontWeight: 700,
                          color: 'var(--adm-accent-yellow)',
                          cursor: 'pointer',
                          fontSize: '0.88rem',
                          padding: 0,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                        title={`Filter transactions for ${tx.equipmentId}`}
                      >
                        <span>{tx.equipmentId}</span>
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
                          color: 'var(--adm-text-primary)',
                        }}
                      >
                        {tx.transactionType}
                      </span>
                    </td>

                    {/* Telemetry Readout */}
                    <td style={{ fontSize: '0.84rem' }}>
                      {renderTransactionValues(tx, eq)}
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
