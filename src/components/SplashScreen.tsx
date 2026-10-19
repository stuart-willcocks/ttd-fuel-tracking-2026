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
      <div className="splash-card">
        {/* Brand Icon */}
        <div className="splash-icon-wrapper">
          <div className="splash-icon-square">
            <Fuel size={36} className="splash-brand-icon" />
          </div>
        </div>

        {/* App Title: The Technical Department Ltd <newline> Fuel Tracking App */}
        <div className="splash-title-block">
          <h1 className="splash-company-name">The Technical Department Ltd</h1>
          <h2 className="splash-app-name">Fuel Tracking App</h2>
        </div>

        {/* Version */}
        <div className="splash-version-row">
          <span className="splash-version-box">Version {APP_VERSION}</span>
        </div>

        {/* Device ID Display & Switcher */}
        <div className="splash-device-card">
          <div className="splash-device-header">
            <Smartphone size={15} className="splash-device-icon" />
            <span className="splash-device-title">Device ID:</span>
            <span className="splash-device-active-box">{deviceName}</span>
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

        {/* Continue Button - Simple Rectangular, no corner radii, center justified */}
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
