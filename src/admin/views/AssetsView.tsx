import React, { useState, useMemo, useEffect } from 'react';
import {
  Plus,
  Search,
  Download,
  QrCode,
  Edit,
  MapPin,
  Map as MapIcon,
  Table as TableIcon,
  AlertTriangle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import type { Equipment, Transaction } from '../../types';
import { EquipmentTypeIcon } from '../../components/EquipmentTypeIcon';
import { getGeneratorPowerState } from '../../utils/powerState';
import {
  getGoogleMapsExternalUrl,
  handleWhat3WordsLinkClick,
  getCachedWhat3WordsCoordinates,
  convertWhat3WordsToCoordinates,
  isValidWhat3WordsFormat,
  normalizeWhat3Words,
  getFleetSatelliteMapSrcDoc,
  type FleetMapMarkerItem,
} from '../../services/what3words';
import { postRemoteEquipment } from '../../services/api';

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
  const [viewMode, setViewMode] = useState<'TABLE' | 'MAP'>('TABLE');
  const [coordResolveTick, setCoordResolveTick] = useState(0);

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
  type AssetSortField = 'equipmentId' | 'type' | 'capacity' | 'location' | 'what3words' | 'rentalSerialNumber' | 'powerState' | 'transactions';
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
        case 'transactions': {
          const aCount = txCounts[a.equipmentId] || 0;
          const bCount = txCounts[b.equipmentId] || 0;
          comparison = aCount - bCount;
          break;
        }
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredAssets, sortField, sortDirection, transactions, txCounts]);

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

  // Listen for actions triggered inside the Fleet Satellite Map iframe popups
  useEffect(() => {
    if (viewMode !== 'MAP') return;
    const handleMessage = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'TTD_MAP_SELECT_ASSET' && typeof e.data.equipmentId === 'string') {
        onSelectAsset(e.data.equipmentId);
      } else if (e.data.type === 'TTD_MAP_EDIT_ASSET' && typeof e.data.equipmentId === 'string') {
        const found = assets.find((a) => a.equipmentId === e.data.equipmentId);
        if (found) onOpenEditModal(found);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [viewMode, assets, onSelectAsset, onOpenEditModal]);

  // Resolve any uncached What3Words coordinates when switching to MAP view
  useEffect(() => {
    if (viewMode !== 'MAP') return;
    let cancelled = false;
    const missingAssets = assets.filter((a) => {
      if (typeof a.latitude === 'number' && typeof a.longitude === 'number') return false;
      if (getCachedWhat3WordsCoordinates(a.what3words)) return false;
      return isValidWhat3WordsFormat(a.what3words);
    });

    if (missingAssets.length === 0) return;

    const uniqueW3w = Array.from(new Set(missingAssets.map((a) => normalizeWhat3Words(a.what3words))));
    Promise.all(uniqueW3w.map((w) => convertWhat3WordsToCoordinates(w))).then(() => {
      if (cancelled) return;
      setCoordResolveTick((prev) => prev + 1);
      for (const a of missingAssets) {
        const coords = getCachedWhat3WordsCoordinates(a.what3words);
        if (coords) {
          postRemoteEquipment({ ...a, latitude: coords.lat, longitude: coords.lng }).catch(() => {});
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [viewMode, assets]);

  // Build map markers for all filtered assets with resolved coordinates
  const fleetMapMarkers = useMemo<FleetMapMarkerItem[]>(() => {
    void coordResolveTick;
    const items: FleetMapMarkerItem[] = [];
    for (const asset of sortedAssets) {
      const coords =
        typeof asset.latitude === 'number' && typeof asset.longitude === 'number'
          ? { lat: asset.latitude, lng: asset.longitude }
          : getCachedWhat3WordsCoordinates(asset.what3words);
      if (!coords) continue;

      const isOn =
        asset.type === 'GENERATOR' && getGeneratorPowerState(asset.equipmentId, transactions).isOn;

      items.push({
        equipmentId: asset.equipmentId,
        type: asset.type,
        area: asset.area,
        location: asset.location,
        what3words: asset.what3words,
        capacity: asset.capacity,
        rentalSerialNumber: asset.rentalSerialNumber,
        isOn,
        txCount: txCounts[asset.equipmentId] || 0,
        lat: coords.lat,
        lng: coords.lng,
      });
    }
    return items;
  }, [sortedAssets, transactions, txCounts, coordResolveTick]);

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '10px', marginBottom: '20px' }}>
        <button type="button" onClick={handleExportCsv} className="admin-btn admin-btn-secondary">
          <Download size={15} />
          <span>Export CSV</span>
        </button>

        <button type="button" onClick={onOpenCreateModal} className="admin-btn admin-btn-primary">
          <Plus size={16} />
          <span>Add New Asset</span>
        </button>

        {onOpenDangerZone && (
          <button
            type="button"
            onClick={onOpenDangerZone}
            className="admin-btn admin-btn-danger"
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
            onClick={() => setViewMode('MAP')}
            className={`admin-btn ${viewMode === 'MAP' ? 'admin-btn-secondary' : 'admin-btn-outline'} admin-btn-sm`}
            style={{ padding: '6px 10px' }}
            title="Satellite Map View"
          >
            <MapIcon size={15} />
            <span>Map</span>
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
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('transactions')}>
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span>Transactions</span>
                    {renderSortIndicator('transactions')}
                  </div>
                </th>
                <th style={{ textAlign: 'right', whiteSpace: 'nowrap', paddingRight: '20px' }}>Actions</th>
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
                    <td style={{ maxWidth: '220px' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.86rem', overflowWrap: 'break-word', wordBreak: 'break-word' }}>{asset.area}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--adm-text-muted)', overflowWrap: 'break-word', wordBreak: 'break-word' }}>{asset.location}</div>
                    </td>

                    {/* What3Words */}
                    <td>
                      <a
                        href={getGoogleMapsExternalUrl(asset.what3words, asset.latitude, asset.longitude)}
                        onClick={(e) =>
                          handleWhat3WordsLinkClick(
                            e,
                            asset.what3words,
                            asset.latitude,
                            asset.longitude,
                            (coords) => {
                              postRemoteEquipment({
                                ...asset,
                                latitude: coords.lat,
                                longitude: coords.lng,
                              }).catch(() => {});
                            }
                          )
                        }
                        target="_blank"
                        rel="noreferrer"
                        title="Open location in Google Maps"
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

                    {/* Transactions */}
                    <td>
                      <button
                        type="button"
                        onClick={() => onSelectAsset(asset.equipmentId)}
                        className="admin-mono"
                        style={{
                          background: 'none',
                          border: 'none',
                          fontFamily: 'var(--adm-font-mono)',
                          fontWeight: 700,
                          color: (txCounts[asset.equipmentId] || 0) > 0 ? 'var(--adm-accent-yellow)' : 'var(--adm-text-muted)',
                          cursor: 'pointer',
                          fontSize: '0.88rem',
                          padding: '2px 4px',
                          textDecoration: (txCounts[asset.equipmentId] || 0) > 0 ? 'underline' : 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                        }}
                        title={`View ${txCounts[asset.equipmentId] || 0} transactions for ${asset.equipmentId}`}
                      >
                        {txCounts[asset.equipmentId] || 0}
                      </button>
                    </td>

                    {/* Action buttons */}
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap', paddingRight: '20px' }}>
                      <div style={{ display: 'inline-flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                        {/* QR Label Print */}
                        <button
                          onClick={() => onOpenQRModal(asset)}
                          className="admin-btn admin-btn-outline admin-btn-sm"
                          title="Generate & Print Physical QR Tag"
                          style={{ padding: '4px 7px' }}
                        >
                          <QrCode size={14} />
                        </button>

                        {/* Edit Asset */}
                        <button
                          onClick={() => onOpenEditModal(asset)}
                          className="admin-btn admin-btn-outline admin-btn-sm"
                          title="Edit Equipment Details"
                          style={{ padding: '4px 7px' }}
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
        /* Google Satellite Fleet Map View */
        <div
          className="admin-card"
          style={{
            padding: 0,
            margin: 0,
            overflow: 'hidden',
            height: 'calc(100vh - 285px)',
            minHeight: '560px',
            border: '1px solid var(--adm-border-subtle)',
            position: 'relative',
          }}
        >
          <iframe
            srcDoc={getFleetSatelliteMapSrcDoc(fleetMapMarkers)}
            title="Fleet Equipment Satellite Map"
            style={{
              width: '100%',
              height: '100%',
              border: '0',
              display: 'block',
            }}
            allow="geolocation"
          />
        </div>
      )}
    </div>
  );
};
