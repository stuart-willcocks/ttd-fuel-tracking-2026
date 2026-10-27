import React, { useState, useEffect } from 'react';
import { Laptop, Smartphone, AlertTriangle, ArrowRight, Eye } from 'lucide-react';
import { isMobileDevice, getDeviceClassification } from '../../utils/deviceDetector';

interface LaptopOnlyGuardProps {
  children: React.ReactNode;
}

export const LaptopOnlyGuard: React.FC<LaptopOnlyGuardProps> = ({ children }) => {
  const [isRestrictedMobile, setIsRestrictedMobile] = useState<boolean>(() => {
    return isMobileDevice();
  });

  const [bypassLockout, setBypassLockout] = useState<boolean>(false);

  useEffect(() => {
    const handleDeviceCheck = () => {
      setIsRestrictedMobile(isMobileDevice());
    };

    window.addEventListener('resize', handleDeviceCheck);
    return () => window.removeEventListener('resize', handleDeviceCheck);
  }, []);

  if (isRestrictedMobile && !bypassLockout) {
    const devInfo = getDeviceClassification();

    return (
      <div className="laptop-guard-overlay">
        <div className="laptop-guard-card">
          <div className="laptop-guard-icon">
            <Laptop size={36} />
          </div>

          <div className="laptop-guard-badge">
            <AlertTriangle size={15} />
            <span>MOBILE HANDHELD DETECTED (USE SCANNER APP)</span>
          </div>

          <h2 className="laptop-guard-title">Workstation Display Required</h2>

          <p className="laptop-guard-text">
            The <strong>TTD Fuel Tracking Admin Portal</strong> is designed for laptop, desktop, and Microsoft Surface workstations. It provides comprehensive data tables, telemetry analytics, and equipment management tools.
          </p>

          <p className="laptop-guard-text" style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
            Current device: <em>{devInfo.reason}</em>. Field technicians should use the dedicated Zebra Mobile Field App.
          </p>

          <div className="laptop-guard-actions" style={{ marginTop: '20px' }}>
            <a
              href="/"
              className="admin-btn admin-btn-primary admin-btn-lg"
              style={{ width: '100%', gap: '10px' }}
            >
              <Smartphone size={18} />
              <span>Open Zebra Mobile Field App</span>
              <ArrowRight size={16} />
            </a>

            <button
              onClick={() => setBypassLockout(true)}
              className="admin-btn admin-btn-outline admin-btn-sm"
              style={{ width: '100%', marginTop: '6px' }}
            >
              <Eye size={15} />
              <span>Override Lockout for Developer Preview</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
