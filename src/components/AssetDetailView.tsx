import React from 'react';
import { ArrowLeft, Clock, Power, PowerOff, CheckCircle2, CloudOff } from 'lucide-react';
import type { Equipment, Transaction, ActionType } from '../types';

interface AssetDetailViewProps {
  asset: Equipment;
  transactions: Transaction[];
  onBackToScanner: () => void;
  onSelectAction: (action: ActionType) => void;
  onEditEquipment: () => void;
  onPowerToggle: (action: 'PoweredUp' | 'PoweredDown') => void;
}

export const AssetDetailView: React.FC<AssetDetailViewProps> = ({
  asset,
  transactions,
  onBackToScanner,
  onSelectAction,
  onEditEquipment,
  onPowerToggle,
}) => {
  const isGenerator = asset.type === 'GENERATOR';

  const capacityLabel = asset.capacity
    ? isGenerator
      ? `${asset.capacity} kVA`
      : `${asset.capacity.toLocaleString()} L`
    : '—';

  const isPoweredOn = Boolean(asset.poweredUpTimestamp && !asset.poweredDownTimestamp);

  return (
    <div className="asset-detail-view">
      {/* Top back button */}
      <div className="top-nav-bar">
        <button className="btn-back" onClick={onBackToScanner}>
          <ArrowLeft size={16} />
          <span>Scan Another Asset</span>
        </button>
      </div>

      {/* Equipment Information (Lines 85-87 of brief) */}
      <div className="equipment-info-card">
        <div className="card-title-row">
          <h2 className="equipment-id">{asset.equipmentId}</h2>
          <span className="type-tag">{asset.type}</span>
        </div>

        <table className="info-table">
          <tbody>
            <tr>
              <td className="info-label">Area</td>
              <td className="info-value">{asset.area}</td>
            </tr>
            <tr>
              <td className="info-label">Location</td>
              <td className="info-value">{asset.location}</td>
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
              <td className="info-label">Capacity / Size</td>
              <td className="info-value">{capacityLabel}</td>
            </tr>
            <tr>
              <td className="info-label">Rental S/N</td>
              <td className="info-value">{asset.rentalSerialNumber}</td>
            </tr>
            {isGenerator && (
              <>
                <tr>
                  <td className="info-label">Power Up Time</td>
                  <td className="info-value">{asset.poweredUpTimestamp || '—'}</td>
                </tr>
                <tr>
                  <td className="info-label">Power Down Time</td>
                  <td className="info-value">{asset.poweredDownTimestamp || '—'}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>

        {/* Generator power toggle */}
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

      {/* Transaction History (Lines 89 of brief) */}
      <div className="history-block">
        <div className="history-header">
          <h3 className="sub-title">Transaction History</h3>
          <span className="count-label">{transactions.length} records</span>
        </div>

        {transactions.length === 0 ? (
          <div className="empty-history">No transactions recorded yet for this asset.</div>
        ) : (
          <div className="tx-list">
            {transactions.map((tx) => (
              <div key={tx.id} className="tx-item">
                <div className="tx-item-top">
                  <span className="tx-type">{tx.transactionType}</span>
                  <span className="tx-timestamp">
                    <Clock size={11} /> {tx.transactionTimestamp}
                  </span>
                </div>

                <div className="tx-values">
                  {tx.checkInFuelPercentage !== undefined && (
                    <span>Fuel In: {tx.checkInFuelPercentage}%</span>
                  )}
                  {tx.checkOutFuelPercentage !== undefined && (
                    <span>Fuel Out: {tx.checkOutFuelPercentage}%</span>
                  )}
                  {tx.checkInFuelEighths !== undefined && (
                    <span>Tank In: {tx.checkInFuelEighths}/8</span>
                  )}
                  {tx.checkOutFuelEighths !== undefined && (
                    <span>Tank Out: {tx.checkOutFuelEighths}/8</span>
                  )}
                  {tx.checkInDefPercentage !== undefined && (
                    <span>DEF In: {tx.checkInDefPercentage}%</span>
                  )}
                  {tx.checkOutDefPercentage !== undefined && (
                    <span>DEF Out: {tx.checkOutDefPercentage}%</span>
                  )}
                  {tx.fuelTransferLitres !== undefined && (
                    <span className="highlight">Fuel Added: {tx.fuelTransferLitres} L</span>
                  )}
                  {tx.defTransferLitres !== undefined && (
                    <span className="highlight">DEF Added: {tx.defTransferLitres} L</span>
                  )}
                  {tx.checkInKWH !== undefined && (
                    <span>Meter In: {tx.checkInKWH} kWh</span>
                  )}
                  {tx.checkOutKWH !== undefined && (
                    <span>Meter Out: {tx.checkOutKWH} kWh</span>
                  )}
                </div>

                <div className="tx-item-status">
                  {tx.syncStatus === 'synced' ? (
                    <span className="sync-tag synced">
                      <CheckCircle2 size={11} /> Synced
                    </span>
                  ) : (
                    <span className="sync-tag pending">
                      <CloudOff size={11} /> Offline Queue
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Menu Action Buttons (Lines 91 of brief) */}
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
          Edit Equipment Details
        </button>
      </div>
    </div>
  );
};
