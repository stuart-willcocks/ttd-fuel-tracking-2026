import React from 'react';
import { Zap, Cylinder, Wrench } from 'lucide-react';

interface EquipmentTypeIconProps {
  type: string;
  size?: number;
  className?: string;
}

export const EquipmentTypeIcon: React.FC<EquipmentTypeIconProps> = ({
  type,
  size = 16,
  className = '',
}) => {
  const normalized = (type || '').toUpperCase();

  if (normalized === 'GENERATOR' || normalized.includes('GEN')) {
    return (
      <span className={`eq-icon-wrap eq-generator ${className}`} title="Generator">
        <Zap size={size} />
      </span>
    );
  }

  if (normalized === 'TANK' || normalized.includes('TNK')) {
    return (
      <span className={`eq-icon-wrap eq-tank ${className}`} title="Fuel Tank">
        <Cylinder size={size} />
      </span>
    );
  }

  // Plant machinery / vehicles (telehandler, light tower, etc.)
  return (
    <span className={`eq-icon-wrap eq-plant ${className}`} title="Plant Equipment">
      <Wrench size={size} />
    </span>
  );
};
