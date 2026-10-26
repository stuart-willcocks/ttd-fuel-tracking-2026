import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getDeviceName } from '../services/device';
import { APP_VERSION, BUILD_NUMBER } from '../version';

interface SplashScreenProps {
  onContinue: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onContinue }) => {
  const deviceName = getDeviceName();
  const [versionText, setVersionText] = useState<string>('Checking for updates...');
  const [isContinueEnabled, setIsContinueEnabled] = useState<boolean>(false);
  const needsReloadRef = useRef<boolean>(false);

  const isCheckingRef = useRef<boolean>(false);

  const checkForUpdates = useCallback(async (isInitial: boolean = false) => {
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;

    // 1. Check if we just updated and reloaded
    if (isInitial) {
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
      let updateFound = false;
      let targetVersion = '';

      // 2. Fetch remote version.json with timeout
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const res = await fetch(`/version.json?t=${Date.now()}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const remoteData = await res.json();
          const remoteBuild = Number(remoteData.build);
          if (remoteBuild && remoteBuild > BUILD_NUMBER) {
            updateFound = true;
            targetVersion = String(remoteData.version || remoteData.build);
            setVersionText('Fetching update');
            setIsContinueEnabled(false);
          }
        }
      } catch {
        // Offline or network error
      }

      // 3. Service Worker check & asset download
      if ('serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) {
            if (reg.waiting) {
              updateFound = true;
              if (!targetVersion) targetVersion = String(BUILD_NUMBER + 1);
              setVersionText('Fetching update');
              setIsContinueEnabled(false);
              reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            }

            await reg.update();

            if (reg.waiting) {
              updateFound = true;
              if (!targetVersion) targetVersion = String(BUILD_NUMBER + 1);
              setVersionText('Fetching update');
              setIsContinueEnabled(false);
              reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            } else if (reg.installing) {
              updateFound = true;
              if (!targetVersion) targetVersion = String(BUILD_NUMBER + 1);
              setVersionText('Fetching update');
              setIsContinueEnabled(false);

              await new Promise<void>((resolve) => {
                const worker = reg.installing!;
                const onStateChange = () => {
                  if (worker.state === 'installed') {
                    worker.removeEventListener('statechange', onStateChange);
                    worker.postMessage({ type: 'SKIP_WAITING' });
                    resolve();
                  }
                };
                worker.addEventListener('statechange', onStateChange);
                setTimeout(resolve, 6000);
              });
            }
          }
        } catch (swErr) {
          console.warn('Service worker check error:', swErr);
        }
      }

      if (updateFound) {
        // Give service worker cache a moment to finalize
        await new Promise((r) => setTimeout(r, 600));
        const finalVersion = targetVersion || String(BUILD_NUMBER + 1);
        needsReloadRef.current = true;
        setVersionText(`Updated to version ${finalVersion}`);
        setIsContinueEnabled(true);
      } else {
        // App is already the latest version
        if (isInitial) {
          await new Promise((r) => setTimeout(r, 600));
        }
        setVersionText((prev) => (prev.startsWith('Updated to version') ? prev : `Version ${APP_VERSION}`));
        setIsContinueEnabled(true);
      }
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
    if (needsReloadRef.current) {
      try {
        sessionStorage.setItem('ttd_initial_view', 'SCAN_SCREEN');
      } catch {
        // Ignore
      }
      window.location.reload();
    } else {
      onContinue();
    }
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
            <h2 className="splash-sub-title">Fuel Tracking App (STAGING)</h2>
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
