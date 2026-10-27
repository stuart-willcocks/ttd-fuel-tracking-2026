// Auto-generated build version - DO NOT EDIT MANUALLY
export const APP_VERSION = '110';
export const BUILD_NUMBER = 110;
export const BUILD_TIME = '2026-10-27 17:04';
export const GIT_BRANCH = 'staging';
export const IS_STAGING = true;

export function getIsStaging(): boolean {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    if (host.includes('staging') || host.includes('preview') || host === 'localhost' || host === '127.0.0.1') {
      return true;
    }
  }
  return IS_STAGING;
}
