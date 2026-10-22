import React, { useState, useRef, useCallback } from 'react';
import { Check, Power, PowerOff } from 'lucide-react';
import { IconCheckIn, IconCheckOut, IconFuel, IconBack } from './icons/AppIcons';
import type { Equipment, Transaction, ActionType } from '../types';
import { formatPdaTimestamp } from '../utils/dateFormat';
import { TransactionTypeIcon } from './TransactionTypeIcon';
import { EquipmentTypeIcon } from './EquipmentTypeIcon';
import { DeleteTransactionModal } from './DeleteTransactionModal';

export interface AssetDetailViewProps {
  asset: Equipment;
  transactions: Transaction[];
  onSelectAction: (action: ActionType) => void;
  onBack: () => void;
  onDeleteTransaction?: (transactionId: string) => void | Promise<void>;
}

export const AssetDetailView: React.FC<AssetDetailViewProps> = ({
  asset,
  transactions,
  onSelectAction,
  onBack,
  onDeleteTransaction,
}) => {
  const isGenerator = asset.type === 'GENERATOR';

  // Delete transaction modal state & long-press detection
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerStartPosRef = useRef<{ x: number; y: number } | null>(null);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pointerStartPosRef.current = null;
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent, tx: Transaction) => {
    // Only primary touch/click button
    if (e.button !== 0) return;

    clearLongPress();
    pointerStartPosRef.current = { x: e.clientX, y: e.clientY };

    longPressTimerRef.current = setTimeout(() => {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate?.(50);
      }
      setTransactionToDelete(tx);
    }, 550);
  }, [clearLongPress]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointerStartPosRef.current || !longPressTimerRef.current) return;
    const dx = e.clientX - pointerStartPosRef.current.x;
    const dy = e.clientY - pointerStartPosRef.current.y;
    // If movement exceeds 10px, the user is scrolling the list: cancel long press
    if (Math.hypot(dx, dy) > 10) {
      clearLongPress();
    }
  }, [clearLongPress]);

  const handlePointerUpOrLeave = useCallback(() => {
    clearLongPress();
  }, [clearLongPress]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    // Suppress system context menu on mobile / desktop long-press
    e.preventDefault();
  }, []);

  const handleConfirmDelete = async () => {
    if (!transactionToDelete) return;
    const id = transactionToDelete.id;
    setTransactionToDelete(null);
    if (onDeleteTransaction) {
      await onDeleteTransaction(id);
    }
  };

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
        return (
          <div className="tx-data-row">
            <span style={{ color: '#16A34A', fontWeight: 700 }}>Status: Powered Up</span>
          </div>
        );
      }
      if (tx.transactionType === 'PoweredDown') {
        return (
          <div className="tx-data-row">
            <span style={{ color: '#DC2626', fontWeight: 700 }}>Status: Powered Down</span>
          </div>
        );
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
              <div
                key={tx.id}
                className="tx-row-card"
                onPointerDown={(e) => handlePointerDown(e, tx)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUpOrLeave}
                onPointerCancel={handlePointerUpOrLeave}
                onContextMenu={handleContextMenu}
              >
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

                {/* Uploaded Status: White tick inside filled green circle (20% smaller) */}
                <div className="tx-sync-col" title="Uploaded">
                  <span className="tx-uploaded-circle" aria-label="Uploaded">
                    <Check size={10} strokeWidth={3.5} className="tx-uploaded-check" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. TRANSACTION BUTTONS: 2-column grid, full width */}
      <div className="asset-detail-btn-stack">
        <button
          type="button"
          className="btn-pda-rect btn-pda-green"
          onClick={() => onSelectAction('check-in')}
        >
          <IconCheckIn size={20} />
          <span>Check In</span>
        </button>

        <button
          type="button"
          className="btn-pda-rect btn-pda-green"
          onClick={() => onSelectAction('check-out')}
        >
          <IconCheckOut size={20} />
          <span>Check Out</span>
        </button>

        <button
          type="button"
          className="btn-pda-rect btn-pda-green"
          onClick={() => onSelectAction('power-up')}
        >
          <Power size={20} />
          <span>Mark powered up</span>
        </button>

        <button
          type="button"
          className="btn-pda-rect btn-pda-slate"
          onClick={() => onSelectAction('power-down')}
        >
          <PowerOff size={20} />
          <span>Mark powered down</span>
        </button>

        <button
          type="button"
          className="btn-pda-rect btn-pda-blue"
          onClick={() => onSelectAction('record-fuel')}
        >
          <IconFuel size={20} />
          <span>Record Fuel Transfer</span>
        </button>

        <button
          type="button"
          className="btn-pda-rect btn-pda-red"
          onClick={onBack}
        >
          <IconBack size={20} />
          <span>Back</span>
        </button>
      </div>

      {/* Delete Transaction Confirmation Modal */}
      {transactionToDelete && (
        <DeleteTransactionModal
          asset={asset}
          transaction={transactionToDelete}
          isOpen={Boolean(transactionToDelete)}
          onCancel={() => setTransactionToDelete(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  );
};
