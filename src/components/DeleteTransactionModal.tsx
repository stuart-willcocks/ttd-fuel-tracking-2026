import React from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';
import { IconCancel } from './icons/AppIcons';
import type { Equipment, Transaction } from '../types';
import { EquipmentTypeIcon } from './EquipmentTypeIcon';
import { TransactionTypeIcon } from './TransactionTypeIcon';
import { formatPdaTimestamp } from '../utils/dateFormat';

interface DeleteTransactionModalProps {
  asset: Equipment;
  transaction: Transaction;
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const DeleteTransactionModal: React.FC<DeleteTransactionModalProps> = ({
  asset,
  transaction,
  isOpen,
  onCancel,
  onConfirm,
}) => {
  if (!isOpen) return null;

  const isPowerEvent =
    transaction.transactionType === 'PoweredUp' ||
    transaction.transactionType === 'PoweredDown';

  const isFuelTransfer =
    transaction.transactionType.includes('FuelTransfer') ||
    transaction.transactionType.includes('Fuel');

  const isCheckOut = transaction.transactionType.includes('CheckOut');
  const isCheckIn = transaction.transactionType.includes('CheckIn');

  const fuelPct = isCheckOut
    ? transaction.checkOutFuelPercentage
    : transaction.checkInFuelPercentage;
  const fuelEighths = isCheckOut
    ? transaction.checkOutFuelEighths
    : transaction.checkInFuelEighths;
  const defPct = isCheckOut
    ? transaction.checkOutDefPercentage
    : transaction.checkInDefPercentage;
  const kwh = isCheckOut ? transaction.checkOutKWH : transaction.checkInKWH;

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

  return (
    <div className="modal-backdrop delete-tx-backdrop" onClick={onCancel}>
      <div
        className="modal-box delete-tx-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
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

        {/* Transaction Details Table */}
        <div className="values-table-wrap delete-tx-details">
          <table className="values-table">
            <tbody>
              <tr>
                <td className="lbl">Asset</td>
                <td className="val font-equipment-id" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>{asset.equipmentId}</span>
                  <EquipmentTypeIcon type={asset.type} size={20} />
                </td>
              </tr>
              <tr>
                <td className="lbl">Type</td>
                <td className="val" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <TransactionTypeIcon type={transaction.transactionType} size={20} />
                  <span>{getReadableType(transaction.transactionType)}</span>
                </td>
              </tr>
              <tr>
                <td className="lbl">Recorded</td>
                <td className="val">
                  {formatPdaTimestamp(transaction.transactionTimestamp)}
                </td>
              </tr>
              {isFuelTransfer && (
                <>
                  {transaction.fuelTransferLitres !== undefined && (
                    <tr>
                      <td className="lbl">Fuel Transferred</td>
                      <td className="val">{transaction.fuelTransferLitres} L</td>
                    </tr>
                  )}
                  {transaction.defTransferLitres !== undefined && (
                    <tr>
                      <td className="lbl">DEF Transferred</td>
                      <td className="val">{transaction.defTransferLitres} L</td>
                    </tr>
                  )}
                </>
              )}
              {(isCheckIn || isCheckOut) && (
                <>
                  {fuelPct !== undefined && (
                    <tr>
                      <td className="lbl">Fuel Level</td>
                      <td className="val">{fuelPct}%</td>
                    </tr>
                  )}
                  {fuelEighths !== undefined && (
                    <tr>
                      <td className="lbl">Fuel (Eighths)</td>
                      <td className="val">{fuelEighths}/8</td>
                    </tr>
                  )}
                  {defPct !== undefined && (
                    <tr>
                      <td className="lbl">DEF Level</td>
                      <td className="val">{defPct}%</td>
                    </tr>
                  )}
                  {kwh !== undefined && (
                    <tr>
                      <td className="lbl">Meter (kWh)</td>
                      <td className="val">{kwh}</td>
                    </tr>
                  )}
                </>
              )}
              {isPowerEvent && (
                <tr>
                  <td className="lbl">Power Status</td>
                  <td
                    className="val"
                    style={{
                      fontWeight: 700,
                      color: transaction.transactionType === 'PoweredUp' ? '#16A34A' : '#DC2626',
                    }}
                  >
                    {transaction.transactionType === 'PoweredUp' ? 'Powered Up' : 'Powered Down'}
                  </td>
                </tr>
              )}
              {transaction.deviceId && (
                <tr>
                  <td className="lbl">Device</td>
                  <td className="val">{transaction.deviceId}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Warning Alert */}
        <div className="delete-tx-warning-box">
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>This will permanently delete this record from the database.</span>
        </div>

        {/* Buttons: Delete & Cancel */}
        <div className="modal-buttons-row">
          <button
            type="button"
            className="btn-modal-confirm btn-pda-red"
            onClick={onConfirm}
          >
            <Trash2 size={20} />
            <span>Delete</span>
          </button>

          <button
            type="button"
            className="btn-modal-cancel btn-pda-slate"
            onClick={onCancel}
          >
            <IconCancel size={20} />
            <span>Cancel</span>
          </button>
        </div>
      </div>
    </div>
  );
};
