// Auto-generated build version - DO NOT EDIT MANUALLY
export const APP_VERSION = '159';
export const BUILD_NUMBER = 159;
export const BUILD_TIME = '2026-10-29 20:29';
export const GIT_BRANCH = 'staging';
export const IS_STAGING = true;

export function getIsStaging(): boolean {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    if (host === 'ttd-fuel-tracking-2026.vercel.app') {
      return false;
    }
    if (host.includes('staging') || host.includes('preview') || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.vercel.app')) {
      return true;
    }
  }
  return IS_STAGING;
}

export function getReportedAppVersion(versionOverride?: string | null): string {
  const base = String(versionOverride || APP_VERSION).trim().replace(/\s*\(staging\)\s*$/i, '');
  return getIsStaging() ? `${base} (staging)` : base;
}
