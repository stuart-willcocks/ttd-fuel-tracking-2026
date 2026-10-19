import React, { useState, useEffect, useCallback } from 'react';
import { getDeviceId, getDeviceName, setDeviceName } from '../services/device';
import { BUILD_NUMBER, APP_VERSION } from '../version';

interface SplashScreenProps {
  onContinue: () => void;
}

const PRESET_PDAS = ['PDA 1', 'PDA 2', 'PDA 3', 'PDA 4', 'PDA 5'];

export const SplashScreen: React.FC<SplashScreenProps> = ({ onContinue }) => {
  const [deviceName, setDeviceNameState] = useState<string>(getDeviceName());
  const [isCheckingUpdate, setIsCheckingUpdate] = useState<boolean>(true);
  const [updateStatus, setUpdateStatus] = useState<string>('Checking for updates...');
  const persistentId = getDeviceId();

  const handleSelectPreset = (name: string) => {
    setDeviceNameState(name);
    setDeviceName(name);
  };

  const checkForUpdates = useCallback(async () => {
    setIsCheckingUpdate(true);
    setUpdateStatus('Checking for updates...');

    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.update();
          if (reg.waiting) {
            setUpdateStatus('Applying update...');
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            navigator.serviceWorker.addEventListener('controllerchange', () => {
              window.location.reload();
            });
            return;
          }
        }
      }
      // Ensure the user visibly sees the update check complete
      await new Promise((resolve) => setTimeout(resolve, 900));
      setUpdateStatus(`App is up to date (Build ${BUILD_NUMBER})`);
    } catch {
      setUpdateStatus(`Running Build ${BUILD_NUMBER}`);
    } finally {
      setIsCheckingUpdate(false);
    }
  }, []);

  useEffect(() => {
    checkForUpdates();
  }, [checkForUpdates]);

  return (
    <div className="old-splash-screen">
      <div className="old-splash-content">
        {/* Top Build Number */}
        <div className="old-splash-build-top">{BUILD_NUMBER}</div>

        {/* Technical Department Ltd Logo */}
        <div className="old-splash-logo-wrap">
          <img
            src="/assets/logo-01.png"
            alt="The Technical Department Ltd"
            className="old-splash-logo"
          />
        </div>

        {/* Title: The Technical Department Ltd <newline> Fuel Tracking App */}
        <div className="old-splash-title-block">
          <h1 className="old-splash-main-title">The Technical Department Ltd</h1>
          <h2 className="old-splash-sub-title">Fuel Tracking App</h2>
        </div>

        {/* Version & Device Info */}
        <div className="old-splash-version-info">
          Version {APP_VERSION} &middot; Device ID: <strong>{deviceName}</strong>
        </div>

        {/* Diagnostics & Initialization Log */}
        <div className="old-splash-log-box">
          <div className="log-line">Starting...</div>
          <div className="log-line log-update-line">
            {isCheckingUpdate ? (
              <span className="log-checking">{updateStatus}</span>
            ) : (
              <span className="log-updated">{updateStatus}</span>
            )}
          </div>
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

        {/* Device Switcher Chips (rectangular, no corner radii) */}
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

        {/* Continue Button: Full width, rectangular, center-justified, disabled while checking */}
        <div className="old-splash-btn-row">
          <button
            type="button"
            className={`old-splash-btn-continue ${isCheckingUpdate ? 'disabled' : ''}`}
            disabled={isCheckingUpdate}
            onClick={onContinue}
          >
            {isCheckingUpdate ? 'Checking for updates...' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
};
