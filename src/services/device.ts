const STORAGE_KEY_DEVICE_ID = 'ttd_pda_device_id';
const STORAGE_KEY_DEVICE_NAME = 'ttd_pda_device_name';

function generateRandomHex(length: number = 4): string {
  const chars = '0123456789ABCDEF';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Returns a permanent unique device identifier for this PDA installation.
 * Generated once per installation and persisted in localStorage.
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'PDA-SERVER';

  let id = localStorage.getItem(STORAGE_KEY_DEVICE_ID);
  if (!id) {
    // Generate a clean identifier, e.g. TC26-9B4F or PDA-9B4F
    const isZebra = typeof navigator !== 'undefined' && /TC26|Zebra|Android/i.test(navigator.userAgent);
    const prefix = isZebra ? 'TC26' : 'PDA';
    id = `${prefix}-${generateRandomHex(4)}`;
    localStorage.setItem(STORAGE_KEY_DEVICE_ID, id);
  }
  return id;
}
/**
 * Sets a custom permanent device identifier for this PDA installation.
 * Also synchronizes the display device name.
 */
export function setDeviceId(id: string): void {
  if (typeof window === 'undefined') return;

  const trimmed = id.trim();
  if (trimmed) {
    localStorage.setItem(STORAGE_KEY_DEVICE_ID, trimmed);
    localStorage.setItem(STORAGE_KEY_DEVICE_NAME, trimmed);
  }
}

/**
 * Returns the configurable display name for this PDA (e.g. "PDA 1", "PDA 2", or auto-generated ID).
 */
export function getDeviceName(): string {
  if (typeof window === 'undefined') return 'PDA-SERVER';

  const customName = localStorage.getItem(STORAGE_KEY_DEVICE_NAME);
  if (customName && customName.trim().length > 0) {
    return customName.trim();
  }
  return getDeviceId();
}

/**
 * Sets a custom friendly label for this device (e.g. "PDA 1", "PDA-NorthZone").
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
