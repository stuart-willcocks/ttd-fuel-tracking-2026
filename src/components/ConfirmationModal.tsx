import React from 'react';
import { IconSubmit, IconCancel } from './icons/AppIcons';
import type { Equipment, Transaction } from '../types';
import { EquipmentTypeIcon } from './EquipmentTypeIcon';
import { TransactionTypeIcon } from './TransactionTypeIcon';

interface ConfirmationModalProps {
  asset: Equipment;
  transactionData: Partial<Transaction>;
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  asset,
  transactionData,
  isOpen,
  onCancel,
  onConfirm,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-box">
        <h3 className="modal-title">Confirm Submission</h3>
        <p className="modal-subtitle">
          Verify entered values for {asset.equipmentId}:
        </p>

        <div className="values-table-wrap">
          <table className="values-table">
            <tbody>
              <tr>
                <td className="lbl">Asset</td>
                <td className="val font-equipment-id" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>{asset.equipmentId}</span>
                  <EquipmentTypeIcon type={asset.type} size={24} />
                </td>
              </tr>
              <tr>
                <td className="lbl">Type</td>
                <td className="val">
                  <TransactionTypeIcon type={transactionData.transactionType} size={24} />
                </td>
              </tr>
              {transactionData.checkInFuelPercentage !== undefined && (
                <tr>
                  <td className="lbl">Check-In Fuel</td>
                  <td className="val">{transactionData.checkInFuelPercentage}%</td>
                </tr>
              )}
              {transactionData.checkOutFuelPercentage !== undefined && (
                <tr>
                  <td className="lbl">Check-Out Fuel</td>
                  <td className="val">{transactionData.checkOutFuelPercentage}%</td>
                </tr>
              )}
              {transactionData.checkInFuelEighths !== undefined && (
                <tr>
                  <td className="lbl">Check-In Fuel</td>
                  <td className="val">{transactionData.checkInFuelEighths} / 8</td>
                </tr>
              )}
              {transactionData.checkOutFuelEighths !== undefined && (
                <tr>
                  <td className="lbl">Check-Out Fuel</td>
                  <td className="val">{transactionData.checkOutFuelEighths} / 8</td>
                </tr>
              )}
              {transactionData.checkInDefPercentage !== undefined && (
                <tr>
                  <td className="lbl">Check-In DEF</td>
                  <td className="val">{transactionData.checkInDefPercentage}%</td>
                </tr>
              )}
              {transactionData.checkOutDefPercentage !== undefined && (
                <tr>
                  <td className="lbl">Check-Out DEF</td>
                  <td className="val">{transactionData.checkOutDefPercentage}%</td>
                </tr>
              )}
              {transactionData.checkInKWH !== undefined && (
                <tr>
                  <td className="lbl">Check-In kWh</td>
                  <td className="val">{transactionData.checkInKWH.toLocaleString()} kWh</td>
                </tr>
              )}
              {transactionData.checkOutKWH !== undefined && (
                <tr>
                  <td className="lbl">Check-Out kWh</td>
                  <td className="val">{transactionData.checkOutKWH.toLocaleString()} kWh</td>
                </tr>
              )}
              {transactionData.fuelTransferLitres !== undefined && (
                <tr>
                  <td className="lbl">Fuel Transferred</td>
                  <td className="val font-bold">+{transactionData.fuelTransferLitres} Litres</td>
                </tr>
              )}
              {transactionData.defTransferLitres !== undefined && (
                <tr>
                  <td className="lbl">DEF Transferred</td>
                  <td className="val font-bold">+{transactionData.defTransferLitres} Litres</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Cancel and Confirm buttons */}
        <div className="modal-buttons-row">
          <button className="btn-modal-confirm" onClick={onConfirm}>
            <IconSubmit size={24} />
            <span>Confirm & Save</span>
          </button>
          <button className="btn-modal-cancel" onClick={onCancel}>
            <IconCancel size={24} />
            <span>Cancel</span>
          </button>
        </div>
      </div>
    </div>
  );
};
