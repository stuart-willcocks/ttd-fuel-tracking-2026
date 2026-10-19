import React, { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  Download,
  Filter,
  QrCode,
  Edit,
  Trash2,
  Zap,
  MapPin,
  LayoutGrid,
  Table as TableIcon,
} from 'lucide-react';
import type { Equipment } from '../../types';

interface AssetsViewProps {
  assets: Equipment[];
  onOpenCreateModal: () => void;
  onOpenEditModal: (asset: Equipment) => void;
  onOpenDeleteModal: (asset: Equipment) => void;
  onOpenQRModal: (asset: Equipment) => void;
  onSelectAsset: (equipmentId: string) => void;
  onTogglePower: (asset: Equipment) => void;
}

type FilterType = 'ALL' | 'GENERATOR' | 'TANK' | 'PLANT' | 'RUNNING' | 'STANDBY';

export const AssetsView: React.FC<AssetsViewProps> = ({
  assets,
  onOpenCreateModal,
  onOpenEditModal,
  onOpenDeleteModal,
  onOpenQRModal,
  onSelectAsset,
  onTogglePower,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('ALL');
  const [selectedArea, setSelectedArea] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'TABLE' | 'GRID'>('TABLE');

  // Distinct areas for filter dropdown
  const uniqueAreas = useMemo(() => {
    return Array.from(new Set(assets.map((a) => a.area).filter(Boolean)));
  }, [assets]);

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

      // Area filter
      if (selectedArea !== 'ALL' && asset.area !== selectedArea) {
        return false;
      }

      // Classification / Power filter
      const isRunning = Boolean(asset.poweredUpTimestamp && !asset.poweredDownTimestamp);
      if (activeFilter === 'GENERATOR' && asset.type !== 'GENERATOR') return false;
      if (activeFilter === 'TANK' && asset.type !== 'TANK') return false;
      if (activeFilter === 'PLANT' && asset.type !== 'PLANT') return false;
      if (activeFilter === 'RUNNING' && (!isRunning || asset.type !== 'GENERATOR')) return false;
      if (activeFilter === 'STANDBY' && (isRunning || asset.type !== 'GENERATOR')) return false;

      return true;
    });
  }, [assets, searchQuery, activeFilter, selectedArea]);

  // Counts for pills
  const counts = useMemo(() => {
    return {
      all: assets.length,
      generator: assets.filter((a) => a.type === 'GENERATOR').length,
      tank: assets.filter((a) => a.type === 'TANK').length,
      plant: assets.filter((a) => a.type === 'PLANT').length,
      running: assets.filter((a) => a.type === 'GENERATOR' && a.poweredUpTimestamp && !a.poweredDownTimestamp).length,
      standby: assets.filter((a) => a.type === 'GENERATOR' && (!a.poweredUpTimestamp || a.poweredDownTimestamp)).length,
    };
  }, [assets]);

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

    const rows = filteredAssets.map((a) => [
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
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--adm-font-display)', fontSize: '1.65rem', fontWeight: 800, color: '#ffffff' }}>
            Fleet Asset Management
          </h1>
          <p style={{ fontSize: '0.86rem', color: 'var(--adm-text-secondary)', marginTop: '2px' }}>
            Comprehensive CRUD control for generators, bulk fuel tanks, and plant machinery
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={handleExportCsv} className="admin-btn admin-btn-secondary">
            <Download size={15} />
            <span>Export CSV</span>
          </button>

          <button onClick={onOpenCreateModal} className="admin-btn admin-btn-primary">
            <Plus size={16} />
            <span>Add New Asset</span>
          </button>
        </div>
      </div>

      {/* Control Bar: Search, Filters & View Toggle */}
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
              placeholder="Search ID, location, serial, w3w..."
            />
          </div>

          {/* Area Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Filter size={15} color="#94a3b8" />
            <select
              className="admin-select"
              style={{ width: '180px', padding: '9px 12px', fontSize: '0.85rem' }}
              value={selectedArea}
              onChange={(e) => setSelectedArea(e.target.value)}
            >
              <option value="ALL">All Zones ({assets.length})</option>
              {uniqueAreas.map((area) => (
                <option key={area} value={area}>
                  {area} ({assets.filter((a) => a.area === area).length})
                </option>
              ))}
            </select>
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
          { key: 'GENERATOR', label: '⚡ Generators', count: counts.generator },
          { key: 'TANK', label: '🛢️ Fuel Tanks', count: counts.tank },
          { key: 'PLANT', label: '🚜 Plant', count: counts.plant },
          { key: 'RUNNING', label: '🟢 Energized (Running)', count: counts.running },
          { key: 'STANDBY', label: '⚪ Standby Generators', count: counts.standby },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveFilter(tab.key as FilterType)}
            className={`admin-btn ${activeFilter === tab.key ? 'admin-btn-secondary' : 'admin-btn-outline'} admin-btn-sm`}
            style={{
              borderColor: activeFilter === tab.key ? 'var(--adm-accent-amber)' : undefined,
              color: activeFilter === tab.key ? '#ffffff' : undefined,
            }}
          >
            <span>{tab.label}</span>
            <span
              style={{
                fontSize: '0.72rem',
                padding: '1px 6px',
                borderRadius: '999px',
                background: activeFilter === tab.key ? 'rgba(245, 158, 11, 0.25)' : 'var(--adm-surface-3)',
                color: activeFilter === tab.key ? '#fbbf24' : 'var(--adm-text-secondary)',
                fontFamily: 'var(--adm-font-mono)',
              }}
            >
              {tab.count}
            </span>
          </button>
        ))}
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
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ffffff', marginBottom: '6px' }}>
            No assets match your search criteria
          </h3>
          <p style={{ color: 'var(--adm-text-secondary)', fontSize: '0.9rem', marginBottom: '18px' }}>
            Try adjusting your search query, filter tabs, or area selection.
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setActiveFilter('ALL');
              setSelectedArea('ALL');
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
                <th>Equipment ID</th>
                <th>Classification</th>
                <th>Capacity</th>
                <th>Zone &amp; Location</th>
                <th>What3Words</th>
                <th>Rental Serial</th>
                <th>Power State</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssets.map((asset) => {
                const isRunning = Boolean(asset.poweredUpTimestamp && !asset.poweredDownTimestamp);
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
                          fontWeight: 800,
                          fontSize: '0.92rem',
                          color: '#fbbf24',
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
                      <span className={`admin-badge admin-badge-${asset.type.toLowerCase()}`}>
                        {asset.type}
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
                          color: '#ef4444',
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
                          {isRunning ? 'RUNNING' : 'STANDBY'}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.78rem', color: 'var(--adm-text-muted)' }}>—</span>
                      )}
                    </td>

                    {/* Action buttons */}
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px', justifyContent: 'flex-end' }}>
                        {/* QR Label Print */}
                        <button
                          onClick={() => onOpenQRModal(asset)}
                          className="admin-btn admin-btn-outline admin-btn-sm"
                          title="Generate & Print Physical QR Tag"
                          style={{ padding: '5px 8px' }}
                        >
                          <QrCode size={14} color="#f59e0b" />
                        </button>

                        {/* Power Toggle for Generator */}
                        {asset.type === 'GENERATOR' && (
                          <button
                            onClick={() => onTogglePower(asset)}
                            className="admin-btn admin-btn-outline admin-btn-sm"
                            title={isRunning ? 'De-energize (Power Down)' : 'Energize (Power Up)'}
                            style={{ padding: '5px 8px', color: isRunning ? '#ef4444' : '#10b981' }}
                          >
                            <Zap size={14} />
                          </button>
                        )}

                        {/* Edit Asset */}
                        <button
                          onClick={() => onOpenEditModal(asset)}
                          className="admin-btn admin-btn-outline admin-btn-sm"
                          title="Edit Equipment Details"
                          style={{ padding: '5px 8px' }}
                        >
                          <Edit size={14} />
                        </button>

                        {/* Delete Asset */}
                        <button
                          onClick={() => onOpenDeleteModal(asset)}
                          className="admin-btn admin-btn-outline admin-btn-sm"
                          title="Decommission & Delete Asset"
                          style={{ padding: '5px 8px', color: '#ef4444' }}
                        >
                          <Trash2 size={14} />
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
          {filteredAssets.map((asset) => {
            const isRunning = Boolean(asset.poweredUpTimestamp && !asset.poweredDownTimestamp);
            return (
              <div
                key={asset.equipmentId}
                className="admin-card"
                style={{
                  marginBottom: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  borderTop: `3px solid ${
                    asset.type === 'GENERATOR' ? '#f59e0b' : asset.type === 'TANK' ? '#06b6d4' : '#10b981'
                  }`,
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span className={`admin-badge admin-badge-${asset.type.toLowerCase()}`}>
                      {asset.type}
                    </span>
                    {asset.type === 'GENERATOR' && (
                      <span className={`admin-badge ${isRunning ? 'admin-badge-running' : 'admin-badge-standby'}`}>
                        <span className={`pulse-dot ${isRunning ? 'green' : 'slate'}`} />
                        {isRunning ? 'RUNNING' : 'STANDBY'}
                      </span>
                    )}
                  </div>

                  <h3
                    onClick={() => onSelectAsset(asset.equipmentId)}
                    style={{
                      fontFamily: 'var(--adm-font-mono)',
                      fontSize: '1.25rem',
                      fontWeight: 800,
                      color: '#ffffff',
                      cursor: 'pointer',
                      marginBottom: '8px',
                    }}
                  >
                    {asset.equipmentId}
                  </h3>

                  <div style={{ fontSize: '0.85rem', color: 'var(--adm-text-secondary)', marginBottom: '4px' }}>
                    <strong>{asset.area}</strong> • {asset.location}
                  </div>

                  <div style={{ fontSize: '0.8rem', color: '#ef4444', fontFamily: 'var(--adm-font-mono)', marginBottom: '12px' }}>
                    <MapPin size={12} style={{ display: 'inline', marginRight: '4px' }} />
                    {asset.what3words}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: 'var(--adm-surface-1)',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      marginBottom: '14px',
                    }}
                  >
                    <span style={{ color: 'var(--adm-text-muted)' }}>Rating / Cap:</span>
                    <span style={{ fontWeight: 700, color: '#ffffff' }}>
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
                      onClick={() => onOpenEditModal(asset)}
                      className="admin-btn admin-btn-outline admin-btn-sm"
                    >
                      <Edit size={14} />
                      <span>Edit</span>
                    </button>

                    <button
                      onClick={() => onOpenDeleteModal(asset)}
                      className="admin-btn admin-btn-outline admin-btn-sm"
                      style={{ color: '#ef4444' }}
                    >
                      <Trash2 size={14} />
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
