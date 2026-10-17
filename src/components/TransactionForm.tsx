import React, { useState, useMemo } from 'react';
import { ArrowLeft, Plus, Minus } from 'lucide-react';
import type { Equipment, ActionType, Transaction, TransactionType } from '../types';

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

  const actionTitle = useMemo(() => {
    switch (action) {
      case 'check-in':
        return `Check In — ${asset.type}`;
      case 'check-out':
        return `Check Out — ${asset.type}`;
      case 'record-fuel':
        return `Record Fuel Transfer — ${asset.type}`;
      default:
        return 'Record Transaction';
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
    <div className="transaction-form-view" onClick={handleContainerClick}>
      <div className="top-nav-bar">
        <button className="btn-back" onClick={onCancel}>
          <ArrowLeft size={16} />
          <span>Cancel & Back</span>
        </button>
        <span className="current-id-badge">{asset.equipmentId}</span>
      </div>

      <div className="form-card" onClick={handleContainerClick}>
        <h2 className="form-title">{actionTitle}</h2>

        <form onSubmit={handleSubmit} noValidate>
          {/* ======================================================= */}
          {/* Generator Check In / Check Out (Lines 93, 99)           */}
          {/* ======================================================= */}
          {(action === 'check-in' || action === 'check-out') && isGen && (
            <div className="fields-stack">
              <div className="form-field">
                <label htmlFor="gen-fuel-pct">Fuel Level (%)</label>
                <div className="input-group-row">
                  <div className="input-group">
                    <input
                      id="gen-fuel-pct"
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      className="text-input"
                      placeholder="0 - 100"
                      value={fuelPercentage}
                      onChange={(e) => setFuelPercentage(e.target.value)}
                      onKeyDown={handleInputKeyDown}
                    />
                    <span className="unit-label">%</span>
                  </div>
                  <button
                    type="button"
                    className="btn-keyboard-done"
                    onClick={dismissKeyboard}
                    title="Close keyboard"
                  >
                    Done
                  </button>
                </div>
              </div>

              <div className="form-field">
                <label htmlFor="gen-def-pct">DEF Level (%)</label>
                <div className="input-group-row">
                  <div className="input-group">
                    <input
                      id="gen-def-pct"
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      className="text-input"
                      placeholder="0 - 100"
                      value={defPercentage}
                      onChange={(e) => setDefPercentage(e.target.value)}
                      onKeyDown={handleInputKeyDown}
                    />
                    <span className="unit-label">%</span>
                  </div>
                  <button
                    type="button"
                    className="btn-keyboard-done"
                    onClick={dismissKeyboard}
                    title="Close keyboard"
                  >
                    Done
                  </button>
                </div>
              </div>

              <div className="form-field">
                <label htmlFor="gen-kwh">Meter Reading (kWh)</label>
                <div className="input-group-row">
                  <div className="input-group">
                    <input
                      id="gen-kwh"
                      type="number"
                      min="0"
                      step="1"
                      className="text-input"
                      placeholder="e.g. 14250"
                      value={kwh}
                      onChange={(e) => setKwh(e.target.value)}
                      onKeyDown={handleInputKeyDown}
                    />
                    <span className="unit-label">kWh</span>
                  </div>
                  <button
                    type="button"
                    className="btn-keyboard-done"
                    onClick={dismissKeyboard}
                    title="Close keyboard"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================= */}
          {/* Tank Check In / Check Out: Spinner Control (Lines 95, 101)*/}
          {/* ======================================================= */}
          {(action === 'check-in' || action === 'check-out') && isTank && (
            <div className="fields-stack">
              <div className="form-field">
                <label>Fuel Level in Eighths (0 to 8)</label>

                <div className="spinner-widget">
                  <div className="spinner-controls">
                    <button
                      type="button"
                      className="btn-spinner"
                      disabled={fuelEighths <= 0}
                      onClick={() => {
                        setFuelEighths((p) => Math.max(0, p - 1));
                        setTankSpinnerInteracted(true);
                      }}
                    >
                      <Minus size={20} />
                    </button>

                    <div className="spinner-value-box">
                      <span className="spinner-value">{fuelEighths} / 8</span>
                      <span className="spinner-fraction">
                        {Math.round((fuelEighths / 8) * 100)}% Full
                      </span>
                    </div>

                    <button
                      type="button"
                      className="btn-spinner"
                      disabled={fuelEighths >= 8}
                      onClick={() => {
                        setFuelEighths((p) => Math.min(8, p + 1));
                        setTankSpinnerInteracted(true);
                      }}
                    >
                      <Plus size={20} />
                    </button>
                  </div>

                  {/* Fast selection row */}
                  <div className="eighths-selector-row">
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((val) => (
                      <button
                        type="button"
                        key={val}
                        className={`btn-eighth ${fuelEighths === val && tankSpinnerInteracted ? 'selected' : ''}`}
                        onClick={() => {
                          setFuelEighths(val);
                          setTankSpinnerInteracted(true);
                        }}
                      >
                        {val}/8
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================= */}
          {/* Plant Check In / Check Out (Lines 97, 103)              */}
          {/* ======================================================= */}
          {(action === 'check-in' || action === 'check-out') && isPlant && (
            <div className="fields-stack">
              <div className="form-field">
                <label htmlFor="plant-fuel-pct">Fuel Level (%)</label>
                <div className="input-group-row">
                  <div className="input-group">
                    <input
                      id="plant-fuel-pct"
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      className="text-input"
                      placeholder="0 - 100"
                      value={fuelPercentage}
                      onChange={(e) => setFuelPercentage(e.target.value)}
                      onKeyDown={handleInputKeyDown}
                    />
                    <span className="unit-label">%</span>
                  </div>
                  <button
                    type="button"
                    className="btn-keyboard-done"
                    onClick={dismissKeyboard}
                    title="Close keyboard"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================= */}
          {/* Record Fuel Transfer (Lines 105, 107)                   */}
          {/* ======================================================= */}
          {action === 'record-fuel' && (
            <div className="fields-stack">
              <div className="form-field">
                <label htmlFor="fuel-vol">Fuel Transferred (Litres)</label>
                <div className="input-group-row">
                  <div className="input-group">
                    <input
                      id="fuel-vol"
                      type="number"
                      min="1"
                      step="1"
                      className="text-input"
                      placeholder="Litres"
                      value={fuelLitres}
                      onChange={(e) => setFuelLitres(e.target.value)}
                      onKeyDown={handleInputKeyDown}
                    />
                    <span className="unit-label">L</span>
                  </div>
                  <button
                    type="button"
                    className="btn-keyboard-done"
                    onClick={dismissKeyboard}
                    title="Close keyboard"
                  >
                    Done
                  </button>
                </div>
              </div>

              {isGen && (
                <div className="form-field">
                  <label htmlFor="def-vol">DEF Transferred (Litres)</label>
                  <div className="input-group-row">
                    <div className="input-group">
                      <input
                        id="def-vol"
                        type="number"
                        min="0"
                        step="1"
                        className="text-input"
                        placeholder="Litres (or 0)"
                        value={defLitres}
                        onChange={(e) => setDefLitres(e.target.value)}
                        onKeyDown={handleInputKeyDown}
                      />
                      <span className="unit-label">L</span>
                    </div>
                    <button
                      type="button"
                      className="btn-keyboard-done"
                      onClick={dismissKeyboard}
                      title="Close keyboard"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ======================================================= */}
          {/* Mandatory Brief Button Rules (Line 109):                */}
          {/* "Submit is greyed out and disabled by default.          */}
          {/*  Cancel is red. If all displayed entry fields contain   */}
          {/*  valid values, the submit button becomes clickable      */}
          {/*  and turns green."                                      */}
          {/* ======================================================= */}
          <div className="form-buttons-row">
            <button
              type="button"
              className="btn-cancel-red"
              onClick={onCancel}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={!isValid}
              className={`btn-submit ${isValid ? 'btn-submit-green' : 'btn-submit-disabled'}`}
            >
              Submit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
