import type React from 'react';
import type { Equipment } from '../types';

const DEFAULT_W3W_API_KEY = 'UUVPQ366';
const W3W_CACHE_STORAGE_KEY = 'ttd_w3w_coords_cache_v1';

export interface W3WCoordinates {
  lat: number;
  lng: number;
}

const memoryCache = new Map<string, W3WCoordinates>();
let cacheHydrated = false;

function hydrateCache() {
  if (cacheHydrated || typeof window === 'undefined') return;
  cacheHydrated = true;
  try {
    const raw = localStorage.getItem(W3W_CACHE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, W3WCoordinates>;
      for (const [k, v] of Object.entries(parsed)) {
        if (v && typeof v.lat === 'number' && typeof v.lng === 'number') {
          memoryCache.set(k, v);
        }
      }
    }
  } catch {
    // Ignore localStorage parse errors
  }
}

function persistCache() {
  if (typeof window === 'undefined') return;
  try {
    const obj: Record<string, W3WCoordinates> = {};
    for (const [k, v] of memoryCache.entries()) {
      obj[k] = v;
    }
    localStorage.setItem(W3W_CACHE_STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // Ignore storage quota errors
  }
}

export function getWhat3WordsApiKey(): string {
  return (
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_WHAT3WORDS_API_KEY) ||
    DEFAULT_W3W_API_KEY
  );
}

/**
 * Normalizes a what3words string by stripping leading slashes and whitespace
 */
export function normalizeWhat3Words(raw?: string | null): string {
  if (!raw) return '';
  return String(raw).replace(/^\/+/, '').trim().toLowerCase();
}

/**
 * Checks if a normalized string looks like a valid 3-word address (word.word.word)
 */
export function isValidWhat3WordsFormat(raw?: string | null): boolean {
  const clean = normalizeWhat3Words(raw);
  if (!clean) return false;
  const parts = clean.split('.');
  return parts.length === 3 && parts.every((p) => p.length >= 1 && !/\s/.test(p));
}

/**
 * Pre-populates the local cache from an equipment record that already has coordinates
 */
export function primeWhat3WordsCache(rawW3w?: string | null, lat?: number | null, lng?: number | null) {
  hydrateCache();
  const clean = normalizeWhat3Words(rawW3w);
  if (!clean || typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) {
    return;
  }
  if (!memoryCache.has(clean)) {
    memoryCache.set(clean, { lat, lng });
    persistCache();
  }
}

/**
 * Synchronously retrieves cached coordinates for a what3words address if known
 */
export function getCachedWhat3WordsCoordinates(rawW3w?: string | null): W3WCoordinates | null {
  hydrateCache();
  const clean = normalizeWhat3Words(rawW3w);
  if (!clean) return null;
  return memoryCache.get(clean) || null;
}

/**
 * Converts a what3words address into latitude & longitude coordinates using the what3words v3 API.
 * Results are cached permanently by 3-word address to minimize API usage.
 */
