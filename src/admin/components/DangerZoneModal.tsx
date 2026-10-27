import React, { useState, useRef } from 'react';
import { AlertTriangle, Trash2, X, AlertOctagon, Upload } from 'lucide-react';
import type { Equipment } from '../../types';
import { parseEquipmentFile } from '../../utils/excelParser';

interface DangerZoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeleteAll: () => Promise<void>;
  onBulkUpload: (equipmentList: Equipment[]) => Promise<void>;
}

export const DangerZoneModal: React.FC<DangerZoneModalProps> = ({
  isOpen,
  onClose,
  onDeleteAll,
  onBulkUpload,
}) => {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleClose = () => {
    if (isDeleting || isUploading) return;
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    setIsUploading(true);
    try {
      const parsedEquipment = await parseEquipmentFile(file);
      await onBulkUpload(parsedEquipment);
      handleClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Upload failed: ${msg}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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
            <h2 className="admin-card-title" style={{ fontSize: '1.25rem', color: 'var(--adm-text-primary)' }}>
              {showConfirm ? 'Confirm Deletion' : 'Danger Zone'}
            </h2>
          </div>

          <button
            onClick={handleClose}
            className="admin-btn admin-btn-outline admin-btn-sm"
            style={{ padding: '6px' }}
            disabled={isDeleting || isUploading}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.csv"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="admin-btn admin-btn-secondary"
                disabled={isDeleting || isUploading}
                style={{
                  padding: '10px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  cursor: isUploading ? 'not-allowed' : 'pointer',
                  width: '100%',
                }}
              >
                <Upload size={16} />
                <span>{isUploading ? 'Uploading...' : 'Bulk upload equipment list'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowConfirm(true)}
                className="admin-btn"
                disabled={isDeleting || isUploading}
                style={{
                  background: '#ef4444',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  padding: '10px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                <Trash2 size={16} />
                <span>Delete all equipment records</span>
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleClose}
                className="admin-btn admin-btn-outline"
                disabled={isDeleting || isUploading}
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
                color: 'var(--adm-text-primary)',
                fontWeight: 600,
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
