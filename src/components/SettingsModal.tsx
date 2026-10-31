import React, { useState, useEffect } from 'react';
import { X, RefreshCw, Battery, BatteryCharging } from 'lucide-react';
import { APP_VERSION } from '../version';
import { getDeviceId } from '../services/device';
import {
  getBatteryStatus,
  getCachedTelemetryStatus,
} from '../services/telemetry';
import { checkRemoteAppVersion } from '../services/appUpdate';

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
  const [liveHasUpdate, setLiveHasUpdate] = useState<boolean>(hasUpdate);
  const [liveAvailableVersion, setLiveAvailableVersion] = useState<string | null>(availableVersion);

  const currentDeviceId = getDeviceId();

  useEffect(() => {
    setLiveHasUpdate(hasUpdate);
    setLiveAvailableVersion(availableVersion);
  }, [hasUpdate, availableVersion]);

  useEffect(() => {
    if (isOpen) {
      setTelemetry(getCachedTelemetryStatus());
      getBatteryStatus().then((b) => {
        if (b) setBatteryInfo(b);
      }).catch(() => {});
      checkRemoteAppVersion()
        .then((res) => {
          if (res.hasUpdate) {
            setLiveHasUpdate(true);
            if (res.remoteVersion) setLiveAvailableVersion(res.remoteVersion);
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const formatVersionTag = (v: string | number) => {
    const s = String(v).trim();
    return s.startsWith('V') || s.startsWith('v') ? `V${s.slice(1)}` : `V${s}`;
  };

  const currentVerStr = formatVersionTag(APP_VERSION);
  const effectiveAvailable = liveAvailableVersion || availableVersion;
  const availableVerStr = effectiveAvailable ? formatVersionTag(effectiveAvailable) : null;
  const canUpdate = Boolean((liveHasUpdate || hasUpdate) && availableVerStr);

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

        {/* Consolidated Device ID, Battery, GPS Location & Version Tile */}
        <div className="settings-device-card">
          <div className="settings-card-rows">
            {/* Device ID Row */}
            <div className="settings-info-row">
              <span className="settings-row-label">Device ID</span>
              <span className="settings-row-value settings-row-mono">
                {currentDeviceId || 'UNREGISTERED'}
              </span>
            </div>

            {!currentDeviceId && onOpenEnrollment ? (
              <button
                type="button"
                className="btn-pda-rect"
                style={{ marginTop: '4px', height: '38px', fontSize: '13px', color: '#000000', borderColor: '#EC721E', background: '#EC721E', fontWeight: 700 }}
                onClick={() => {
                  onClose();
                  onOpenEnrollment();
                }}
              >
                Pair Scanner
              </button>
            ) : null}

            {/* Battery Row */}
            <div className="settings-info-row">
              <span className="settings-row-label">Battery</span>
              <span className="settings-row-value" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                {batteryInfo?.isCharging ? <BatteryCharging size={15} color="#10B981" /> : <Battery size={15} color="#10B981" />}
                <span>{batteryInfo ? `${batteryInfo.batteryLevel}%${batteryInfo.isCharging ? ' (Charging)' : ''}` : 'Reading...'}</span>
              </span>
            </div>

            {/* GPS Location Row */}
            <div className="settings-info-row">
              <span className="settings-row-label">GPS Location</span>
              <span className="settings-row-value" style={{ color: telemetry.cachedLocation ? '#2563EB' : 'var(--text-muted)' }}>
                {telemetry.cachedLocation
                  ? `${telemetry.cachedLocation.latitude}, ${telemetry.cachedLocation.longitude} (±${telemetry.cachedLocation.locationAccuracy}m)`
                  : (telemetry.lastLocationError || 'Waiting for fix...')}
              </span>
            </div>

            {/* Current Version Row */}
            <div className="settings-info-row">
              <span className="settings-row-label">Current version</span>
              <span className="settings-row-value settings-row-mono">{currentVerStr}</span>
            </div>

            <button
              type="button"
              className={`btn-pda-rect ${canUpdate ? 'btn-pda-green' : 'settings-update-btn-disabled'} settings-update-btn`}
              disabled={!canUpdate || isUpdating}
              onClick={() => {
                if (!canUpdate) return;
                setIsUpdating(true);
                onUpdate();
              }}
            >
              {isUpdating ? (
                <>
                  <RefreshCw size={14} className="spinning" />
                  <span>Applying Update...</span>
                </>
              ) : canUpdate ? (
                <span>Update to {availableVerStr}</span>
              ) : (
                <span>Update</span>
              )}
            </button>
          </div>
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
