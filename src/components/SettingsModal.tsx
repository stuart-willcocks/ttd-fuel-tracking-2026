import React, { useState, useEffect } from 'react';
import { X, Sparkles, CheckCircle2, Smartphone, Check, RefreshCw, Navigation, Battery, BatteryCharging } from 'lucide-react';
import { APP_VERSION } from '../version';
import { getDeviceId, getDeviceName } from '../services/device';
import {
  getBatteryStatus,
  getCachedTelemetryStatus,
} from '../services/telemetry';

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
  onOpenEnrollment,
}) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [telemetry, setTelemetry] = useState(() => getCachedTelemetryStatus());
  const [batteryInfo, setBatteryInfo] = useState<{ batteryLevel: number; isCharging: boolean } | null>(null);

  const currentDeviceId = getDeviceId();
  const currentDeviceName = getDeviceName();

  useEffect(() => {
    if (isOpen) {
      setTelemetry(getCachedTelemetryStatus());
      getBatteryStatus().then((b) => {
        if (b) setBatteryInfo(b);
      }).catch(() => {});
    }
  }, [isOpen]);

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
            {!currentDeviceId && onOpenEnrollment ? (
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
        </div>

        {/* Hardware Telemetry Card */}
        <div className="settings-device-card" style={{ marginTop: '12px' }}>
          <div className="settings-card-label-row">
            <Navigation size={16} className="settings-card-icon" style={{ color: '#3B82F6' }} />
            <span className="settings-card-label">Hardware Telemetry</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
            {/* Battery Row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Battery</span>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                {batteryInfo?.isCharging ? <BatteryCharging size={16} color="#10B981" /> : <Battery size={16} color="#10B981" />}
                {batteryInfo ? `${batteryInfo.batteryLevel}% ${batteryInfo.isCharging ? '(Charging)' : ''}` : 'Reading...'}
              </span>
            </div>

            {/* GPS Location Row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>GPS Location</span>
              <span style={{ fontWeight: 700, color: telemetry.cachedLocation ? '#2563EB' : 'var(--text-secondary)', textAlign: 'right' }}>
                {telemetry.cachedLocation
                  ? `${telemetry.cachedLocation.latitude}, ${telemetry.cachedLocation.longitude} (±${telemetry.cachedLocation.locationAccuracy}m)`
                  : (telemetry.lastLocationError || 'Waiting for fix...')}
              </span>
            </div>
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
              disabled={isUpdating}
              onClick={() => {
                setIsUpdating(true);
                onUpdate();
              }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              {isUpdating ? (
                <>
                  <RefreshCw size={14} className="spinning" />
                  <span>Applying Update...</span>
                </>
              ) : (
                <span>Update to {availableVerStr}</span>
              )}
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
