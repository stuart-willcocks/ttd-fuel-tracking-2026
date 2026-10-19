import React, { useState } from 'react';
import { Smartphone, ArrowRight, ShieldCheck, Fuel } from 'lucide-react';
import { getDeviceId, getDeviceName, setDeviceName } from '../services/device';
import { APP_VERSION } from '../version';

interface SplashScreenProps {
  onContinue: () => void;
}

const PRESET_PDAS = ['PDA 1', 'PDA 2', 'PDA 3', 'PDA 4', 'PDA 5'];

export const SplashScreen: React.FC<SplashScreenProps> = ({ onContinue }) => {
  const [deviceName, setDeviceNameState] = useState<string>(getDeviceName());
  const persistentId = getDeviceId();

  const handleSelectPreset = (name: string) => {
    setDeviceNameState(name);
    setDeviceName(name);
  };

  return (
    <div className="splash-screen">
      {/* Centered Tonal Container */}
      <div className="splash-card">
        {/* Brand Icon / Glyph */}
        <div className="splash-icon-wrapper">
          <div className="splash-icon-circle">
            <Fuel size={36} className="splash-brand-icon" />
          </div>
        </div>

        {/* App Title: The Technical Department Ltd <newline> Fuel Tracking App */}
        <div className="splash-title-block">
          <h1 className="splash-company-name">The Technical Department Ltd</h1>
          <h2 className="splash-app-name">Fuel Tracking App</h2>
        </div>

        {/* Version Badge */}
        <div className="splash-version-row">
          <span className="splash-version-badge">Version {APP_VERSION}</span>
        </div>

        {/* Device ID Section */}
        <div className="splash-device-card">
          <div className="splash-device-header">
            <div className="splash-device-label-group">
              <Smartphone size={16} className="splash-device-icon" />
              <span className="splash-device-title">Device Identifier</span>
            </div>
            <span className="splash-device-active-badge">{deviceName}</span>
          </div>

          <div className="splash-device-pills">
            {PRESET_PDAS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`splash-pda-chip ${deviceName === preset ? 'active' : ''}`}
                onClick={() => handleSelectPreset(preset)}
              >
                {preset}
              </button>
            ))}
          </div>

          <div className="splash-device-sub">
            <span>Hardware Token: </span>
            <code>{persistentId}</code>
          </div>
        </div>

        {/* Big tactile "Continue" Action Button */}
        <button
          type="button"
          className="splash-btn-continue"
          onClick={onContinue}
        >
          <span>Continue</span>
          <ArrowRight size={18} />
        </button>

        {/* Footer verification note */}
        <div className="splash-footer-note">
          <ShieldCheck size={13} />
          <span>Industrial Zebra Handheld Edition</span>
        </div>
      </div>
    </div>
  );
};
