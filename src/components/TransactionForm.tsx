import React, { useState, useMemo } from 'react';
import { Minus, Plus } from 'lucide-react';
import { IconSubmit, IconCancel } from './icons/AppIcons';
import type { Equipment, ActionType, Transaction, TransactionType } from '../types';
import { EquipmentTypeIcon } from './EquipmentTypeIcon';

interface TransactionFormProps {
  asset: Equipment;
  action: ActionType;
  onCancel: () => void;
  onSubmitValues: (transactionData: Partial<Transaction>) => void;
}

export const TransactionForm: React.FC<TransactionFormProps> = ({
  asset,
  action,
  onCancel,
  onSubmitValues,
}) => {
  const isGen = asset.type === 'GENERATOR';
  const isTank = asset.type === 'TANK';
  const isPlant = asset.type === 'PLANT';

  // State
  const [fuelPercentage, setFuelPercentage] = useState<string>('');
  const [defPercentage, setDefPercentage] = useState<string>('');
  const [kwh, setKwh] = useState<string>('');
  const [fuelEighths, setFuelEighths] = useState<number>(0);
  const [tankSpinnerInteracted, setTankSpinnerInteracted] = useState<boolean>(false);
  const [fuelLitres, setFuelLitres] = useState<string>('');
  const [defLitres, setDefLitres] = useState<string>('');

  // Title matching Screenshot_20250324-201605.png & Screenshot_20261019-112955.png
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
        return tankSpinnerInteracted && fuelEighths >= 0 && fuelEighths <= 8;
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
      } else if (isTank) {
        txData.checkInFuelEighths = fuelEighths;
      } else if (isPlant) {
        txData.checkInFuelPercentage = parseInt(fuelPercentage, 10);
      }
    } else if (action === 'check-out') {
      if (isGen) {
        txData.checkOutFuelPercentage = parseInt(fuelPercentage, 10);
        txData.checkOutDefPercentage = parseInt(defPercentage, 10);
        txData.checkOutKWH = parseInt(kwh, 10);
      } else if (isTank) {
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

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
    }
  };

  const dismissKeyboard = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  const handleContainerClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && !target.closest('input') && !target.closest('button')) {
      dismissKeyboard();
    }
  };

  return (
    <div className="old-screen-container" onClick={handleContainerClick}>
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
      <div className="old-form-body" onClick={handleContainerClick}>
        {/* Blue Bold Uppercase Title */}
        <h2 className="old-form-title">{actionTitle}</h2>

        <form onSubmit={handleSubmit} noValidate className="old-form-content">
          {/* ======================================================= */}
          {/* Generator Check In / Check Out (Screenshot 20250324-201605) */}
          {/* ======================================================= */}
          {(action === 'check-in' || action === 'check-out') && isGen && (
            <div className="old-form-grid">
              <div className="old-form-row">
                <span className="old-form-lbl">Fuel level</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  className="old-form-input"
                  placeholder="100"
                  value={fuelPercentage}
                  onChange={(e) => setFuelPercentage(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                />
                <span className="old-form-unit">%</span>
              </div>

              <div className="old-form-row">
                <span className="old-form-lbl">DEF level</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  className="old-form-input"
                  placeholder="100"
                  value={defPercentage}
                  onChange={(e) => setDefPercentage(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                />
                <span className="old-form-unit">%</span>
              </div>

              <div className="old-form-row">
                <span className="old-form-lbl">Meter</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="old-form-input"
                  placeholder="1752"
                  value={kwh}
                  onChange={(e) => setKwh(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                />
                <span className="old-form-unit">kWh</span>
              </div>
            </div>
          )}

          {/* ======================================================= */}
          {/* Tank Check In / Check Out (Eighths Spinner Control)     */}
          {/* ======================================================= */}
          {(action === 'check-in' || action === 'check-out') && isTank && (
            <div className="old-form-grid">
              <div className="old-form-row">
                <span className="old-form-lbl">Fuel level</span>
                <div className="old-tank-spinner">
                  <button
                    type="button"
                    className="old-btn-step"
                    disabled={fuelEighths <= 0}
                    onClick={() => {
                      setFuelEighths((p) => Math.max(0, p - 1));
                      setTankSpinnerInteracted(true);
                    }}
                  >
                    <Minus size={18} />
                  </button>
                  <span className="old-tank-val">{fuelEighths} / 8</span>
                  <button
                    type="button"
                    className="old-btn-step"
                    disabled={fuelEighths >= 8}
                    onClick={() => {
                      setFuelEighths((p) => Math.min(8, p + 1));
                      setTankSpinnerInteracted(true);
                    }}
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
              <div className="old-form-row">
                <span className="old-form-lbl">Fuel level</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  className="old-form-input"
                  placeholder="100"
                  value={fuelPercentage}
                  onChange={(e) => setFuelPercentage(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                />
                <span className="old-form-unit">%</span>
              </div>
            </div>
          )}

          {/* ======================================================= */}
          {/* Fuel Transfer (Screenshot 20261019-112955)              */}
          {/* ======================================================= */}
          {action === 'record-fuel' && (
            <div className="old-form-grid">
              <div className="old-form-row">
                <span className="old-form-lbl">Fuel transferred</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  className="old-form-input"
                  placeholder="500"
                  value={fuelLitres}
                  onChange={(e) => setFuelLitres(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                />
                <span className="old-form-unit">litres</span>
              </div>

              {isGen && (
                <div className="old-form-row">
                  <span className="old-form-lbl">DEF transferred</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="old-form-input"
                    placeholder="100"
                    value={defLitres}
                    onChange={(e) => setDefLitres(e.target.value)}
                    onKeyDown={handleInputKeyDown}
                  />
                  <span className="old-form-unit">litres</span>
                </div>
              )}
            </div>
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
              className="old-btn-cancel"
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
