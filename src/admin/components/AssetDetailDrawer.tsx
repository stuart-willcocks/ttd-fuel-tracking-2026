import React from 'react';
import { X, QrCode, Edit, Trash2, Zap, Fuel, Activity, Clock, MapPin } from 'lucide-react';
import type { Equipment, Transaction } from '../../types';

interface AssetDetailDrawerProps {
  asset: Equipment | null;
  transactions: Transaction[];
  isOpen: boolean;
  onClose: () => void;
  onEdit: (asset: Equipment) => void;
  onDelete: (asset: Equipment) => void;
  onOpenQR: (asset: Equipment) => void;
  onTogglePower: (asset: Equipment) => void;
}

export const AssetDetailDrawer: React.FC<AssetDetailDrawerProps> = ({
  asset,
  transactions,
  isOpen,
  onClose,
  onEdit,
  onDelete,
  onOpenQR,
  onTogglePower,
}) => {
  if (!isOpen || !asset) return null;

  const assetTxs = transactions.filter((t) => t.equipmentId === asset.equipmentId);

  // Calculate cumulative stats
  const totalDieselLitres = assetTxs.reduce((sum, t) => sum + (t.fuelTransferLitres || 0), 0);
  const totalDefLitres = assetTxs.reduce((sum, t) => sum + (t.defTransferLitres || 0), 0);

  const isRunning = Boolean(asset.poweredUpTimestamp && !asset.poweredDownTimestamp);

  const formatRuntime = () => {
    if (!asset.poweredUpTimestamp) return 'Offline';
    try {
      const start = new Date(asset.poweredUpTimestamp.replace(' ', 'T')).getTime();
      const end = asset.poweredDownTimestamp
        ? new Date(asset.poweredDownTimestamp.replace(' ', 'T')).getTime()
        : Date.now();
      const diffMs = Math.max(0, end - start);
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      return `${hours}h ${mins}m runtime`;
    } catch {
      return 'N/A';
    }
  };

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div className="admin-drawer-panel" onClick={(e) => e.stopPropagation()}>
        {/* Drawer Header */}
        <div
          style={{
            padding: '24px',
            borderBottom: '1px solid var(--adm-border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--adm-surface-2)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
            <h2
              style={{
                fontFamily: 'var(--adm-font-display)',
                fontSize: '1.45rem',
                fontWeight: 800,
                color: '#ffffff',
                marginTop: '4px',
              }}
            >
              {asset.equipmentId}
            </h2>
          </div>
          <button onClick={onClose} className="admin-btn admin-btn-outline admin-btn-sm" style={{ padding: '6px' }}>
            <X size={20} />
          </button>
        </div>

        {/* Action Toolbar */}
        <div
          style={{
            padding: '12px 24px',
            borderBottom: '1px solid var(--adm-border-subtle)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            background: 'var(--adm-surface-1)',
          }}
        >
          <button
            onClick={() => onOpenQR(asset)}
            className="admin-btn admin-btn-primary admin-btn-sm"
          >
            <QrCode size={14} />
            <span>Print QR Label</span>
          </button>

          <button
            onClick={() => onEdit(asset)}
            className="admin-btn admin-btn-secondary admin-btn-sm"
          >
            <Edit size={14} />
            <span>Edit Asset</span>
          </button>

          {asset.type === 'GENERATOR' && (
            <button
              onClick={() => onTogglePower(asset)}
              className="admin-btn admin-btn-outline admin-btn-sm"
              style={{ color: isRunning ? '#ef4444' : '#10b981' }}
            >
              <Zap size={14} />
              <span>{isRunning ? 'Power Down' : 'Power Up'}</span>
            </button>
          )}

          <button
            onClick={() => onDelete(asset)}
            className="admin-btn admin-btn-outline admin-btn-sm"
            style={{ color: '#ef4444', marginLeft: 'auto' }}
          >
            <Trash2 size={14} />
            <span>Decommission</span>
          </button>
        </div>

        {/* Drawer Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {/* Key Specs Card */}
          <div
            style={{
              background: 'var(--adm-surface-2)',
              borderRadius: 'var(--adm-radius-lg)',
              border: '1px solid var(--adm-border-subtle)',
              padding: '18px',
              marginBottom: '24px',
            }}
          >
            <h4
              style={{
                fontSize: '0.78rem',
                textTransform: 'uppercase',
                color: 'var(--adm-text-muted)',
                letterSpacing: '0.05em',
                marginBottom: '14px',
                fontWeight: 700,
              }}
            >
              Asset Specifications
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <span style={{ fontSize: '0.74rem', color: 'var(--adm-text-muted)' }}>Location / Area</span>
                <p style={{ fontWeight: 600, fontSize: '0.9rem', color: '#ffffff' }}>
                  {asset.area}
                </p>
                <p style={{ fontSize: '0.8rem', color: 'var(--adm-text-secondary)' }}>
                  {asset.location}
                </p>
              </div>

              <div>
                <span style={{ fontSize: '0.74rem', color: 'var(--adm-text-muted)' }}>What3Words</span>
                <p style={{ fontFamily: 'var(--adm-font-mono)', fontWeight: 600, fontSize: '0.86rem', color: '#ef4444' }}>
                  <MapPin size={12} style={{ display: 'inline', marginRight: '4px' }} />
                  {asset.what3words}
                </p>
              </div>

              <div>
                <span style={{ fontSize: '0.74rem', color: 'var(--adm-text-muted)' }}>Capacity</span>
                <p style={{ fontWeight: 600, fontSize: '0.9rem', color: '#ffffff' }}>
                  {asset.type === 'GENERATOR' && asset.capacity ? `${asset.capacity} kVA` : null}
                  {asset.type === 'TANK' && asset.capacity ? `${asset.capacity.toLocaleString()} Litres` : null}
                  {asset.type === 'PLANT' ? 'Unrated' : null}
                </p>
              </div>

              <div>
                <span style={{ fontSize: '0.74rem', color: 'var(--adm-text-muted)' }}>Rental Serial Number</span>
                <p style={{ fontFamily: 'var(--adm-font-mono)', fontWeight: 600, fontSize: '0.86rem', color: '#f59e0b' }}>
                  {asset.rentalSerialNumber}
                </p>
              </div>
            </div>
          </div>

          {/* Telemetry Metrics Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '24px' }}>
            <div
              style={{
                background: 'var(--adm-surface-2)',
                padding: '16px',
                borderRadius: 'var(--adm-radius-md)',
                border: '1px solid var(--adm-border-subtle)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#06b6d4', marginBottom: '6px' }}>
                <Fuel size={16} />
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>Fuel Dispensed</span>
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ffffff' }}>
                {totalDieselLitres.toLocaleString()} <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>Litres</span>
              </div>
              {totalDefLitres > 0 && (
                <div style={{ fontSize: '0.75rem', color: 'var(--adm-text-muted)', marginTop: '4px' }}>
                  + {totalDefLitres.toLocaleString()} L DEF
                </div>
              )}
            </div>

            <div
              style={{
                background: 'var(--adm-surface-2)',
                padding: '16px',
                borderRadius: 'var(--adm-radius-md)',
                border: '1px solid var(--adm-border-subtle)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', marginBottom: '6px' }}>
                <Clock size={16} />
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>Runtime State</span>
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff' }}>
                {asset.type === 'GENERATOR' ? formatRuntime() : `${assetTxs.length} Transactions`}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--adm-text-muted)', marginTop: '4px' }}>
                {isRunning ? `Online since ${asset.poweredUpTimestamp?.substring(11, 16)}` : 'Standby / Logged'}
              </div>
            </div>
          </div>

          {/* Associated Transactions Timeline */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity size={16} color="#f59e0b" />
                <span>Transaction History</span>
                <span className="admin-nav-badge">{assetTxs.length}</span>
              </h3>
            </div>

            {assetTxs.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '30px',
                  background: 'var(--adm-surface-2)',
                  borderRadius: 'var(--adm-radius-md)',
                  color: 'var(--adm-text-muted)',
                  fontSize: '0.85rem',
                }}
              >
                No refuelling or status transactions logged for this asset yet.
              </div>
            ) : (
              <div className="admin-table-container">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Action</th>
                      <th>Telemetry</th>
                      <th>Device</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assetTxs.map((tx) => (
                      <tr key={tx.id}>
                        <td style={{ fontSize: '0.78rem' }} className="admin-mono">
                          {tx.transactionTimestamp}
                        </td>
                        <td>
                          <span
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              color: tx.transactionType.includes('Fuel')
                                ? '#06b6d4'
                                : tx.transactionType.includes('Power')
                                ? '#10b981'
                                : '#f59e0b',
                            }}
                          >
                            {tx.transactionType.replace('Generator', '').replace('Tank', '').replace('Plant', '')}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.78rem' }}>
                          {tx.fuelTransferLitres && (
                            <span style={{ color: '#06b6d4', fontWeight: 600 }}>
                              +{tx.fuelTransferLitres}L{' '}
                            </span>
                          )}
                          {tx.checkInFuelPercentage !== undefined && (
                            <span>{tx.checkInFuelPercentage}% fuel </span>
                          )}
                          {tx.checkInFuelEighths !== undefined && (
                            <span>{tx.checkInFuelEighths}/8 tank </span>
                          )}
                          {tx.checkInKWH !== undefined && (
                            <span style={{ color: '#10b981' }}>{tx.checkInKWH.toLocaleString()} kWh </span>
                          )}
                          {!tx.fuelTransferLitres &&
                            tx.checkInFuelPercentage === undefined &&
                            tx.checkInFuelEighths === undefined &&
                            tx.checkInKWH === undefined && (
                              <span style={{ color: 'var(--adm-text-muted)' }}>Status Log</span>
                            )}
                        </td>
                        <td style={{ fontSize: '0.75rem', color: 'var(--adm-text-muted)' }} className="admin-mono">
                          {tx.deviceId || 'PDA-Zebra'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
