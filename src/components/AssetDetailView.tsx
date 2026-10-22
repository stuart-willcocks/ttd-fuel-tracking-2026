import React from 'react';
import { Check } from 'lucide-react';
import { IconCheckIn, IconCheckOut, IconFuel, IconBack } from './icons/AppIcons';
import type { Equipment, Transaction, ActionType } from '../types';
import { formatPdaTimestamp } from '../utils/dateFormat';
import { TransactionTypeIcon } from './TransactionTypeIcon';
import { EquipmentTypeIcon } from './EquipmentTypeIcon';

export interface AssetDetailViewProps {
  asset: Equipment;
  transactions: Transaction[];
  onSelectAction: (action: ActionType) => void;
  onBack: () => void;
}

export const AssetDetailView: React.FC<AssetDetailViewProps> = ({
  asset,
  transactions,
  onSelectAction,
  onBack,
}) => {
  const isGenerator = asset.type === 'GENERATOR';

  // Sort transactions in reverse timestamp order (newest first)
  const sortedTransactions = [...transactions].sort((a, b) => {
    return (b.transactionTimestamp || '').localeCompare(a.transactionTimestamp || '');
  });

  const renderTransactionData = (tx: Transaction) => {
    const isFuelTransfer =
      tx.transactionType.includes('FuelTransfer') ||
      tx.transactionType.includes('Fuel');
    const isCheckOut = tx.transactionType.includes('CheckOut');

    if (isFuelTransfer) {
      return (
        <div className="tx-data-row">
          <span className="tx-data-item">
            Fuel: {tx.fuelTransferLitres !== undefined ? `${tx.fuelTransferLitres}L` : '0L'}
          </span>
          {tx.defTransferLitres !== undefined && (
            <span className="tx-data-item">
              DEF: {tx.defTransferLitres}L
            </span>
          )}
        </div>
      );
    }

    const fuelPct = isCheckOut
      ? tx.checkOutFuelPercentage
      : tx.checkInFuelPercentage;
    const fuelEighths = isCheckOut
      ? tx.checkOutFuelEighths
      : tx.checkInFuelEighths;
    const defPct = isCheckOut
      ? tx.checkOutDefPercentage
      : tx.checkInDefPercentage;
    const kwh = isCheckOut ? tx.checkOutKWH : tx.checkInKWH;

    const hasAnyData =
      fuelPct !== undefined ||
      fuelEighths !== undefined ||
      defPct !== undefined ||
      kwh !== undefined;

    if (!hasAnyData) {
      if (tx.transactionType === 'PoweredUp') {
        return <div className="tx-data-row"><span>Status: Powered Up</span></div>;
      }
      if (tx.transactionType === 'PoweredDown') {
        return <div className="tx-data-row"><span>Status: Powered Down</span></div>;
      }
      return null;
    }

    return (
      <div className="tx-data-row">
        {(fuelPct !== undefined || fuelEighths !== undefined) && (
          <span className="tx-data-item">
            Fuel: {fuelPct !== undefined ? `${fuelPct}%` : `${fuelEighths}/8`}
          </span>
        )}
        {defPct !== undefined && (
          <span className="tx-data-item">
            DEF: {defPct}%
          </span>
        )}
        {kwh !== undefined && (
          <span className="tx-data-item">
            kWh: {kwh}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="old-screen-container asset-detail-container">
      {/* 1. ASSET ID: Matches placement and styling of scan view text box */}
      <div className="scan-top-area">
        <div className="old-scan-input asset-detail-id-box">
          <span className="asset-detail-id-icon">
            <EquipmentTypeIcon type={asset.type} size={24} />
          </span>
          <span className="asset-detail-id-text">{asset.equipmentId}</span>
        </div>
      </div>

      {/* 2. METADATA SECTION: Non-monospace what3words, light grey asset data, no equipment type text */}
      <div className="asset-detail-meta-box">
        {/* what3words: Clean sans-serif light grey */}
        <div className="asset-detail-w3w">
          {asset.what3words.replace('///', '')}
        </div>

        {/* Asset Capacity & Serial Number */}
        {(asset.capacity !== undefined || asset.rentalSerialNumber) && (
          <div className="asset-detail-spec">
            {asset.capacity ? `${asset.capacity} ${isGenerator ? 'kVA' : 'L'}` : ''}
            {asset.capacity && asset.rentalSerialNumber ? ' • ' : ''}
            {asset.rentalSerialNumber ? `SN: ${asset.rentalSerialNumber}` : ''}
          </div>
        )}

        {/* Area */}
        <div className="asset-detail-area">{asset.area.toUpperCase()}</div>

        {/* Location */}
        <div className="asset-detail-location">{asset.location.toUpperCase()}</div>
      </div>

      {/* 3. TRANSACTIONS LIST: Vertically scrollable pane, reverse timestamp order */}
      <div className="asset-detail-tx-pane">
        {sortedTransactions.length === 0 ? (
          <div className="tx-empty-state">No transactions recorded yet for this asset.</div>
        ) : (
          <div className="tx-list-stack">
            {sortedTransactions.map((tx) => (
              <div key={tx.id} className="tx-row-card">
                {/* Transaction Type Icon */}
                <div className="tx-type-icon-col">
                  <TransactionTypeIcon type={tx.transactionType} size={24} />
                </div>

                {/* Details: Timestamp & Data Values with Type Icons */}
                <div className="tx-info-col">
                  <div className="tx-timestamp-line">
                    {formatPdaTimestamp(tx.transactionTimestamp)}
                  </div>
                  {renderTransactionData(tx)}
                </div>

                {/* Uploaded Status: White tick inside filled green circle */}
                <div className="tx-sync-col" title="Uploaded">
                  <span className="tx-uploaded-circle" aria-label="Uploaded">
                    <Check size={12} strokeWidth={3.5} className="tx-uploaded-check" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. TRANSACTION BUTTONS: Consistent height, width 100%, center justified, modern 8px rounded corners with icons */}
      <div className="asset-detail-btn-stack">
        <button
          type="button"
          className="btn-pda-rect btn-pda-green"
          onClick={() => onSelectAction('check-in')}
        >
          <IconCheckIn size={24} />
          <span>Check In</span>
        </button>

        <button
          type="button"
          className="btn-pda-rect btn-pda-blue"
          onClick={() => onSelectAction('record-fuel')}
        >
          <IconFuel size={24} />
          <span>Record Fuel Transfer</span>
        </button>

        <button
          type="button"
          className="btn-pda-rect btn-pda-green"
          onClick={() => onSelectAction('check-out')}
        >
          <IconCheckOut size={24} />
          <span>Check Out</span>
        </button>

        <button
          type="button"
          className="btn-pda-rect btn-pda-red"
          onClick={onBack}
        >
          <IconBack size={24} />
          <span>Back</span>
        </button>
      </div>
    </div>
  );
};
