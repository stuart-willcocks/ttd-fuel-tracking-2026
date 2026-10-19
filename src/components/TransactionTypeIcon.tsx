import React from 'react';
import { Power, PowerOff, Clock } from 'lucide-react';
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
      <img
        src="/assets/checkin-6.png"
        alt="Check In"
        width={size}
        height={size}
        className={`tx-png-icon ${className}`}
        title={title || 'Check In'}
      />
    );
  }

  if (t.includes('CheckOut') || t === 'check-out') {
    return (
      <img
        src="/assets/checkout-6.png"
        alt="Check Out"
        width={size}
        height={size}
        className={`tx-png-icon ${className}`}
        title={title || 'Check Out'}
      />
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
      <img
        src="/assets/refuel-6.png"
        alt="Fuel Transfer"
        width={size}
        height={size}
        className={`tx-png-icon ${className}`}
        title={title || 'Fuel Transfer'}
      />
    );
  }

  return (
    <span className={`tx-type-icon-wrapper ${className}`} title={title || 'Transaction'}>
      <Clock size={size} className="tx-type-icon" />
    </span>
  );
};
