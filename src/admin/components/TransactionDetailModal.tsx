import React, { useState, useRef } from 'react';
import { X, ReceiptText, Code, Trash2 } from 'lucide-react';
import type { Transaction, Equipment } from '../../types';
import { formatAdminTimestamp } from '../../utils/dateFormat';

interface TransactionDetailModalProps {
  transaction: Transaction | null;
  asset?: Equipment | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectAsset?: (equipmentId: string) => void;
  onDeleteTransaction?: (transactionId: string) => Promise<void>;
}

export const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({
  transaction,
  asset,
  isOpen,
  onClose,
  onSelectAsset,
  onDeleteTransaction,
}) => {
  const [showJson, setShowJson] = useState(false);
  const isMouseDownOnBackdrop = useRef<boolean>(false);

  if (!isOpen || !transaction) return null;

  const handleBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    isMouseDownOnBackdrop.current = e.target === e.currentTarget;
  };

  const handleBackdropMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (isMouseDownOnBackdrop.current && e.target === e.currentTarget) {
      onClose();
    }
    isMouseDownOnBackdrop.current = false;
  };

  return (
    <div
      className="admin-modal-backdrop"
      onMouseDown={handleBackdropMouseDown}
      onMouseUp={handleBackdropMouseUp}
    >
      <div
        className="admin-modal-panel"
        onMouseDown={(e) => {
          e.stopPropagation();
          isMouseDownOnBackdrop.current = false;
        }}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '600px' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: 'var(--adm-radius-sm)',
                background: 'rgba(250, 204, 21, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--adm-accent-yellow)',
              }}
            >
              <ReceiptText size={20} />
            </div>
            <div>
              <h3 style={{ fontFamily: 'var(--adm-font-display)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--adm-text-primary)' }}>
                Transaction Telemetry
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--adm-text-secondary)', fontFamily: 'var(--adm-font-mono)' }}>
                UUID: {transaction.id}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="admin-btn admin-btn-outline admin-btn-sm" style={{ padding: '6px' }}>
            <X size={18} />
          </button>
        </div>

        {/* Target Asset Banner */}
        <div
          style={{
            padding: '16px',
            background: 'var(--adm-surface-2)',
            borderRadius: 'var(--adm-radius-md)',
            border: '1px solid var(--adm-border-subtle)',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--adm-text-muted)', fontWeight: 700 }}>
              Target Asset
            </span>
            <div style={{ fontFamily: 'var(--adm-font-mono)', fontSize: '1.15rem', fontWeight: 800, color: '#f59e0b' }}>
              {transaction.equipmentId}
            </div>
            {asset && (
              <div style={{ fontSize: '0.82rem', color: 'var(--adm-text-secondary)' }}>
                {asset.type} • {asset.area} ({asset.location})
              </div>
            )}
          </div>

          {onSelectAsset && (
            <button
              onClick={() => {
                onClose();
                onSelectAsset(transaction.equipmentId);
              }}
              className="admin-btn admin-btn-outline admin-btn-sm"
            >
              View Asset ↗
            </button>
          )}
        </div>

        {/* Telemetry Data Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
          <div style={{ background: 'var(--adm-surface-2)', padding: '14px', borderRadius: '8px' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--adm-text-muted)' }}>Action Type</span>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--adm-text-primary)' }}>
              {transaction.transactionType}
            </div>
          </div>

          <div style={{ background: 'var(--adm-surface-2)', padding: '14px', borderRadius: '8px' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--adm-text-muted)' }}>PDA Handheld Device</span>
            <div style={{ fontFamily: 'var(--adm-font-mono)', fontWeight: 600, fontSize: '0.9rem', color: '#0284c7' }}>
              {transaction.deviceId || 'Field PDA (Zebra)'}
            </div>
          </div>

          <div style={{ background: 'var(--adm-surface-2)', padding: '14px', borderRadius: '8px' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--adm-text-muted)' }}>Transaction Time (Local)</span>
            <div style={{ fontFamily: 'var(--adm-font-mono)', fontWeight: 600, fontSize: '0.86rem', color: 'var(--adm-text-primary)' }}>
              {formatAdminTimestamp(transaction.transactionTimestamp)}
            </div>
          </div>

          <div style={{ background: 'var(--adm-surface-2)', padding: '14px', borderRadius: '8px' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--adm-text-muted)' }}>Cloud Upload Time</span>
            <div style={{ fontFamily: 'var(--adm-font-mono)', fontWeight: 600, fontSize: '0.86rem', color: '#10b981' }}>
              {transaction.uploadTimestamp || 'Synced'}
            </div>
          </div>
        </div>

        {/* Specific Measurements Section */}
        <div
          style={{
            background: 'var(--adm-surface-1)',
            border: '1px solid var(--adm-border-subtle)',
            borderRadius: 'var(--adm-radius-md)',
            padding: '16px',
            marginBottom: '20px',
          }}
        >
          <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--adm-text-secondary)', fontWeight: 700, marginBottom: '12px' }}>
            Recorded Values
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
            {transaction.fuelTransferLitres !== undefined && (
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--adm-text-muted)' }}>Fuel Transfer</span>
                <p style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--adm-accent-yellow)' }}>
                  {transaction.fuelTransferLitres} L
                </p>
              </div>
            )}

            {transaction.defTransferLitres !== undefined && (
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--adm-text-muted)' }}>DEF Transfer</span>
                <p style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--adm-text-primary)' }}>
                  {transaction.defTransferLitres} L
                </p>
              </div>
            )}

            {transaction.checkInFuelPercentage !== undefined && (
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--adm-text-muted)' }}>Check-in Fuel</span>
                <p style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--adm-text-primary)' }}>
                  {transaction.checkInFuelPercentage}%
                </p>
              </div>
            )}

            {transaction.checkOutFuelPercentage !== undefined && (
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--adm-text-muted)' }}>Check-out Fuel</span>
                <p style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--adm-text-primary)' }}>
                  {transaction.checkOutFuelPercentage}%
                </p>
              </div>
            )}

            {transaction.checkInDefPercentage !== undefined && (
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--adm-text-muted)' }}>Check-in DEF</span>
                <p style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--adm-text-primary)' }}>
                  {transaction.checkInDefPercentage}%
                </p>
              </div>
            )}

            {transaction.checkOutDefPercentage !== undefined && (
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--adm-text-muted)' }}>Check-out DEF</span>
                <p style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--adm-text-primary)' }}>
                  {transaction.checkOutDefPercentage}%
                </p>
              </div>
            )}

            {transaction.checkInFuelEighths !== undefined && (
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--adm-text-muted)' }}>Check-in Eighths</span>
                <p style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--adm-text-primary)' }}>
                  {transaction.checkInFuelEighths}/8
                </p>
              </div>
            )}

            {transaction.checkOutFuelEighths !== undefined && (
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--adm-text-muted)' }}>Check-out Eighths</span>
                <p style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--adm-text-primary)' }}>
                  {transaction.checkOutFuelEighths}/8
                </p>
              </div>
            )}

            {transaction.checkInKWH !== undefined && (
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--adm-text-muted)' }}>Check-in kWh</span>
                <p style={{ fontSize: '1.1rem', fontWeight: 800, color: '#10b981' }}>
                  {transaction.checkInKWH.toLocaleString()} kWh
                </p>
              </div>
            )}

            {transaction.checkOutKWH !== undefined && (
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--adm-text-muted)' }}>Check-out kWh</span>
                <p style={{ fontSize: '1.1rem', fontWeight: 800, color: '#10b981' }}>
                  {transaction.checkOutKWH.toLocaleString()} kWh
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Raw JSON toggle */}
        <div style={{ marginBottom: '14px' }}>
          <button
            onClick={() => setShowJson(!showJson)}
            className="admin-btn admin-btn-outline admin-btn-sm"
            style={{ fontSize: '0.78rem' }}
          >
            <Code size={14} />
            <span>{showJson ? 'Hide Raw JSON Payload' : 'Inspect Raw JSON Payload'}</span>
          </button>

          {showJson && (
            <pre
              style={{
                marginTop: '10px',
                padding: '12px',
                background: '#04070d',
                borderRadius: '8px',
                border: '1px solid var(--adm-border-subtle)',
                fontSize: '0.76rem',
                fontFamily: 'var(--adm-font-mono)',
                color: '#34d399',
                overflowX: 'auto',
                maxHeight: '180px',
              }}
            >
              {JSON.stringify(transaction, null, 2)}
            </pre>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '16px', borderTop: '1px solid var(--adm-border-subtle)' }}>
          {onDeleteTransaction ? (
            <button
              onClick={async () => {
                if (window.confirm(`Delete transaction ${transaction.id}? If this was a power event, generator state will recalculate from the remaining history.`)) {
                  await onDeleteTransaction(transaction.id);
                }
              }}
              className="admin-btn admin-btn-outline admin-btn-sm"
              style={{ color: '#F87171', gap: '6px' }}
              title="Delete transaction and recalculate equipment state"
            >
              <Trash2 size={14} />
              <span>Delete Transaction</span>
            </button>
          ) : <div />}

          <button onClick={onClose} className="admin-btn admin-btn-secondary">
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
