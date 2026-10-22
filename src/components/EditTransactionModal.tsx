import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Trash2, Check, AlertTriangle, Minus, Plus, Power, PowerOff, Pencil } from 'lucide-react';
import { IconCancel } from './icons/AppIcons';
import type { Equipment, Transaction } from '../types';
import { EquipmentTypeIcon } from './EquipmentTypeIcon';
import { TransactionTypeIcon } from './TransactionTypeIcon';
import { formatPdaTimestamp } from '../utils/dateFormat';
import { InAppNumpad } from './InAppNumpad';

interface EditTransactionModalProps {
  asset: Equipment;
  transaction: Transaction;
  isOpen: boolean;
  onCancel: () => void;
  onSave: (updatedTx: Transaction) => void | Promise<void>;
  onDelete: (transactionId: string) => void | Promise<void>;
}

type EditField = 'fuelPercentage' | 'defPercentage' | 'kwh' | 'fuelLitres' | 'defLitres';

export const EditTransactionModal: React.FC<EditTransactionModalProps> = ({
  asset,
  transaction,
  isOpen,
  onCancel,
  onSave,
  onDelete,
}) => {
  const isGen = asset.type === 'GENERATOR';
  const isTank = asset.type === 'TANK';
  const isPlant = asset.type === 'PLANT';

  const isPowerEvent =
    transaction.transactionType === 'PoweredUp' ||
    transaction.transactionType === 'PoweredDown';

  const isFuelTransfer =
    transaction.transactionType.includes('FuelTransfer') ||
    transaction.transactionType.includes('Fuel');

  const isCheckOut = transaction.transactionType.includes('CheckOut');
  const isCheckIn = transaction.transactionType.includes('CheckIn');

  // Deletion confirmation view toggle
  const [isDeleting, setIsDeleting] = useState(false);

  // Field states initialized from the transaction
  const [fuelPercentage, setFuelPercentage] = useState<string>(() => {
    const val = isCheckOut ? transaction.checkOutFuelPercentage : transaction.checkInFuelPercentage;
    return val !== undefined ? String(val) : '';
  });

  const [defPercentage, setDefPercentage] = useState<string>(() => {
    const val = isCheckOut ? transaction.checkOutDefPercentage : transaction.checkInDefPercentage;
    return val !== undefined ? String(val) : '';
  });

  const [kwh, setKwh] = useState<string>(() => {
    const val = isCheckOut ? transaction.checkOutKWH : transaction.checkInKWH;
    return val !== undefined ? String(val) : '';
  });

  const [fuelEighths, setFuelEighths] = useState<number | null>(() => {
    const val = isCheckOut ? transaction.checkOutFuelEighths : transaction.checkInFuelEighths;
    return val !== undefined ? val : null;
  });

  const [fuelLitres, setFuelLitres] = useState<string>(() => {
    return transaction.fuelTransferLitres !== undefined ? String(transaction.fuelTransferLitres) : '';
  });

  const [defLitres, setDefLitres] = useState<string>(() => {
    return transaction.defTransferLitres !== undefined ? String(transaction.defTransferLitres) : '';
  });

  const [powerType, setPowerType] = useState<'PoweredUp' | 'PoweredDown' | null>(() => {
    return isPowerEvent ? (transaction.transactionType as 'PoweredUp' | 'PoweredDown') : null;
  });

  // Active form field for InAppNumpad
  const activeFieldsList = useMemo<EditField[]>(() => {
    if (isCheckIn || isCheckOut) {
      if (isGen) return ['fuelPercentage', 'defPercentage', 'kwh'];
      if (isPlant) return ['fuelPercentage'];
      return [];
    }
    if (isFuelTransfer) {
      if (isGen) return ['fuelLitres', 'defLitres'];
      return ['fuelLitres'];
    }
    return [];
  }, [isCheckIn, isCheckOut, isFuelTransfer, isGen, isPlant]);

  const [activeField, setActiveField] = useState<EditField | null>(() => {
    return activeFieldsList.length > 0 ? activeFieldsList[0] : null;
  });

  const isPercentageValid = (val: string): boolean => {
    if (val.trim() === '') return false;
    const num = Number(val);
    return Number.isInteger(num) && num >= 0 && num <= 100;
  };

  const isPositiveIntValid = (val: string, allowZero = false): boolean => {
    if (val.trim() === '') return false;
    const num = Number(val);
    return Number.isInteger(num) && (allowZero ? num >= 0 : num > 0);
  };

  const isValid = useMemo(() => {
    if (isCheckIn || isCheckOut) {
      if (isGen) {
        return (
          isPercentageValid(fuelPercentage) &&
          isPercentageValid(defPercentage) &&
          isPositiveIntValid(kwh, true)
        );
      }
      if (isTank) {
        return fuelEighths !== null && fuelEighths >= 0 && fuelEighths <= 8;
      }
      if (isPlant) {
        return isPercentageValid(fuelPercentage);
      }
    }

    if (isFuelTransfer) {
      if (isGen) {
        return (
          isPositiveIntValid(fuelLitres, false) &&
          (defLitres.trim() === '' || isPositiveIntValid(defLitres, true))
        );
      }
      return isPositiveIntValid(fuelLitres, false);
    }

    if (isPowerEvent) {
      return powerType !== null;
    }

    return true;
  }, [
    isCheckIn,
    isCheckOut,
    isFuelTransfer,
    isPowerEvent,
    isGen,
    isTank,
    isPlant,
    fuelPercentage,
    defPercentage,
    kwh,
    fuelEighths,
    fuelLitres,
    defLitres,
    powerType,
  ]);

  // InAppNumpad Handlers
  const handleNumpadDigit = useCallback((digit: string) => {
    if (!activeField) return;

    if (activeField === 'fuelPercentage') {
      setFuelPercentage((prev) => {
        const next = prev === '0' ? digit : prev + digit;
        if (Number(next) > 100) return '100';
        return next;
      });
    } else if (activeField === 'defPercentage') {
      setDefPercentage((prev) => {
        const next = prev === '0' ? digit : prev + digit;
        if (Number(next) > 100) return '100';
        return next;
      });
    } else if (activeField === 'kwh') {
      setKwh((prev) => {
        if (prev.length >= 7) return prev;
        return prev === '0' ? digit : prev + digit;
      });
    } else if (activeField === 'fuelLitres') {
      setFuelLitres((prev) => {
        if (prev.length >= 6) return prev;
        return prev === '0' ? digit : prev + digit;
      });
    } else if (activeField === 'defLitres') {
      setDefLitres((prev) => {
        if (prev.length >= 6) return prev;
        return prev === '0' ? digit : prev + digit;
      });
    }
  }, [activeField]);

  const handleNumpadBackspace = useCallback(() => {
    if (!activeField) return;

    if (activeField === 'fuelPercentage') {
      setFuelPercentage((prev) => prev.slice(0, -1));
    } else if (activeField === 'defPercentage') {
      setDefPercentage((prev) => prev.slice(0, -1));
    } else if (activeField === 'kwh') {
      setKwh((prev) => prev.slice(0, -1));
    } else if (activeField === 'fuelLitres') {
      setFuelLitres((prev) => prev.slice(0, -1));
    } else if (activeField === 'defLitres') {
      setDefLitres((prev) => prev.slice(0, -1));
    }
  }, [activeField]);

  const handleNumpadClear = useCallback(() => {
    if (!activeField) return;

    if (activeField === 'fuelPercentage') {
      setFuelPercentage('');
    } else if (activeField === 'defPercentage') {
      setDefPercentage('');
    } else if (activeField === 'kwh') {
      setKwh('');
    } else if (activeField === 'fuelLitres') {
      setFuelLitres('');
    } else if (activeField === 'defLitres') {
      setDefLitres('');
    }
  }, [activeField]);

  // Support physical keyboard entry on desktop workstations / laptops
  useEffect(() => {
    if (isDeleting) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleNumpadDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleNumpadBackspace();
      } else if (e.key === 'Delete' || e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        handleNumpadClear();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDeleting, handleNumpadDigit, handleNumpadBackspace, handleNumpadClear, onCancel]);

  const handleSave = () => {
    if (!isValid) return;

    const updated: Transaction = {
      ...transaction,
    };

    if (isCheckIn) {
      if (isGen) {
        updated.checkInFuelPercentage = parseInt(fuelPercentage, 10);
        updated.checkInDefPercentage = parseInt(defPercentage, 10);
        updated.checkInKWH = parseInt(kwh, 10);
      } else if (isTank && fuelEighths !== null) {
        updated.checkInFuelEighths = fuelEighths;
      } else if (isPlant) {
        updated.checkInFuelPercentage = parseInt(fuelPercentage, 10);
      }
    } else if (isCheckOut) {
      if (isGen) {
        updated.checkOutFuelPercentage = parseInt(fuelPercentage, 10);
        updated.checkOutDefPercentage = parseInt(defPercentage, 10);
        updated.checkOutKWH = parseInt(kwh, 10);
      } else if (isTank && fuelEighths !== null) {
        updated.checkOutFuelEighths = fuelEighths;
      } else if (isPlant) {
        updated.checkOutFuelPercentage = parseInt(fuelPercentage, 10);
      }
    } else if (isFuelTransfer) {
      updated.fuelTransferLitres = parseInt(fuelLitres, 10);
      if (isGen) {
        if (defLitres.trim() !== '') {
          updated.defTransferLitres = parseInt(defLitres, 10);
        } else {
          delete updated.defTransferLitres;
        }
      }
    } else if (isPowerEvent && powerType) {
      updated.transactionType = powerType;
    }

    onSave(updated);
  };

  const getReadableType = (type: string) => {
    switch (type) {
      case 'CheckInGenerator':
      case 'CheckInTank':
      case 'CheckInPlant':
      case 'CheckIn':
        return 'Check In';
      case 'CheckOutGenerator':
      case 'CheckOutTank':
      case 'CheckOutPlant':
      case 'CheckOut':
        return 'Check Out';
      case 'FuelTransfer':
      case 'FuelTransferGenerator':
      case 'FuelTransferTank':
      case 'FuelTransferPlant':
      case 'RecordFuel':
        return 'Fuel Transfer';
      case 'PoweredUp':
        return 'Marked Powered Up';
      case 'PoweredDown':
        return 'Marked Powered Down';
      default:
        return type;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop edit-tx-backdrop" onClick={onCancel}>
      <div
        className="modal-box edit-tx-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* =================================================================== */}
        {/* VIEW 1: DELETE CONFIRMATION VIEW                                    */}
        {/* =================================================================== */}
        {isDeleting ? (
          <div className="delete-tx-confirm-view">
            <div className="delete-tx-header">
              <div className="delete-tx-icon-wrap">
                <Trash2 size={24} color="#DC2626" />
              </div>
              <div>
                <h3 className="modal-title" style={{ margin: 0, color: '#DC2626' }}>
                  Delete Transaction?
                </h3>
                <p className="modal-subtitle" style={{ margin: '2px 0 0 0' }}>
                  Asset <strong>{asset.equipmentId}</strong>
                </p>
              </div>
            </div>

            <div className="values-table-wrap delete-tx-details">
              <table className="values-table">
                <tbody>
                  <tr>
                    <td className="lbl">Asset</td>
                    <td className="val font-equipment-id" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>{asset.equipmentId}</span>
                      <EquipmentTypeIcon type={asset.type} size={18} />
                    </td>
                  </tr>
                  <tr>
                    <td className="lbl">Type</td>
                    <td className="val" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <TransactionTypeIcon type={transaction.transactionType} size={18} />
                      <span>{getReadableType(transaction.transactionType)}</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="lbl">Recorded</td>
                    <td className="val">{formatPdaTimestamp(transaction.transactionTimestamp)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="delete-tx-warning-box">
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>This will permanently delete this record from the database.</span>
            </div>

            <div className="modal-buttons-row">
              <button
                type="button"
                className="btn-modal-confirm btn-pda-red"
                onClick={() => onDelete(transaction.id)}
              >
                <Trash2 size={18} />
                <span>Confirm Delete</span>
              </button>

              <button
                type="button"
                className="btn-modal-cancel btn-pda-slate"
                onClick={() => setIsDeleting(false)}
              >
                <IconCancel size={18} />
                <span>Back</span>
              </button>
            </div>
          </div>
        ) : (
          /* =================================================================== */
          /* VIEW 2: EDIT TRANSACTION DETAILS VIEW                               */
          /* =================================================================== */
          <div className="edit-tx-content-view">
            {/* Header */}
            <div className="edit-tx-header">
              <div className="edit-tx-icon-wrap">
                <Pencil size={22} color="var(--btn-blue-bg)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 className="modal-title" style={{ margin: 0 }}>
                  Edit Transaction
                </h3>
                <div className="edit-tx-meta-line">
                  <span className="edit-tx-asset font-equipment-id">{asset.equipmentId}</span>
                  <span className="edit-tx-dot">•</span>
                  <span>{getReadableType(transaction.transactionType)}</span>
                  <span className="edit-tx-dot">•</span>
                  <span>{formatPdaTimestamp(transaction.transactionTimestamp)}</span>
                </div>
              </div>
            </div>

            {/* Editable Form Controls */}
            <div className="edit-tx-fields-container">
              {/* Generator Check In / Check Out */}
              {(isCheckIn || isCheckOut) && isGen && (
                <div className="old-form-grid" style={{ gap: '6px', marginBottom: '4px' }}>
                  <div
                    className={`old-form-row ${activeField === 'fuelPercentage' ? 'row-selected' : ''}`}
                    onClick={() => setActiveField('fuelPercentage')}
                  >
                    <span className="old-form-lbl">Fuel level</span>
                    <input
                      type="text"
                      inputMode="none"
                      readOnly
                      className={`old-form-input ${activeField === 'fuelPercentage' ? 'is-active' : ''}`}
                      value={fuelPercentage}
                      placeholder="0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveField('fuelPercentage');
                      }}
                    />
                    <span className="old-form-unit">%</span>
                  </div>

                  <div
                    className={`old-form-row ${activeField === 'defPercentage' ? 'row-selected' : ''}`}
                    onClick={() => setActiveField('defPercentage')}
                  >
                    <span className="old-form-lbl">DEF level</span>
                    <input
                      type="text"
                      inputMode="none"
                      readOnly
                      className={`old-form-input ${activeField === 'defPercentage' ? 'is-active' : ''}`}
                      value={defPercentage}
                      placeholder="0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveField('defPercentage');
                      }}
                    />
                    <span className="old-form-unit">%</span>
                  </div>

                  <div
                    className={`old-form-row ${activeField === 'kwh' ? 'row-selected' : ''}`}
                    onClick={() => setActiveField('kwh')}
                  >
                    <span className="old-form-lbl">Meter</span>
                    <input
                      type="text"
                      inputMode="none"
                      readOnly
                      className={`old-form-input ${activeField === 'kwh' ? 'is-active' : ''}`}
                      value={kwh}
                      placeholder="0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveField('kwh');
                      }}
                    />
                    <span className="old-form-unit">kWh</span>
                  </div>
                </div>
              )}

              {/* Tank Check In / Check Out (Eighths Spinner) */}
              {(isCheckIn || isCheckOut) && isTank && (
                <div className="old-form-grid" style={{ gap: '8px', marginBottom: '8px' }}>
                  <div className="old-form-row">
                    <span className="old-form-lbl">Fuel level</span>
                    <div className="old-tank-spinner">
                      <button
                        type="button"
                        className="old-btn-step"
                        disabled={fuelEighths !== null && fuelEighths <= 0}
                        onClick={() => setFuelEighths((p) => Math.max(0, (p ?? 1) - 1))}
                      >
                        <Minus size={18} />
                      </button>
                      <span className="old-tank-val">{fuelEighths !== null ? `${fuelEighths} / 8` : '— / 8'}</span>
                      <button
                        type="button"
                        className="old-btn-step"
                        disabled={fuelEighths !== null && fuelEighths >= 8}
                        onClick={() => setFuelEighths((p) => Math.min(8, (p ?? -1) + 1))}
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                    <span className="old-form-unit">eighths</span>
                  </div>

                  <div className="old-tank-chips-row">
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((v) => (
                      <button
                        key={v}
                        type="button"
                        className={`old-tank-chip ${fuelEighths === v ? 'active' : ''}`}
                        onClick={() => setFuelEighths(v)}
                      >
                        {v}/8
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Plant Check In / Check Out */}
              {(isCheckIn || isCheckOut) && isPlant && (
                <div className="old-form-grid" style={{ gap: '6px', marginBottom: '4px' }}>
                  <div
                    className={`old-form-row ${activeField === 'fuelPercentage' ? 'row-selected' : ''}`}
                    onClick={() => setActiveField('fuelPercentage')}
                  >
                    <span className="old-form-lbl">Fuel level</span>
                    <input
                      type="text"
                      inputMode="none"
                      readOnly
                      className={`old-form-input ${activeField === 'fuelPercentage' ? 'is-active' : ''}`}
                      value={fuelPercentage}
                      placeholder="0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveField('fuelPercentage');
                      }}
                    />
                    <span className="old-form-unit">%</span>
                  </div>
                </div>
              )}

              {/* Fuel Transfer */}
              {isFuelTransfer && (
                <div className="old-form-grid" style={{ gap: '6px', marginBottom: '4px' }}>
                  <div
                    className={`old-form-row ${activeField === 'fuelLitres' ? 'row-selected' : ''}`}
                    onClick={() => setActiveField('fuelLitres')}
                  >
                    <span className="old-form-lbl">Fuel</span>
                    <input
                      type="text"
                      inputMode="none"
                      readOnly
                      className={`old-form-input ${activeField === 'fuelLitres' ? 'is-active' : ''}`}
                      value={fuelLitres}
                      placeholder="0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveField('fuelLitres');
                      }}
                    />
                    <span className="old-form-unit">litres</span>
                  </div>

                  {isGen && (
                    <div
                      className={`old-form-row ${activeField === 'defLitres' ? 'row-selected' : ''}`}
                      onClick={() => setActiveField('defLitres')}
                    >
                      <span className="old-form-lbl">DEF</span>
                      <input
                        type="text"
                        inputMode="none"
                        readOnly
                        className={`old-form-input ${activeField === 'defLitres' ? 'is-active' : ''}`}
                        value={defLitres}
                        placeholder="0"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveField('defLitres');
                        }}
                      />
                      <span className="old-form-unit">litres</span>
                    </div>
                  )}
                </div>
              )}

              {/* Power Event (PoweredUp / PoweredDown) */}
              {isPowerEvent && (
                <div className="edit-tx-power-toggle-row">
                  <button
                    type="button"
                    className={`edit-tx-power-btn ${powerType === 'PoweredUp' ? 'selected-power-up' : ''}`}
                    onClick={() => setPowerType('PoweredUp')}
                  >
                    <Power size={18} />
                    <span>Powered Up</span>
                  </button>

                  <button
                    type="button"
                    className={`edit-tx-power-btn ${powerType === 'PoweredDown' ? 'selected-power-down' : ''}`}
                    onClick={() => setPowerType('PoweredDown')}
                  >
                    <PowerOff size={18} />
                    <span>Powered Down</span>
                  </button>
                </div>
              )}
            </div>

            {/* In-App Touch Numpad for numeric fields */}
            {activeFieldsList.length > 0 && (
              <InAppNumpad
                onDigit={handleNumpadDigit}
                onBackspace={handleNumpadBackspace}
                onClear={handleNumpadClear}
              />
            )}

            {/* Buttons Row: Save, Delete, Cancel */}
            <div className="edit-tx-btn-row">
              <button
                type="button"
                disabled={!isValid}
                className={`btn-modal-action btn-pda-green ${isValid ? '' : 'disabled'}`}
                onClick={handleSave}
                title="Save changes"
              >
                <Check size={18} />
                <span>Save</span>
              </button>

              <button
                type="button"
                className="btn-modal-action btn-pda-red"
                onClick={() => setIsDeleting(true)}
                title="Delete transaction"
              >
                <Trash2 size={18} />
                <span>Delete</span>
              </button>

              <button
                type="button"
                className="btn-modal-action btn-pda-slate"
                onClick={onCancel}
                title="Cancel"
              >
                <IconCancel size={18} />
                <span>Cancel</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
