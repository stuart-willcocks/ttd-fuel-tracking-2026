import React, { useState, useEffect, useCallback } from 'react';
import { getDeviceName } from '../services/device';
import { APP_VERSION, BUILD_NUMBER } from '../version';

interface SplashScreenProps {
  onContinue: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onContinue }) => {
  const deviceName = getDeviceName();
  const [isCheckingUpdate, setIsCheckingUpdate] = useState<boolean>(true);
  const [updateStatus, setUpdateStatus] = useState<string>('Checking for updates...');

  const checkForUpdates = useCallback(async () => {
    try {
      // 1. Service Worker update check
      if ('serviceWorker' in navigator) {
        try {
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

            if (reg.installing) {
              setUpdateStatus('Applying update...');
              const worker = reg.installing;
              worker.addEventListener('statechange', () => {
                if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                  worker.postMessage({ type: 'SKIP_WAITING' });
                  navigator.serviceWorker.addEventListener('controllerchange', () => {
                    window.location.reload();
                  });
                }
              });
            }
          }
        } catch (swErr) {
          console.warn('Service worker check error:', swErr);
        }
      }

      // 2. Remote version.json check
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
          const remoteVersionData = await res.json();
          if (remoteVersionData.build && remoteVersionData.build > BUILD_NUMBER) {
            setUpdateStatus('Applying update...');
            if ('serviceWorker' in navigator) {
              const reg = await navigator.serviceWorker.getRegistration();
              if (reg && reg.waiting) {
                reg.waiting.postMessage({ type: 'SKIP_WAITING' });
              }
            }
            window.location.reload();
            return;
          }
        }
      } catch {
        // Ignore network errors for version check
      }

      // Brief pause so user visibly sees the update check
      await new Promise((resolve) => setTimeout(resolve, 800));
      setUpdateStatus('App is up to date');
    } catch {
      setUpdateStatus('App is ready');
    } finally {
      setIsCheckingUpdate(false);
    }
  }, []);

  useEffect(() => {
    checkForUpdates();
  }, [checkForUpdates]);

  return (
    <div className="splash-screen">
      <div className="splash-container">
        {/* Technical Department Ltd Logo */}
        <div className="splash-logo-wrap">
          <img
            src="/logo-01.png"
            alt="The Technical Department Ltd"
            className="splash-logo"
          />
        </div>

        {/* Title Block: The Technical Department Ltd <newline> Fuel Tracking App */}
        <div className="splash-title-block">
          <h1 className="splash-main-title">The Technical Department Ltd</h1>
          <h2 className="splash-sub-title">Fuel Tracking App</h2>
          {/* Version number shown ONLY beneath "Fuel Tracking App" */}
          <div className="splash-version">Version {APP_VERSION}</div>
        </div>

        {/* Device ID & Update Status Indication */}
        <div className="splash-status-block">
          <div className="splash-device-line">
            Device ID: <strong>{deviceName}</strong>
          </div>
          <div className="splash-update-line">
            {isCheckingUpdate ? (
              <span className="splash-checking-text">
                <span className="splash-spinner" /> Checking for updates...
              </span>
            ) : (
              <span className="splash-ready-text">
                {updateStatus}
              </span>
            )}
          </div>
        </div>

        {/* Continue Button */}
        <div className="splash-btn-wrap">
          <button
            type="button"
            className={`splash-btn-continue ${isCheckingUpdate ? 'disabled' : ''}`}
            disabled={isCheckingUpdate}
            onClick={onContinue}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};
