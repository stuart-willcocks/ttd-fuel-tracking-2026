import React, { useState } from 'react';
import { Power, PowerOff, Calendar } from 'lucide-react';
import { IconCancel } from './icons/AppIcons';
import type { Equipment } from '../types';
import { formatPdaTimestamp } from '../utils/dateFormat';

interface PowerEventModalProps {
  asset: Equipment;
  type: 'PoweredUp' | 'PoweredDown';
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: (timestamp: string) => void;
}

function getLocalDateTimeString(date: Date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export const PowerEventModal: React.FC<PowerEventModalProps> = ({
  asset,
  type,
  isOpen,
  onCancel,
  onConfirm,
}) => {
  const [selectedDateTime, setSelectedDateTime] = useState<string>(getLocalDateTimeString);

  if (!isOpen) return null;

  const isPowerUp = type === 'PoweredUp';

  const handleResetToNow = () => {
    setSelectedDateTime(getLocalDateTimeString(new Date()));
  };

  const handleConfirm = () => {
    if (!selectedDateTime) {
      onConfirm(new Date().toISOString());
      return;
    }
    const d = new Date(selectedDateTime);
    const isoString = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
    onConfirm(isoString);
  };

  const displayFormatted = (() => {
    try {
      if (!selectedDateTime) return '—';
      const d = new Date(selectedDateTime);
      return isNaN(d.getTime()) ? '—' : formatPdaTimestamp(d);
    } catch {
      return '—';
    }
  })();

  return (
    <div className="modal-backdrop">
      <div className="modal-box power-modal-box">
        {/* Header with power icon & title */}
        <div className="power-modal-header">
          {isPowerUp ? (
            <span className="power-modal-icon-wrap power-up">
              <Power size={26} color="#16A34A" />
            </span>
          ) : (
            <span className="power-modal-icon-wrap power-down">
              <PowerOff size={26} color="#DC2626" />
            </span>
          )}
          <div>
            <h3 className="modal-title" style={{ margin: 0 }}>
              {isPowerUp ? 'Mark Powered Up' : 'Mark Powered Down'}
            </h3>
            <p className="modal-subtitle" style={{ margin: '2px 0 0 0' }}>
              Asset <strong>{asset.equipmentId}</strong>
            </p>
          </div>
        </div>

        {/* Picker section */}
        <div className="power-modal-content">
          <label className="power-modal-label" htmlFor="power-datetime-input">
            <Calendar size={16} />
            <span>Select Date and Time</span>
          </label>

          <div className="power-input-row">
            <input
              id="power-datetime-input"
              type="datetime-local"
              className="power-datetime-input"
              value={selectedDateTime}
              onChange={(e) => setSelectedDateTime(e.target.value)}
            />
            <button
              type="button"
              className="btn-power-now"
              onClick={handleResetToNow}
              title="Reset to current date and time"
            >
              Current Time
            </button>
          </div>

          <div className="power-preview-card">
            <span className="power-preview-label">Recorded Time:</span>
            <span className="power-preview-value">{displayFormatted}</span>
          </div>
        </div>

        {/* Buttons: Confirm & Cancel */}
        <div className="modal-buttons-row">
          <button
            type="button"
            className={`btn-modal-confirm ${isPowerUp ? 'btn-pda-green' : 'btn-pda-slate'}`}
            onClick={handleConfirm}
          >
            {isPowerUp ? <Power size={22} /> : <PowerOff size={22} />}
            <span>{isPowerUp ? 'Confirm Power Up' : 'Confirm Power Down'}</span>
          </button>

          <button
            type="button"
            className="btn-modal-cancel btn-pda-red"
            onClick={onCancel}
          >
            <IconCancel size={22} />
            <span>Cancel</span>
          </button>
        </div>
      </div>
    </div>
  );
};
