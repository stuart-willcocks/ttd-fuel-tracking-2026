import React from 'react';
import {
  ArrowLeft,
  Clock,
  Power,
  PowerOff,
  CheckCircle2,
  CloudOff,
  Edit3,
  LogIn,
  LogOut,
  Fuel,
  Droplets,
  Zap,
  Gauge,
  QrCode,
} from 'lucide-react';
import type { Equipment, Transaction, ActionType } from '../types';
import { formatHumanTimestamp } from '../utils/dateFormat';
import { EquipmentTypeIcon } from './EquipmentTypeIcon';
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
    <div className="transaction-view asset-detail-view">
      {/* Top Navigation: "BACK" button (white text on green, no corner radii) */}
      <div className="top-nav-bar">
        <button className="btn-back-green" onClick={onBackToScanner}>
          <ArrowLeft size={16} />
          <span>BACK</span>
        </button>
      </div>

      {/* 1. ASSET_DETAIL_VIEW (QR icon for ID, /// for location, Equipment Type Icon instead of text) */}
      <div className="asset-detail-card">
        <div className="card-title-row">
          <div className="card-title-left">
            <QrCode size={18} className="qr-title-icon" />
            <h2 className="equipment-id">{asset.equipmentId}</h2>
          </div>
          {/* Equipment Type Icon instead of the words GENERATOR, TANK, PLANT */}
          <span className="type-icon-box">
            <EquipmentTypeIcon type={asset.type} size={18} />
          </span>
        </div>

        <table className="info-table">
          <tbody>
            <tr>
              <td className="info-label">
                <span className="info-label-icon-wrap" title="Asset ID">
                  <QrCode size={15} className="info-label-icon" />
                </span>
              </td>
              <td className="info-value font-mono">{asset.equipmentId}</td>
            </tr>
            <tr>
              <td className="info-label font-bold text-w3w">///</td>
              <td className="info-value">
                <a
                  href={`https://what3words.com/${asset.what3words.replace('///', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w3w-link"
                >
                  {asset.what3words}
                </a>
              </td>
            </tr>
            <tr>
              <td className="info-label">Type</td>
              <td className="info-value">
                <span className="type-icon-inline">
                  <EquipmentTypeIcon type={asset.type} size={16} />
                </span>
              </td>
            </tr>
            <tr>
              <td className="info-label">Serial Number</td>
              <td className="info-value font-mono">{asset.rentalSerialNumber}</td>
            </tr>
            <tr>
              <td className="info-label">Area</td>
              <td className="info-value">{asset.area}</td>
            </tr>
            <tr>
              <td className="info-label">Location</td>
              <td className="info-value">{asset.location}</td>
            </tr>
            {isGenerator && (
              <>
                <tr>
                  <td className="info-label">Power Up Time</td>
                  <td className="info-value">{formatHumanTimestamp(asset.poweredUpTimestamp)}</td>
                </tr>
                <tr>
                  <td className="info-label">Power Down Time</td>
                  <td className="info-value">{formatHumanTimestamp(asset.poweredDownTimestamp)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>

        {/* Generator power toggle control */}
        {isGenerator && (
          <div className="power-control-row">
            <span className="power-status-text">
              Status: <strong>{isPoweredOn ? 'RUNNING' : 'STOPPED'}</strong>
            </span>
            {isPoweredOn ? (
              <button
                className="btn-power power-off"
                onClick={() => onPowerToggle('PoweredDown')}
              >
                <PowerOff size={14} />
                <span>Power Down</span>
              </button>
            ) : (
              <button
                className="btn-power power-on"
                onClick={() => onPowerToggle('PoweredUp')}
              >
                <Power size={14} />
                <span>Power Up</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* 2. TRANSACTION_LIST_VIEW (Transaction Type: icon only, no words) */}
      <div className="transaction-list-card">
        <div className="history-header">
          <h3 className="sub-title">Transaction List</h3>
          <span className="count-label">{transactions.length} records</span>
        </div>

        {transactions.length === 0 ? (
          <div className="empty-history">No transactions recorded yet for this asset.</div>
        ) : (
          <div className="tx-list">
            {transactions.map((tx) => (
              <div key={tx.id} className="tx-item">
                <div className="tx-item-top">
                  {/* Transaction Type: Icon only (no words) */}
                  <div className="tx-item-top-left">
                    <span className="tx-type-icon-box">
                      <TransactionTypeIcon type={tx.transactionType} size={15} />
                    </span>
                    {tx.deviceId && (
                      <span className="tx-pda-tag" title={`Executed on ${tx.deviceId}`}>
                        {tx.deviceId}
                      </span>
                    )}
                  </div>

                  <div className="tx-item-top-right">
                    <span className="tx-timestamp">
                      <Clock size={11} /> {formatHumanTimestamp(tx.transactionTimestamp)}
                    </span>
                    {/* Omit the word "synced" from the sync status indicator */}
                    {tx.syncStatus === 'synced' ? (
                      <span className="sync-tag-icon synced" title="Synced to cloud">
                        <CheckCircle2 size={13} />
                      </span>
                    ) : (
                      <span className="sync-tag-icon pending" title="Offline Queue">
                        <CloudOff size={13} />
                      </span>
                    )}
                  </div>
                </div>

                {/* Data values with required icons for fuel amount, DEF amount, kWh reading */}
                <div className="tx-values">
                  {tx.checkInFuelPercentage !== undefined && (
                    <span className="val-badge">
                      <Fuel size={12} className="data-icon icon-fuel" />
                      <span>In: {tx.checkInFuelPercentage}%</span>
                    </span>
                  )}
                  {tx.checkOutFuelPercentage !== undefined && (
                    <span className="val-badge">
                      <Fuel size={12} className="data-icon icon-fuel" />
                      <span>Out: {tx.checkOutFuelPercentage}%</span>
                    </span>
                  )}
                  {tx.checkInFuelEighths !== undefined && (
                    <span className="val-badge">
                      <Gauge size={12} className="data-icon icon-gauge" />
                      <span>In: {tx.checkInFuelEighths}/8</span>
                    </span>
                  )}
                  {tx.checkOutFuelEighths !== undefined && (
                    <span className="val-badge">
                      <Gauge size={12} className="data-icon icon-gauge" />
                      <span>Out: {tx.checkOutFuelEighths}/8</span>
                    </span>
                  )}
                  {tx.checkInDefPercentage !== undefined && (
                    <span className="val-badge">
                      <Droplets size={12} className="data-icon icon-def" />
                      <span>DEF In: {tx.checkInDefPercentage}%</span>
                    </span>
                  )}
                  {tx.checkOutDefPercentage !== undefined && (
                    <span className="val-badge">
                      <Droplets size={12} className="data-icon icon-def" />
                      <span>DEF Out: {tx.checkOutDefPercentage}%</span>
                    </span>
                  )}
                  {tx.fuelTransferLitres !== undefined && (
                    <span className="val-badge highlight">
                      <Fuel size={12} className="data-icon icon-fuel" />
                      <span>+{tx.fuelTransferLitres} L</span>
                    </span>
                  )}
                  {tx.defTransferLitres !== undefined && (
                    <span className="val-badge highlight">
                      <Droplets size={12} className="data-icon icon-def" />
                      <span>+{tx.defTransferLitres} L</span>
                    </span>
                  )}
                  {tx.checkInKWH !== undefined && (
                    <span className="val-badge">
                      <Zap size={12} className="data-icon icon-kwh" />
                      <span>In: {tx.checkInKWH} kWh</span>
                    </span>
                  )}
                  {tx.checkOutKWH !== undefined && (
                    <span className="val-badge">
                      <Zap size={12} className="data-icon icon-kwh" />
                      <span>Out: {tx.checkOutKWH} kWh</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action Buttons: Consistent rectangular styling, equal height, consistent text size */}
      <div className="menu-actions-grid">
        <button
          className="btn-menu-action"
          onClick={() => onSelectAction('check-in')}
        >
          <LogIn size={15} style={{ marginRight: 6 }} />
          <span>Check In</span>
        </button>

        <button
          className="btn-menu-action"
          onClick={() => onSelectAction('record-fuel')}
        >
          <Fuel size={15} style={{ marginRight: 6 }} />
          <span>Record Fuel Transfer</span>
        </button>

        <button
          className="btn-menu-action"
          onClick={() => onSelectAction('check-out')}
        >
          <LogOut size={15} style={{ marginRight: 6 }} />
          <span>Check Out</span>
        </button>

        <button
          className="btn-menu-action btn-menu-edit"
          onClick={onEditEquipment}
        >
          <Edit3 size={15} style={{ marginRight: 6 }} />
          <span>Edit Equipment Details</span>
        </button>
      </div>
    </div>
  );
};

export { TransactionView as AssetDetailView };
