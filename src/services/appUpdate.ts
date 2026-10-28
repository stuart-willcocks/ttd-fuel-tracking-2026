import { BUILD_NUMBER, APP_VERSION } from '../version';

export interface VersionCheckResult {
  hasUpdate: boolean;
  currentBuild: number;
  currentVersion: string;
  remoteBuild: number | null;
  remoteVersion: string | null;
}

let isCurrentlyUpdating = false;

/**
 * Checks for a newer build on the server by querying /version.json with cache busting.
 */
export async function checkRemoteAppVersion(): Promise<VersionCheckResult> {
  const result: VersionCheckResult = {
    hasUpdate: false,
    currentBuild: BUILD_NUMBER,
    currentVersion: APP_VERSION,
    remoteBuild: null,
    remoteVersion: null,
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`/version.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const remoteBuild = Number(data.build);
      const remoteVersion = String(data.version || data.build);
      result.remoteBuild = remoteBuild;
      result.remoteVersion = remoteVersion;

      if (remoteBuild && remoteBuild > BUILD_NUMBER) {
        result.hasUpdate = true;
      }
    }
  } catch {
    // Offline or network error
  }

  // Also check if any service worker is currently waiting to activate
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        if (reg.waiting || reg.installing) {
          result.hasUpdate = true;
          if (!result.remoteBuild) {
            result.remoteBuild = BUILD_NUMBER + 1;
            result.remoteVersion = String(BUILD_NUMBER + 1);
          }
        }
      }
    } catch {
      // Ignore SW registration check errors
    }
  }

  return result;
}

/**
 * Executes a complete, guaranteed app update:
 * 1. Prompts waiting service workers to skip waiting.
 * 2. Purges all browser CacheStorage caches to remove stale chunks.
 * 3. Cleans transient storage flags.
 * 4. Force-reloads the page with a cache-busting timestamp query parameter.
 */
export async function performAppUpdate(targetVersion?: string): Promise<void> {
  if (isCurrentlyUpdating) return;
  isCurrentlyUpdating = true;

  console.log(`[AppUpdate] Applying update${targetVersion ? ` to version ${targetVersion}` : ''}...`);

  try {
    // 1. Tell all registered service workers to activate immediately
    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
          if (reg.active) {
            reg.active.postMessage({ type: 'SKIP_WAITING' });
          }
          reg.update().catch(() => {});
        }
      } catch (swErr) {
        console.warn('[AppUpdate] SW skipWaiting error:', swErr);
      }
    }

    // 2. Clear all browser CacheStorage caches so stale HTML/JS bundles are purged
    if (typeof window !== 'undefined' && 'caches' in window) {
      try {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map((key) => caches.delete(key)));
        console.log('[AppUpdate] Purged CacheStorage caches:', cacheKeys);
      } catch (cacheErr) {
        console.warn('[AppUpdate] Cache purge warning:', cacheErr);
      }
    }

    // 3. Mark update completed in sessionStorage
    try {
      sessionStorage.removeItem('ttd_initial_view');
      if (targetVersion) {
        sessionStorage.setItem('ttd_just_updated_to', String(targetVersion));
      }
    } catch {}

    // 4. Force reload by navigating to fresh timestamp URL
    const url = new URL(window.location.href);
    url.searchParams.set('v', String(Date.now()));
    window.location.replace(url.toString());
  } catch (err) {
    console.error('[AppUpdate] Update execution failed, falling back to reload:', err);
    window.location.reload();
  }
}

/**
 * Registers a listener on navigator.serviceWorker 'controllerchange'
 * so that when a new service worker claims the page, it reloads to pick up new bundles.
 */
export function setupServiceWorkerAutoReload(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  let isReloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (isReloading) return;
    isReloading = true;
    console.log('[AppUpdate] Service worker controller changed. Reloading page...');
    window.location.reload();
  });
}
