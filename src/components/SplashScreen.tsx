import React, { useState } from 'react';
import { getDeviceId, getDeviceName, setDeviceName } from '../services/device';
import { BUILD_NUMBER, BUILD_TIME } from '../version';

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
    <div className="old-splash-screen">
      <div className="old-splash-content">
        {/* Top Build Number */}
        <div className="old-splash-build-top">{BUILD_NUMBER}</div>

        {/* Title: The Technical Department <newline> Fuel Tracking */}
        <div className="old-splash-title-block">
          <h1 className="old-splash-main-title">The Technical Department</h1>
          <h2 className="old-splash-sub-title">Fuel Tracking</h2>
        </div>

        {/* Event & Version Tag */}
        <div className="old-splash-event-block">
          <h3 className="old-splash-event-name">Silverstone 2026</h3>
          <div className="old-splash-event-code">{BUILD_TIME?.replace(/[- :]/g, '').slice(0, 9) || '20261019E'}</div>
        </div>

        {/* Diagnostics & Initialization Log */}
        <div className="old-splash-log-box">
          <div className="log-line">Starting...</div>
          <div className="log-line">Checking tables...</div>
          <div className="log-line">Equipment table exists.</div>
          <div className="log-line">Transaction table exists.</div>
          <div className="log-line">Downloaded transaction table exists.</div>
          <div className="log-line">Equipment upload table exists.</div>
          <div className="log-line">device_id table exists.</div>
          <div className="log-line device-id-line">
            device_id is <strong>{deviceName}</strong>
          </div>
        </div>

        {/* Device Switcher Chips */}
        <div className="old-splash-pda-row">
          {PRESET_PDAS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`old-splash-pda-chip ${deviceName === preset ? 'active' : ''}`}
              onClick={() => handleSelectPreset(preset)}
            >
              {preset}
            </button>
          ))}
        </div>

        <div className="old-splash-hw-id">
          <span>Token: <code>{persistentId.slice(0, 18)}...</code></span>
        </div>

        {/* Continue Button: Light Grey, Rectangular, Center-Justified */}
        <div className="old-splash-btn-row">
          <button
            type="button"
            className="old-splash-btn-continue"
            onClick={onContinue}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};
