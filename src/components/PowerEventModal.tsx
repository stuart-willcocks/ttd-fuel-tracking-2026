import React, { useState, useEffect } from 'react';
import { Power, PowerOff } from 'lucide-react';
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

export const PowerEventModal: React.FC<PowerEventModalProps> = ({
  asset,
  type,
  isOpen,
  onCancel,
  onConfirm,
}) => {
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date());

  useEffect(() => {
    if (!isOpen) return;
    setCurrentTime(new Date());
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const isPowerUp = type === 'PoweredUp';

  const handleConfirm = () => {
    onConfirm(new Date().toISOString());
  };

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

        {/* Current UK Time Display */}
        <div className="power-modal-content">
          <div className="power-preview-card">
            <span className="power-preview-label">Current UK Time</span>
            <span className="power-preview-value">{formatPdaTimestamp(currentTime)}</span>
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
