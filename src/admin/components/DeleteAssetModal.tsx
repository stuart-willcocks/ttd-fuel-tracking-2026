import React, { useState } from 'react';
import { AlertOctagon, Trash2, X } from 'lucide-react';
import type { Equipment, Transaction } from '../../types';

interface DeleteAssetModalProps {
  asset: Equipment | null;
  transactions: Transaction[];
  isOpen: boolean;
  onClose: () => void;
  onConfirmDelete: (equipmentId: string) => Promise<void>;
}

export const DeleteAssetModal: React.FC<DeleteAssetModalProps> = ({
  asset,
  transactions,
  isOpen,
  onClose,
  onConfirmDelete,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen || !asset) return null;

  const assetTxs = transactions.filter((t) => t.equipmentId === asset.equipmentId);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onConfirmDelete(asset.equipmentId);
      onClose();
    } catch (err) {
      console.error('Delete error:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div className="admin-modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: 'rgba(239, 68, 68, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ef4444',
              }}
            >
              <AlertOctagon size={24} />
            </div>
            <div>
              <h3 style={{ fontFamily: 'var(--adm-font-display)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--adm-text-primary)' }}>
                Decommission Asset?
              </h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--adm-text-secondary)' }}>
                Permanent removal from fleet registry
              </p>
            </div>
          </div>
          <button onClick={onClose} className="admin-btn admin-btn-outline admin-btn-sm" style={{ padding: '6px' }}>
            <X size={18} />
          </button>
        </div>

        <div
          style={{
            padding: '16px',
            background: 'var(--adm-surface-2)',
            borderRadius: 'var(--adm-radius-md)',
            border: '1px solid var(--adm-border-subtle)',
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--adm-text-muted)' }}>Equipment ID:</span>
            <span style={{ fontFamily: 'var(--adm-font-mono)', fontWeight: 700, color: '#f59e0b' }}>
              {asset.equipmentId}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--adm-text-muted)' }}>Equipment type:</span>
            <span style={{ fontWeight: 600 }}>{asset.type} ({asset.capacity ? `${asset.capacity} ${asset.type === 'GENERATOR' ? 'kVA' : 'L'}` : 'N/A'})</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--adm-text-muted)' }}>Associated Transactions:</span>
            <span
              style={{
                fontFamily: 'var(--adm-font-mono)',
                fontWeight: 700,
                color: assetTxs.length > 0 ? '#ef4444' : '#10b981',
              }}
            >
              {assetTxs.length} records
            </span>
          </div>
        </div>

        {assetTxs.length > 0 && (
          <p
            style={{
              fontSize: '0.85rem',
              color: '#f87171',
              lineHeight: 1.5,
              marginBottom: '20px',
              padding: '10px 14px',
              background: 'rgba(239, 68, 68, 0.1)',
              borderRadius: '8px',
              border: '1px solid rgba(239, 68, 68, 0.25)',
            }}
          >
            ⚠️ <strong>Warning:</strong> Deleting this equipment will also cascade delete {assetTxs.length} historical fuel transaction records associated with this asset ID.
          </p>
        )}

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="admin-btn admin-btn-outline" disabled={isDeleting}>
            Cancel
          </button>
          <button
            onClick={handleDelete}
            className="admin-btn admin-btn-danger"
            disabled={isDeleting}
          >
            <Trash2 size={16} />
            <span>{isDeleting ? 'Deleting...' : 'Confirm Decommission & Delete'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
