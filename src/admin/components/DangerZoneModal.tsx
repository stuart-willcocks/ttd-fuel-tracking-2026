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
  onDeleteTransactionsForEquipment: (equipmentId: string) => Promise<void>;
  onBulkUpload: (equipmentList: Equipment[]) => Promise<void>;
}

type ModalStep =
  | 'MAIN'
  | 'CONFIRM_DELETE_ALL'
  | 'CONFIRM_DELETE_TXS'
  | 'SELECT_EQ_DELETE_TXS'
  | 'CONFIRM_DELETE_EQ_TXS'
  | 'VERIFY_UPLOAD';

const PREVIEW_ROW_LIMIT = 5;

export const DangerZoneModal: React.FC<DangerZoneModalProps> = ({
  isOpen,
  existingAssets = [],
  onClose,
  onDeleteAll,
  onDeleteAllTransactions,
  onDeleteTransactionsForEquipment,
  onBulkUpload,
}) => {
  const [step, setStep] = useState<ModalStep>('MAIN');
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isValidatingFile, setIsValidatingFile] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<EquipmentFileValidationResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sortedAssets = React.useMemo(
    () =>
      [...existingAssets].sort((a, b) =>
        a.equipmentId.localeCompare(b.equipmentId, undefined, { numeric: true, sensitivity: 'base' })
      ),
    [existingAssets]
  );

  React.useEffect(() => {
    if (isOpen) {
      setStep('MAIN');
      setSelectedEquipmentId('');
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

  const handleConfirmDeleteEquipmentTransactions = async () => {
    if (!selectedEquipmentId) return;
    setIsDeleting(true);
    setErrorMsg(null);
    try {
      await onDeleteTransactionsForEquipment(selectedEquipmentId);
      setIsDeleting(false);
      setSelectedEquipmentId('');
      setStep('MAIN');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Failed to delete transactions for ${selectedEquipmentId}: ${msg}`);
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
    if (
      step === 'CONFIRM_DELETE_ALL' ||
      step === 'CONFIRM_DELETE_TXS' ||
      step === 'CONFIRM_DELETE_EQ_TXS'
    ) {
      return 'Confirm Deletion';
    }
    if (step === 'SELECT_EQ_DELETE_TXS') {
      return 'Select Equipment ID';
    }
    if (step === 'VERIFY_UPLOAD') {
      return 'Bulk Upload Verification';
    }
    return 'Danger Zone';
  };

  const previewRows = validationResult
    ? validationResult.equipmentList.slice(0, PREVIEW_ROW_LIMIT)
    : [];

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
          maxWidth: step === 'VERIFY_UPLOAD' ? '740px' : step === 'MAIN' ? '520px' : '480px',
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
                    ? '#16a34a'
                    : '#ef4444',
              }}
            >
              {step === 'CONFIRM_DELETE_ALL' ||
              step === 'CONFIRM_DELETE_TXS' ||
              step === 'CONFIRM_DELETE_EQ_TXS' ? (
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
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              color: '#dc2626',
              fontSize: '0.88rem',
              fontWeight: 600,
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
                  setSelectedEquipmentId('');
                  setStep('SELECT_EQ_DELETE_TXS');
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
                <span>Delete transactions for one equipment ID</span>
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

        {step === 'SELECT_EQ_DELETE_TXS' && (
          /* Select Equipment ID to Delete Transactions For */
          <div>
            <p
              style={{
                fontSize: '0.94rem',
                color: 'var(--adm-text-secondary)',
                lineHeight: 1.5,
                margin: '4px 0 14px 0',
              }}
            >
              Select an equipment ID from the drop-down below to delete all of its transaction records:
            </p>

            <div style={{ marginBottom: '22px' }}>
              <label
                htmlFor="danger-zone-equipment-select"
                style={{
                  display: 'block',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: 'var(--adm-text-secondary)',
                  marginBottom: '6px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Equipment ID
              </label>
              <select
                id="danger-zone-equipment-select"
                className="admin-select"
                value={selectedEquipmentId}
                onChange={(e) => setSelectedEquipmentId(e.target.value)}
                disabled={isDeleting || sortedAssets.length === 0}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: '0.92rem',
                  fontWeight: 600,
                }}
              >
                <option value="">
                  {sortedAssets.length === 0
                    ? '-- No equipment IDs available --'
                    : '-- Select an equipment ID --'}
                </option>
                {sortedAssets.map((eq) => (
                  <option key={eq.equipmentId} value={eq.equipmentId}>
                    {eq.equipmentId} — {eq.type}
                    {eq.location ? ` (${eq.location})` : ''}
                  </option>
                ))}
              </select>
            </div>

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
                  setSelectedEquipmentId('');
                  setStep('MAIN');
                }}
                className="admin-btn"
                style={{
                  background: '#16a34a',
                  color: '#ffffff',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!selectedEquipmentId) return;
                  setErrorMsg(null);
                  setStep('CONFIRM_DELETE_EQ_TXS');
                }}
                className="admin-btn"
                style={{
                  background: '#ef4444',
                  color: '#ffffff',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  border: 'none',
                  opacity: selectedEquipmentId ? 1 : 0.5,
                  cursor: selectedEquipmentId ? 'pointer' : 'not-allowed',
                }}
                disabled={!selectedEquipmentId}
              >
                <Trash2 size={15} />
                <span>Continue</span>
              </button>
            </div>
          </div>
        )}

        {step === 'CONFIRM_DELETE_EQ_TXS' && (
          /* Confirm Delete Transactions for Selected Equipment ID */
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
              All transaction records for equipment ID{' '}
              <span style={{ fontFamily: 'var(--adm-font-mono)', color: '#ef4444' }}>
                {selectedEquipmentId}
              </span>{' '}
              will be deleted (leaving the equipment record intact). Do you want to continue?
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
                  setStep('SELECT_EQ_DELETE_TXS');
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
                onClick={handleConfirmDeleteEquipmentTransactions}
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
                    <span>Delete transactions</span>
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

            {/* Upsert Warning Box — Grey background with yellow text */}
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '8px',
                background: '#475569',
                border: '1px solid #334155',
                color: '#fde047',
                fontSize: '0.86rem',
                lineHeight: 1.45,
                marginBottom: '14px',
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start',
              }}
            >
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px', color: '#fde047' }} />
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
                  background: 'rgba(22, 163, 74, 0.12)',
                  border: '1px solid rgba(22, 163, 74, 0.4)',
                  color: 'var(--adm-text-primary)',
                  fontSize: '0.9rem',
                  marginBottom: '14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, marginBottom: '8px', color: '#15803d' }}>
                  <CheckCircle2 size={18} />
                  <span>All column headings and data rows look good!</span>
                </div>
                <div style={{ fontSize: '0.84rem', color: 'var(--adm-text-primary)', lineHeight: 1.6 }}>
                  <div>• Expected column headings verified: <strong>OK</strong></div>
                  <div>• Total valid equipment records ready to import: <strong>{validationResult.equipmentList.length}</strong></div>
                  <div>• New equipment IDs to be appended: <strong>{validationResult.newCount}</strong></div>
                  <div>• Existing equipment IDs to be overwritten: <strong>{validationResult.overwriteCount}</strong></div>
                  {validationResult.inFileDuplicateCount > 0 && (
                    <div style={{ color: '#b45309', fontWeight: 600 }}>
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
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#991b1b',
                  fontSize: '0.88rem',
                  marginBottom: '14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, marginBottom: '8px', color: '#dc2626' }}>
                  <XCircle size={18} />
                  <span>Validation errors found ({validationResult.errors.length}) — database was not modified:</span>
                </div>
                <div
                  style={{
                    maxHeight: '170px',
                    overflowY: 'auto',
                    background: '#334155',
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

            {/* Sheet Preview Table (first few rows to be imported) */}
            {previewRows.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div
                  style={{
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    color: 'var(--adm-text-secondary)',
                    marginBottom: '6px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span>
                    Preview ({previewRows.length} of {validationResult.equipmentList.length}{' '}
                    {validationResult.equipmentList.length === 1 ? 'row' : 'rows'} to be imported)
                  </span>
                </div>
                <div
                  style={{
                    overflowX: 'auto',
                    border: '1px solid var(--adm-border-medium)',
                    borderRadius: '6px',
                    background: '#ffffff',
                  }}
                >
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '0.78rem',
                      textAlign: 'left',
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          background: 'var(--adm-surface-2)',
                          borderBottom: '1px solid var(--adm-border-medium)',
                          color: 'var(--adm-text-secondary)',
                          fontWeight: 700,
                        }}
                      >
                        <th style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>EquipmentId</th>
                        <th style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>Area</th>
                        <th style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>Location</th>
                        <th style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>what3words</th>
                        <th style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>Type</th>
                        <th style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>Size</th>
                        <th style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>SerialNumber</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((eq, idx) => (
                        <tr
                          key={eq.equipmentId}
                          style={{
                            borderBottom:
                              idx < previewRows.length - 1
                                ? '1px solid var(--adm-border-subtle)'
                                : 'none',
                            color: 'var(--adm-text-primary)',
                          }}
                        >
                          <td
                            style={{
                              padding: '6px 10px',
                              fontFamily: 'var(--adm-font-mono)',
                              fontWeight: 700,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {eq.equipmentId}
                          </td>
                          <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>{eq.area}</td>
                          <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>{eq.location}</td>
                          <td
                            style={{
                              padding: '6px 10px',
                              fontFamily: 'var(--adm-font-mono)',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {eq.what3words}
                          </td>
                          <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', fontWeight: 600 }}>
                            {eq.type}
                          </td>
                          <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                            {eq.capacity !== undefined
                              ? `${eq.capacity} ${eq.type === 'GENERATOR' ? 'kVA' : 'L'}`
                              : '—'}
                          </td>
                          <td
                            style={{
                              padding: '6px 10px',
                              fontFamily: 'var(--adm-font-mono)',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {eq.rentalSerialNumber}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
