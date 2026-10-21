import React from 'react';

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  className?: string;
  strokeWidth?: number | string;
  color?: string;
}

// 1) Check In
export const IconCheckIn: React.FC<IconProps> = ({
  size = 24,
  className = '',
  strokeWidth = 2,
  color = 'currentColor',
  ...props
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" />
    <polyline points="10 17 15 12 10 7" />
    <line x1="15" y1="12" x2="3" y2="12" />
  </svg>
);

// 2) Check Out
export const IconCheckOut: React.FC<IconProps> = ({
  size = 24,
  className = '',
  strokeWidth = 2,
  color = 'currentColor',
  ...props
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5" />
    <polyline points="14 17 19 12 14 7" />
    <line x1="19" y1="12" x2="7" y2="12" />
  </svg>
);

// 3) Fuel (Transfer / Dispenser)
export const IconFuel: React.FC<IconProps> = ({
  size = 24,
  className = '',
  strokeWidth = 2,
  color = 'currentColor',
  ...props
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <rect x="3" y="4" width="10" height="16" rx="2" />
    <rect x="5.5" y="7" width="5" height="4" rx="0.5" />
    <path d="M13 8h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V8.5a1.5 1.5 0 0 0-2.5-1.1L16 8.5" />
    <line x1="2" y1="20" x2="14" y2="20" />
  </svg>
);

// 4) Back / Return
export const IconBack: React.FC<IconProps> = ({
  size = 24,
  className = '',
  strokeWidth = 2,
  color = 'currentColor',
  ...props
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <path d="M19 12H5" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

// 5) Submit / Confirm
export const IconSubmit: React.FC<IconProps> = ({
  size = 24,
  className = '',
  strokeWidth = 2.5,
  color = 'currentColor',
  ...props
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// 6) Cancel / Dismiss
export const IconCancel: React.FC<IconProps> = ({
  size = 24,
  className = '',
  strokeWidth = 2.5,
  color = 'currentColor',
  ...props
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// 7) Generator (Industrial Canopy Genset with lifting lug, panel, vents, skid)
export const IconGenerator: React.FC<IconProps> = ({
  size = 24,
  className = '',
  strokeWidth = 2,
  color = 'currentColor',
  ...props
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M10 6V4a2 2 0 0 1 4 0v2" />
    <path d="M6 10h4v4H6z" />
    <path d="M14 9.5h4M14 12h4M14 14.5h4" />
    <path d="M2 18h20v2H2z" />
  </svg>
);

// 8) Plant (Simplified forklift truck profile)
export const IconPlant: React.FC<IconProps> = ({
  size = 24,
  className = '',
  strokeWidth = 2,
  color = 'currentColor',
  ...props
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <line x1="18" y1="4" x2="18" y2="18" />
    <path d="M17 18h5" />
    <path d="M4 14h10v-3l-3-4H8a2 2 0 0 0-2 2v5Z" />
    <path d="M4 14H3a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h2" />
    <circle cx="6" cy="18" r="2" />
    <circle cx="14" cy="18" r="2" />
  </svg>
);
export const IconForklift = IconPlant;

// 9) Tank (Fuel tank / bowser mounted on towable trailer)
export const IconTank: React.FC<IconProps> = ({
  size = 24,
  className = '',
  strokeWidth = 2,
  color = 'currentColor',
  ...props
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <rect x="5" y="5" width="13" height="9" rx="3.5" />
    <path d="M10 5V3h3v2" />
    <path d="M3 15h15l4 3" />
    <circle cx="22" cy="18" r="0.75" />
    <path d="M8 15a3.5 3.5 0 0 1 7 0" />
    <circle cx="11.5" cy="18.5" r="2.5" />
  </svg>
);
export const IconTrailerTank = IconTank;
