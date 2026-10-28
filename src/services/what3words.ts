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
 * Returns a Google Maps URL for external browser tabs
 */
export function getGoogleMapsExternalUrl(w3w?: string | null, lat?: number | null, lng?: number | null): string {
  if (typeof lat === 'number' && typeof lng === 'number' && !Number.isNaN(lat) && !Number.isNaN(lng)) {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }
  const cached = getCachedWhat3WordsCoordinates(w3w);
  if (cached) {
    return `https://www.google.com/maps?q=${cached.lat},${cached.lng}`;
  }
  const clean = normalizeWhat3Words(w3w);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clean)}`;
}

/**
 * Returns an embeddable Google Maps iframe URL for the in-app PDA map modal
 */
export function getGoogleMapsEmbedUrl(w3w?: string | null, lat?: number | null, lng?: number | null): string {
  if (typeof lat === 'number' && typeof lng === 'number' && !Number.isNaN(lat) && !Number.isNaN(lng)) {
    return `https://maps.google.com/maps?q=${lat},${lng}&z=18&output=embed`;
  }
  const cached = getCachedWhat3WordsCoordinates(w3w);
  if (cached) {
    return `https://maps.google.com/maps?q=${cached.lat},${cached.lng}&z=18&output=embed`;
  }
  const clean = normalizeWhat3Words(w3w);
  return `https://maps.google.com/maps?q=${encodeURIComponent(clean)}&z=16&output=embed`;
}

/**
 * Click handler for What3Words links in the Admin Console:
 * Uses pre-converted coordinates if present, or resolves them once on demand and opens Google Maps.
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
    window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank', 'noopener,noreferrer');
    return;
  }

  const cached = getCachedWhat3WordsCoordinates(w3w);
  if (cached) {
    onResolved?.(cached);
    window.open(`https://www.google.com/maps?q=${cached.lat},${cached.lng}`, '_blank', 'noopener,noreferrer');
    return;
  }

  // Open blank tab synchronously on user gesture to avoid popup blockers while converting
  const newWin = window.open('about:blank', '_blank');
  const coords = await convertWhat3WordsToCoordinates(w3w);
  const targetUrl = coords
    ? `https://www.google.com/maps?q=${coords.lat},${coords.lng}`
    : getGoogleMapsExternalUrl(w3w);

  if (coords) {
    onResolved?.(coords);
  }

  if (newWin) {
    newWin.location.href = targetUrl;
  } else {
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  }
}