export async function convertWhat3WordsToCoordinates(rawW3w?: string | null): Promise<W3WCoordinates | null> {
  hydrateCache();
  const clean = normalizeWhat3Words(rawW3w);
  if (!isValidWhat3WordsFormat(clean)) {
    return null;
  }

  const cached = memoryCache.get(clean);
  if (cached) {
    return cached;
  }

  const apiKey = getWhat3WordsApiKey();
  const url = `https://api.what3words.com/v3/convert-to-coordinates?words=${encodeURIComponent(clean)}&key=${encodeURIComponent(apiKey)}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (
      res.ok &&
      data?.coordinates &&
      typeof data.coordinates.lat === 'number' &&
      typeof data.coordinates.lng === 'number'
    ) {
      const coords: W3WCoordinates = {
        lat: data.coordinates.lat,
        lng: data.coordinates.lng,
      };
      memoryCache.set(clean, coords);
      persistCache();
      return coords;
    } else {
      console.warn('[what3words] API conversion warning for', clean, data?.error?.message || res.status);
      return null;
    }
  } catch (err) {
    console.warn('[what3words] Network error converting', clean, err);
    return null;
  }
}

/**
 * Ensures an Equipment object has resolved latitude/longitude for its what3words address.
 * Converts once on save or update when coordinates are missing or when what3words has changed.
 */
export async function resolveEquipmentCoordinates(
  equipment: Equipment,
  previousWhat3Words?: string
): Promise<Equipment> {
  const currentClean = normalizeWhat3Words(equipment.what3words);
  const prevClean = previousWhat3Words !== undefined ? normalizeWhat3Words(previousWhat3Words) : undefined;
  const w3wChanged = prevClean !== undefined && prevClean !== currentClean;

  const hasExistingCoords =
    typeof equipment.latitude === 'number' &&
    typeof equipment.longitude === 'number' &&
    !Number.isNaN(equipment.latitude) &&
    !Number.isNaN(equipment.longitude);

  if (hasExistingCoords && !w3wChanged) {
    primeWhat3WordsCache(currentClean, equipment.latitude, equipment.longitude);
    return equipment;
  }

  const coords = await convertWhat3WordsToCoordinates(currentClean);
  if (coords) {
    return {
      ...equipment,
      latitude: coords.lat,
      longitude: coords.lng,
    };
  }

  // If what3words changed to an invalid/placeholder string, clear stale coordinates
  if (w3wChanged) {
    return {
      ...equipment,
      latitude: undefined,
      longitude: undefined,
    };
  }

  return equipment;
}

/**
 * Returns a Google Maps URL with Satellite layer enabled (`t=k` / `data=!3m1!1e3`)
 */
export function getGoogleMapsExternalUrl(w3w?: string | null, lat?: number | null, lng?: number | null): string {
  if (typeof lat === 'number' && typeof lng === 'number' && !Number.isNaN(lat) && !Number.isNaN(lng)) {
    return `https://maps.google.com/maps?q=${lat},${lng}&t=k&z=19&output=embed`;
  }
  const cached = getCachedWhat3WordsCoordinates(w3w);
  if (cached) {
    return `https://maps.google.com/maps?q=${cached.lat},${cached.lng}&t=k&z=19&output=embed`;
  }
  const clean = normalizeWhat3Words(w3w);
  return `https://maps.google.com/maps?q=${encodeURIComponent(clean)}&t=k&z=18&output=embed`;
}

/**
 * Returns a clutter-free embeddable Google Maps iframe URL with the Satellite layer (`t=k`) visible.
 * Using `output=embed` with `t=k` removes the left-hand Places/Directions/Save/Nearby drawer and
 * top Restaurants/Hotels category buttons while keeping the satellite layer and location pin active.
 */
export function getGoogleMapsEmbedUrl(w3w?: string | null, lat?: number | null, lng?: number | null): string {
  if (typeof lat === 'number' && typeof lng === 'number' && !Number.isNaN(lat) && !Number.isNaN(lng)) {
    return `https://maps.google.com/maps?q=${lat},${lng}&t=k&z=19&ie=UTF8&iwloc=near&output=embed`;
  }
  const cached = getCachedWhat3WordsCoordinates(w3w);
  if (cached) {
    return `https://maps.google.com/maps?q=${cached.lat},${cached.lng}&t=k&z=19&ie=UTF8&iwloc=near&output=embed`;
  }
  const clean = normalizeWhat3Words(w3w);
  return `https://maps.google.com/maps?q=${encodeURIComponent(clean)}&t=k&z=18&ie=UTF8&iwloc=near&output=embed`;
}

/**
 * Opens a clutter-free Google Maps Satellite modal overlay in the Admin Console.
 * Eliminates the Google Maps left-hand info drawer (Directions, Save, Nearby) and top category chips
 * (Restaurants, Hotels, etc.) and always displays the Satellite layer (`t=k`).
 */
