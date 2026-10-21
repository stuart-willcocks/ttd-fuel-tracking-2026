import React from 'react';
import { X, Sparkles, CheckCircle2 } from 'lucide-react';
import { APP_VERSION } from '../version';

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

        {/* Retain only the Close button at the bottom */}
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
