import React from 'react';
import { Fuel, Droplet, Zap, Check } from 'lucide-react';
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
            <Fuel size={13} className="data-icon icon-fuel" />
            <span>
              Fuel{' '}
              {tx.fuelTransferLitres !== undefined
                ? `${tx.fuelTransferLitres}.0`
                : '0.0'}{' '}
              litres
            </span>
          </span>
          {tx.defTransferLitres !== undefined && (
            <span className="tx-data-item">
              <Droplet size={13} className="data-icon icon-def" />
              <span>DEF {tx.defTransferLitres}.0 litres</span>
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
            <Fuel size={13} className="data-icon icon-fuel" />
            <span>
              Fuel {fuelPct !== undefined ? `${fuelPct}%` : `${fuelEighths}/8`}
            </span>
          </span>
        )}
        {defPct !== undefined && (
          <span className="tx-data-item">
            <Droplet size={13} className="data-icon icon-def" />
            <span>DEF {defPct}%</span>
          </span>
        )}
        {kwh !== undefined && (
          <span className="tx-data-item">
            <Zap size={13} className="data-icon icon-kwh" />
            <span>{kwh} kWh</span>
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="old-screen-container asset-detail-container">
      {/* 1. ASSET ID: Orange banner matching scan view with equipment type icon on the left */}
      <div className="asset-detail-id-banner">
        <span className="asset-detail-id-icon">
          <EquipmentTypeIcon type={asset.type} size={20} />
        </span>
        <span className="asset-detail-id-text">{asset.equipmentId}</span>
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
                  <TransactionTypeIcon type={tx.transactionType} size={30} />
                </div>

                {/* Details: Timestamp & Data Values with Type Icons */}
                <div className="tx-info-col">
                  <div className="tx-timestamp-line">
                    {formatPdaTimestamp(tx.transactionTimestamp)}
                  </div>
                  {renderTransactionData(tx)}
                </div>

                {/* Sync Status: Green Tick */}
                <div className="tx-sync-col" title="Sync Status: Green Tick">
                  <Check size={18} strokeWidth={3} className="sync-green-tick" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. TRANSACTION BUTTONS: Consistent height, width 100%, center justified, rectangular */}
      <div className="asset-detail-btn-stack">
        <button
          type="button"
          className="btn-pda-rect btn-pda-green"
          onClick={() => onSelectAction('check-in')}
        >
          Check In
        </button>

        <button
          type="button"
          className="btn-pda-rect btn-pda-green"
          onClick={() => onSelectAction('record-fuel')}
        >
          Record Fuel Transfer
        </button>

        <button
          type="button"
          className="btn-pda-rect btn-pda-green"
          onClick={() => onSelectAction('check-out')}
        >
          Check Out
        </button>

        <button
          type="button"
          className="btn-pda-rect btn-pda-blue"
          onClick={onBack}
        >
          Back
        </button>
      </div>
    </div>
  );
};
