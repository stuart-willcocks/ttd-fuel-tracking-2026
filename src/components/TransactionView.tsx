import React from 'react';
import { ArrowLeft, CheckCircle2, CloudOff } from 'lucide-react';
import type { Equipment, Transaction, ActionType } from '../types';
import { formatOldAppTimestamp } from '../utils/dateFormat';
import { TransactionTypeIcon } from './TransactionTypeIcon';

export interface TransactionViewProps {
  asset: Equipment;
  transactions: Transaction[];
  onBackToScanner: () => void;
  onSelectAction: (action: ActionType) => void;
  onEditEquipment: () => void;
  onPowerToggle: (action: 'PoweredUp' | 'PoweredDown') => void;
}

export const TransactionView: React.FC<TransactionViewProps> = ({
  asset,
  transactions,
  onBackToScanner,
  onSelectAction,
  onEditEquipment,
  onPowerToggle,
}) => {
  const isGenerator = asset.type === 'GENERATOR';
  const isPoweredOn = Boolean(asset.poweredUpTimestamp && !asset.poweredDownTimestamp);

  return (
    <div className="old-screen-container">
      {/* 1. TOP BANNER: Solid Black Banner with Scanned ID */}
      <div className="old-top-banner">
        <button
          type="button"
          className="old-banner-back-btn"
          onClick={onBackToScanner}
          title="Back to scanner"
        >
          <ArrowLeft size={16} />
          <span>BACK</span>
        </button>
        <span className="old-banner-title">{asset.equipmentId}</span>
        <div style={{ width: 60 }} /> {/* Spacer to keep title centered */}
      </div>

      {/* 2. METADATA HEADER: Centered on white background */}
      <div className="old-meta-header">
        {/* what3words: Red Centered Monospace */}
        <div className="old-meta-w3w-row">
          <a
            href={`https://what3words.com/${asset.what3words.replace('///', '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="old-meta-w3w"
          >
            {asset.what3words.replace('///', '')}
          </a>
        </div>

        {/* TYPE & SIZE & S/N: Blue Centered Uppercase */}
        <div className="old-meta-spec">
          {asset.type}
          {asset.capacity ? ` - ${asset.capacity} ${isGenerator ? 'kVA' : 'L'} ` : ' - '}
          - {asset.rentalSerialNumber}
        </div>

        {/* Power Status & Toggle Controls: Green ON / Red OFF */}
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
              className={`old-btn-power-chip off ${!isPoweredOn && asset.poweredDownTimestamp ? 'active' : ''}`}
              onClick={() => onPowerToggle('PoweredDown')}
            >
              OFF
            </button>
            <span className="old-power-label">PoweredDown</span>
          </div>
        )}

        {/* AREA & LOCATION: Blue Centered Uppercase */}
        <div className="old-meta-area">{asset.area.toUpperCase()}</div>
        <div className="old-meta-location">{asset.location.toUpperCase()}</div>
      </div>

      {/* 3. TRANSACTION HISTORY LIST */}
      <div className="old-history-scroll-area">
        {transactions.length === 0 ? (
          <div className="old-empty-history">No transactions recorded yet for this asset.</div>
        ) : (
          <div className="old-tx-list">
            {transactions.map((tx) => {
              const isFuel = tx.transactionType.includes('FuelTransfer') || tx.transactionType.includes('Fuel');
              const isCheckOut = tx.transactionType.includes('CheckOut');

              return (
                <div key={tx.id} className="old-tx-row">
                  <div className="old-tx-icon-col">
                    <TransactionTypeIcon type={tx.transactionType} size={32} />
                  </div>

                  <div className="old-tx-content-col">
                    <div className="old-tx-datetime">
                      {formatOldAppTimestamp(tx.transactionTimestamp)}
                    </div>

                    <div className="old-tx-details">
                      {isFuel ? (
                        <span>
                          ● Fuel {tx.fuelTransferLitres !== undefined ? `${tx.fuelTransferLitres}.0` : '0.0'} litres
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

      {/* 4. BOTTOM ACTION BUTTONS: 4 Stacked Rectangular Black Buttons */}
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
    </div>
  );
};

export { TransactionView as AssetDetailView };
