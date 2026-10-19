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
} from 'lucide-react';
import type { Equipment, Transaction, ActionType } from '../types';
import { formatHumanTimestamp } from '../utils/dateFormat';

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

  // Helper for Transaction Type icon
  const renderTxTypeIcon = (type: string) => {
    if (type.includes('CheckIn')) {
      return <LogIn size={13} className="tx-type-icon icon-checkin" />;
    }
    if (type.includes('CheckOut')) {
      return <LogOut size={13} className="tx-type-icon icon-checkout" />;
    }
    if (type === 'PoweredUp') {
      return <Power size={13} className="tx-type-icon icon-powerup" />;
    }
    if (type === 'PoweredDown') {
      return <PowerOff size={13} className="tx-type-icon icon-powerdown" />;
    }
    if (type.includes('FuelTransfer') || type.includes('Fuel')) {
      return <Fuel size={13} className="tx-type-icon icon-fueltransfer" />;
    }
    return <Clock size={13} className="tx-type-icon" />;
  };

  return (
    <div className="transaction-view asset-detail-view">
      {/* Top Navigation: Scan Another Asset Button */}
      <div className="top-nav-bar">
        <button className="btn-back" onClick={onBackToScanner}>
          <ArrowLeft size={16} />
          <span>Scan Another Asset</span>
        </button>
      </div>

      {/* 1. ASSET_DETAIL_VIEW (Fields: ID, what3words, type, serial number, area, location) */}
      <div className="asset-detail-card">
        <div className="card-title-row">
          <h2 className="equipment-id">{asset.equipmentId}</h2>
          <span className="type-tag">{asset.type}</span>
        </div>

        <table className="info-table">
          <tbody>
            <tr>
              <td className="info-label">Asset ID</td>
              <td className="info-value">{asset.equipmentId}</td>
            </tr>
            <tr>
              <td className="info-label">what3words</td>
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
              <td className="info-label">Asset Type</td>
              <td className="info-value">{asset.type}</td>
            </tr>
            <tr>
              <td className="info-label">Serial Number</td>
              <td className="info-value">{asset.rentalSerialNumber}</td>
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

      {/* 2. TRANSACTION_LIST_VIEW (Directly beneath ASSET_DETAIL_VIEW, most recent at top) */}
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
                  <div className="tx-item-top-left">
                    {renderTxTypeIcon(tx.transactionType)}
                    <span className="tx-type">{tx.transactionType}</span>
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
                      <span>Fuel In: {tx.checkInFuelPercentage}%</span>
                    </span>
                  )}
                  {tx.checkOutFuelPercentage !== undefined && (
                    <span className="val-badge">
                      <Fuel size={12} className="data-icon icon-fuel" />
                      <span>Fuel Out: {tx.checkOutFuelPercentage}%</span>
                    </span>
                  )}
                  {tx.checkInFuelEighths !== undefined && (
                    <span className="val-badge">
                      <Gauge size={12} className="data-icon icon-gauge" />
                      <span>Tank In: {tx.checkInFuelEighths}/8</span>
                    </span>
                  )}
                  {tx.checkOutFuelEighths !== undefined && (
                    <span className="val-badge">
                      <Gauge size={12} className="data-icon icon-gauge" />
                      <span>Tank Out: {tx.checkOutFuelEighths}/8</span>
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
                      <span>Fuel Added: {tx.fuelTransferLitres} L</span>
                    </span>
                  )}
                  {tx.defTransferLitres !== undefined && (
                    <span className="val-badge highlight">
                      <Droplets size={12} className="data-icon icon-def" />
                      <span>DEF Added: {tx.defTransferLitres} L</span>
                    </span>
                  )}
                  {tx.checkInKWH !== undefined && (
                    <span className="val-badge">
                      <Zap size={12} className="data-icon icon-kwh" />
                      <span>Meter In: {tx.checkInKWH} kWh</span>
                    </span>
                  )}
                  {tx.checkOutKWH !== undefined && (
                    <span className="val-badge">
                      <Zap size={12} className="data-icon icon-kwh" />
                      <span>Meter Out: {tx.checkOutKWH} kWh</span>
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
          Check In
        </button>

        <button
          className="btn-menu-action"
          onClick={() => onSelectAction('record-fuel')}
        >
          Record Fuel Transfer
        </button>

        <button
          className="btn-menu-action"
          onClick={() => onSelectAction('check-out')}
        >
          Check Out
        </button>

        <button
          className="btn-menu-action btn-menu-edit"
          onClick={onEditEquipment}
        >
          <Edit3 size={13} style={{ marginRight: 4 }} />
          <span>Edit Equipment Details</span>
        </button>
      </div>
    </div>
  );
};

export { TransactionView as AssetDetailView };
