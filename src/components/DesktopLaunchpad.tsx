import React from 'react';
import { Smartphone, ExternalLink, ShieldCheck, ArrowRight, LayoutDashboard } from 'lucide-react';

interface DesktopLaunchpadProps {
  popupState: 'launched' | 'blocked' | 'idle';
  onLaunch: () => void;
  onContinueInTab: () => void;
}

export const DesktopLaunchpad: React.FC<DesktopLaunchpadProps> = ({
  popupState,
  onLaunch,
  onContinueInTab,
}) => {
  const isLaunched = popupState === 'launched';

  return (
    <div className="desktop-launchpad-wrap">
      <div className="desktop-launchpad-card">
        {/* Device Icon Header */}
        <div className="desktop-launchpad-icon-box">
          <div className="desktop-launchpad-icon-ring">
            <Smartphone size={38} className="desktop-launchpad-phone-icon" />
          </div>
          <span className={`desktop-launchpad-status-pill ${isLaunched ? 'status-active' : 'status-ready'}`}>
            <span className="status-dot" />
            <span>{isLaunched ? 'Detached Window Active' : 'Zebra TC26 Emulation Ready'}</span>
          </span>
        </div>

        {/* Title & Description */}
        <h1 className="desktop-launchpad-title">TTD Fuel Tracking</h1>
        <p className="desktop-launchpad-subtitle">
          {isLaunched
            ? 'The handheld field scanner is currently running in its dedicated, locked PDA window.'
            : 'The field scanner is designed for a dedicated handheld window (360 × 640) detached from standard browser tabs.'}
        </p>

        {/* Main Action Buttons */}
        <div className="desktop-launchpad-actions">
          <button
            type="button"
            className="desktop-launchpad-primary-btn"
            onClick={onLaunch}
          >
            <ExternalLink size={16} />
            <span>{isLaunched ? 'Bring Detached Window to Front' : 'Launch Detached PDA Window'}</span>
          </button>

          <a
            href="/admin.html"
            className="desktop-launchpad-secondary-btn"
          >
            <LayoutDashboard size={15} />
            <span>Open Fleet Admin Portal</span>
            <ArrowRight size={14} className="launchpad-arrow" />
          </a>
        </div>

        {/* Browser Permission Tip */}
        <div className="desktop-launchpad-notice">
          <ShieldCheck size={16} className="launchpad-notice-icon" />
          <div className="launchpad-notice-text">
            <strong>Auto-Launch Tip:</strong> When prompted in your browser address bar, choose{' '}
            <em>&quot;Always allow pop-ups and redirects&quot;</em> so this window automatically detaches whenever you enter the URL.
          </div>
        </div>

        {/* In-tab Fallback */}
        <div className="desktop-launchpad-footer">
          <button
            type="button"
            className="desktop-launchpad-link-btn"
            onClick={onContinueInTab}
          >
            Continue using in this browser tab instead
          </button>
        </div>
      </div>
    </div>
  );
};