function openCleanGoogleMapsModal(
  rawW3w: string,
  initialCoords?: W3WCoordinates | null,
  onResolved?: (coords: W3WCoordinates) => void
) {
  if (typeof document === 'undefined') return;

  const clean = normalizeWhat3Words(rawW3w);
  const existingModal = document.getElementById('ttd-w3w-satellite-modal');
  if (existingModal) {
    existingModal.remove();
  }

  const backdrop = document.createElement('div');
  backdrop.id = 'ttd-w3w-satellite-modal';
  Object.assign(backdrop.style, {
    position: 'fixed',
    inset: '0',
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    backdropFilter: 'blur(3px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: '10000',
    padding: '24px',
  });

  const panel = document.createElement('div');
  Object.assign(panel.style, {
    width: 'min(960px, 92vw)',
    height: 'min(680px, 86vh)',
    backgroundColor: '#FFFFFF',
    borderRadius: '12px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    border: '1px solid #E2E8F0',
  });

  const header = document.createElement('div');
  Object.assign(header.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 18px',
    backgroundColor: '#F8FAFC',
    borderBottom: '1px solid #E2E8F0',
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
  });

  const titleWrap = document.createElement('div');
  Object.assign(titleWrap.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  });

  const titleText = document.createElement('span');
  titleText.textContent = `///${clean}`;
  Object.assign(titleText.style, {
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: '800',
    fontSize: '1rem',
    color: '#0F172A',
  });

  const coordsBadge = document.createElement('span');
  Object.assign(coordsBadge.style, {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '0.78rem',
    fontWeight: '600',
    color: '#475569',
    backgroundColor: '#E2E8F0',
    padding: '2px 8px',
    borderRadius: '6px',
  });
  coordsBadge.textContent = initialCoords
    ? `${initialCoords.lat.toFixed(5)}, ${initialCoords.lng.toFixed(5)}`
    : 'Resolving coordinates...';

  titleWrap.appendChild(titleText);
  titleWrap.appendChild(coordsBadge);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.innerHTML = '&#10005;';
  closeBtn.title = 'Close Map (Esc)';
  Object.assign(closeBtn.style, {
    width: '32px',
    height: '32px',
    borderRadius: '6px',
    border: '1px solid #CBD5E1',
    backgroundColor: '#FFFFFF',
    color: '#334155',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  });

  const bodyWrap = document.createElement('div');
  Object.assign(bodyWrap.style, {
    flex: '1',
    position: 'relative',
    backgroundColor: '#0F172A',
  });

  const cleanup = () => {
    document.removeEventListener('keydown', onKeyDown);
    backdrop.remove();
  };

  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') cleanup();
  };
  document.addEventListener('keydown', onKeyDown);

  closeBtn.onclick = cleanup;
  backdrop.onclick = (ev) => {
    if (ev.target === backdrop) cleanup();
  };

  header.appendChild(titleWrap);
  header.appendChild(closeBtn);
  panel.appendChild(header);
  panel.appendChild(bodyWrap);
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);

  const renderIframe = (coords: W3WCoordinates | null) => {
    bodyWrap.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.src = getGoogleMapsEmbedUrl(clean, coords?.lat, coords?.lng);
    iframe.title = `Satellite Map for ///${clean}`;
    iframe.setAttribute('allow', 'geolocation');
    Object.assign(iframe.style, {
      width: '100%',
      height: '100%',
      border: '0',
      display: 'block',
    });
    bodyWrap.appendChild(iframe);
  };

  if (initialCoords) {
    renderIframe(initialCoords);
  } else {
    const loadingEl = document.createElement('div');
    loadingEl.textContent = `Loading satellite map for ///${clean}...`;
    Object.assign(loadingEl.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      color: '#F8FAFC',
      fontFamily: "'Inter', system-ui, sans-serif",
      fontSize: '0.92rem',
      fontWeight: '600',
    });
    bodyWrap.appendChild(loadingEl);

    convertWhat3WordsToCoordinates(clean).then((resolved) => {
      if (!document.body.contains(backdrop)) return;
      if (resolved) {
        coordsBadge.textContent = `${resolved.lat.toFixed(5)}, ${resolved.lng.toFixed(5)}`;
        onResolved?.(resolved);
        renderIframe(resolved);
      } else {
        coordsBadge.textContent = 'Location lookup failed';
        renderIframe(null);
      }
    });
  }
}

/**
 * Click handler for What3Words links:
 * Opens a clutter-free Google Maps Satellite view with no left-hand drawer and no category pills.
 */
export async function handleWhat3WordsLinkClick(
  e: React.MouseEvent<HTMLElement>,
  w3w: string,
  lat?: number,
  lng?: number,
  onResolved?: (coords: W3WCoordinates) => void
): Promise<void> {
  e.preventDefault();
  e.stopPropagation();

  if (typeof lat === 'number' && typeof lng === 'number' && !Number.isNaN(lat) && !Number.isNaN(lng)) {
    openCleanGoogleMapsModal(w3w, { lat, lng }, onResolved);
    return;
  }

  const cached = getCachedWhat3WordsCoordinates(w3w);
  if (cached) {
    onResolved?.(cached);
    openCleanGoogleMapsModal(w3w, cached, onResolved);
    return;
  }

  openCleanGoogleMapsModal(w3w, null, onResolved);
}
