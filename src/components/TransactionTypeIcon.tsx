import React from 'react';
import { Power, PowerOff, Clock } from 'lucide-react';
import { IconCheckIn, IconCheckOut, IconFuel } from './icons/AppIcons';
import type { TransactionType } from '../types';

interface TransactionTypeIconProps {
  type?: TransactionType | string;
  size?: number;
  className?: string;
  title?: string;
}

export const TransactionTypeIcon: React.FC<TransactionTypeIconProps> = ({
  type = '',
  size = 24,
  className = '',
  title,
}) => {
  const t = (type || '').toString();

  if (t.includes('CheckIn') || t === 'check-in') {
    return (
      <span className={`tx-type-icon-wrapper ${className}`} title={title || 'Check In'}>
        <IconCheckIn size={size} className="tx-type-icon" />
      </span>
    );
  }

  if (t.includes('CheckOut') || t === 'check-out') {
    return (
      <span className={`tx-type-icon-wrapper ${className}`} title={title || 'Check Out'}>
        <IconCheckOut size={size} className="tx-type-icon" />
      </span>
    );
  }

  if (t === 'PoweredUp') {
    return (
      <span className={`tx-type-icon-wrapper ${className}`} title={title || 'Power Up'}>
        <Power size={size} className="tx-type-icon icon-powerup" />
      </span>
    );
  }

  if (t === 'PoweredDown') {
    return (
      <span className={`tx-type-icon-wrapper ${className}`} title={title || 'Power Down'}>
        <PowerOff size={size} className="tx-type-icon icon-powerdown" />
      </span>
    );
  }

  if (t.includes('FuelTransfer') || t.includes('Fuel') || t === 'record-fuel') {
    return (
      <span className={`tx-type-icon-wrapper ${className}`} title={title || 'Fuel Transfer'}>
        <IconFuel size={size} className="tx-type-icon" />
      </span>
    );
  }

  return (
    <span className={`tx-type-icon-wrapper ${className}`} title={title || 'Transaction'}>
      <Clock size={size} className="tx-type-icon" />
    </span>
  );
};
