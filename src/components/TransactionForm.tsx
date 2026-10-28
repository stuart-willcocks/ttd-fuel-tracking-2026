import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { IconSubmit, IconCancel } from './icons/AppIcons';
import type { Equipment, ActionType, Transaction, TransactionType } from '../types';
import { EquipmentTypeIcon } from './EquipmentTypeIcon';
import { InAppNumpad } from './InAppNumpad';

interface TransactionFormProps {
  asset: Equipment;
  action: ActionType;
  onCancel: () => void;
  onSubmitValues: (transactionData: Partial<Transaction>) => void;
}

type FormField = 'fuelPercentage' | 'defPercentage' | 'kwh' | 'fuelLitres' | 'defLitres';

export const TransactionForm: React.FC<TransactionFormProps> = ({
  asset,
  action,
  onCancel,
  onSubmitValues,
}) => {
  const isGen = asset.type === 'GENERATOR';
  const isTank = asset.type === 'TANK';
  const isPlant = asset.type === 'PLANT';

  // Form field state
  const [fuelPercentage, setFuelPercentage] = useState<string>('');
  const [defPercentage, setDefPercentage] = useState<string>('');
  const [kwh, setKwh] = useState<string>('');
  const [fuelEighths, setFuelEighths] = useState<number | null>(null);
  const [tankSpinnerInteracted, setTankSpinnerInteracted] = useState<boolean>(false);
  const [fuelLitres, setFuelLitres] = useState<string>('');
  const [defLitres, setDefLitres] = useState<string>('');

  // Determine active form fields for current action & asset
  const formFields = useMemo<FormField[]>(() => {
    if (action === 'check-in' || action === 'check-out') {
      if (isGen) return ['fuelPercentage', 'defPercentage', 'kwh'];
      if (isPlant) return ['fuelPercentage'];
      return []; // Tank uses eighths touch spinner
    }
    if (action === 'record-fuel') {
      if (isGen) return ['fuelLitres', 'defLitres'];
      return ['fuelLitres'];
    }
    return [];
  }, [action, isGen, isPlant]);

  // Active field for in-app keypad entry
  const [activeField, setActiveField] = useState<FormField | null>(() => {
    if (action === 'check-in' || action === 'check-out') {
      if (isGen || isPlant) return 'fuelPercentage';
      return null;
    }
    if (action === 'record-fuel') {
      return 'fuelLitres';
    }
    return null;
  });

  // Action title
  const actionTitle = useMemo(() => {
    switch (action) {
      case 'check-in':
        return `CHECK IN ${asset.type}`;
      case 'check-out':
        return `CHECK OUT ${asset.type}`;
      case 'record-fuel':
        return `TRANSFER FUEL TO ${asset.type}`;
      default:
        return 'RECORD TRANSACTION';
    }
  }, [action, asset.type]);

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
    if (action === 'check-in' || action === 'check-out') {
      if (isGen) {
        return (
          isPercentageValid(fuelPercentage) &&
          isPercentageValid(defPercentage) &&
          isPositiveIntValid(kwh, true)
        );
      }
      if (isTank) {
        return tankSpinnerInteracted && fuelEighths !== null && fuelEighths >= 0 && fuelEighths <= 8;
      }
      if (isPlant) {
        return isPercentageValid(fuelPercentage);
      }
    }

    if (action === 'record-fuel') {
      if (isGen) {
        return (
          isPositiveIntValid(fuelLitres, false) &&
          (defLitres.trim() === '' || isPositiveIntValid(defLitres, true))
        );
      }
      if (isTank || isPlant) {
        return isPositiveIntValid(fuelLitres, false);
      }
    }

    return false;
  }, [
    action,
    isGen,
    isTank,
    isPlant,
    fuelPercentage,
    defPercentage,
    kwh,
    tankSpinnerInteracted,
    fuelEighths,
    fuelLitres,
    defLitres,
  ]);

  // In-App Numpad Action Handlers
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

  const handleNumpadNext = useCallback(() => {
    if (!activeField || formFields.length <= 1) return;
    const currentIndex = formFields.indexOf(activeField);
    if (currentIndex >= 0 && currentIndex < formFields.length - 1) {
      setActiveField(formFields[currentIndex + 1]);
    } else {
      setActiveField(formFields[0]);
    }
  }, [activeField, formFields]);


  // Support physical keyboard entry on desktop workstations / laptops
  useEffect(() => {
    const handlePhysicalKeyDown = (e: KeyboardEvent) => {
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
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        handleNumpadNext();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handlePhysicalKeyDown);
    return () => window.removeEventListener('keydown', handlePhysicalKeyDown);
  }, [handleNumpadDigit, handleNumpadBackspace, handleNumpadClear, handleNumpadNext, onCancel]);

  const getTransactionType = (): TransactionType => {
    if (action === 'check-in') {
      if (isGen) return 'CheckInGenerator';
      if (isTank) return 'CheckInTank';
      return 'CheckInPlant';
    }
    if (action === 'check-out') {
      if (isGen) return 'CheckOutGenerator';
      if (isTank) return 'CheckOutTank';
      return 'CheckOutPlant';
    }
    if (isGen) return 'FuelTransferGenerator';
    if (isTank) return 'FuelTransferTank';
    return 'FuelTransferPlant';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    const txData: Partial<Transaction> = {
      equipmentId: asset.equipmentId,
      transactionType: getTransactionType(),
    };

    if (action === 'check-in') {
      if (isGen) {
        txData.checkInFuelPercentage = parseInt(fuelPercentage, 10);
        txData.checkInDefPercentage = parseInt(defPercentage, 10);
        txData.checkInKWH = parseInt(kwh, 10);
      } else if (isTank && fuelEighths !== null) {
        txData.checkInFuelEighths = fuelEighths;
      } else if (isPlant) {
        txData.checkInFuelPercentage = parseInt(fuelPercentage, 10);
      }
    } else if (action === 'check-out') {
      if (isGen) {
        txData.checkOutFuelPercentage = parseInt(fuelPercentage, 10);
        txData.checkOutDefPercentage = parseInt(defPercentage, 10);
        txData.checkOutKWH = parseInt(kwh, 10);
      } else if (isTank && fuelEighths !== null) {
        txData.checkOutFuelEighths = fuelEighths;
      } else if (isPlant) {
        txData.checkOutFuelPercentage = parseInt(fuelPercentage, 10);
      }
    } else if (action === 'record-fuel') {
      txData.fuelTransferLitres = parseInt(fuelLitres, 10);
      if (isGen && defLitres.trim() !== '') {
        txData.defTransferLitres = parseInt(defLitres, 10);
      }
    }

    onSubmitValues(txData);
  };

  const renderInputField = (
    label: string,
    field: FormField,
    value: string,
    unit: string
  ) => {
    const isActive = activeField === field;

    return (
      <div
        key={field}
        className="old-form-row"
        onClick={() => setActiveField(field)}
      >
        <span className="old-form-lbl">{label}</span>
        <div
          className={`old-form-input-box ${isActive ? 'is-active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            setActiveField(field);
          }}
          role="textbox"
          aria-label={label}
          tabIndex={0}
        >
          <span className="old-form-display-val">{value}</span>
          {isActive && <span className="old-form-caret" aria-hidden="true" />}
          <input
            type="text"
            inputMode="none"
            readOnly
            tabIndex={-1}
            aria-hidden="true"
            className="old-form-hidden-input"
            value={value}
            onChange={() => {}}
          />
        </div>
        <span className="old-form-unit">{unit}</span>
      </div>
    );
  };

  return (
    <div className="old-screen-container transaction-form-container">
      {/* 1. TOP: Matches placement and styling of scan view text box */}
      <div className="scan-top-area">
        <div className="old-scan-input asset-detail-id-box">
          <span className="asset-detail-id-icon">
            <EquipmentTypeIcon type={asset.type} size={24} />
          </span>
          <span className="asset-detail-id-text">{asset.equipmentId}</span>
        </div>
      </div>

      {/* 2. FORM BODY */}
      <div className="old-form-body">
        {/* Header bar with Action Title */}
        <div className="old-form-header-bar">
          <h2 className="old-form-title">{actionTitle}</h2>
        </div>

        <form onSubmit={handleSubmit} noValidate autoComplete="off" className="old-form-content">
          {/* ======================================================= */}
          {/* Generator Check In / Check Out                          */}
          {/* ======================================================= */}
          {(action === 'check-in' || action === 'check-out') && isGen && (
            <div className="old-form-grid">
              {renderInputField('Fuel level', 'fuelPercentage', fuelPercentage, '%')}
              {renderInputField('DEF level', 'defPercentage', defPercentage, '%')}
              {renderInputField('Meter', 'kwh', kwh, 'kWh')}
            </div>
          )}

          {/* ======================================================= */}
          {/* Tank Check In / Check Out (Eighths Preset Buttons)      */}
          {/* ======================================================= */}
          {(action === 'check-in' || action === 'check-out') && isTank && (
            <div className="old-form-grid">
              <div className="old-tank-chips-row">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={`old-tank-chip ${fuelEighths === v && tankSpinnerInteracted ? 'active' : ''}`}
                    onClick={() => {
                      setFuelEighths(v);
                      setTankSpinnerInteracted(true);
                    }}
                  >
                    {v}/8
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ======================================================= */}
          {/* Plant Check In / Check Out                             */}
          {/* ======================================================= */}
          {(action === 'check-in' || action === 'check-out') && isPlant && (
            <div className="old-form-grid">
              {renderInputField('Fuel level', 'fuelPercentage', fuelPercentage, '%')}
            </div>
          )}

          {/* ======================================================= */}
          {/* Fuel Transfer (Screenshot 20261019-112955)              */}
          {/* ======================================================= */}
          {action === 'record-fuel' && (
            <div className="old-form-grid">
              {renderInputField('Fuel transferred', 'fuelLitres', fuelLitres, 'litres')}
              {isGen && renderInputField('DEF transferred', 'defLitres', defLitres, 'litres')}
            </div>
          )}

          {/* ======================================================= */}
          {/* Custom In-App Touch Keypad                              */}
          {/* ======================================================= */}
          {formFields.length > 0 && (
            <InAppNumpad
              onDigit={handleNumpadDigit}
              onBackspace={handleNumpadBackspace}
              onClear={handleNumpadClear}
            />
          )}

          {/* ======================================================= */}
          {/* Form Action Buttons: Green Submit & Red Cancel          */}
          {/* ======================================================= */}
          <div className="old-form-btn-row">
            <button
              type="submit"
              disabled={!isValid}
              className={`old-btn-submit ${isValid ? 'valid' : 'disabled'}`}
            >
              <IconSubmit size={24} />
              <span>Submit</span>
            </button>

            <button
              type="button"
              className="old-btn-cancel btn-pda-red"
              onClick={onCancel}
            >
              <IconCancel size={24} />
              <span>Cancel</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
