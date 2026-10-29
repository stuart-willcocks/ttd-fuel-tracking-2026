import type { DeviceTelemetry } from '../types';
import { isDeviceEnrolled, getDeviceId } from './device';
import { updateRemoteDeviceTelemetry } from './api';
import { APP_VERSION } from '../version';

// Cache of last transmitted telemetry to eliminate duplicate network calls
let lastSentTelemetry: DeviceTelemetry | null = null;
let lastSentTime = 0;
let isCollecting = false;

// Cached location to avoid firing hardware GPS continuously
let cachedLocation: { latitude: number; longitude: number; locationAccuracy: number } | null = (() => {
  try {
    const raw = sessionStorage.getItem('ttd_cached_location') || localStorage.getItem('ttd_cached_location');
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
})();
let lastLocationTime = cachedLocation ? Date.now() : 0;
let lastLocationError: string | null = null;

/**
 * Reads battery level and charging state via W3C Battery Status API.
 * Supported on Chrome for Android (Zebra TC26).
 */
export async function getBatteryStatus(): Promise<{ batteryLevel: number; isCharging: boolean } | null> {
  if (typeof navigator === 'undefined') return null;

  try {
    const nav = navigator as unknown as {
      getBattery?: () => Promise<{
        level: number;
        charging: boolean;
        addEventListener: (event: string, handler: () => void) => void;
      }>;
    };

    if (typeof nav.getBattery === 'function') {
      const battery = await nav.getBattery();
      const level = Math.round(battery.level * 100);
      return {
        batteryLevel: Math.max(0, Math.min(100, level)),
        isCharging: Boolean(battery.charging),
      };
    }
  } catch (err) {
    // Battery API blocked or not supported
  }

  return null;
}

/**
 * Helper to fetch a single GPS position with given accuracy and timeout.
 */
function fetchPositionOnce(highAccuracy: boolean, timeoutMs: number): Promise<{
  latitude: number;
  longitude: number;
  locationAccuracy: number;
} | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }

    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(null);
      }
    }, timeoutMs + 200);

    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!done) {
            done = true;
            clearTimeout(timer);
            const fix = {
              latitude: Number(pos.coords.latitude.toFixed(6)),
              longitude: Number(pos.coords.longitude.toFixed(6)),
              locationAccuracy: Math.round(pos.coords.accuracy),
            };
            lastLocationError = null;
            resolve(fix);
          }
        },
        (err) => {
          if (!done) {
            done = true;
            clearTimeout(timer);
            lastLocationError = `Code ${err.code}: ${err.message}`;
            console.warn(`[Telemetry] Geolocation error (highAccuracy=${highAccuracy}):`, lastLocationError);
            resolve(null);
          }
        },
        {
          enableHighAccuracy: highAccuracy,
          timeout: timeoutMs,
          maximumAge: 120000, // 2 minutes cache
        }
      );
    } catch (e: any) {
      if (!done) {
        done = true;
        clearTimeout(timer);
        lastLocationError = e?.message || 'Unknown error';
        resolve(null);
      }
    }
  });
}

/**
 * Reads current GPS position via W3C Geolocation API.
 * Non-blocking:
 * - Uses cached location immediately if less than 3 minutes old (0ms delay).
 * - Tries high-accuracy GPS (satellite fix) first with reasonable background timeout.
 * - Falls back to low-accuracy (cellular/Wi-Fi) if high-accuracy fails or is unavailable.
 */
export async function getCurrentLocation(): Promise<{
  latitude: number;
  longitude: number;
  locationAccuracy: number;
} | null> {
  const now = Date.now();
  if (cachedLocation && now - lastLocationTime < 180000) {
    return cachedLocation;
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return cachedLocation;
  }

  // 1. Try high accuracy (hardware GPS on Zebra TC26)
  let fix = await fetchPositionOnce(true, 7000);

  // 2. If high accuracy timed out or unavailable, try low accuracy (cell/Wi-Fi)
  if (!fix) {
    fix = await fetchPositionOnce(false, 3000);
  }

  if (fix) {
    cachedLocation = fix;
    lastLocationTime = Date.now();
    try {
      sessionStorage.setItem('ttd_cached_location', JSON.stringify(fix));
      localStorage.setItem('ttd_cached_location', JSON.stringify(fix));
    } catch {}
    return fix;
  }

  return cachedLocation;
}

/**
 * Manually requests or re-requests location permission and acquires an immediate GPS fix.
 * Can be called from the Settings modal.
 */
export async function requestLocationPermission(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return false;

  const fix = await fetchPositionOnce(true, 10000);
  if (fix) {
    cachedLocation = fix;
    lastLocationTime = Date.now();
    try {
      sessionStorage.setItem('ttd_cached_location', JSON.stringify(fix));
      localStorage.setItem('ttd_cached_location', JSON.stringify(fix));
    } catch {}
    await pushDeviceTelemetry(true);
    return true;
  }
  return false;
}

