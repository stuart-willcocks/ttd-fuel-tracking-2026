import React, { useState, useRef } from 'react';
import {
  AlertTriangle,
  Trash2,
  X,
  AlertOctagon,
  Upload,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
} from 'lucide-react';
import type { Equipment } from '../../types';
import {
  validateAndParseEquipmentFile,
  type EquipmentFileValidationResult,
} from '../../utils/excelParser';

interface DangerZoneModalProps {
  isOpen: boolean;
  existingAssets?: Equipment[];
  onClose: () => void;
  onDeleteAll: () => Promise<void>;
  onDeleteAllTransactions: () => Promise<void>;
  onBulkUpload: (equipmentList: Equipment[]) => Promise<void>;
}

type ModalStep = 'MAIN' | 'CONFIRM_DELETE_ALL' | 'CONFIRM_DELETE_TXS' | 'VERIFY_UPLOAD';

export const DangerZoneModal: React.FC<DangerZoneModalProps> = ({
  isOpen,
  existingAssets = [],
  onClose,
  onDeleteAll,
  onDeleteAllTransactions,
  onBulkUpload,
}) => {
  const [step, setStep] = useState<ModalStep>('MAIN');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isValidatingFile, setIsValidatingFile] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<EquipmentFileValidationResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isOpen) {
      setStep('MAIN');
      setIsDeleting(false);
      setIsUploading(false);
      setIsValidatingFile(false);
      setErrorMsg(null);
      setValidationResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isBusy = isDeleting || isUploading || isValidatingFile;

  const handleClose = () => {
    if (isBusy) return;
    setStep('MAIN');
    setErrorMsg(null);
    setValidationResult(null);
    onClose();
  };

  const handleConfirmDeleteAll = async () => {
    setIsDeleting(true);
    setErrorMsg(null);
    try {
      await onDeleteAll();
      setIsDeleting(false);
      setStep('MAIN');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Failed to delete records: ${msg}`);
      setIsDeleting(false);
    }
  };

  const handleConfirmDeleteTransactions = async () => {
    setIsDeleting(true);
    setErrorMsg(null);
    try {
      await onDeleteAllTransactions();
      setIsDeleting(false);
      setStep('MAIN');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Failed to delete transactions: ${msg}`);
      setIsDeleting(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    setIsValidatingFile(true);
    try {
      const result = await validateAndParseEquipmentFile(file, existingAssets);
      setValidationResult(result);
      setStep('VERIFY_UPLOAD');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Failed to read file: ${msg}`);
    } finally {
      setIsValidatingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleConfirmBulkUpload = async () => {
    if (!validationResult || !validationResult.isValid) return;

    setErrorMsg(null);
    setIsUploading(true);
    try {
      await onBulkUpload(validationResult.equipmentList);
      setIsUploading(false);
      setValidationResult(null);
      setStep('MAIN');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Upload failed: ${msg}`);
      setIsUploading(false);
    }
  };

  const isMouseDownOnBackdrop = useRef<boolean>(false);

  const handleBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    isMouseDownOnBackdrop.current = e.target === e.currentTarget;
  };

  const handleBackdropMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (isMouseDownOnBackdrop.current && e.target === e.currentTarget) {
      handleClose();
    }
    isMouseDownOnBackdrop.current = false;
  };

  const getHeaderTitle = () => {
    if (step === 'CONFIRM_DELETE_ALL' || step === 'CONFIRM_DELETE_TXS') {
      return 'Confirm Deletion';
    }
    if (step === 'VERIFY_UPLOAD') {
      return 'Bulk Upload Verification';
    }
    return 'Danger Zone';
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
        style={{
          maxWidth: step === 'VERIFY_UPLOAD' ? '580px' : step === 'MAIN' ? '520px' : '480px',
          borderColor: 'rgba(239, 68, 68, 0.45)',
        }}
      >
        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.csv"
          style={{ display: 'none' }}
          onChange={handleFileChange}
          onClick={(e) => {
            (e.target as HTMLInputElement).value = '';
          }}
        />

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
                background:
                  step === 'VERIFY_UPLOAD' && validationResult?.isValid
                    ? 'rgba(22, 163, 74, 0.15)'
                    : 'rgba(239, 68, 68, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color:
                  step === 'VERIFY_UPLOAD' && validationResult?.isValid
                    ? '#22c55e'
                    : '#ef4444',
              }}
            >
              {step === 'CONFIRM_DELETE_ALL' || step === 'CONFIRM_DELETE_TXS' ? (
                <AlertOctagon size={20} />
              ) : step === 'VERIFY_UPLOAD' ? (
                <FileSpreadsheet size={20} />
              ) : (
                <AlertTriangle size={20} />
              )}
            </div>
            <h2 className="admin-card-title" style={{ fontSize: '1.25rem', color: 'var(--adm-text-primary)' }}>
              {getHeaderTitle()}
            </h2>
          </div>

          <button
            onClick={handleClose}
            className="admin-btn admin-btn-outline admin-btn-sm"
            style={{ padding: '6px' }}
            disabled={isBusy}
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

        {step === 'MAIN' && (
          /* Step 1: Danger Zone Main Dialog */
          <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="admin-btn admin-btn-secondary"
                disabled={isBusy}
                style={{
                  padding: '10px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  cursor: isBusy ? 'not-allowed' : 'pointer',
                  width: '100%',
                }}
              >
                <Upload size={16} />
                <span>
                  {isValidatingFile ? 'Validating file...' : 'Bulk upload equipment list'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  setStep('CONFIRM_DELETE_TXS');
                }}
                className="admin-btn"
                disabled={isBusy}
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
                  cursor: isBusy ? 'not-allowed' : 'pointer',
                  width: '100%',
                }}
              >
                <Trash2 size={16} />
                <span>Delete all transactions</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  setStep('CONFIRM_DELETE_ALL');
                }}
                className="admin-btn"
                disabled={isBusy}
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
                  cursor: isBusy ? 'not-allowed' : 'pointer',
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
                disabled={isBusy}
              >
                Close
              </button>
            </div>
          </div>
        )}

        {step === 'CONFIRM_DELETE_ALL' && (
          /* Confirm Delete All Equipment & Transactions Dialog */
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
              All equipment IDs and transactions will be deleted. Do you want to continue?
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
                onClick={() => {
                  setErrorMsg(null);
                  setStep('MAIN');
                }}
                className="admin-btn"
                style={{
                  background: '#16a34a',
                  color: '#ffffff',
                  fontWeight: 700,
                  border: 'none',
                  cursor: isDeleting ? 'not-allowed' : 'pointer',
                }}
                disabled={isDeleting}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmDeleteAll}
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
                    <span>Delete all records</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {step === 'CONFIRM_DELETE_TXS' && (
          /* Confirm Delete All Transactions Only Dialog */
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
              All transaction records will be deleted (leaving the equipment list intact). Do you want to continue?
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
                onClick={() => {
                  setErrorMsg(null);
                  setStep('MAIN');
                }}
                className="admin-btn"
                style={{
                  background: '#16a34a',
                  color: '#ffffff',
                  fontWeight: 700,
                  border: 'none',
                  cursor: isDeleting ? 'not-allowed' : 'pointer',
                }}
                disabled={isDeleting}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmDeleteTransactions}
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
                    <span>Delete all transactions</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {step === 'VERIFY_UPLOAD' && validationResult && (
          /* Pre-Upload Verification & Upsert Warning Dialog */
          <div>
            {/* File metadata bar */}
            <div
              style={{
                fontSize: '0.84rem',
                color: 'var(--adm-text-secondary)',
                marginBottom: '12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>
                File: <strong style={{ color: 'var(--adm-text-primary)' }}>{validationResult.fileName}</strong>
              </span>
              {validationResult.sheetName && (
                <span>
                  Sheet: <strong style={{ color: 'var(--adm-text-primary)' }}>{validationResult.sheetName}</strong>
                </span>
              )}
            </div>

            {/* Upsert Warning Box */}
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '8px',
                background: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                color: '#fcd34d',
                fontSize: '0.86rem',
                lineHeight: 1.45,
                marginBottom: '14px',
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start',
              }}
            >
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px', color: '#f59e0b' }} />
              <div>
                <strong>Important:</strong> Uploaded equipment details will be appended to any existing
                equipment rows. In the event of any duplicate equipment IDs, the new uploaded values
                will overwrite the existing values.
              </div>
            </div>

            {/* Validation Status Box */}
            {validationResult.isValid ? (
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: '8px',
                  background: 'rgba(22, 163, 74, 0.14)',
                  border: '1px solid rgba(22, 163, 74, 0.4)',
                  color: '#86efac',
                  fontSize: '0.9rem',
                  marginBottom: '18px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, marginBottom: '8px', color: '#4ade80' }}>
                  <CheckCircle2 size={18} />
                  <span>All column headings and data rows look good!</span>
                </div>
                <div style={{ fontSize: '0.84rem', color: 'var(--adm-text-primary)', lineHeight: 1.6 }}>
                  <div>• Expected column headings verified: <strong>OK</strong></div>
                  <div>• Total valid equipment records ready to import: <strong>{validationResult.equipmentList.length}</strong></div>
                  <div>• New equipment IDs to be appended: <strong>{validationResult.newCount}</strong></div>
                  <div>• Existing equipment IDs to be overwritten: <strong>{validationResult.overwriteCount}</strong></div>
                  {validationResult.inFileDuplicateCount > 0 && (
                    <div style={{ color: '#fcd34d' }}>
                      • Duplicate rows within uploaded sheet merged: <strong>{validationResult.inFileDuplicateCount}</strong>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.14)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#fca5a5',
                  fontSize: '0.88rem',
                  marginBottom: '18px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, marginBottom: '8px', color: '#f87171' }}>
                  <XCircle size={18} />
                  <span>Validation errors found ({validationResult.errors.length}) — database was not modified:</span>
                </div>
                <div
                  style={{
                    maxHeight: '190px',
                    overflowY: 'auto',
                    background: 'rgba(15, 23, 42, 0.55)',
                    borderRadius: '6px',
                    padding: '10px 12px',
                    fontSize: '0.82rem',
                    lineHeight: 1.5,
                    color: '#fecaca',
                  }}
                >
                  {validationResult.errors.map((err, idx) => (
                    <div key={idx} style={{ marginBottom: idx < validationResult.errors.length - 1 ? '6px' : 0 }}>
                      • {err}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div
              style={{
                display: 'flex',
                gap: '12px',
                justifyContent: 'flex-end',
                paddingTop: '14px',
                borderTop: '1px solid var(--adm-border-subtle)',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setValidationResult(null);
                  setErrorMsg(null);
                  setStep('MAIN');
                }}
                className="admin-btn"
                style={{
                  background: '#16a34a',
                  color: '#ffffff',
                  fontWeight: 700,
                  border: 'none',
                  cursor: isUploading ? 'not-allowed' : 'pointer',
                }}
                disabled={isUploading}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="admin-btn admin-btn-outline"
                disabled={isUploading}
              >
                Select another file
              </button>

              {validationResult.isValid && (
                <button
                  type="button"
                  onClick={handleConfirmBulkUpload}
                  className="admin-btn admin-btn-primary"
                  style={{
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                  disabled={isUploading}
                >
                  <Upload size={15} />
                  <span>{isUploading ? 'Uploading...' : 'Confirm & Upload'}</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
