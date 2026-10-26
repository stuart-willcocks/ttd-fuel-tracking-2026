import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Trash2, Check, Minus, Plus, Power, PowerOff, Pencil } from 'lucide-react';
import { IconCancel } from './icons/AppIcons';
import type { Equipment, Transaction } from '../types';
import { formatPdaTimestamp } from '../utils/dateFormat';
import { InAppNumpad } from './InAppNumpad';
import { ActionConfirmModal } from './ActionConfirmModal';

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

  // Confirmation dialog states
  const [showConfirmSave, setShowConfirmSave] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

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

  // Initial reference values to compute form dirty state
  const initialFuelPercentage = useMemo(() => {
    const val = isCheckOut ? transaction.checkOutFuelPercentage : transaction.checkInFuelPercentage;
    return val !== undefined ? String(val) : '';
  }, [isCheckOut, transaction]);

  const initialDefPercentage = useMemo(() => {
    const val = isCheckOut ? transaction.checkOutDefPercentage : transaction.checkInDefPercentage;
    return val !== undefined ? String(val) : '';
  }, [isCheckOut, transaction]);

  const initialKwh = useMemo(() => {
    const val = isCheckOut ? transaction.checkOutKWH : transaction.checkInKWH;
    return val !== undefined ? String(val) : '';
  }, [isCheckOut, transaction]);

  const initialFuelEighths = useMemo(() => {
    const val = isCheckOut ? transaction.checkOutFuelEighths : transaction.checkInFuelEighths;
    return val !== undefined ? val : null;
  }, [isCheckOut, transaction]);

  const initialFuelLitres = useMemo(() => {
    return transaction.fuelTransferLitres !== undefined ? String(transaction.fuelTransferLitres) : '';
  }, [transaction]);

  const initialDefLitres = useMemo(() => {
    return transaction.defTransferLitres !== undefined ? String(transaction.defTransferLitres) : '';
  }, [transaction]);

  const initialPowerType = useMemo(() => {
    return isPowerEvent ? (transaction.transactionType as 'PoweredUp' | 'PoweredDown') : null;
  }, [isPowerEvent, transaction]);

  // Compute dirty state
  const isDirty = useMemo(() => {
    if (isCheckIn || isCheckOut) {
      if (isGen) {
        return (
          fuelPercentage !== initialFuelPercentage ||
          defPercentage !== initialDefPercentage ||
          kwh !== initialKwh
        );
      }
      if (isTank) {
        return fuelEighths !== initialFuelEighths;
      }
      if (isPlant) {
        return fuelPercentage !== initialFuelPercentage;
      }
    }

    if (isFuelTransfer) {
      if (isGen) {
        return (
          fuelLitres !== initialFuelLitres ||
          defLitres !== initialDefLitres
        );
      }
      return fuelLitres !== initialFuelLitres;
    }

    if (isPowerEvent) {
      return powerType !== initialPowerType;
    }

    return false;
  }, [
    isCheckIn,
    isCheckOut,
    isGen,
    isTank,
    isPlant,
    isFuelTransfer,
    isPowerEvent,
    fuelPercentage,
    initialFuelPercentage,
    defPercentage,
    initialDefPercentage,
    kwh,
    initialKwh,
    fuelEighths,
    initialFuelEighths,
    fuelLitres,
    initialFuelLitres,
    defLitres,
    initialDefLitres,
    powerType,
    initialPowerType,
  ]);

  // Active form field and keyboard visibility (hidden by default)
  const [activeField, setActiveField] = useState<EditField | null>(null);
  const [showKeyboard, setShowKeyboard] = useState<boolean>(false);

  // Field input refs for focus handling
  const fuelInputRef = useRef<HTMLInputElement>(null);
  const defInputRef = useRef<HTMLInputElement>(null);
  const kwhInputRef = useRef<HTMLInputElement>(null);
  const fuelLitresInputRef = useRef<HTMLInputElement>(null);
  const defLitresInputRef = useRef<HTMLInputElement>(null);

  const handleToggleEdit = (field: EditField) => {
    if (activeField === field && showKeyboard) {
      setActiveField(null);
      setShowKeyboard(false);
      return;
    }
    setActiveField(field);
    setShowKeyboard(true);
    setTimeout(() => {
      switch (field) {
        case 'fuelPercentage':
          fuelInputRef.current?.focus();
          break;
        case 'defPercentage':
          defInputRef.current?.focus();
          break;
        case 'kwh':
          kwhInputRef.current?.focus();
          break;
        case 'fuelLitres':
          fuelLitresInputRef.current?.focus();
          break;
        case 'defLitres':
          defLitresInputRef.current?.focus();
          break;
      }
    }, 40);
  };

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

  const canSave = isValid && isDirty;

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
    if (showConfirmSave || showConfirmDelete) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      if (e.key >= '0' && e.key <= '9') {
        if (activeField) {
          e.preventDefault();
          handleNumpadDigit(e.key);
        }
      } else if (e.key === 'Backspace') {
        if (activeField) {
          e.preventDefault();
          handleNumpadBackspace();
        }
      } else if (e.key === 'Delete' || e.key === 'c' || e.key === 'C') {
        if (activeField) {
          e.preventDefault();
          handleNumpadClear();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (showKeyboard) {
          setShowKeyboard(false);
          setActiveField(null);
        } else {
          onCancel();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showConfirmSave, showConfirmDelete, activeField, showKeyboard, handleNumpadDigit, handleNumpadBackspace, handleNumpadClear, onCancel]);

  const handleCommitSave = () => {
    setShowConfirmSave(false);
    if (!isValid || !isDirty) return;

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

  const handleCommitDelete = () => {
    setShowConfirmDelete(false);
    onDelete(transaction.id);
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
    <>
      <div className="modal-backdrop edit-tx-backdrop" onClick={onCancel}>
        <div
          className="modal-box edit-tx-modal"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="edit-tx-header">
            <div className="edit-tx-icon-wrap">
              <Pencil size={20} color="var(--btn-blue-bg)" />
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
              <div className="edit-tx-grid">
                <div className="edit-tx-row">
                  <span className="edit-tx-lbl">Fuel level</span>
                  <input
                    ref={fuelInputRef}
                    type="text"
                    inputMode="none"
                    readOnly={activeField !== 'fuelPercentage'}
                    className={`edit-tx-input ${activeField === 'fuelPercentage' ? 'is-active' : ''}`}
                    value={fuelPercentage}
                    placeholder="0"
                    onClick={() => handleToggleEdit('fuelPercentage')}
                  />
                  <span className="edit-tx-unit">%</span>
                  <button
                    type="button"
                    className={`btn-field-edit ${activeField === 'fuelPercentage' && showKeyboard ? 'is-editing' : ''}`}
                    onClick={() => handleToggleEdit('fuelPercentage')}
                    title="Edit fuel level"
                  >
                    <Pencil size={12} />
                    <span>Edit</span>
                  </button>
                </div>

                <div className="edit-tx-row">
                  <span className="edit-tx-lbl">DEF level</span>
                  <input
                    ref={defInputRef}
                    type="text"
                    inputMode="none"
                    readOnly={activeField !== 'defPercentage'}
                    className={`edit-tx-input ${activeField === 'defPercentage' ? 'is-active' : ''}`}
                    value={defPercentage}
                    placeholder="0"
                    onClick={() => handleToggleEdit('defPercentage')}
                  />
                  <span className="edit-tx-unit">%</span>
                  <button
                    type="button"
                    className={`btn-field-edit ${activeField === 'defPercentage' && showKeyboard ? 'is-editing' : ''}`}
                    onClick={() => handleToggleEdit('defPercentage')}
                    title="Edit DEF level"
                  >
                    <Pencil size={12} />
                    <span>Edit</span>
                  </button>
                </div>

                <div className="edit-tx-row">
                  <span className="edit-tx-lbl">Meter</span>
                  <input
                    ref={kwhInputRef}
                    type="text"
                    inputMode="none"
                    readOnly={activeField !== 'kwh'}
                    className={`edit-tx-input ${activeField === 'kwh' ? 'is-active' : ''}`}
                    value={kwh}
                    placeholder="0"
                    onClick={() => handleToggleEdit('kwh')}
                  />
                  <span className="edit-tx-unit">kWh</span>
                  <button
                    type="button"
                    className={`btn-field-edit ${activeField === 'kwh' && showKeyboard ? 'is-editing' : ''}`}
                    onClick={() => handleToggleEdit('kwh')}
                    title="Edit kWh meter"
                  >
                    <Pencil size={12} />
                    <span>Edit</span>
                  </button>
                </div>
              </div>
            )}

            {/* Tank Check In / Check Out (Eighths Spinner) */}
            {(isCheckIn || isCheckOut) && isTank && (
              <div className="old-form-grid" style={{ gap: '8px', marginBottom: '8px', maxWidth: '310px' }}>
                <div className="edit-tx-row">
                  <span className="edit-tx-lbl">Fuel level</span>
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
                  <span className="edit-tx-unit">eighths</span>
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
              <div className="edit-tx-grid">
                <div className="edit-tx-row">
                  <span className="edit-tx-lbl">Fuel level</span>
                  <input
                    ref={fuelInputRef}
                    type="text"
                    inputMode="none"
                    readOnly={activeField !== 'fuelPercentage'}
                    className={`edit-tx-input ${activeField === 'fuelPercentage' ? 'is-active' : ''}`}
                    value={fuelPercentage}
                    placeholder="0"
                    onClick={() => handleToggleEdit('fuelPercentage')}
                  />
                  <span className="edit-tx-unit">%</span>
                  <button
                    type="button"
                    className={`btn-field-edit ${activeField === 'fuelPercentage' && showKeyboard ? 'is-editing' : ''}`}
                    onClick={() => handleToggleEdit('fuelPercentage')}
                    title="Edit fuel level"
                  >
                    <Pencil size={12} />
                    <span>Edit</span>
                  </button>
                </div>
              </div>
            )}

            {/* Fuel Transfer */}
            {isFuelTransfer && (
              <div className="edit-tx-grid">
                <div className="edit-tx-row">
                  <span className="edit-tx-lbl">Fuel</span>
                  <input
                    ref={fuelLitresInputRef}
                    type="text"
                    inputMode="none"
                    readOnly={activeField !== 'fuelLitres'}
                    className={`edit-tx-input ${activeField === 'fuelLitres' ? 'is-active' : ''}`}
                    value={fuelLitres}
                    placeholder="0"
                    onClick={() => handleToggleEdit('fuelLitres')}
                  />
                  <span className="edit-tx-unit">litres</span>
                  <button
                    type="button"
                    className={`btn-field-edit ${activeField === 'fuelLitres' && showKeyboard ? 'is-editing' : ''}`}
                    onClick={() => handleToggleEdit('fuelLitres')}
                    title="Edit fuel litres"
                  >
                    <Pencil size={12} />
                    <span>Edit</span>
                  </button>
                </div>

                {isGen && (
                  <div className="edit-tx-row">
                    <span className="edit-tx-lbl">DEF</span>
                    <input
                      ref={defLitresInputRef}
                      type="text"
                      inputMode="none"
                      readOnly={activeField !== 'defLitres'}
                      className={`edit-tx-input ${activeField === 'defLitres' ? 'is-active' : ''}`}
                      value={defLitres}
                      placeholder="0"
                      onClick={() => handleToggleEdit('defLitres')}
                    />
                    <span className="edit-tx-unit">litres</span>
                    <button
                      type="button"
                      className={`btn-field-edit ${activeField === 'defLitres' && showKeyboard ? 'is-editing' : ''}`}
                      onClick={() => handleToggleEdit('defLitres')}
                      title="Edit DEF litres"
                    >
                      <Pencil size={12} />
                      <span>Edit</span>
                    </button>
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

          {/* In-App Touch Numpad for numeric fields - Hidden by default */}
          {showKeyboard && activeField && (
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
              disabled={!canSave}
              className={`btn-modal-action btn-pda-green ${canSave ? '' : 'disabled'}`}
              onClick={() => setShowConfirmSave(true)}
              title={canSave ? 'Save changes' : 'No changes to save'}
            >
              <Check size={18} />
              <span>Save</span>
            </button>

            <button
              type="button"
              className="btn-modal-action btn-pda-red"
              onClick={() => setShowConfirmDelete(true)}
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
      </div>

      {/* Confirmation Dialog for Save */}
      <ActionConfirmModal
        isOpen={showConfirmSave}
        title="Save Changes?"
        message="Save modifications to this transaction?"
        confirmLabel="Yes"
        cancelLabel="No"
        confirmVariant="green"
        onConfirm={handleCommitSave}
        onCancel={() => setShowConfirmSave(false)}
      />

      {/* Confirmation Dialog for Delete */}
      <ActionConfirmModal
        isOpen={showConfirmDelete}
        title="Delete Transaction?"
        message="Delete this transaction?"
        subMessage="This action will permanently delete this record."
        confirmLabel="Yes"
        cancelLabel="No"
        confirmVariant="red"
        onConfirm={handleCommitDelete}
        onCancel={() => setShowConfirmDelete(false)}
      />
    </>
  );
};
