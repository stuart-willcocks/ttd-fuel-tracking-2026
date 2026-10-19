import React from 'react';
import { X, QrCode, Edit, Trash2, Zap, ReceiptText, Clock, MapPin, CheckCircle2 } from 'lucide-react';
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
  onInspectTransaction?: (tx: Transaction) => void;
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
  onInspectTransaction,
}) => {
  if (!isOpen || !asset) return null;

  const assetTxs = transactions.filter((t) => t.equipmentId === asset.equipmentId);
  const isRunning = Boolean(asset.poweredUpTimestamp && !asset.poweredDownTimestamp);

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div className="admin-drawer-panel" onClick={(e) => e.stopPropagation()} style={{ width: '680px', maxWidth: '92vw' }}>
        {/* Drawer Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--adm-border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--adm-surface-2)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
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
            onClick={() => onEdit(asset)}
            className="admin-btn admin-btn-primary admin-btn-sm"
          >
            <Edit size={14} />
            <span>Edit Asset</span>
          </button>

          <button
            onClick={() => onOpenQR(asset)}
            className="admin-btn admin-btn-secondary admin-btn-sm"
          >
            <QrCode size={14} />
            <span>Print QR Tag</span>
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
          {/* Asset Specs Row */}
          <div
            style={{
              background: 'var(--adm-surface-2)',
              borderRadius: 'var(--adm-radius-md)',
              border: '1px solid var(--adm-border-subtle)',
              padding: '16px 20px',
              marginBottom: '24px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '14px',
            }}
          >
            <div>
              <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--adm-text-muted)', fontWeight: 700 }}>
                Location
              </span>
              <p style={{ fontWeight: 600, fontSize: '0.88rem', color: '#ffffff' }}>
                {asset.area}
              </p>
              <p style={{ fontSize: '0.78rem', color: 'var(--adm-text-secondary)' }}>
                {asset.location}
              </p>
            </div>

            <div>
              <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--adm-text-muted)', fontWeight: 700 }}>
                Capacity
              </span>
              <p style={{ fontWeight: 600, fontSize: '0.88rem', color: '#ffffff' }}>
                {asset.type === 'GENERATOR' && asset.capacity ? `${asset.capacity} kVA` : null}
                {asset.type === 'TANK' && asset.capacity ? `${asset.capacity.toLocaleString()} Litres` : null}
                {asset.type === 'PLANT' ? 'Unrated' : null}
              </p>
            </div>

            <div>
              <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--adm-text-muted)', fontWeight: 700 }}>
                What3Words
              </span>
              <p style={{ fontFamily: 'var(--adm-font-mono)', fontWeight: 600, fontSize: '0.82rem', color: '#ef4444' }}>
                <MapPin size={11} style={{ display: 'inline', marginRight: '3px' }} />
                {asset.what3words}
              </p>
            </div>

            <div>
              <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--adm-text-muted)', fontWeight: 700 }}>
                Rental Serial #
              </span>
              <p style={{ fontFamily: 'var(--adm-font-mono)', fontWeight: 600, fontSize: '0.82rem', color: '#f59e0b' }}>
                {asset.rentalSerialNumber}
              </p>
            </div>
          </div>

          {/* Asset Transactions History */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ReceiptText size={17} color="#06b6d4" />
                <span>Transactions for {asset.equipmentId}</span>
                <span className="admin-nav-badge">{assetTxs.length}</span>
              </h3>
            </div>

            {assetTxs.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '40px 20px',
                  background: 'var(--adm-surface-2)',
                  borderRadius: 'var(--adm-radius-md)',
                  color: 'var(--adm-text-muted)',
                  fontSize: '0.88rem',
                }}
              >
                No fuel transfers or inspections logged for this asset yet.
              </div>
            ) : (
              <div className="admin-table-container">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Action</th>
                      <th>Recorded Telemetry</th>
                      <th>Device ID</th>
                      <th>Status</th>
                      {onInspectTransaction && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {assetTxs.map((tx) => (
                      <tr key={tx.id}>
                        <td style={{ fontSize: '0.78rem' }} className="admin-mono">
                          <Clock size={11} style={{ display: 'inline', marginRight: '4px', color: '#64748b' }} />
                          {tx.transactionTimestamp}
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
                        <td style={{ fontSize: '0.8rem' }}>
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
                        <td style={{ fontSize: '0.75rem', color: 'var(--adm-text-secondary)' }} className="admin-mono">
                          {tx.deviceId || 'PDA-Zebra'}
                        </td>
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.72rem', color: '#10b981' }}>
                            <CheckCircle2 size={11} />
                            <span>Synced</span>
                          </span>
                        </td>
                        {onInspectTransaction && (
                          <td style={{ textAlign: 'right' }}>
                            <button
                              onClick={() => onInspectTransaction(tx)}
                              className="admin-btn admin-btn-outline admin-btn-sm"
                              style={{ padding: '3px 7px', fontSize: '0.74rem' }}
                            >
                              Inspect
                            </button>
                          </td>
                        )}
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
