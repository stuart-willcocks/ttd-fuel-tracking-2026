import type { DeviceTelemetry } from '../types';
import { isDeviceEnrolled, getDeviceId } from './device';
import { updateRemoteDeviceTelemetry } from './api';

// Cache of last transmitted telemetry to eliminate duplicate network calls
let lastSentTelemetry: DeviceTelemetry | null = null;
let lastSentTime = 0;
let isCollecting = false;

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
 * Reads current GPS position via W3C Geolocation API.
 * Uses 2-minute maximumAge cache to minimize GPS chip battery drain on Zebra PDA.
 */
export async function getCurrentLocation(): Promise<{
  latitude: number;
  longitude: number;
  locationAccuracy: number;
} | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return null;
  }

  return new Promise((resolve) => {
    let resolved = false;

    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    }, 8000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          resolve({
            latitude: Number(pos.coords.latitude.toFixed(6)),
            longitude: Number(pos.coords.longitude.toFixed(6)),
            locationAccuracy: Math.round(pos.coords.accuracy),
          });
        }
      },
      () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          resolve(null);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 7000,
        maximumAge: 120000, // 2 minutes cache saves battery
      }
    );
  });
}

/**
 * Gathers complete device telemetry snapshot (battery + location) concurrently.
 */
export async function collectDeviceTelemetry(): Promise<DeviceTelemetry> {
  const [battery, location] = await Promise.all([
    getBatteryStatus().catch(() => null),
    getCurrentLocation().catch(() => null),
  ]);

  return {
    batteryLevel: battery ? battery.batteryLevel : null,
    isCharging: battery ? battery.isCharging : null,
    latitude: location ? location.latitude : null,
    longitude: location ? location.longitude : null,
    locationAccuracy: location ? location.locationAccuracy : null,
    lastTelemetryAt: new Date().toISOString(),
  };
}

/**
 * Checks whether telemetry should be sent or throttled to save bandwidth and battery.
 */
function shouldSendTelemetry(newTel: DeviceTelemetry, force: boolean): boolean {
  if (force || !lastSentTelemetry) return true;

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
 * Subscribes to battery events and periodic 5-minute heartbeat.
 */
export function startTelemetryMonitoring(): () => void {
  if (typeof window === 'undefined') return () => {};

  // Initial immediate collection on boot
  pushDeviceTelemetry(true);

  // Periodic heartbeat every 5 minutes (low-frequency to protect free tier quotas)
  const intervalId = setInterval(() => {
    pushDeviceTelemetry(false);
  }, 300000);

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
    cleanBatteryEvents();
  };
}
