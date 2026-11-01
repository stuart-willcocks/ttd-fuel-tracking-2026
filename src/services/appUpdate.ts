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

  const isDesktopPortal =
    typeof window !== 'undefined' &&
    (window.location.pathname.startsWith('/admin') ||
      window.location.pathname.startsWith('/stress-test'));

  // Fallback: only if /version.json could not be fetched on a field PDA, check if a service worker is waiting
  if (result.remoteBuild === null && !isDesktopPortal && 'serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && reg.waiting) {
        result.hasUpdate = true;
        result.remoteBuild = BUILD_NUMBER + 1;
        result.remoteVersion = String(BUILD_NUMBER + 1);
      }
    } catch {
      // Ignore SW registration check errors
    }
  }

  return result;
}

/**
 * Verifies after an update reload that the running bundle actually reached the target version.
 * Returns:
 * - 'verified': The app just updated and is confirmed running the target build (or newer).
 * - 'retrying': The browser served a stale bundle (< targetVersion); a retry update has been scheduled.
 * - 'none': No pending post-update verification state was present.
 */
export function verifyPostUpdateBuild(): {
  status: 'verified' | 'retrying' | 'none';
  targetVersion: string | null;
} {
  if (typeof window === 'undefined') {
    return { status: 'none', targetVersion: null };
  }

  try {
    const justUpdatedVersion = sessionStorage.getItem('ttd_just_updated_to');
    if (!justUpdatedVersion) {
      return { status: 'none', targetVersion: null };
    }

    const targetBuildNum = Number(justUpdatedVersion);
    const isUpToDate =
      (!Number.isNaN(targetBuildNum) && targetBuildNum > 0 && BUILD_NUMBER >= targetBuildNum) ||
      APP_VERSION === justUpdatedVersion;

    if (isUpToDate) {
      sessionStorage.removeItem('ttd_just_updated_to');
      sessionStorage.removeItem('ttd_update_verify_retry');
      return { status: 'verified', targetVersion: justUpdatedVersion };
    }

    // Running bundle is still older than targetVersion (e.g. stale browser/edge cache on first reload).
    // Allow up to 2 automatic cache-busted retry reloads for this target version.
    let retryCount = 0;
    try {
      const rawRetry = sessionStorage.getItem('ttd_update_verify_retry');
      if (rawRetry) {
        const parsed = JSON.parse(rawRetry) as { version?: string; count?: number };
        if (parsed.version === justUpdatedVersion && typeof parsed.count === 'number') {
          retryCount = parsed.count;
        }
      }
    } catch {}

    if (retryCount < 2) {
      sessionStorage.setItem(
        'ttd_update_verify_retry',
        JSON.stringify({ version: justUpdatedVersion, count: retryCount + 1 })
      );
      console.warn(
        `[AppUpdate] Post-reload build mismatch (running V${APP_VERSION}, expected V${justUpdatedVersion}). Scheduling retry #${retryCount + 1}...`
      );
      setTimeout(() => {
        performAppUpdate(justUpdatedVersion);
      }, 1200);
      return { status: 'retrying', targetVersion: justUpdatedVersion };
    }

    // Retries exhausted; clear flags so the user is not stuck in a reload loop
    sessionStorage.removeItem('ttd_just_updated_to');
    sessionStorage.removeItem('ttd_update_verify_retry');
    return { status: 'none', targetVersion: justUpdatedVersion };
  } catch {
    return { status: 'none', targetVersion: null };
  }
}

/**
 * Executes a complete, guaranteed app update:
 * 1. Stores target version in sessionStorage.
 * 2. Unregisters active service workers BEFORE purging CacheStorage so Workbox's
 *    navigation handler never serves an emptied or stale precache.
 * 3. Purges all browser CacheStorage caches to remove stale chunks.
 * 4. Pre-warms both the clean path and the cache-busted URL over the network and navigates cleanly.
 */
export async function performAppUpdate(targetVersion?: string): Promise<void> {
  if (isCurrentlyUpdating) return;
  isCurrentlyUpdating = true;

  console.log(`[AppUpdate] Applying update${targetVersion ? ` to version ${targetVersion}` : ''}...`);

  try {
    // 1. Mark update target in sessionStorage first before any navigation/reload event
    try {
      sessionStorage.removeItem('ttd_initial_view');
      if (targetVersion) {
        sessionStorage.setItem('ttd_just_updated_to', String(targetVersion));
      }
    } catch {}

    const isAdminPage =
      typeof window !== 'undefined' &&
      (window.location.pathname.startsWith('/admin') ||
        window.location.pathname.startsWith('/stress-test'));

    // Immediately report the newly updated app version to the database if this is an enrolled PDA
    if (typeof window !== 'undefined' && !isAdminPage && targetVersion) {
      try {
        await Promise.race([
          reportDeviceAppVersionImmediately(String(targetVersion)),
          new Promise((r) => setTimeout(r, 1500)),
        ]);
      } catch {}
    }

    // 2. Unregister any active service workers before reloading into the new build
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
        console.warn('[AppUpdate] SW unregister warning:', swErr);
      }
    }

    // 3. Clear all browser CacheStorage caches on both PDA and Admin pages
    if (typeof window !== 'undefined' && 'caches' in window) {
      try {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map((key) => caches.delete(key)));
      } catch (cacheErr) {
        console.warn('[AppUpdate] Cache purge warning:', cacheErr);
      }
    }

    // 4. Prime the HTTP cache with fresh HTML from the network (including the exact bustUrl),
    // then navigate with the cache-busting query param while preserving pda_window=1
    const bustUrl = new URL(window.location.href);
    bustUrl.searchParams.set('v', String(Date.now()));

    const cleanUrl = window.location.origin + window.location.pathname;
    const urlsToRevalidate = [cleanUrl, `${window.location.origin}/index.html`, bustUrl.toString()];
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

    window.location.replace(bustUrl.toString());
  } catch (err) {
    console.error('[AppUpdate] Update execution failed, falling back to reload:', err);
    window.location.reload();
  }
}

/**
 * Retained for backwards compatibility.
 * Reloads are now exclusively coordinated via performAppUpdate() to prevent
 * un-busted controllerchange reloads from racing with cache-busted navigation.
 */
export function setupServiceWorkerAutoReload(): void {
  // No-op by design: performAppUpdate() is the single authority for update reloads.
}
