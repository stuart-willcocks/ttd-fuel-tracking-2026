import React, { useState, useEffect } from 'react';
import { X, Sparkles, CheckCircle2, Smartphone, Check } from 'lucide-react';
import { APP_VERSION } from '../version';
import { getDeviceId, setDeviceId } from '../services/device';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  hasUpdate: boolean;
  availableVersion: string | null;
  onUpdate: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  hasUpdate,
  availableVersion,
  onUpdate,
}) => {
  const [deviceIdInput, setDeviceIdInput] = useState<string>('');
  const [isSaved, setIsSaved] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setDeviceIdInput(getDeviceId());
      setIsSaved(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveDeviceId = (valToSave?: string) => {
    const val = (valToSave !== undefined ? valToSave : deviceIdInput).trim();
    if (val) {
      setDeviceId(val);
      setDeviceIdInput(val);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    }
  };

  const handleDeviceIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDeviceIdInput(val);
    if (val.trim()) {
      setDeviceId(val.trim());
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 1500);
    }
  };

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

        {/* Device ID Display & Edit */}
        <div className="settings-device-card">
          <div className="settings-card-label-row">
            <Smartphone size={16} className="settings-card-icon" />
            <span className="settings-card-label">Device ID</span>
            {isSaved && (
              <span className="settings-saved-pill">
                <Check size={12} />
                <span>Saved</span>
              </span>
            )}
          </div>
          <div className="settings-input-row">
            <input
              type="text"
              className="settings-device-input"
              value={deviceIdInput}
              onChange={handleDeviceIdChange}
              onBlur={() => handleSaveDeviceId()}
              placeholder="e.g. TC26-01"
              spellCheck={false}
              autoComplete="off"
            />
            <button
              type="button"
              className="btn-pda-rect btn-pda-blue settings-device-save-btn"
              onClick={() => handleSaveDeviceId()}
            >
              Save
            </button>
          </div>
          <div className="settings-card-helper">
            Identifies all transactions uploaded from this handheld unit.
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
            onClick={() => {
              handleSaveDeviceId();
              onClose();
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
