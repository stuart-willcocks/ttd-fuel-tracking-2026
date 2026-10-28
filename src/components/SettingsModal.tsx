import React from 'react';
import { X, Sparkles, CheckCircle2, Smartphone, Check } from 'lucide-react';
import { APP_VERSION } from '../version';
import { getDeviceId, getDeviceName } from '../services/device';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  hasUpdate: boolean;
  availableVersion: string | null;
  onUpdate: () => void;
  onDeregister?: () => void;
  onOpenEnrollment?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  hasUpdate,
  availableVersion,
  onUpdate,
  onDeregister,
  onOpenEnrollment,
}) => {
  const currentDeviceId = getDeviceId();
  const currentDeviceName = getDeviceName();

  if (!isOpen) return null;

  const formatVersionTag = (v: string | number) => {
    const s = String(v).trim();
    return s.startsWith('V') || s.startsWith('v') ? `V${s.slice(1)}` : `V${s}`;
  };

  const currentVerStr = formatVersionTag(APP_VERSION);
  const availableVerStr = availableVersion ? formatVersionTag(availableVersion) : null;

  const versionText = hasUpdate && availableVerStr
    ? `Current version: ${currentVerStr} (${availableVerStr} is available)`
    : `Current version: ${currentVerStr} (latest)`;

  const handleDeregisterClick = () => {
    if (window.confirm(`Deregister this PDA (${currentDeviceId})? You will need to re-scan the Admin Enrollment QR code to use this scanner again.`)) {
      onClose();
      onDeregister?.();
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-box settings-modal-box"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header-simple">
          <h3 className="modal-title">Settings</h3>
          <button
            type="button"
            className="btn-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Device ID & Authorization Card */}
        <div className="settings-device-card">
          <div className="settings-card-label-row">
            <Smartphone size={16} className="settings-card-icon" />
            <span className="settings-card-label">PDA Device ID</span>
            {currentDeviceId ? (
              <span className="settings-saved-pill" style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#16A34A', borderColor: 'rgba(34, 197, 94, 0.3)' }}>
                <Check size={12} />
                <span>Authorized</span>
              </span>
            ) : (
              <span className="settings-saved-pill" style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#EAB308', borderColor: 'rgba(234, 179, 8, 0.3)' }}>
                <span>Unregistered</span>
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
            <div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                {currentDeviceId || 'UNREGISTERED'}
              </div>
              {currentDeviceName && currentDeviceName !== currentDeviceId && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {currentDeviceName}
                </div>
              )}
            </div>
            {currentDeviceId && onDeregister ? (
              <button
                type="button"
                className="btn-pda-rect"
                style={{ padding: '6px 10px', fontSize: '0.78rem', color: '#EF4444', borderColor: '#EF4444', background: 'transparent' }}
                onClick={handleDeregisterClick}
              >
                Deregister
              </button>
            ) : onOpenEnrollment ? (
              <button
                type="button"
                className="btn-pda-rect"
                style={{ padding: '6px 12px', fontSize: '0.78rem', color: '#000000', borderColor: '#EC721E', background: '#EC721E', fontWeight: 800 }}
                onClick={() => {
                  onClose();
                  onOpenEnrollment();
                }}
              >
                Pair Scanner
              </button>
            ) : null}
          </div>
          <div className="settings-card-helper" style={{ marginTop: '8px' }}>
            {currentDeviceId
              ? 'Permanently assigned at registration. Recorded with all transactions.'
              : 'Pair with Admin Console QR code to permanently identify this PDA.'}
          </div>
        </div>

        {/* App Version & Update Card */}
        <div className="settings-version-card">
          <div className="settings-version-status-row">
            {hasUpdate ? (
              <Sparkles size={20} className="update-available-icon" />
            ) : (
              <CheckCircle2 size={20} className="update-latest-icon" />
            )}
            <div className="settings-version-text">{versionText}</div>
          </div>

          {hasUpdate && availableVerStr && (
            <button
              type="button"
              className="btn-pda-rect btn-pda-green settings-update-btn"
              onClick={onUpdate}
            >
              Update to {availableVerStr}
            </button>
          )}
        </div>

        {/* Close Button */}
        <div className="modal-buttons-row">
          <button
            type="button"
            className="btn-pda-rect btn-pda-blue"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