/**
 * Checks current location permission state via Permissions API if available.
 */
export async function checkLocationPermissionState(): Promise<'granted' | 'prompt' | 'denied' | 'unsupported'> {
  if (typeof navigator === 'undefined' || !navigator.permissions) return 'unsupported';
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return status.state as 'granted' | 'prompt' | 'denied';
  } catch {
    return 'unsupported';
  }
}

/**
 * Returns current cached telemetry status for diagnostics (Settings UI).
 */
export function getCachedTelemetryStatus(): {
  cachedLocation: { latitude: number; longitude: number; locationAccuracy: number } | null;
  lastLocationTime: number;
  lastLocationError: string | null;
  lastSentTelemetry: DeviceTelemetry | null;
} {
  return {
    cachedLocation,
    lastLocationTime,
    lastLocationError,
    lastSentTelemetry,
  };
}

/**
 * Gathers complete device telemetry snapshot (battery + location) concurrently.
 * Battery is prioritized and never waits on slow GPS fixes.
 */
export async function collectDeviceTelemetry(): Promise<DeviceTelemetry> {
  const [battery, location] = await Promise.all([
    getBatteryStatus().catch(() => null),
    getCurrentLocation().catch(() => cachedLocation),
  ]);

  return {
    batteryLevel: battery ? battery.batteryLevel : null,
    isCharging: battery ? battery.isCharging : null,
    latitude: location ? location.latitude : null,
    longitude: location ? location.longitude : null,
    locationAccuracy: location ? location.locationAccuracy : null,
    lastTelemetryAt: new Date().toISOString(),
    appVersion: APP_VERSION,
  };
}

/**
 * Immediately reports the running (or newly updated) app build version to the database
 * without waiting on a slow hardware GPS satellite lock.
 */
export async function reportDeviceAppVersionImmediately(versionOverride?: string): Promise<void> {
  if (!isDeviceEnrolled()) return;
  const deviceId = getDeviceId();
  if (!deviceId) return;

  const targetVer = versionOverride || APP_VERSION;
  try {
    const battery = await getBatteryStatus().catch(() => null);
    const snapshot: DeviceTelemetry = {
      batteryLevel: battery ? battery.batteryLevel : (lastSentTelemetry?.batteryLevel ?? null),
      isCharging: battery ? battery.isCharging : (lastSentTelemetry?.isCharging ?? null),
      latitude: cachedLocation ? cachedLocation.latitude : (lastSentTelemetry?.latitude ?? null),
      longitude: cachedLocation ? cachedLocation.longitude : (lastSentTelemetry?.longitude ?? null),
      locationAccuracy: cachedLocation ? cachedLocation.locationAccuracy : (lastSentTelemetry?.locationAccuracy ?? null),
      lastTelemetryAt: new Date().toISOString(),
      appVersion: targetVer,
    };
    await updateRemoteDeviceTelemetry(deviceId, snapshot);
    lastSentTelemetry = snapshot;
    lastSentTime = Date.now();
    try {
      localStorage.setItem('ttd_last_reported_app_version', targetVer);
    } catch {}
  } catch (err) {
    console.debug('[Telemetry] Immediate appVersion report skipped:', err);
  }
}

/**
 * Checks whether telemetry should be sent or throttled to save bandwidth and battery.
 */
function shouldSendTelemetry(newTel: DeviceTelemetry, force: boolean): boolean {
  if (force || !lastSentTelemetry) return true;

  // Send immediately if app version changed
  if (newTel.appVersion && newTel.appVersion !== lastSentTelemetry.appVersion) return true;

  const now = Date.now();
  // Always send if at least 5 minutes have passed since last upload
  if (now - lastSentTime > 300000) return true;

  // Send immediately if charging status changed
  if (newTel.isCharging !== lastSentTelemetry.isCharging) return true;

  // Send immediately if battery changed by 3% or more
  if (
    typeof newTel.batteryLevel === 'number' &&
    typeof lastSentTelemetry.batteryLevel === 'number' &&
    Math.abs(newTel.batteryLevel - lastSentTelemetry.batteryLevel) >= 3
  ) {
    return true;
  }

  // Send immediately if we previously had no battery reading and now we do
  if (typeof newTel.batteryLevel === 'number' && (lastSentTelemetry.batteryLevel === null || typeof lastSentTelemetry.batteryLevel !== 'number')) {
    return true;
  }

  // CRITICAL: Send immediately if we previously had no GPS coordinates and now we do!
  if (typeof newTel.latitude === 'number' && (lastSentTelemetry.latitude === null || typeof lastSentTelemetry.latitude !== 'number')) {
    return true;
  }

  // Send if location shifted significantly (> 0.0005 degrees ≈ 55 meters)
  if (
    typeof newTel.latitude === 'number' &&
    typeof lastSentTelemetry.latitude === 'number' &&
    typeof newTel.longitude === 'number' &&
    typeof lastSentTelemetry.longitude === 'number'
  ) {
    const latDiff = Math.abs(newTel.latitude - lastSentTelemetry.latitude);
    const lonDiff = Math.abs(newTel.longitude - lastSentTelemetry.longitude);
    if (latDiff > 0.0005 || lonDiff > 0.0005) {
      return true;
    }
  }

  return false;
}

