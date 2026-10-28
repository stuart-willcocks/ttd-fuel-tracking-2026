import type { DeviceStatus } from '../types';

const STORAGE_KEY_DEVICE_ID = 'ttd_pda_device_id';
const STORAGE_KEY_DEVICE_NAME = 'ttd_pda_device_name';
const STORAGE_KEY_DEVICE_TOKEN = 'ttd_pda_device_token';
const STORAGE_KEY_DEVICE_STATUS = 'ttd_pda_device_status';

/**
 * Generates a high-entropy secure device authentication token
 */
export function generateSecureDeviceToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `tok_${crypto.randomUUID().replace(/-/g, '')}`;
  }
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let token = 'tok_';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * Checks whether this physical PDA device has been enrolled and authorized.
 */
export function isDeviceEnrolled(): boolean {
  if (typeof window === 'undefined') return true;

  const id = localStorage.getItem(STORAGE_KEY_DEVICE_ID);
  const token = localStorage.getItem(STORAGE_KEY_DEVICE_TOKEN);
  const status = localStorage.getItem(STORAGE_KEY_DEVICE_STATUS);

  return Boolean(id && id.trim().length > 0 && token && status === 'active');
}

/**
 * Returns the permanent user-defined device identifier for this PDA.
 * Returns empty string if not yet enrolled.
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'PDA-SERVER';
  return (localStorage.getItem(STORAGE_KEY_DEVICE_ID) || '').trim();
}

/**
 * Returns the stored device authentication token.
 */
export function getDeviceToken(): string {
  if (typeof window === 'undefined') return '';
  return (localStorage.getItem(STORAGE_KEY_DEVICE_TOKEN) || '').trim();
}

/**
 * Returns the device authorization status.
 */
export function getDeviceStatus(): DeviceStatus | 'unregistered' {
  if (typeof window === 'undefined') return 'active';
  const status = localStorage.getItem(STORAGE_KEY_DEVICE_STATUS);
  if (!status) return 'unregistered';
  return status as DeviceStatus;
}

/**
 * Stores complete enrollment credentials for this physical device.
 */
export function saveDeviceEnrollment(info: {
  deviceId: string;
  deviceName?: string;
  authToken: string;
  status?: DeviceStatus;
}): void {
  if (typeof window === 'undefined') return;

  const cleanId = info.deviceId.trim().toUpperCase();
  const cleanToken = info.authToken.trim();
  const status = info.status || 'active';
  const cleanName = (info.deviceName && info.deviceName.trim().length > 0)
    ? info.deviceName.trim()
    : cleanId;

  localStorage.setItem(STORAGE_KEY_DEVICE_ID, cleanId);
  localStorage.setItem(STORAGE_KEY_DEVICE_TOKEN, cleanToken);
  localStorage.setItem(STORAGE_KEY_DEVICE_STATUS, status);
  localStorage.setItem(STORAGE_KEY_DEVICE_NAME, cleanName);
}

/**
 * Wipes all device authorization data from this client.
 */
export function clearDeviceEnrollment(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY_DEVICE_ID);
  localStorage.removeItem(STORAGE_KEY_DEVICE_NAME);
  localStorage.removeItem(STORAGE_KEY_DEVICE_TOKEN);
  localStorage.removeItem(STORAGE_KEY_DEVICE_STATUS);
}

/**
 * Sets a custom permanent device identifier for this PDA installation.
 * Also synchronizes the display device name.
 */
export function setDeviceId(id: string): void {
  if (typeof window === 'undefined') return;

  const trimmed = id.trim().toUpperCase();
  if (trimmed) {
    localStorage.setItem(STORAGE_KEY_DEVICE_ID, trimmed);
    const existingName = localStorage.getItem(STORAGE_KEY_DEVICE_NAME);
    if (!existingName) {
      localStorage.setItem(STORAGE_KEY_DEVICE_NAME, trimmed);
    }
  }
}

/**
 * Returns the friendly display label for this PDA (e.g. "Fuel Truck 1" or deviceId).
 */
export function getDeviceName(): string {
  if (typeof window === 'undefined') return 'PDA-SERVER';

  const customName = localStorage.getItem(STORAGE_KEY_DEVICE_NAME);
  if (customName && customName.trim().length > 0) {
    return customName.trim();
  }
  const id = getDeviceId();
  return id || 'Unregistered PDA';
}

/**
 * Sets a custom friendly label for this device (e.g. "Fuel Truck 1", "North Yard PDA").
 */
export function setDeviceName(name: string): void {
  if (typeof window === 'undefined') return;

  const trimmed = name.trim();
  if (trimmed) {
    localStorage.setItem(STORAGE_KEY_DEVICE_NAME, trimmed);
  } else {
    localStorage.removeItem(STORAGE_KEY_DEVICE_NAME);
  }
}
