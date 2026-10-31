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
      <span className={`tx-type-icon-wrapper ${className}`} title={title || 'Check In'} style={{ color: '#16A34A' }}>
        <IconCheckIn size={size} color="#16A34A" className="tx-type-icon" />
      </span>
    );
  }

  if (t.includes('CheckOut') || t === 'check-out') {
    return (
      <span className={`tx-type-icon-wrapper ${className}`} title={title || 'Check Out'} style={{ color: '#DC2626' }}>
        <IconCheckOut size={size} color="#DC2626" className="tx-type-icon" />
      </span>
    );
  }

  if (t === 'PoweredUp' || t === 'power-up') {
    return (
      <span className={`tx-type-icon-wrapper ${className}`} title={title || 'Powered Up'} style={{ color: '#16A34A' }}>
        <Power size={size} color="#16A34A" className="tx-type-icon icon-powerup" />
      </span>
    );
  }

  if (t === 'PoweredDown' || t === 'power-down') {
    return (
      <span className={`tx-type-icon-wrapper ${className}`} title={title || 'Powered Down'} style={{ color: '#DC2626' }}>
        <PowerOff size={size} color="#DC2626" className="tx-type-icon icon-powerdown" />
      </span>
    );
  }

  if (t.includes('FuelTransfer') || t.includes('Fuel') || t === 'record-fuel') {
    return (
      <span className={`tx-type-icon-wrapper ${className}`} title={title || 'Fuel Transfer'} style={{ color: '#2563EB' }}>
        <IconFuel size={size} color="#2563EB" className="tx-type-icon" />
      </span>
    );
  }

  return (
    <span className={`tx-type-icon-wrapper ${className}`} title={title || 'Transaction'}>
      <Clock size={size} className="tx-type-icon" />
    </span>
  );
};
