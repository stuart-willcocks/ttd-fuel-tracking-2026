import { BUILD_NUMBER, APP_VERSION } from '../version';
import { reportDeviceAppVersionImmediately } from './telemetry';

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
 * 1. Stores target version in sessionStorage.
 * 2. Unregisters active service workers BEFORE purging CacheStorage so Workbox's
 *    NavigationRoute (createHandlerBoundToURL('index.html')) never hits an emptied precache
 *    (which otherwise causes Chrome Android to fail with ERR_FAILED / "This site can't be reached").
 * 3. Purges all browser CacheStorage caches to remove stale chunks.
 * 4. Revalidates index.html over the network and reloads cleanly.
 */
export async function performAppUpdate(targetVersion?: string): Promise<void> {
  if (isCurrentlyUpdating) return;
  isCurrentlyUpdating = true;

  console.log(`[AppUpdate] Applying update${targetVersion ? ` to version ${targetVersion}` : ''}...`);

  try {
    // 1. Mark update completed in sessionStorage first before any navigation/reload event
    try {
      sessionStorage.removeItem('ttd_initial_view');
      if (targetVersion) {
        sessionStorage.setItem('ttd_just_updated_to', String(targetVersion));
      }
    } catch {}

    // Immediately report the newly updated app version to the database if this is an enrolled PDA
    if (typeof window !== 'undefined' && !window.location.pathname.includes('admin') && targetVersion) {
      try {
        await Promise.race([
          reportDeviceAppVersionImmediately(String(targetVersion)),
          new Promise((r) => setTimeout(r, 1500)),
        ]);
      } catch {}
    }

    // 2. Unregister all service workers BEFORE deleting CacheStorage caches
    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations.map(async (reg) => {
            try {
              await reg.unregister();
            } catch {}
          }),
        );
      } catch (swErr) {
        console.warn('[AppUpdate] SW unregister error:', swErr);
      }
    }

    // 3. Clear all browser CacheStorage caches so stale HTML/JS bundles are purged
    if (typeof window !== 'undefined' && 'caches' in window) {
      try {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map((key) => caches.delete(key)));
        console.log('[AppUpdate] Purged CacheStorage caches:', cacheKeys);
      } catch (cacheErr) {
        console.warn('[AppUpdate] Cache purge warning:', cacheErr);
      }
    }

    // 4. Prime the HTTP cache with fresh HTML from the network, then navigate with cache-busting query param
    const cleanUrl = window.location.origin + window.location.pathname;
    const urlsToRevalidate = [cleanUrl];
    if (window.location.pathname.startsWith('/admin')) {
      urlsToRevalidate.push(`${window.location.origin}/admin`, `${window.location.origin}/admin.html`);
    }
    try {
      await Promise.all(
        Array.from(new Set(urlsToRevalidate)).map((u) =>
          fetch(u, {
            cache: 'reload',
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              Pragma: 'no-cache',
            },
          }).catch(() => {})
        )
      );
    } catch {
      // Ignore network pre-fetch error and proceed to reload
    }

    const bustUrl = new URL(cleanUrl);
    bustUrl.searchParams.set('v', String(Date.now()));
    window.location.replace(bustUrl.toString());
  } catch (err) {
    console.error('[AppUpdate] Update execution failed, falling back to reload:', err);
    window.location.reload();
  }
}

/**
 * Registers a listener on navigator.serviceWorker 'controllerchange'
 * so that when a new service worker claims an already-controlled page, it reloads to pick up new bundles.
 */
export function setupServiceWorkerAutoReload(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  const hadControllerOnBoot = Boolean(navigator.serviceWorker.controller);
  let isReloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (isCurrentlyUpdating || isReloading || !hadControllerOnBoot) return;
    if (!navigator.serviceWorker.controller) return;
    isReloading = true;
    console.log('[AppUpdate] Service worker controller changed. Reloading page...');
    window.location.reload();
  });
}
