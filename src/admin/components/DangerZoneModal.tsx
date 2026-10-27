import React, { useState } from 'react';
import { AlertTriangle, Trash2, X, AlertOctagon } from 'lucide-react';

interface DangerZoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeleteAll: () => Promise<void>;
}

export const DangerZoneModal: React.FC<DangerZoneModalProps> = ({
  isOpen,
  onClose,
  onDeleteAll,
}) => {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleClose = () => {
    if (isDeleting) return;
    setShowConfirm(false);
    setErrorMsg(null);
    onClose();
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    setErrorMsg(null);
    try {
      await onDeleteAll();
      handleClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Failed to delete records: ${msg}`);
      setIsDeleting(false);
    }
  };

  return (
    <div className="admin-modal-backdrop" onClick={handleClose}>
      <div
        className="admin-modal-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: showConfirm ? '460px' : '520px',
          borderColor: 'rgba(239, 68, 68, 0.45)',
        }}
      >
        {/* Dialog Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ef4444',
              }}
            >
              {showConfirm ? <AlertOctagon size={20} /> : <AlertTriangle size={20} />}
            </div>
            <h2 className="admin-card-title" style={{ fontSize: '1.25rem', color: '#ffffff' }}>
              {showConfirm ? 'Confirm Deletion' : 'Danger Zone'}
            </h2>
          </div>

          <button
            onClick={handleClose}
            className="admin-btn admin-btn-outline admin-btn-sm"
            style={{ padding: '6px' }}
            disabled={isDeleting}
          >
            <X size={18} />
          </button>
        </div>

        {errorMsg && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              color: '#fca5a5',
              fontSize: '0.88rem',
              marginBottom: '18px',
            }}
          >
            {errorMsg}
          </div>
        )}

        {!showConfirm ? (
          /* Step 1: Danger Zone Dialog */
          <div>
            <div
              style={{
                padding: '18px',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: 'var(--adm-radius-md)',
                marginBottom: '20px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '14px',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#ffffff' }}>
                    Purge Master Database
                  </div>
                  <div
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--adm-text-secondary)',
                      marginTop: '3px',
                    }}
                  >
                    Permanently delete all fleet equipment records and transactions.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowConfirm(true)}
                  className="admin-btn"
                  style={{
                    background: '#ef4444',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    padding: '8px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <Trash2 size={15} />
                  <span>Delete all equipment records</span>
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleClose}
                className="admin-btn admin-btn-outline"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          /* Step 2: Confirmation Dialog */
          <div>
            <p
              style={{
                fontSize: '1rem',
                color: '#f8fafc',
                fontWeight: 500,
                lineHeight: 1.5,
                margin: '12px 0 24px 0',
              }}
            >
              All equipment IDs and transaction will be deleted. Do you want to continue?
            </p>

            <div
              style={{
                display: 'flex',
                gap: '12px',
                justifyContent: 'flex-end',
                paddingTop: '16px',
                borderTop: '1px solid var(--adm-border-subtle)',
              }}
            >
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="admin-btn admin-btn-outline"
                disabled={isDeleting}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmDelete}
                className="admin-btn"
                style={{
                  background: '#ef4444',
                  color: '#ffffff',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  border: 'none',
                  cursor: isDeleting ? 'not-allowed' : 'pointer',
                }}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <span>Deleting...</span>
                ) : (
                  <>
                    <Trash2 size={15} />
                    <span>Yes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
