import React, { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  Download,
  QrCode,
  Edit,
  MapPin,
  LayoutGrid,
  Table as TableIcon,
  ReceiptText,
  AlertTriangle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import type { Equipment, Transaction } from '../../types';
import { EquipmentTypeIcon } from '../../components/EquipmentTypeIcon';
import { getGeneratorPowerState } from '../../utils/powerState';

interface AssetsViewProps {
  assets: Equipment[];
  transactions: Transaction[];
  onOpenCreateModal: () => void;
  onOpenEditModal: (asset: Equipment) => void;
  onOpenQRModal: (asset: Equipment) => void;
  onSelectAsset: (equipmentId: string) => void;
  onOpenDangerZone?: () => void;
}

type FilterType = 'ALL' | 'GENERATOR' | 'TANK' | 'PLANT' | 'RUNNING' | 'STANDBY';

export const AssetsView: React.FC<AssetsViewProps> = ({
  assets,
  transactions,
  onOpenCreateModal,
  onOpenEditModal,
  onOpenQRModal,
  onSelectAsset,
  onOpenDangerZone,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('ALL');
  const [viewMode, setViewMode] = useState<'TABLE' | 'GRID'>('TABLE');

  // Transaction counts per asset
  const txCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of transactions) {
      map[t.equipmentId] = (map[t.equipmentId] || 0) + 1;
    }
    return map;
  }, [transactions]);

  // Filtered Assets
  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      // Search query
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        asset.equipmentId.toLowerCase().includes(q) ||
        asset.area.toLowerCase().includes(q) ||
        asset.location.toLowerCase().includes(q) ||
        asset.what3words.toLowerCase().includes(q) ||
        asset.rentalSerialNumber.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      // Classification / Power filter
      const isRunning = asset.type === 'GENERATOR' && getGeneratorPowerState(asset.equipmentId, transactions).isOn;
      if (activeFilter === 'GENERATOR' && asset.type !== 'GENERATOR') return false;
      if (activeFilter === 'TANK' && asset.type !== 'TANK') return false;
      if (activeFilter === 'PLANT' && asset.type !== 'PLANT') return false;
      if (activeFilter === 'RUNNING' && (!isRunning || asset.type !== 'GENERATOR')) return false;
      if (activeFilter === 'STANDBY' && (isRunning || asset.type !== 'GENERATOR')) return false;

      return true;
    });
  }, [assets, transactions, searchQuery, activeFilter]);

  // Counts for pills
  const counts = useMemo(() => {
    return {
      all: assets.length,
      generator: assets.filter((a) => a.type === 'GENERATOR').length,
      tank: assets.filter((a) => a.type === 'TANK').length,
      plant: assets.filter((a) => a.type === 'PLANT').length,
      running: assets.filter((a) => a.type === 'GENERATOR' && getGeneratorPowerState(a.equipmentId, transactions).isOn).length,
      standby: assets.filter((a) => a.type === 'GENERATOR' && !getGeneratorPowerState(a.equipmentId, transactions).isOn).length,
    };
  }, [assets, transactions]);

  // Sorting State
  type AssetSortField = 'equipmentId' | 'type' | 'capacity' | 'location' | 'what3words' | 'rentalSerialNumber' | 'powerState';
  type SortDirection = 'asc' | 'desc';

  const [sortField, setSortField] = useState<AssetSortField>('equipmentId');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const handleSort = (field: AssetSortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Sorted Assets
  const sortedAssets = useMemo(() => {
    return [...filteredAssets].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'equipmentId':
          comparison = a.equipmentId.localeCompare(b.equipmentId, undefined, { numeric: true, sensitivity: 'base' });
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
        case 'capacity':
          comparison = (a.capacity || 0) - (b.capacity || 0);
          break;
        case 'location': {
          const locA = `${a.area} ${a.location}`;
          const locB = `${b.area} ${b.location}`;
          comparison = locA.localeCompare(locB);
          break;
        }
        case 'what3words':
          comparison = (a.what3words || '').localeCompare(b.what3words || '');
          break;
        case 'rentalSerialNumber':
          comparison = (a.rentalSerialNumber || '').localeCompare(b.rentalSerialNumber || '');
          break;
        case 'powerState': {
          const aOn = a.type === 'GENERATOR' && getGeneratorPowerState(a.equipmentId, transactions).isOn ? 1 : 0;
          const bOn = b.type === 'GENERATOR' && getGeneratorPowerState(b.equipmentId, transactions).isOn ? 1 : 0;
          comparison = aOn - bOn;
          break;
        }
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredAssets, sortField, sortDirection, transactions]);

  const renderSortIndicator = (field: AssetSortField) => {
    if (sortField !== field) {
      return <ArrowUpDown size={12} style={{ opacity: 0.35, marginLeft: '6px' }} />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp size={12} style={{ color: 'var(--adm-accent-yellow)', marginLeft: '6px' }} />
    ) : (
      <ArrowDown size={12} style={{ color: 'var(--adm-accent-yellow)', marginLeft: '6px' }} />
    );
  };

  // Export to CSV
  const handleExportCsv = () => {
    const headers = [
      'EquipmentId',
      'Type',
      'Capacity',
      'Area',
      'Location',
      'What3Words',
      'RentalSerialNumber',
      'PoweredUpTimestamp',
      'PoweredDownTimestamp',
      'UpdatedAt',
    ];

    const rows = sortedAssets.map((a) => [
      `"${a.equipmentId}"`,
      `"${a.type}"`,
      a.capacity !== undefined ? a.capacity : '""',
      `"${a.area.replace(/"/g, '""')}"`,
      `"${a.location.replace(/"/g, '""')}"`,
      `"${a.what3words.replace(/"/g, '""')}"`,
      `"${a.rentalSerialNumber.replace(/"/g, '""')}"`,
      `"${a.poweredUpTimestamp || ''}"`,
      `"${a.poweredDownTimestamp || ''}"`,
      `"${a.updatedAt || ''}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `TTD_Fleet_Assets_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="admin-page-container">
      {/* Top Action Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginBottom: '20px' }}>
        <button onClick={handleExportCsv} className="admin-btn admin-btn-secondary">
          <Download size={15} />
          <span>Export CSV</span>
        </button>

        <button onClick={onOpenCreateModal} className="admin-btn admin-btn-primary">
          <Plus size={16} />
          <span>Add New Asset</span>
        </button>

        {onOpenDangerZone && (
          <button
            onClick={onOpenDangerZone}
            className="admin-btn"
            style={{
              background: '#ef4444',
              color: '#ffffff',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              border: '1px solid #dc2626',
            }}
            title="Open Danger Zone database management"
          >
            <AlertTriangle size={15} />
            <span>Danger zone</span>
          </button>
        )}
      </div>

      {/* Control Bar: Search & View Toggle */}
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
        </div>

        {/* View Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--adm-surface-2)', padding: '3px', borderRadius: '8px' }}>
          <button
            onClick={() => setViewMode('TABLE')}
            className={`admin-btn ${viewMode === 'TABLE' ? 'admin-btn-secondary' : 'admin-btn-outline'} admin-btn-sm`}
            style={{ padding: '6px 10px' }}
            title="Data Table View"
          >
            <TableIcon size={15} />
            <span>Table</span>
          </button>
          <button
            onClick={() => setViewMode('GRID')}
            className={`admin-btn ${viewMode === 'GRID' ? 'admin-btn-secondary' : 'admin-btn-outline'} admin-btn-sm`}
            style={{ padding: '6px 10px' }}
            title="Card Grid View"
          >
            <LayoutGrid size={15} />
            <span>Grid</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
        {[
          { key: 'ALL', label: 'All Equipment', count: counts.all },
          { key: 'GENERATOR', label: 'Generators', icon: <EquipmentTypeIcon type="GENERATOR" size={13} />, count: counts.generator },
          { key: 'TANK', label: 'Fuel Tanks', icon: <EquipmentTypeIcon type="TANK" size={13} />, count: counts.tank },
          { key: 'PLANT', label: 'Plant', icon: <EquipmentTypeIcon type="PLANT" size={13} />, count: counts.plant },
          { key: 'RUNNING', label: 'Generators (ON)', icon: <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ADE80', display: 'inline-block' }} />, count: counts.running },
          { key: 'STANDBY', label: 'Generators (OFF)', icon: <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#94A3B8', display: 'inline-block' }} />, count: counts.standby },
        ].map((tab) => {
          const isSelected = activeFilter === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key as FilterType)}
              className={`admin-btn ${isSelected ? 'admin-btn-primary' : 'admin-btn-outline'} admin-btn-sm`}
              style={{
                background: isSelected ? '#2563EB' : 'transparent',
                borderColor: isSelected ? '#2563EB' : 'var(--adm-border-medium)',
                color: isSelected ? '#FFFFFF' : 'var(--adm-text-primary)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: isSelected ? 700 : 500,
              }}
            >
              {tab.icon}
              <span>{tab.label}</span>
              <span
                style={{
                  fontSize: '0.72rem',
                  padding: '1px 6px',
                  borderRadius: '999px',
                  background: isSelected ? 'rgba(255, 255, 255, 0.25)' : 'var(--adm-surface-3)',
                  color: isSelected ? '#FFFFFF' : 'var(--adm-text-secondary)',
                  fontFamily: 'var(--adm-font-mono)',
                }}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Content Area */}
      {filteredAssets.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '60px 20px',
            background: 'var(--adm-surface-1)',
            borderRadius: 'var(--adm-radius-lg)',
            border: '1px solid var(--adm-border-subtle)',
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🔍</div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--adm-text-primary)', marginBottom: '6px' }}>
            No assets match your search criteria
          </h3>
          <p style={{ color: 'var(--adm-text-secondary)', fontSize: '0.9rem', marginBottom: '18px' }}>
            Try adjusting your search query or filter tabs.
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setActiveFilter('ALL');
            }}
            className="admin-btn admin-btn-secondary"
          >
            Reset Filters
          </button>
        </div>
      ) : viewMode === 'TABLE' ? (
        /* Data Table View */
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
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
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('capacity')}>
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span>Capacity</span>
                    {renderSortIndicator('capacity')}
                  </div>
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('location')}>
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span>Zone &amp; Location</span>
                    {renderSortIndicator('location')}
                  </div>
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('what3words')}>
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span>What3Words</span>
                    {renderSortIndicator('what3words')}
                  </div>
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('rentalSerialNumber')}>
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span>Rental Serial</span>
                    {renderSortIndicator('rentalSerialNumber')}
                  </div>
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('powerState')}>
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span>Power State</span>
                    {renderSortIndicator('powerState')}
                  </div>
                </th>
                <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedAssets.map((asset) => {
                const isRunning = asset.type === 'GENERATOR' && getGeneratorPowerState(asset.equipmentId, transactions).isOn;
                return (
                  <tr key={asset.equipmentId}>
                    {/* Equipment ID */}
                    <td>
                      <button
                        onClick={() => onSelectAsset(asset.equipmentId)}
                        style={{
                          background: 'none',
                          border: 'none',
                          fontFamily: 'var(--adm-font-mono)',
                          fontWeight: 700,
                          fontSize: '0.92rem',
                          color: 'var(--adm-accent-yellow)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <span>{asset.equipmentId}</span>
                      </button>
                    </td>

                    {/* Classification */}
                    <td>
                      <span className={`admin-badge admin-badge-${asset.type.toLowerCase()}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                        <EquipmentTypeIcon type={asset.type} size={13} />
                        <span>{asset.type}</span>
                      </span>
                    </td>

                    {/* Capacity */}
                    <td style={{ fontWeight: 600 }}>
                      {asset.type === 'GENERATOR' && asset.capacity ? `${asset.capacity} kVA` : null}
                      {asset.type === 'TANK' && asset.capacity ? `${asset.capacity.toLocaleString()} L` : null}
                      {asset.type === 'PLANT' ? <span style={{ color: 'var(--adm-text-muted)' }}>Unrated</span> : null}
                    </td>

                    {/* Location */}
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{asset.area}</div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--adm-text-muted)' }}>{asset.location}</div>
                    </td>

                    {/* What3Words */}
                    <td>
                      <a
                        href={`https://what3words.com/${asset.what3words.replace(/^\/\/\//, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontFamily: 'var(--adm-font-mono)',
                          fontSize: '0.8rem',
                          color: 'var(--adm-accent-yellow)',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <MapPin size={12} />
                        <span>{asset.what3words}</span>
                      </a>
                    </td>

                    {/* Rental Serial */}
                    <td className="admin-mono" style={{ fontSize: '0.82rem', color: 'var(--adm-text-secondary)' }}>
                      {asset.rentalSerialNumber}
                    </td>

                    {/* Power State */}
                    <td>
                      {asset.type === 'GENERATOR' ? (
                        <span className={`admin-badge ${isRunning ? 'admin-badge-running' : 'admin-badge-standby'}`}>
                          <span className={`pulse-dot ${isRunning ? 'green' : 'slate'}`} />
                          {isRunning ? 'ON' : 'OFF'}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.78rem', color: 'var(--adm-text-muted)' }}>—</span>
                      )}
                    </td>

                    {/* Action buttons */}
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', gap: '6px', justifyContent: 'flex-end' }}>
                        {/* View Transactions for this asset */}
                        <button
                          onClick={() => onSelectAsset(asset.equipmentId)}
                          className="admin-btn admin-btn-secondary admin-btn-sm"
                          title={`View transactions for ${asset.equipmentId}`}
                          style={{ padding: '5px 10px', gap: '5px' }}
                        >
                          <ReceiptText size={13} color="var(--adm-accent-yellow)" />
                          <span>Transactions ({txCounts[asset.equipmentId] || 0})</span>
                        </button>

                        {/* QR Label Print */}
                        <button
                          onClick={() => onOpenQRModal(asset)}
                          className="admin-btn admin-btn-outline admin-btn-sm"
                          title="Generate & Print Physical QR Tag"
                          style={{ padding: '5px 8px' }}
                        >
                          <QrCode size={14} />
                        </button>

                        {/* Edit Asset */}
                        <button
                          onClick={() => onOpenEditModal(asset)}
                          className="admin-btn admin-btn-outline admin-btn-sm"
                          title="Edit Equipment Details"
                          style={{ padding: '5px 8px' }}
                        >
                          <Edit size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Card Grid View */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {sortedAssets.map((asset) => {
            const isRunning = asset.type === 'GENERATOR' && getGeneratorPowerState(asset.equipmentId, transactions).isOn;
            return (
              <div
                key={asset.equipmentId}
                className="admin-card"
                style={{
                  marginBottom: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  borderTop: `2px solid ${
                    asset.type === 'GENERATOR' ? 'var(--adm-accent-yellow)' : 'var(--adm-border-subtle)'
                  }`,
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span className={`admin-badge admin-badge-${asset.type.toLowerCase()}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                      <EquipmentTypeIcon type={asset.type} size={13} />
                      <span>{asset.type}</span>
                    </span>
                    {asset.type === 'GENERATOR' && (
                      <span className={`admin-badge ${isRunning ? 'admin-badge-running' : 'admin-badge-standby'}`}>
                        <span className={`pulse-dot ${isRunning ? 'green' : 'slate'}`} />
                        {isRunning ? 'ON' : 'OFF'}
                      </span>
                    )}
                  </div>

                  <h3
                    onClick={() => onSelectAsset(asset.equipmentId)}
                    style={{
                      fontFamily: 'var(--adm-font-mono)',
                      fontSize: '1.2rem',
                      fontWeight: 700,
                      color: 'var(--adm-text-primary)',
                      cursor: 'pointer',
                      marginBottom: '8px',
                    }}
                  >
                    {asset.equipmentId}
                  </h3>

                  <div style={{ fontSize: '0.85rem', color: 'var(--adm-text-secondary)', marginBottom: '4px' }}>
                    <strong>{asset.area}</strong> • {asset.location}
                  </div>

                  <div style={{ fontSize: '0.8rem', color: 'var(--adm-accent-yellow)', fontFamily: 'var(--adm-font-mono)', marginBottom: '12px' }}>
                    <MapPin size={12} style={{ display: 'inline', marginRight: '4px' }} />
                    {asset.what3words}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: 'var(--adm-surface-1)',
                      borderRadius: 'var(--adm-radius-sm)',
                      fontSize: '0.8rem',
                      marginBottom: '14px',
                    }}
                  >
                    <span style={{ color: 'var(--adm-text-muted)' }}>Rating / Cap:</span>
                    <span style={{ fontWeight: 600, color: 'var(--adm-text-primary)' }}>
                      {asset.type === 'GENERATOR' && asset.capacity ? `${asset.capacity} kVA` : null}
                      {asset.type === 'TANK' && asset.capacity ? `${asset.capacity.toLocaleString()} Litres` : null}
                      {asset.type === 'PLANT' ? 'Unrated' : null}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: '12px',
                    borderTop: '1px solid var(--adm-border-subtle)',
                  }}
                >
                  <button
                    onClick={() => onOpenQRModal(asset)}
                    className="admin-btn admin-btn-outline admin-btn-sm"
                    title="Print QR Label Tag"
                  >
                    <QrCode size={14} />
                    <span>Tag</span>
                  </button>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => onSelectAsset(asset.equipmentId)}
                      className="admin-btn admin-btn-secondary admin-btn-sm"
                      title="View Transactions for this asset"
                      style={{ padding: '5px 8px' }}
                    >
                      <ReceiptText size={14} color="var(--adm-accent-yellow)" />
                      <span>{txCounts[asset.equipmentId] || 0} Txs</span>
                    </button>

                    <button
                      onClick={() => onOpenEditModal(asset)}
                      className="admin-btn admin-btn-outline admin-btn-sm"
                    >
                      <Edit size={14} />
                      <span>Edit</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