/**
 * Transmits current PDA battery and location telemetry to the central database.
 */
export async function pushDeviceTelemetry(force: boolean = false): Promise<void> {
  if (!isDeviceEnrolled() || isCollecting) return;
  const deviceId = getDeviceId();
  if (!deviceId) return;

  isCollecting = true;
  try {
    const telemetry = await collectDeviceTelemetry();

    if (shouldSendTelemetry(telemetry, force)) {
      await updateRemoteDeviceTelemetry(deviceId, telemetry);
      lastSentTelemetry = telemetry;
      lastSentTime = Date.now();
      try {
        if (telemetry.appVersion) {
          localStorage.setItem('ttd_last_reported_app_version', telemetry.appVersion);
        }
      } catch {}
      console.log('[Telemetry] Transmitted PDA telemetry update:', telemetry);
    }
  } catch (err) {
    // Fail silently in background
    console.debug('[Telemetry] Update skipped:', err);
  } finally {
    isCollecting = false;
  }
}

/**
 * Starts continuous, low-power telemetry monitoring on the PDA.
 * Subscribes to battery events, geolocation watchPosition updates, and periodic 5-minute heartbeat.
 */
export function startTelemetryMonitoring(): () => void {
  if (typeof window === 'undefined') return () => {};

  // If the app version changed (e.g. after an app update), report the new version immediately without waiting on GPS
  try {
    const lastVer = localStorage.getItem('ttd_last_reported_app_version');
    if (lastVer !== APP_VERSION) {
      reportDeviceAppVersionImmediately(APP_VERSION);
    }
  } catch {}

  // Initial immediate collection on boot (sends battery + location + appVersion)
  pushDeviceTelemetry(true);

  // Periodic heartbeat every 5 minutes (low-frequency to protect free tier quotas)
  const intervalId = setInterval(() => {
    pushDeviceTelemetry(false);
  }, 300000);

  // Continuous background GPS watch
  let watchId: number | null = null;
  if (typeof navigator !== 'undefined' && navigator.geolocation) {
    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const fix = {
            latitude: Number(pos.coords.latitude.toFixed(6)),
            longitude: Number(pos.coords.longitude.toFixed(6)),
            locationAccuracy: Math.round(pos.coords.accuracy),
          };
          console.log('[Telemetry] Live GPS watch fix:', fix);
          cachedLocation = fix;
          lastLocationTime = Date.now();
          lastLocationError = null;
          try {
            sessionStorage.setItem('ttd_cached_location', JSON.stringify(fix));
            localStorage.setItem('ttd_cached_location', JSON.stringify(fix));
          } catch {}

          // If we had no location sent yet, push immediately!
          if (!lastSentTelemetry || lastSentTelemetry.latitude === null) {
            pushDeviceTelemetry(true);
          } else {
            pushDeviceTelemetry(false);
          }
        },
        (err) => {
          lastLocationError = `Code ${err.code}: ${err.message}`;
          console.warn('[Telemetry] Geolocation watch warning:', lastLocationError);
        },
        {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 60000,
        }
      );
    } catch (err) {
      console.warn('[Telemetry] Failed to start geolocation watcher:', err);
    }
  }

  // Battery status change listener
  const nav = navigator as unknown as {
    getBattery?: () => Promise<{
      addEventListener: (event: string, handler: () => void) => void;
      removeEventListener: (event: string, handler: () => void) => void;
    }>;
  };

  let cleanBatteryEvents = () => {};

  if (typeof nav?.getBattery === 'function') {
    nav.getBattery().then((battery) => {
      const onBatteryChange = () => {
        pushDeviceTelemetry(false);
      };
      battery.addEventListener('levelchange', onBatteryChange);
      battery.addEventListener('chargingchange', onBatteryChange);

      cleanBatteryEvents = () => {
        try {
          battery.removeEventListener('levelchange', onBatteryChange);
          battery.removeEventListener('chargingchange', onBatteryChange);
        } catch {}
      };
    }).catch(() => {});
  }

  return () => {
    clearInterval(intervalId);
    if (watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      try {
        navigator.geolocation.clearWatch(watchId);
      } catch {}
    }
    cleanBatteryEvents();
  };
}
