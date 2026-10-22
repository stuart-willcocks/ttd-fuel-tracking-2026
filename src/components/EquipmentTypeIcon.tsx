import React from 'react';
import { IconGenerator, IconTank, IconPlant } from './icons/AppIcons';

interface EquipmentTypeIconProps {
  type: string;
  size?: number;
  className?: string;
  color?: string;
}

export const EquipmentTypeIcon: React.FC<EquipmentTypeIconProps> = ({
  type,
  size = 24,
  className = '',
  color = '#EC721E',
}) => {
  const normalized = (type || '').toUpperCase();

  if (normalized === 'GENERATOR' || normalized.includes('GEN')) {
    return (
      <span className={`eq-icon-wrap eq-generator ${className}`} title="Generator" style={{ color }}>
        <IconGenerator size={size} color={color} />
      </span>
    );
  }

  if (normalized === 'TANK' || normalized.includes('TNK')) {
    return (
      <span className={`eq-icon-wrap eq-tank ${className}`} title="Fuel Tank" style={{ color }}>
        <IconTank size={size} color={color} />
      </span>
    );
  }

  // Plant machinery / vehicles (forklift, telehandler, etc.)
  return (
    <span className={`eq-icon-wrap eq-plant ${className}`} title="Plant Equipment" style={{ color }}>
      <IconPlant size={size} color={color} />
    </span>
  );
};
