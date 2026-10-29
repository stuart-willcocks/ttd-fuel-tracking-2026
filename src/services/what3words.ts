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
 * Returns a fallback href for What3Words links
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
  return `#w3w-${encodeURIComponent(clean)}`;
}

/**
 * Generates a self-contained HTML document (`srcDoc`) that renders Google Maps' pure Satellite
 * raster layer (`https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}`, `lyrs=s` = pure satellite
 * imagery with ALL POI icons — photo locations, hotels, hospitals, restaurants, businesses — suppressed)
 * and places a single location pin at the exact converted coordinates.
 */
export function getGoogleSatelliteMapSrcDoc(
  w3w?: string | null,
  lat?: number | null,
  lng?: number | null
): string {
  const clean = normalizeWhat3Words(w3w);
  const cached =
    typeof lat === 'number' && typeof lng === 'number' && !Number.isNaN(lat) && !Number.isNaN(lng)
      ? { lat, lng }
      : getCachedWhat3WordsCoordinates(clean);

  const targetLat = cached ? cached.lat : 52.0733;
  const targetLng = cached ? cached.lng : -1.0147;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      background: #0F172A;
      overflow: hidden;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }
    .leaflet-control-attribution {
      font-size: 10px !important;
      background: rgba(15, 23, 42, 0.65) !important;
      color: #CBD5E1 !important;
      padding: 2px 6px !important;
      border-top-left-radius: 4px;
    }
    .leaflet-control-attribution a {
      color: #93C5FD !important;
    }
    .recenter-btn {
      position: absolute;
      bottom: 24px;
      right: 12px;
      z-index: 1000;
      background: #FFFFFF;
      color: #0F172A;
      border: 1px solid #CBD5E1;
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.28);
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .recenter-btn:hover {
      background: #F8FAFC;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <button type="button" class="recenter-btn" id="recenterBtn" title="Re-center on pin">
    <span>⌖ Center Pin</span>
  </button>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    (function() {
      var target = [${targetLat}, ${targetLng}];
      var map = L.map('map', {
        center: target,
        zoom: 19,
        maxZoom: 21,
        minZoom: 3,
        zoomControl: true
      });

      // Pure Google Satellite layer (lyrs=s) - zero POI icons (no photos, hotels, hospitals, etc.)
      L.tileLayer('https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        maxZoom: 21,
        maxNativeZoom: 20,
        subdomains: ['0', '1', '2', '3'],
        attribution: 'Map data &copy; Google Satellite'
      }).addTo(map);

      var pinSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44">' +
        '<defs><filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">' +
        '<feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000000" flood-opacity="0.55"/>' +
        '</filter></defs>' +
        '<path filter="url(#shadow)" d="M17 2C9.27 2 3 8.27 3 16c0 10.5 14 25 14 25s14-14.5 14-25c0-7.73-6.27-14-14-14z" fill="#EA4335" stroke="#FFFFFF" stroke-width="2"/>' +
        '<circle cx="17" cy="16" r="5.5" fill="#960A0A"/>' +
        '</svg>';

      var pinIcon = L.divIcon({
        html: pinSvg,
        className: '',
        iconSize: [34, 44],
        iconAnchor: [17, 41]
      });

      L.marker(target, { icon: pinIcon }).addTo(map);

      document.getElementById('recenterBtn').addEventListener('click', function() {
        map.setView(target, 19, { animate: true });
      });
    })();
  </script>
