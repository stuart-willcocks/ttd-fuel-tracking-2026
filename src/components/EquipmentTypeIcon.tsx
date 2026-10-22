import React from 'react';
import { IconGenerator, IconTank, IconPlant } from './icons/AppIcons';

interface EquipmentTypeIconProps {
  type: string;
  size?: number;
  className?: string;
}

export const EquipmentTypeIcon: React.FC<EquipmentTypeIconProps> = ({
  type,
  size = 24,
  className = '',
}) => {
  const normalized = (type || '').toUpperCase();

  if (normalized === 'GENERATOR' || normalized.includes('GEN')) {
    return (
      <span className={`eq-icon-wrap eq-generator ${className}`} title="Generator">
        <IconGenerator size={size} />
      </span>
    );
  }

  if (normalized === 'TANK' || normalized.includes('TNK')) {
    return (
      <span className={`eq-icon-wrap eq-tank ${className}`} title="Fuel Tank">
        <IconTank size={size} />
      </span>
    );
  }

  // Plant machinery / vehicles (forklift, telehandler, etc.)
  return (
    <span className={`eq-icon-wrap eq-plant ${className}`} title="Plant Equipment">
      <IconPlant size={size} />
    </span>
  );
};
