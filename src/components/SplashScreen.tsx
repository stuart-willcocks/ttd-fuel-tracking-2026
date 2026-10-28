import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getDeviceName } from '../services/device';
import { APP_VERSION, BUILD_NUMBER, getIsStaging } from '../version';
import { checkRemoteAppVersion, performAppUpdate } from '../services/appUpdate';

interface SplashScreenProps {
  onContinue: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onContinue }) => {
  const deviceName = getDeviceName();
  const isStaging = getIsStaging();
  const [versionText, setVersionText] = useState<string>('Checking for updates...');
  const [isContinueEnabled, setIsContinueEnabled] = useState<boolean>(false);
  const isCheckingRef = useRef<boolean>(false);

  const checkForUpdates = useCallback(async (isInitial: boolean = false) => {
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;

    // 1. Check if we just completed an update reload
    if (isInitial) {
      if (typeof window !== 'undefined' && window.location.search.includes('v=')) {
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete('v');
          const cleanSearch = url.searchParams.toString();
          window.history.replaceState({}, '', url.pathname + (cleanSearch ? `?${cleanSearch}` : '') + url.hash);
        } catch {}
      }
      try {
        const justUpdatedVersion = sessionStorage.getItem('ttd_just_updated_to');
        if (justUpdatedVersion) {
          sessionStorage.removeItem('ttd_just_updated_to');
          setVersionText(`Updated to version ${justUpdatedVersion}`);
          setIsContinueEnabled(true);
          isCheckingRef.current = false;
          return;
        }
      } catch {
        // Ignore sessionStorage error
      }
    }

    try {
      const check = await checkRemoteAppVersion();

      if (check.hasUpdate) {
        const finalVersion = check.remoteVersion || String(BUILD_NUMBER + 1);
        setVersionText(`Downloading update (Version ${finalVersion})...`);
        await new Promise((r) => setTimeout(r, 600));
        setVersionText(`Applying update to version ${finalVersion}...`);
        await performAppUpdate(finalVersion);
        return;
      }

      // App is already the latest version
      if (isInitial) {
        await new Promise((r) => setTimeout(r, 400));
      }
      setVersionText((prev) => (prev.startsWith('Updated to version') ? prev : `Version ${APP_VERSION}`));
      setIsContinueEnabled(true);
    } catch {
      // Offline fallback
      setVersionText((prev) => (prev.startsWith('Updated to version') ? prev : `Version ${APP_VERSION}`));
      setIsContinueEnabled(true);
    } finally {
      isCheckingRef.current = false;
    }
  }, []);

  useEffect(() => {
    // Initial check on load
    checkForUpdates(true);

    // Periodically check for version updates while on splash screen (every 10 seconds)
    const timer = setInterval(() => {
      checkForUpdates(false);
    }, 10000);

    return () => {
      clearInterval(timer);
    };
  }, [checkForUpdates]);

  const handleContinueClick = () => {
    onContinue();
  };

  return (
    <div className="splash-screen">
      <div className="splash-container">
        {/* Upper Block: Logo and Title (moved up by ~1/5 screen height) */}
        <div className="splash-top-block">
          <div className="splash-logo-wrap">
            <img
              src="/logo-01.png"
              alt="The Technical Department Ltd"
              className="splash-logo"
            />
          </div>

          <div className="splash-title-block">
            <h1 className="splash-main-title">The Technical Department Ltd</h1>
            <h2 className="splash-sub-title">Fuel Tracking App{isStaging ? ' (STAGING)' : ''}</h2>
          </div>
        </div>

        {/* Lower Text Block: Version/Update Status line & Device ID line (moved down by ~1/5 screen height, lighter weight) */}
        <div className="splash-lower-text-block">
          <div className="splash-version-status-line">
            {versionText}
          </div>
          <div className="splash-device-line">
            Device ID: <strong>{deviceName}</strong>
          </div>
        </div>

        {/* Bottom Button Block: enabled only when all update activity is completed */}
        <div className="splash-btn-wrap">
          <button
            type="button"
            className={`splash-btn-continue ${!isContinueEnabled ? 'disabled' : ''}`}
            disabled={!isContinueEnabled}
            onClick={handleContinueClick}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};
