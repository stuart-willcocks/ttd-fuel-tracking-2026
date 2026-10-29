import React, { useState, useMemo, useEffect, useRef } from 'react';
import { X, Edit, Code, Trash2, Check, AlertTriangle } from 'lucide-react';
import type { Transaction, TransactionType, Equipment } from '../../types';
import { formatAdminTimestamp } from '../../utils/dateFormat';

interface TransactionDetailModalProps {
  transaction: Transaction | null;
  asset?: Equipment | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectAsset?: (equipmentId: string) => void;
  onUpdateTransaction?: (updatedTx: Transaction) => Promise<void>;
  onDeleteTransaction?: (transactionId: string) => Promise<void>;
}

export const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({
  transaction,
  asset,
  isOpen,
  onClose,
  onSelectAsset,
  onUpdateTransaction,
  onDeleteTransaction,
}) => {
  const [showJson, setShowJson] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'SAVE' | 'DELETE' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isMouseDownOnBackdrop = useRef<boolean>(false);

  const assetType = useMemo<'GENERATOR' | 'TANK' | 'PLANT'>(() => {
    if (asset?.type) return asset.type;
    const t = transaction?.transactionType || '';
    if (t.includes('Tank')) return 'TANK';
    if (t.includes('Plant')) return 'PLANT';
    return 'GENERATOR';
  }, [asset, transaction]);

  const isPowerEvent = Boolean(
    transaction &&
      (transaction.transactionType === 'PoweredUp' || transaction.transactionType === 'PoweredDown')
  );
  const isFuelTransfer = Boolean(
    transaction && transaction.transactionType.includes('FuelTransfer')
  );
  const isCheckInOrOut = Boolean(transaction && !isPowerEvent && !isFuelTransfer);

  const [txType, setTxType] = useState<TransactionType>(
    () => transaction?.transactionType || 'CheckInGenerator'
  );
  const [fuelPercentage, setFuelPercentage] = useState<string>('');
  const [defPercentage, setDefPercentage] = useState<string>('');
  const [kwh, setKwh] = useState<string>('');
  const [fuelEighths, setFuelEighths] = useState<number>(0);
  const [fuelLitres, setFuelLitres] = useState<string>('');
  const [defLitres, setDefLitres] = useState<string>('');

  useEffect(() => {
    if (!transaction) return;
    setConfirmAction(null);
    setIsSubmitting(false);
    setTxType(transaction.transactionType);

    const isCheckOut = transaction.transactionType.includes('CheckOut');
    const initFuelPct = isCheckOut
      ? (transaction.checkOutFuelPercentage ?? transaction.checkInFuelPercentage)
      : (transaction.checkInFuelPercentage ?? transaction.checkOutFuelPercentage);
    const initDefPct = isCheckOut
      ? (transaction.checkOutDefPercentage ?? transaction.checkInDefPercentage)
      : (transaction.checkInDefPercentage ?? transaction.checkOutDefPercentage);
    const initKwh = isCheckOut
      ? (transaction.checkOutKWH ?? transaction.checkInKWH)
      : (transaction.checkInKWH ?? transaction.checkOutKWH);
    const initEighths = isCheckOut
      ? (transaction.checkOutFuelEighths ?? transaction.checkInFuelEighths)
      : (transaction.checkInFuelEighths ?? transaction.checkOutFuelEighths);

    setFuelPercentage(initFuelPct !== undefined ? String(initFuelPct) : '');
    setDefPercentage(initDefPct !== undefined ? String(initDefPct) : '');
    setKwh(initKwh !== undefined ? String(initKwh) : '');
    setFuelEighths(initEighths !== undefined ? initEighths : 0);
    setFuelLitres(
      transaction.fuelTransferLitres !== undefined ? String(transaction.fuelTransferLitres) : ''
    );
    setDefLitres(
      transaction.defTransferLitres !== undefined ? String(transaction.defTransferLitres) : ''
    );
  }, [transaction]);

  if (!isOpen || !transaction) return null;

  const isIntInRange = (val: string, min: number, max: number): boolean => {
    if (val.trim() === '') return false;
    const n = Number(val);
    return Number.isInteger(n) && n >= min && n <= max;
  };

  const isValid = (() => {
    if (isPowerEvent) {
      return txType === 'PoweredUp' || txType === 'PoweredDown';
    }
    if (isFuelTransfer) {
      const validFuel = isIntInRange(fuelLitres, 1, 1000000);
      const validDef = defLitres.trim() === '' || isIntInRange(defLitres, 0, 1000000);
      return validFuel && validDef;
    }
    if (isCheckInOrOut) {
      if (assetType === 'GENERATOR') {
        return (
          isIntInRange(fuelPercentage, 0, 100) &&
          isIntInRange(defPercentage, 0, 100) &&
          isIntInRange(kwh, 0, 100000000)
        );
      }
      if (assetType === 'TANK') {
        return Number.isInteger(fuelEighths) && fuelEighths >= 0 && fuelEighths <= 8;
      }
      if (assetType === 'PLANT') {
        return isIntInRange(fuelPercentage, 0, 100);
      }
    }
    return true;
  })();

  const buildUpdatedTransaction = (): Transaction => {
    const next: Transaction = {
      ...transaction,
      transactionType: txType,
    };

    // Clear old measurement fields before setting the active ones
    delete next.checkInFuelPercentage;
    delete next.checkOutFuelPercentage;
    delete next.checkInDefPercentage;
    delete next.checkOutDefPercentage;
    delete next.checkInKWH;
    delete next.checkOutKWH;
    delete next.checkInFuelEighths;
    delete next.checkOutFuelEighths;
    delete next.fuelTransferLitres;
    delete next.defTransferLitres;

    if (isFuelTransfer) {
      next.fuelTransferLitres = parseInt(fuelLitres, 10);
      if (assetType === 'GENERATOR' && defLitres.trim() !== '') {
        next.defTransferLitres = parseInt(defLitres, 10);
      }
    } else if (isCheckInOrOut) {
      const isOut = txType.includes('CheckOut');
      if (assetType === 'GENERATOR') {
        const fp = parseInt(fuelPercentage, 10);
        const dp = parseInt(defPercentage, 10);
        const k = parseInt(kwh, 10);
        if (isOut) {
          next.checkOutFuelPercentage = fp;
          next.checkOutDefPercentage = dp;
          next.checkOutKWH = k;
        } else {
          next.checkInFuelPercentage = fp;
          next.checkInDefPercentage = dp;
          next.checkInKWH = k;
        }
      } else if (assetType === 'TANK') {
        if (isOut) {
          next.checkOutFuelEighths = fuelEighths;
        } else {
          next.checkInFuelEighths = fuelEighths;
        }
      } else if (assetType === 'PLANT') {
        const fp = parseInt(fuelPercentage, 10);
        if (isOut) {
          next.checkOutFuelPercentage = fp;
        } else {
          next.checkInFuelPercentage = fp;
        }
      }
    }

    return next;
  };

  const isDirty = (() => {
    const candidate = buildUpdatedTransaction();
    return (
      candidate.transactionType !== transaction.transactionType ||
      (candidate.checkInFuelPercentage ?? null) !== (transaction.checkInFuelPercentage ?? null) ||
      (candidate.checkOutFuelPercentage ?? null) !== (transaction.checkOutFuelPercentage ?? null) ||
      (candidate.checkInDefPercentage ?? null) !== (transaction.checkInDefPercentage ?? null) ||
      (candidate.checkOutDefPercentage ?? null) !== (transaction.checkOutDefPercentage ?? null) ||
      (candidate.checkInKWH ?? null) !== (transaction.checkInKWH ?? null) ||
      (candidate.checkOutKWH ?? null) !== (transaction.checkOutKWH ?? null) ||
      (candidate.checkInFuelEighths ?? null) !== (transaction.checkInFuelEighths ?? null) ||
      (candidate.checkOutFuelEighths ?? null) !== (transaction.checkOutFuelEighths ?? null) ||
      (candidate.fuelTransferLitres ?? null) !== (transaction.fuelTransferLitres ?? null) ||
      (candidate.defTransferLitres ?? null) !== (transaction.defTransferLitres ?? null)
    );
  })();

  const handleBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    isMouseDownOnBackdrop.current = e.target === e.currentTarget;
  };

  const handleBackdropMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (isMouseDownOnBackdrop.current && e.target === e.currentTarget && !confirmAction && !isSubmitting) {
      onClose();
    }
    isMouseDownOnBackdrop.current = false;
  };

  const handleConfirmedCommit = async () => {
    if (!confirmAction || isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (confirmAction === 'SAVE' && onUpdateTransaction) {
        const updatedTx = buildUpdatedTransaction();
        await onUpdateTransaction(updatedTx);
      } else if (confirmAction === 'DELETE' && onDeleteTransaction) {
        await onDeleteTransaction(transaction.id);
      }
      setConfirmAction(null);
      onClose();
    } catch (err) {
      console.error('Transaction commit failed:', err);
      setIsSubmitting(false);
      setConfirmAction(null);
    }
  };

  const checkInTypeForAsset: TransactionType =
    assetType === 'TANK'
      ? 'CheckInTank'
      : assetType === 'PLANT'
        ? 'CheckInPlant'
        : 'CheckInGenerator';
  const checkOutTypeForAsset: TransactionType =
    assetType === 'TANK'
      ? 'CheckOutTank'
      : assetType === 'PLANT'
        ? 'CheckOutPlant'
        : 'CheckOutGenerator';

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
        style={{ maxWidth: '600px', position: 'relative' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: 'var(--adm-radius-sm)',
                background: 'rgba(37, 99, 235, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2563EB',
              }}
            >
              <Edit size={20} />
            </div>
            <div>
              <h3 style={{ fontFamily: 'var(--adm-font-display)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--adm-text-primary)', margin: 0 }}>
                Edit Transaction
              </h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--adm-text-secondary)', fontFamily: 'var(--adm-font-mono)', margin: '2px 0 0' }}>
                UUID: {transaction.id}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="admin-btn admin-btn-outline admin-btn-sm"
            style={{ padding: '6px' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Target Asset Banner */}
        <div
          style={{
            padding: '14px 16px',
            background: 'var(--adm-surface-2)',
            borderRadius: 'var(--adm-radius-md)',
            border: '1px solid var(--adm-border-subtle)',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--adm-text-muted)', fontWeight: 700 }}>
              Equipment Asset
            </span>
            <div style={{ fontFamily: 'var(--adm-font-mono)', fontSize: '1.1rem', fontWeight: 800, color: 'var(--adm-accent-yellow)' }}>
              {transaction.equipmentId}
            </div>
            {asset && (
              <div style={{ fontSize: '0.8rem', color: 'var(--adm-text-secondary)' }}>
                {asset.type} • {asset.area} ({asset.location})
              </div>
            )}
          </div>

          {onSelectAsset && (
            <button
              type="button"
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

        {/* Metadata Summary Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '18px' }}>
          <div style={{ background: 'var(--adm-surface-2)', padding: '10px 14px', borderRadius: '8px' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--adm-text-muted)' }}>Transaction Time (Local)</span>
            <div style={{ fontFamily: 'var(--adm-font-mono)', fontWeight: 600, fontSize: '0.84rem', color: 'var(--adm-text-primary)', marginTop: '2px' }}>
              {formatAdminTimestamp(transaction.transactionTimestamp)}
            </div>
          </div>

          <div style={{ background: 'var(--adm-surface-2)', padding: '10px 14px', borderRadius: '8px' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--adm-text-muted)' }}>Recorded By Device</span>
            <div style={{ fontFamily: 'var(--adm-font-mono)', fontWeight: 600, fontSize: '0.84rem', color: '#0284c7', marginTop: '2px' }}>
              {transaction.deviceId || 'Field PDA (Zebra)'}
            </div>
          </div>
        </div>

        {/* Editable Fields Section */}
        <div
          style={{
            background: 'var(--adm-surface-1)',
            border: '1px solid var(--adm-border-subtle)',
            borderRadius: 'var(--adm-radius-md)',
            padding: '16px',
            marginBottom: '18px',
          }}
        >
          <h4 style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--adm-text-secondary)', fontWeight: 700, marginTop: 0, marginBottom: '14px' }}>
            Editable Transaction Parameters
          </h4>

          {/* Check-In vs Check-Out selector */}
          {isCheckInOrOut && (
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--adm-text-secondary)', marginBottom: '6px' }}>
                Transaction Type
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setTxType(checkInTypeForAsset)}
                  className={`admin-btn ${txType.includes('CheckIn') ? 'admin-btn-primary' : 'admin-btn-outline'}`}
                  style={{ justifyContent: 'center', fontWeight: 700 }}
                >
                  {checkInTypeForAsset}
                </button>
                <button
                  type="button"
                  onClick={() => setTxType(checkOutTypeForAsset)}
                  className={`admin-btn ${txType.includes('CheckOut') ? 'admin-btn-primary' : 'admin-btn-outline'}`}
                  style={{ justifyContent: 'center', fontWeight: 700 }}
                >
                  {checkOutTypeForAsset}
                </button>
              </div>
            </div>
          )}

          {/* Generator Check-In / Check-Out Inputs */}
          {isCheckInOrOut && assetType === 'GENERATOR' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: 'var(--adm-text-secondary)', marginBottom: '5px' }}>
                  Fuel Level (0–100%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  className="admin-input"
                  value={fuelPercentage}
                  onChange={(e) => setFuelPercentage(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: 'var(--adm-text-secondary)', marginBottom: '5px' }}>
                  DEF Level (0–100%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  className="admin-input"
                  value={defPercentage}
                  onChange={(e) => setDefPercentage(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: 'var(--adm-text-secondary)', marginBottom: '5px' }}>
                  Energy (kWh)
                </label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="admin-input"
                  value={kwh}
                  onChange={(e) => setKwh(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          )}

          {/* Tank Check-In / Check-Out Eighths Selector */}
          {isCheckInOrOut && assetType === 'TANK' && (
            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: 'var(--adm-text-secondary)', marginBottom: '6px' }}>
                Tank Fuel Reading (Eighths: 0/8 – 8/8)
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '6px' }}>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((val) => {
                  const selected = fuelEighths === val;
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setFuelEighths(val)}
                      className={`admin-btn ${selected ? 'admin-btn-primary' : 'admin-btn-outline'} admin-btn-sm`}
                      style={{
                        justifyContent: 'center',
                        padding: '8px 0',
                        fontFamily: 'var(--adm-font-mono)',
                        fontWeight: 700,
                      }}
                    >
                      {val}/8
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Plant Check-In / Check-Out Input */}
          {isCheckInOrOut && assetType === 'PLANT' && (
            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: 'var(--adm-text-secondary)', marginBottom: '5px' }}>
                Fuel Level (0–100%)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                className="admin-input"
                value={fuelPercentage}
                onChange={(e) => setFuelPercentage(e.target.value)}
                style={{ width: '100%', maxWidth: '220px' }}
              />
            </div>
          )}

          {/* Fuel Transfer Inputs */}
          {isFuelTransfer && (
            <div style={{ display: 'grid', gridTemplateColumns: assetType === 'GENERATOR' ? '1fr 1fr' : '1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: 'var(--adm-text-secondary)', marginBottom: '5px' }}>
                  Fuel Transfer (Litres)
                </label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  className="admin-input"
                  value={fuelLitres}
                  onChange={(e) => setFuelLitres(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
              {assetType === 'GENERATOR' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: 'var(--adm-text-secondary)', marginBottom: '5px' }}>
                    DEF Transfer (Litres, optional)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className="admin-input"
                    value={defLitres}
                    onChange={(e) => setDefLitres(e.target.value)}
                    placeholder="Optional"
                    style={{ width: '100%' }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Power Event Selector */}
          {isPowerEvent && (
            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: 'var(--adm-text-secondary)', marginBottom: '6px' }}>
                Generator Power State Event
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setTxType('PoweredUp')}
                  className={`admin-btn ${txType === 'PoweredUp' ? 'admin-btn-primary' : 'admin-btn-outline'}`}
                  style={{
                    justifyContent: 'center',
                    fontWeight: 700,
                    background: txType === 'PoweredUp' ? '#16A34A' : undefined,
                    borderColor: txType === 'PoweredUp' ? '#16A34A' : undefined,
                    color: txType === 'PoweredUp' ? '#FFFFFF' : undefined,
                  }}
                >
                  PoweredUp (ON)
                </button>
                <button
                  type="button"
                  onClick={() => setTxType('PoweredDown')}
                  className={`admin-btn ${txType === 'PoweredDown' ? 'admin-btn-primary' : 'admin-btn-outline'}`}
                  style={{
                    justifyContent: 'center',
                    fontWeight: 700,
                    background: txType === 'PoweredDown' ? '#DC2626' : undefined,
                    borderColor: txType === 'PoweredDown' ? '#DC2626' : undefined,
                    color: txType === 'PoweredDown' ? '#FFFFFF' : undefined,
                  }}
                >
                  PoweredDown (OFF)
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Raw JSON toggle */}
        <div style={{ marginBottom: '16px' }}>
          <button
            type="button"
            onClick={() => setShowJson(!showJson)}
            className="admin-btn admin-btn-outline admin-btn-sm"
            style={{ fontSize: '0.76rem' }}
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
                fontSize: '0.75rem',
                fontFamily: 'var(--adm-font-mono)',
                color: '#34d399',
                overflowX: 'auto',
                maxHeight: '160px',
              }}
            >
              {JSON.stringify(buildUpdatedTransaction(), null, 2)}
            </pre>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: '16px',
            borderTop: '1px solid var(--adm-border-subtle)',
            gap: '10px',
          }}
        >
          {onDeleteTransaction ? (
            <button
              type="button"
              onClick={() => setConfirmAction('DELETE')}
              disabled={isSubmitting}
              className="admin-btn admin-btn-outline"
              style={{ color: '#EF4444', borderColor: 'rgba(239, 68, 68, 0.4)', gap: '6px' }}
              title="Delete transaction"
            >
              <Trash2 size={15} />
              <span>Delete Transaction</span>
            </button>
          ) : (
            <div />
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="admin-btn admin-btn-outline"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => setConfirmAction('SAVE')}
              disabled={!isValid || !isDirty || isSubmitting}
              className="admin-btn admin-btn-primary"
              style={{ gap: '6px' }}
            >
              <Check size={15} />
              <span>Save Changes</span>
            </button>
          </div>
        </div>

        {/* Confirmation Message Box Overlay */}
        {confirmAction && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1200,
              background: 'rgba(15, 23, 42, 0.65)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px',
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (!isSubmitting) setConfirmAction(null);
            }}
          >
            <div
              className="admin-modal-panel"
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: '440px',
                width: '100%',
                padding: '22px 24px',
                boxShadow: '0 20px 40px rgba(0, 0, 0, 0.45)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '8px',
                    background:
                      confirmAction === 'DELETE'
                        ? 'rgba(239, 68, 68, 0.14)'
                        : 'rgba(37, 99, 235, 0.14)',
                    color: confirmAction === 'DELETE' ? '#EF4444' : '#2563EB',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 700, color: 'var(--adm-text-primary)' }}>
                    {confirmAction === 'DELETE'
                      ? 'Confirm Delete Transaction?'
                      : 'Confirm Transaction Changes?'}
                  </h4>
                  <span style={{ fontSize: '0.78rem', color: 'var(--adm-text-secondary)', fontFamily: 'var(--adm-font-mono)' }}>
                    {transaction.equipmentId} • {formatAdminTimestamp(transaction.transactionTimestamp)}
                  </span>
                </div>
              </div>

              <p style={{ fontSize: '0.88rem', color: 'var(--adm-text-secondary)', lineHeight: 1.5, margin: '0 0 20px' }}>
                {confirmAction === 'DELETE'
                  ? `Are you sure you want to permanently delete this ${transaction.transactionType} transaction for ${transaction.equipmentId}?${isPowerEvent ? ' Generator power state will be recalculated from the remaining history.' : ''}`
                  : `Are you sure you want to commit these changes to the transaction for ${transaction.equipmentId}?`}
              </p>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setConfirmAction(null)}
                  disabled={isSubmitting}
                  className="admin-btn admin-btn-outline"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmedCommit}
                  disabled={isSubmitting}
                  className={`admin-btn ${confirmAction === 'DELETE' ? 'admin-btn-danger' : 'admin-btn-primary'}`}
                  style={
                    confirmAction === 'DELETE'
                      ? { background: '#EF4444', borderColor: '#DC2626', color: '#FFFFFF', gap: '6px' }
                      : { gap: '6px' }
                  }
                >
                  {confirmAction === 'DELETE' ? <Trash2 size={15} /> : <Check size={15} />}
                  <span>
                    {isSubmitting
                      ? 'Committing...'
                      : confirmAction === 'DELETE'
                        ? 'Confirm Delete'
                        : 'Confirm & Save'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
