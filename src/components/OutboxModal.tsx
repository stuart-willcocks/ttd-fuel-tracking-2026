import React, { useState, useEffect } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { db, type OutboxItem } from '../db/indexedDB';
import type { Transaction } from '../types';
import { syncEngine, type SyncState } from '../services/syncEngine';
import { TransactionTypeIcon } from './TransactionTypeIcon';
import { formatPdaTimestamp } from '../utils/dateFormat';

interface OutboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  syncState: SyncState;
}

export const OutboxModal: React.FC<OutboxModalProps> = ({
  isOpen,
  onClose,
  syncState,
}) => {
  const [outboxItems, setOutboxItems] = useState<(OutboxItem & { tx?: Transaction })[]>([]);

  const loadData = async () => {
    try {
      const items = await db.outbox.toArray();
      const enriched = await Promise.all(
        items.map(async (item) => {
          const tx = await db.transactions.get(item.id);
          return { ...item, tx };
        })
      );
      setOutboxItems(enriched);
    } catch (err) {
      console.error('Failed to load outbox:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, syncState.pendingCount, syncState.isSyncing]);

  if (!isOpen) return null;

  const handleForceSync = async () => {
    await syncEngine.syncWithRemote();
    await loadData();
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-box">
        <div className="modal-header-simple">
          <h3 className="modal-title">Offline Upload Queue</h3>
          <button className="btn-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <p className="modal-subtitle">
          {outboxItems.length} transactions stored on device waiting for server connection.
        </p>

        {outboxItems.length === 0 ? (
          <div className="empty-history">All transactions are uploaded and synchronized.</div>
        ) : (
          <div className="queue-list-simple">
            {outboxItems.map((item) => (
              <div key={item.id} className="queue-row">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <strong>{item.equipmentId}</strong>
                    <TransactionTypeIcon type={item.tx?.transactionType} size={24} />
                  </div>
                  <div className="queue-time">{formatPdaTimestamp(item.tx?.transactionTimestamp)}</div>
                  {item.error && (
                    <div style={{ fontSize: '11px', color: '#f87171', marginTop: '2px' }}>
                      {item.error}
                    </div>
                  )}
                </div>
                <span className="pending-tag">
                  {item.attempts > 0 ? `Retry (${item.attempts})` : 'Pending'}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="modal-buttons-row">
          <button
            className="btn-pda-rect btn-pda-blue"
            onClick={handleForceSync}
            disabled={!syncState.isOnline || syncState.isSyncing}
          >
            <RefreshCw size={14} className={syncState.isSyncing ? 'spinning' : ''} />
            <span>{syncState.isSyncing ? 'Syncing...' : 'Sync Queue Now'}</span>
          </button>
          <button className="btn-modal-cancel" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