</body>
</html>`;
}

/**
 * Opens a clutter-free Google Maps pure Satellite modal overlay in the Admin Console.
 * Uses pure Google Satellite tiles (`lyrs=s`) so all POI icons (photo locations, hotels,
 * hospitals, restaurants) and Google sidebars are completely suppressed.
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
    iframe.srcdoc = getGoogleSatelliteMapSrcDoc(clean, coords?.lat, coords?.lng);
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
 * Opens a clutter-free Google Maps pure Satellite view with all POI icons suppressed.
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

export interface FleetMapTransactionItem {
  id: string;
  timestamp: string;
  type: string;
  summary: string;
}

export interface FleetMapMarkerItem {
  equipmentId: string;
  type: 'GENERATOR' | 'TANK' | 'PLANT';
  area: string;
  location: string;
  what3words: string;
  capacity?: number;
  rentalSerialNumber: string;
  isOn?: boolean;
  checkInStatus?: 'checked_in' | 'checked_out' | 'none';
  txCount?: number;
  recentTransactions?: FleetMapTransactionItem[];
  lat: number;
  lng: number;
}

/**
 * Generates a self-contained HTML document (`srcDoc`) for the Admin Console Fleet Satellite Map View.
 * Renders pure Google Satellite imagery (`lyrs=s`, zero POI clutter) with an Equipment Type Icon
 * at the resolved location for each equipment ID.
 */
export function getFleetSatelliteMapSrcDoc(markers: FleetMapMarkerItem[]): string {
  const markersJson = JSON.stringify(markers).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      background: #0F172A;
      overflow: hidden;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }
    .leaflet-control-attribution {
      font-size: 10px !important;
      background: rgba(15, 23, 42, 0.65) !important;
      color: #CBD5E1 !important;
      padding: 2px 6px !important;
      border-top-left-radius: 4px;
    }
    .leaflet-control-attribution a {
      color: #93C5FD !important;
    }
    .eq-map-marker {
      display: flex;
      flex-direction: column;
      align-items: center;
      transform: translate(-50%, -50%);
      cursor: pointer;
      user-select: none;
    }
    .eq-map-icon-box {
      position: relative;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: #EC721E;
      border: none;
      box-shadow: 0 3px 8px rgba(0, 0, 0, 0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.12s ease, box-shadow 0.12s ease;
    }
    .eq-map-marker:hover .eq-map-icon-box {
      transform: scale(1.14);
      box-shadow: 0 5px 14px rgba(0, 0, 0, 0.6);
      z-index: 10;
    }
    .eq-map-status-cluster {
      position: absolute;
      top: -3px;
      left: -4px;
      display: inline-flex;
      align-items: center;
      gap: 1px;
      z-index: 2;
    }
    .eq-map-status-sq {
      width: 9px;
      height: 9px;
      border-radius: 2px;
      border: 1.5px solid #FFFFFF;
      box-sizing: border-box;
      display: block;
      flex-shrink: 0;
    }
    .eq-map-label {
      margin-top: 2px;
      padding: 1px 5px;
      border-radius: 3px;
      background: rgba(15, 23, 42, 0.86);
      color: #FFFFFF;
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      font-weight: 700;
      white-space: nowrap;
      border: 1px solid rgba(255, 255, 255, 0.22);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
    }
    .fit-btn {
      position: absolute;
      bottom: 24px;
      right: 12px;
      z-index: 1000;
      background: #FFFFFF;
      color: #0F172A;
      border: 1px solid #CBD5E1;
      border-radius: 6px;
      padding: 7px 12px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.28);
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .fit-btn:hover {
      background: #F8FAFC;
    }
    .leaflet-popup-content-wrapper {
      border-radius: 8px !important;
      padding: 2px !important;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.35) !important;
    }
    .leaflet-popup-content {
      margin: 10px 12px !important;
      min-width: 210px;
    }
    .popup-id {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 800;
      font-size: 14px;
      color: #0F172A;
    }
    .popup-meta {
      font-size: 12px;
      color: #475569;
      margin: 4px 0;
    }
    .popup-w3w {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: #2563EB;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .popup-actions {
      display: flex;
      gap: 6px;
      margin-top: 8px;
    }
    .popup-btn {
      flex: 1;
      padding: 5px 8px;
      font-size: 11px;
      font-weight: 700;
      border-radius: 4px;
      border: 1px solid #CBD5E1;
      background: #F8FAFC;
      color: #0F172A;
      cursor: pointer;
      text-align: center;
    }
    .popup-btn-primary {
      background: #2563EB;
      border-color: #2563EB;
      color: #FFFFFF;
    }
    .leaflet-tooltip.eq-tx-balloon {
      background: #FFFFFF !important;
      color: #0F172A !important;
      border: 1px solid #CBD5E1 !important;
      border-radius: 8px !important;
      padding: 8px 10px !important;
      box-shadow: 0 8px 22px rgba(0, 0, 0, 0.38) !important;
      min-width: 245px;
      max-width: 320px;
      white-space: normal !important;
      pointer-events: none;
    }
    .leaflet-tooltip-top.eq-tx-balloon::before {
      border-top-color: #FFFFFF !important;
    }
    .leaflet-tooltip-bottom.eq-tx-balloon::before {
      border-bottom-color: #FFFFFF !important;
    }
    .tx-balloon-hdr {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding-bottom: 5px;
      margin-bottom: 5px;
      border-bottom: 1px solid #E2E8F0;
    }
    .tx-balloon-id {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      font-weight: 800;
      color: #0F172A;
    }
    .tx-balloon-badge {
      font-size: 10px;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 999px;
      background: #EFF6FF;
      color: #1D4ED8;
      border: 1px solid #BFDBFE;
    }
    .tx-balloon-sub {
      font-size: 11px;
      color: #64748B;
      margin-bottom: 6px;
      line-height: 1.3;
    }
    .tx-balloon-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .tx-balloon-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 3px 5px;
      border-radius: 4px;
      background: #F8FAFC;
      border: 1px solid #F1F5F9;
      font-size: 11px;
      line-height: 1.25;
    }
    .tx-balloon-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: 15px;
      height: 15px;
    }
    .tx-balloon-ts {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      font-weight: 600;
      color: #475569;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .tx-balloon-val {
      font-size: 11px;
      font-weight: 600;
      color: #0F172A;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
    }
    .tx-balloon-empty {
      font-size: 11px;
      color: #94A3B8;
      font-style: italic;
      padding: 4px 2px;
    }
    .tx-balloon-more {
      font-size: 10px;
      font-weight: 600;
      color: #64748B;
      text-align: right;
      margin-top: 3px;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <button type="button" class="fit-btn" id="fitBoundsBtn" title="Fit all equipment on map">
    <span>⌖ Fit All Equipment</span>
  </button>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    (function() {
      var items = ${markersJson};
      var defaultCenter = [52.0733, -1.0147];
      var map = L.map('map', {
        center: defaultCenter,
        zoom: 16,
        maxZoom: 21,
        minZoom: 3,
        zoomControl: true
      });

      // Pure Google Satellite layer (lyrs=s) - zero POI clutter
      L.tileLayer('https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        maxZoom: 21,
        maxNativeZoom: 20,
        subdomains: ['0', '1', '2', '3'],
        attribution: 'Map data &copy; Google Satellite'
      }).addTo(map);

      function getEquipmentSvg(type, color) {
        if (type === 'GENERATOR') {
          return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none">' +
            '<g transform="translate(-102)">' +
            '<path d="m 106,6 c -1,0 -2,1 -2,2 v 9 c 0,1 1,2 2,2 h 16 c 1,0 2,-1 2,-2 V 8 c 0,-1 -1,-2 -2,-2 z M 118.69922,7.9003906 120.30078,9.099609 118.5,11.5 h 3 l -4.19922,5.599609 -1.60156,-1.199218 L 117.5,13.5 h -3 z M 106,8.5 h 7 v 2 h -7 z m 0,3 h 7 v 2 h -7 z m 0,3 h 7 v 2 h -7 z" fill="' + color + '" fill-rule="evenodd"/>' +
            '<path d="m 107,4.5 h 3" stroke="' + color + '" stroke-width="2" stroke-linecap="round" fill="none"/>' +
            '<path d="m 106,21 h 16" stroke="' + color + '" stroke-width="2" stroke-linecap="round" fill="none"/>' +
            '<path d="M 118,6 V 3 h 2" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
            '</g></svg>';
        }
        if (type === 'TANK') {
          return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none">' +
            '<g transform="translate(-136)">' +
            '<rect x="139" y="5.5" width="15.5" height="8" rx="2.5" fill="' + color + '" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<circle cx="147" cy="18.5" r="2.5" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<path d="m 143,3 h 3.5" stroke="' + color + '" stroke-width="2" stroke-linecap="round" fill="none"/>' +
            '<path d="m 151,16 h 7" stroke="' + color + '" stroke-width="2" stroke-linecap="round" fill="none"/>' +
            '<path d="m 143,16 h -3" stroke="' + color + '" stroke-width="2" stroke-linecap="round" fill="none"/>' +
            '</g></svg>';
        }
        // PLANT (Forklift / Plant)
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none">' +
          '<g transform="translate(-170)">' +
          '<circle cx="175.82" cy="20.11" r="1.6" fill="none" stroke="' + color + '" stroke-width="1.5"/>' +
          '<circle cx="184.72" cy="20.16" r="1.6" fill="none" stroke="' + color + '" stroke-width="1.5"/>' +
          '<path d="M 172.72,19.70 172.5,11.5 176,11 176.5,5.5 182,5 l 1,0.5 1.5,8.5 h 3.5" fill="none" stroke="' + color + '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
          '<path d="m 172.72,19.20 1.5,-2 h 3.5 l 1,2 h 3 l 2,-2" fill="none" stroke="' + color + '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
          '<path d="m 192,21.5 h -4 V 2" fill="none" stroke="' + color + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
          '</g></svg>';
      }

      function getTxTypeSvg(type) {
        var t = (type || '').toString();
        if (t.indexOf('CheckIn') !== -1 || t === 'check-in') {
          return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#16A34A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
            '<g transform="translate(-204)"><path d="M 216,5 V 3 h 9 v 18 h -9 v -1 -1" /><path d="m 218,12 h -10 -1" /><path d="m 214,9 4,3 -4,3" /></g></svg>';
        }
        if (t.indexOf('CheckOut') !== -1 || t === 'check-out') {
          return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#16A34A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
            '<g transform="translate(-34)"><path d="M 46,5 V 3 h 9 v 18 h -9 v -1 -1" /><path d="m 37,12 h 10 1" /><path d="m 41,9 -4,3 4,3" /></g></svg>';
        }
        if (t === 'PoweredUp' || t === 'power-up') {
          return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#16A34A" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/></svg>';
        }
        if (t === 'PoweredDown' || t === 'power-down') {
          return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#DC2626" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M18.36 6.64A9 9 0 0 1 20.77 15"/><path d="M6.16 6.16a9 9 0 1 0 12.68 12.68"/><path d="M12 2v4"/><path d="m2 2 20 20"/></svg>';
        }
        // FuelTransfer
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none">' +
          '<g transform="translate(-68)"><g transform="translate(2)"><circle cx="86.75" cy="12.25" r="1.75" fill="#2563EB" /><path d="M 85.5,12 86.715,9.5 88,12" stroke="#2563EB" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" /></g>' +
          '<path d="m 72.5,20.5 c 0,0 -0.437,-1.493 -0.5,-2 -0.062,-0.506 -0.081,-0.656 0,-1 0.081,-0.343 0.253,-0.657 0.5,-1 0.246,-0.342 1,-1 1,-1" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />' +
          '<path d="M 72.5,13.5 76,17 77.5,17.5 78.5,17 83,12.5 82.5,9 80,6.5 78.5,7.5 77,7 l -2,2 0.5,1.5 z" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />' +
          '<path d="m 81.5,7.5 3.5,-3 h 3.5" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />' +
          '<path d="M 75,15 78.5,11.5 82,13" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />' +
          '<path d="M 78,12.5 V 15" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></g></svg>';
      }

      var boundsPoints = [];
      var markersById = {};
      var hasFittedOnce = false;

      function spreadOverlappingItems(rawList) {
        var groups = {};
        (rawList || []).forEach(function(m) {
          var key = Number(m.lat).toFixed(6) + ',' + Number(m.lng).toFixed(6);
          if (!groups[key]) groups[key] = [];
          groups[key].push(m);
        });
        var result = [];
        Object.keys(groups).forEach(function(key) {
          var group = groups[key];
          if (group.length === 1) {
            result.push(group[0]);
          } else {
            var radiusLat = 0.000042;
            var radiusLng = 0.000068;
            group.forEach(function(item, idx) {
              var angle = (2 * Math.PI * idx) / group.length;
              var copy = {};
              Object.keys(item).forEach(function(k) { copy[k] = item[k]; });
              copy.lat = item.lat + radiusLat * Math.sin(angle);
              copy.lng = item.lng + radiusLng * Math.cos(angle);
              result.push(copy);
            });
          }
        });
        return result;
      }

      function fitAll() {
        if (boundsPoints.length === 1) {
          map.setView(boundsPoints[0], 19);
        } else if (boundsPoints.length > 1) {
          var bounds = L.latLngBounds(boundsPoints);
          map.fitBounds(bounds, { padding: [45, 45], maxZoom: 19 });
        }
      }

      function renderOrUpdateMarkers(rawList) {
        var adjusted = spreadOverlappingItems(rawList);
        boundsPoints = [];
        var seenIds = {};

        adjusted.forEach(function(item) {
          var pt = [item.lat, item.lng];
          boundsPoints.push(pt);
          seenIds[item.equipmentId] = true;

          var bgColor = item.type === 'GENERATOR' ? '#EC721E' : item.type === 'TANK' ? '#2563EB' : '#16A34A';
          var iconColor = '#FFFFFF';
          var chkColor = item.checkInStatus === 'checked_in' ? '#16A34A' : '#DC2626';
          var pwrColor = item.isOn ? '#16A34A' : '#DC2626';
          var statusSqHtml = item.type === 'GENERATOR'
            ? '<span class="eq-map-status-cluster">' +
                '<span class="eq-map-status-sq" style="background:' + chkColor + '"></span>' +
                '<span class="eq-map-status-sq" style="background:' + pwrColor + '"></span>' +
              '</span>'
            : '<span class="eq-map-status-cluster">' +
                '<span class="eq-map-status-sq" style="background:' + chkColor + '"></span>' +
              '</span>';

          var html = '<div class="eq-map-marker">' +
            '<div class="eq-map-icon-box" style="background:' + bgColor + '">' +
              getEquipmentSvg(item.type, iconColor) +
              statusSqHtml +
            '</div>' +
            '<div class="eq-map-label">' + item.equipmentId + '</div>' +
          '</div>';

          var divIcon = L.divIcon({
            html: html,
            className: '',
            iconSize: [0, 0],
            iconAnchor: [0, 0]
          });

          var capStr = item.type === 'GENERATOR' && item.capacity ? (item.capacity + ' kVA')
            : item.type === 'TANK' && item.capacity ? (item.capacity + ' L')
            : 'Unrated';

          var txList = Array.isArray(item.recentTransactions) ? item.recentTransactions : [];
          var maxBalloonTx = 6;
          var visibleTx = txList.slice(0, maxBalloonTx);
          var txRowsHtml = '';

          if (visibleTx.length === 0) {
            txRowsHtml = '<div class="tx-balloon-empty">No transactions recorded</div>';
          } else {
            txRowsHtml = '<div class="tx-balloon-list">';
            visibleTx.forEach(function(tx) {
              txRowsHtml += '<div class="tx-balloon-row">' +
                '<span class="tx-balloon-icon">' + getTxTypeSvg(tx.type) + '</span>' +
                '<span class="tx-balloon-ts">' + tx.timestamp + '</span>' +
                '<span class="tx-balloon-val">' + tx.summary + '</span>' +
              '</div>';
            });
            txRowsHtml += '</div>';
            if ((item.txCount || txList.length) > visibleTx.length) {
              var remaining = (item.txCount || txList.length) - visibleTx.length;
              txRowsHtml += '<div class="tx-balloon-more">+' + remaining + ' earlier transaction' + (remaining === 1 ? '' : 's') + '</div>';
            }
          }

          var balloonHtml = '<div>' +
            '<div class="tx-balloon-hdr">' +
              '<span class="tx-balloon-id">' + item.equipmentId + '</span>' +
              '<span class="tx-balloon-badge">' + (item.txCount || 0) + ' tx</span>' +
            '</div>' +
            '<div class="tx-balloon-sub">' + item.area + ' • ' + item.location + '</div>' +
            txRowsHtml +
          '</div>';

          var popupHtml = '<div>' +
            '<div class="popup-id">' + item.equipmentId + '</div>' +
            '<div class="popup-meta"><strong>' + item.type + '</strong> • ' + capStr + (item.type === 'GENERATOR' ? (' • ' + (item.isOn ? '<span style="color:#16A34A;font-weight:700">ON</span>' : '<span style="color:#64748B;font-weight:700">OFF</span>')) : '') + '</div>' +
            '<div class="popup-meta">' + item.area + ' • ' + item.location + '</div>' +
            '<div class="popup-w3w">' + item.what3words + '</div>' +
            '<div class="popup-actions">' +
              '<button type="button" class="popup-btn popup-btn-primary" onclick="window.parent.postMessage({type:\\'TTD_MAP_SELECT_ASSET\\',equipmentId:\\'' + item.equipmentId + '\\'}, \\'*\\')">Transactions (' + (item.txCount || 0) + ')</button>' +
              '<button type="button" class="popup-btn" onclick="window.parent.postMessage({type:\\'TTD_MAP_EDIT_ASSET\\',equipmentId:\\'' + item.equipmentId + '\\'}, \\'*\\')">Edit</button>' +
            '</div>' +
          '</div>';

          var existing = markersById[item.equipmentId];
          if (existing) {
            var oldLatLng = existing.getLatLng();
            if (Math.abs(oldLatLng.lat - pt[0]) > 1e-7 || Math.abs(oldLatLng.lng - pt[1]) > 1e-7) {
              existing.setLatLng(pt);
            }
            existing.setIcon(divIcon);
            existing.setTooltipContent(balloonHtml);
            existing.setPopupContent(popupHtml);
          } else {
            var marker = L.marker(pt, { icon: divIcon }).addTo(map);
            marker.bindTooltip(balloonHtml, {
              direction: 'top',
              offset: [0, -24],
              opacity: 1,
              className: 'eq-tx-balloon'
            });
            marker.bindPopup(popupHtml, { offset: [0, -14] });
            marker.on('popupopen', function() {
              marker.closeTooltip();
            });
            markersById[item.equipmentId] = marker;
          }
        });

        Object.keys(markersById).forEach(function(eqId) {
          if (!seenIds[eqId]) {
            map.removeLayer(markersById[eqId]);
            delete markersById[eqId];
          }
        });

        if (!hasFittedOnce && boundsPoints.length > 0) {
          hasFittedOnce = true;
          fitAll();
        }
      }

      renderOrUpdateMarkers(items);

      window.addEventListener('message', function(e) {
        if (!e.data || typeof e.data !== 'object') return;
        if (e.data.type === 'TTD_MAP_UPDATE_MARKERS' && Array.isArray(e.data.markers)) {
          renderOrUpdateMarkers(e.data.markers);
        }
      });

      document.getElementById('fitBoundsBtn').addEventListener('click', function() {
        fitAll();
      });
    })();
  </script>
</body>
</html>`;
}
