import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AlertCircle, List, X, CheckCircle2, CloudOff } from 'lucide-react';
import type { Equipment, Transaction, ActionType } from '../types';
import { EquipmentTypeIcon } from './EquipmentTypeIcon';
import { TransactionTypeIcon } from './TransactionTypeIcon';
import { formatOldAppTimestamp } from '../utils/dateFormat';

export interface ScannerViewProps {
  activeAssetId: string | null;
  currentAsset: Equipment | null;
  transactions: Transaction[];
  availableAssets: Equipment[];
  onAssetSelected: (equipmentId: string | null) => void;
  onSelectAction: (action: ActionType) => void;
  onEditEquipment: () => void;
  onPowerToggle: (action: 'PoweredUp' | 'PoweredDown') => void;
  isAnyModalOpen?: boolean;
}

export const ScannerView: React.FC<ScannerViewProps> = ({
  activeAssetId,
  currentAsset,
  transactions,
  availableAssets,
  onAssetSelected,
  onSelectAction,
  onEditEquipment,
  onPowerToggle,
  isAnyModalOpen = false,
}) => {
  const [barcodeInput, setBarcodeInput] = useState(activeAssetId || '');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isModalActive = isAssetModalOpen || isAnyModalOpen;

  // Synchronize internal input with external activeAssetId
  useEffect(() => {
    if (activeAssetId) {
      setBarcodeInput(activeAssetId);
      setErrorMessage(null);
    }
  }, [activeAssetId]);

  // Reliable focus handler that prevents scroll jumping
  const focusInput = useCallback(() => {
    if (isModalActive) return;
    if (inputRef.current && document.activeElement !== inputRef.current) {
      inputRef.current.focus({ preventScroll: true });
    }
  }, [isModalActive]);

  // Initial focus on mount
  useEffect(() => {
    focusInput();
    const t = setTimeout(focusInput, 80);
    return () => clearTimeout(t);
  }, [focusInput]);

  // Re-focus whenever any modal closes
  useEffect(() => {
    if (!isModalActive) {
      focusInput();
      const t1 = setTimeout(focusInput, 50);
      const t2 = setTimeout(focusInput, 150);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [isModalActive, focusInput]);

  // Global listeners: clicks on screen restore focus to input
  useEffect(() => {
    const handleGlobalInteraction = (e: Event) => {
      if (isModalActive) return;

      const target = e.target as HTMLElement | null;

      // If user clicked inside an active modal, ignore
      if (target?.closest('.modal-box')) return;

      // If user clicked action buttons, allow button click
      if (
        target?.closest('.old-btn-black-action') ||
        target?.closest('.old-btn-select-fleet') ||
        target?.closest('.old-scan-clear-btn') ||
        target?.closest('.old-btn-power-chip') ||
        target?.closest('button[title*="Settings"]')
      ) {
        return;
      }

      setTimeout(focusInput, 50);
      setTimeout(focusInput, 150);
    };

    const handleWindowFocus = () => {
      if (!isModalActive) {
        focusInput();
      }
    };

    window.addEventListener('pointerup', handleGlobalInteraction);
    window.addEventListener('click', handleGlobalInteraction);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      window.removeEventListener('pointerup', handleGlobalInteraction);
      window.removeEventListener('click', handleGlobalInteraction);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [isModalActive, focusInput]);

  // Keep-alive focus heartbeat: ensures barcode text box never stays unfocused
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isModalActive) {
        if (document.activeElement !== inputRef.current) {
          focusInput();
        }
      }
    }, 400);

    return () => clearInterval(interval);
  }, [isModalActive, focusInput]);

  // Helper to find asset in fleet matching input
  const findMatchingAsset = useCallback(
    (value: string): Equipment | null => {
      const trimmed = value.trim().toUpperCase();
      if (!trimmed) return null;
      const alt = trimmed.includes('-')
        ? trimmed.replace(/-/g, '_')
        : trimmed.replace(/_/g, '-');
      return (
        availableAssets.find(
          (a) =>
            a.equipmentId.toUpperCase() === trimmed ||
            a.equipmentId.toUpperCase() === alt
        ) || null
      );
    },
    [availableAssets]
  );

  // Check if input currently contains a valid asset number
  const trimmedInput = barcodeInput.trim().toUpperCase();
  const matchedAsset = findMatchingAsset(barcodeInput);
  const isValidAsset = Boolean(
    matchedAsset &&
      currentAsset &&
      (currentAsset.equipmentId.toUpperCase() === trimmedInput ||
        currentAsset.equipmentId.replace(/-/g, '_').toUpperCase() === trimmedInput.replace(/-/g, '_'))
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setBarcodeInput(val);
    setErrorMessage(null);

    const match = findMatchingAsset(val);
    if (match) {
      onAssetSelected(match.equipmentId);
    } else if (activeAssetId) {
      onAssetSelected(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const match = findMatchingAsset(barcodeInput);
      if (match) {
        setErrorMessage(null);
        onAssetSelected(match.equipmentId);
      } else if (barcodeInput.trim()) {
        setErrorMessage(`Asset "${barcodeInput.trim()}" not found in fleet.`);
        onAssetSelected(null);
      }
    }
  };

  const handleClear = () => {
    setBarcodeInput('');
    setErrorMessage(null);
    onAssetSelected(null);
    setTimeout(focusInput, 60);
  };

  const handleBlur = () => {
    setTimeout(() => {
      if (!isModalActive) {
        focusInput();
      }
    }, 60);
  };

  const handleOpenModal = () => {
    setIsAssetModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsAssetModalOpen(false);
    setTimeout(focusInput, 80);
  };

  const handleSelectAsset = (equipmentId: string) => {
    setIsAssetModalOpen(false);
    setBarcodeInput(equipmentId);
    setErrorMessage(null);
    onAssetSelected(equipmentId);
    setTimeout(focusInput, 80);
  };

  const isGenerator = currentAsset?.type === 'GENERATOR';
  const isPoweredOn = Boolean(
    currentAsset?.poweredUpTimestamp && !currentAsset?.poweredDownTimestamp
  );

  return (
    <div className="old-screen-container">
      {/* 
        CONDITION: When the input box DOES NOT contain a valid asset number:
        - "Scan equipment barcode..." is deleted
        - Asset data is NOT displayed
        - Transactions are NOT displayed
        - Transaction buttons are NOT displayed
      */}
      {!isValidAsset ? (
        <div className="old-scanner-middle-area">
          {/* Full width scan input box */}
          <div className="scan-input-wrapper">
            <input
              ref={inputRef}
              type="text"
              inputMode="none"
              className="old-scan-input"
              placeholder="[ Ready to scan barcode ]"
              value={barcodeInput}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck="false"
            />
          </div>

          {errorMessage && (
            <div className="old-error-message">
              <AlertCircle size={15} />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Quick picker trigger button */}
          <button
            type="button"
            className="old-btn-select-fleet"
            onClick={handleOpenModal}
          >
            <List size={16} />
            <span>Select asset from list</span>
          </button>
        </div>
      ) : (
        /*
          CONDITION: When the input box DOES contain a valid asset number:
          - Display scan input box at top with CLEAR button
          - Display asset data
          - Display transactions
          - Display transaction buttons
        */
        currentAsset && (
          <>
            {/* Top Bar with Scan Input Box and Clear Button */}
            <div className="scan-active-banner">
              <div className="scan-active-input-wrap">
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="none"
                  className="old-scan-input-active"
                  value={barcodeInput}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onBlur={handleBlur}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  spellCheck="false"
                />
                <button
                  type="button"
                  className="old-scan-clear-btn"
                  onClick={handleClear}
                  title="Clear and scan another"
                >
                  <X size={15} />
                  <span>CLEAR</span>
                </button>
              </div>
            </div>

            {/* 1. ASSET DATA (Metadata Header) */}
            <div className="old-meta-header">
              {/* what3words: Clean Yellow Link */}
              <div className="old-meta-w3w-row">
                <a
                  href={`https://what3words.com/${currentAsset.what3words.replace('///', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="old-meta-w3w"
                >
                  {currentAsset.what3words.replace('///', '')}
                </a>
              </div>

              {/* TYPE & SIZE & S/N: High-Vis Slate Text */}
              <div className="old-meta-spec">
                {currentAsset.type}
                {currentAsset.capacity
                  ? ` - ${currentAsset.capacity} ${isGenerator ? 'kVA' : 'L'} `
                  : ' - '}
                - {currentAsset.rentalSerialNumber}
              </div>

              {/* Power Status & Toggle Controls: Green ON / Muted Slate OFF */}
              {isGenerator && (
                <div className="old-meta-power-row">
                  <button
                    type="button"
                    className={`old-btn-power-chip on ${isPoweredOn ? 'active' : ''}`}
                    onClick={() => onPowerToggle('PoweredUp')}
                  >
                    ON
                  </button>
                  <span className="old-power-label">PoweredUp</span>

                  <button
                    type="button"
                    className={`old-btn-power-chip off ${!isPoweredOn && currentAsset.poweredDownTimestamp ? 'active' : ''}`}
                    onClick={() => onPowerToggle('PoweredDown')}
                  >
                    OFF
                  </button>
                  <span className="old-power-label">PoweredDown</span>
                </div>
              )}

              {/* AREA & LOCATION: Slate Centered Uppercase */}
              <div className="old-meta-area">{currentAsset.area.toUpperCase()}</div>
              <div className="old-meta-location">{currentAsset.location.toUpperCase()}</div>
            </div>

            {/* 2. TRANSACTIONS (Transaction History List) */}
            <div className="old-history-scroll-area">
              {transactions.length === 0 ? (
                <div className="old-empty-history">
                  No transactions recorded yet for this asset.
                </div>
              ) : (
                <div className="old-tx-list">
                  {transactions.map((tx) => {
                    const isFuel =
                      tx.transactionType.includes('FuelTransfer') ||
                      tx.transactionType.includes('Fuel');
                    const isCheckOut = tx.transactionType.includes('CheckOut');

                    return (
                      <div key={tx.id} className="old-tx-row">
                        <div className="old-tx-icon-col">
                          <TransactionTypeIcon type={tx.transactionType} size={30} />
                        </div>

                        <div className="old-tx-content-col">
                          <div className="old-tx-datetime">
                            {formatOldAppTimestamp(tx.transactionTimestamp)}
                          </div>

                          <div className="old-tx-details">
                            {isFuel ? (
                              <span>
                                ● Fuel{' '}
                                {tx.fuelTransferLitres !== undefined
                                  ? `${tx.fuelTransferLitres}.0`
                                  : '0.0'}{' '}
                                litres
                                {tx.defTransferLitres !== undefined && (
                                  <> ● DEF {tx.defTransferLitres}.0 litres</>
                                )}
                              </span>
                            ) : isCheckOut ? (
                              <span>
                                {tx.checkOutFuelPercentage !== undefined && (
                                  <>● Fuel {tx.checkOutFuelPercentage}% </>
                                )}
                                {tx.checkOutFuelEighths !== undefined && (
                                  <>● Fuel {tx.checkOutFuelEighths}/8 </>
                                )}
                                {tx.checkOutDefPercentage !== undefined && (
                                  <>● DEF {tx.checkOutDefPercentage}% </>
                                )}
                                {tx.checkOutKWH !== undefined && (
                                  <>● {tx.checkOutKWH} kWh</>
                                )}
                              </span>
                            ) : (
                              <span>
                                {tx.checkInFuelPercentage !== undefined && (
                                  <>● Fuel {tx.checkInFuelPercentage}% </>
                                )}
                                {tx.checkInFuelEighths !== undefined && (
                                  <>● Fuel {tx.checkInFuelEighths}/8 </>
                                )}
                                {tx.checkInDefPercentage !== undefined && (
                                  <>● DEF {tx.checkInDefPercentage}% </>
                                )}
                                {tx.checkInKWH !== undefined && (
                                  <>● {tx.checkInKWH} kWh</>
                                )}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Discrete Sync Status Indicator */}
                        <div className="old-tx-sync-col">
                          {tx.syncStatus === 'synced' ? (
                            <span title="Synced">
                              <CheckCircle2 size={14} className="sync-icon-synced" />
                            </span>
                          ) : (
                            <span title="Queued locally">
                              <CloudOff size={14} className="sync-icon-pending" />
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 3. TRANSACTION BUTTONS (4 Stacked Action Buttons) */}
            <div className="old-bottom-actions-stack">
              <button
                type="button"
                className="old-btn-black-action"
                onClick={() => onSelectAction('check-in')}
              >
                Check In
              </button>

              <button
                type="button"
                className="old-btn-black-action"
                onClick={() => onSelectAction('record-fuel')}
              >
                Record fuel transfer
              </button>

              <button
                type="button"
                className="old-btn-black-action"
                onClick={() => onSelectAction('check-out')}
              >
                Check Out
              </button>

              <button
                type="button"
                className="old-btn-black-action"
                onClick={onEditEquipment}
              >
                Edit equipment details
              </button>
            </div>
          </>
        )
      )}

      {/* Asset Picker Modal */}
      {isAssetModalOpen && (
        <div className="modal-backdrop" onClick={handleCloseModal}>
          <div
            className="modal-box asset-picker-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header-simple">
              <h3 className="modal-title">Select Equipment</h3>
              <span className="picker-asset-count">
                {availableAssets.length} assets
              </span>
            </div>

            <div className="asset-picker-list">
              {availableAssets.length === 0 ? (
                <div className="empty-picker-notice">No assets available</div>
              ) : (
                availableAssets.map((asset) => (
                  <div
                    key={asset.equipmentId}
                    className="asset-compact-row picker-row"
                    onClick={() => handleSelectAsset(asset.equipmentId)}
                  >
                    <div className="row-left">
                      <span className="row-id">{asset.equipmentId}</span>
                      <EquipmentTypeIcon type={asset.type} size={15} />
                    </div>
                    <div className="row-right">
                      <span className="row-location">{asset.location}</span>
                      <span className="row-area">{asset.area}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="modal-single-button-row">
              <button
                type="button"
                className="btn-danger-cancel"
                onClick={handleCloseModal}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export { ScannerView as ScanView };
