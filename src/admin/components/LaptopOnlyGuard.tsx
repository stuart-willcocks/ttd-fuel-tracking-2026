import React, { useState, useEffect } from 'react';
import { Laptop, Smartphone, AlertTriangle, ArrowRight, Eye } from 'lucide-react';

interface LaptopOnlyGuardProps {
  children: React.ReactNode;
}

export const LaptopOnlyGuard: React.FC<LaptopOnlyGuardProps> = ({ children }) => {
  const [isMobileScreen, setIsMobileScreen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 1024;
  });

  const [bypassLockout, setBypassLockout] = useState<boolean>(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobileScreen(window.innerWidth < 1024);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (isMobileScreen && !bypassLockout) {
    return (
      <div className="laptop-guard-overlay">
        <div className="laptop-guard-card">
          <div className="laptop-guard-icon">
            <Laptop size={36} />
          </div>

          <div className="laptop-guard-badge">
            <AlertTriangle size={15} />
            <span>LAPTOP / WORKSTATION ONLY (MIN 1024px)</span>
          </div>

          <h2 className="laptop-guard-title">Workstation Display Required</h2>

          <p className="laptop-guard-text">
            The <strong>TTD Fleet Administrator Portal</strong> is designed exclusively for laptop and desktop screens. It provides comprehensive data tables, fleet telemetry analytics, and asset CRUD controls that require a wider display.
          </p>

          <p className="laptop-guard-text" style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
            If you are a field technician using a <strong>Zebra TC26 Handheld</strong> or mobile smartphone, please use the Field Scanner App.
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
