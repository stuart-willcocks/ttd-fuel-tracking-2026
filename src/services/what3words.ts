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
    .map-bottom-controls {
      position: absolute;
      bottom: 24px;
      right: 12px;
      z-index: 1000;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .recenter-btn {
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
      user-select: none;
    }
    .recenter-btn:hover {
      background: #F8FAFC;
    }
    .recenter-btn.active {
      background: #2563EB;
      color: #FFFFFF;
      border-color: #1D4ED8;
    }
    @keyframes pdaPulseRing {
      0% { transform: scale(0.85); opacity: 0.75; }
      70% { transform: scale(1.65); opacity: 0; }
      100% { transform: scale(1.65); opacity: 0; }
    }
    .pda-device-loc-wrap {
      position: relative;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .pda-device-loc-pulse {
      position: absolute;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: rgba(37, 99, 235, 0.45);
      animation: pdaPulseRing 2s infinite ease-out;
      pointer-events: none;
    }
    .pda-device-loc-disc {
      position: relative;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: #64748B;
      border: 2.5px solid #FFFFFF;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #FFFFFF;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="map-bottom-controls">
    <button type="button" class="recenter-btn" id="deviceLocBtn" title="Show or hide current device location">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <rect width="14" height="20" x="5" y="2" rx="2" ry="2"/>
        <path d="M12 18h.01"/>
      </svg>
      <span id="deviceLocLabel">My Location</span>
    </button>
    <button type="button" class="recenter-btn" id="recenterBtn" title="Re-center on pin">
      <span>⌖ Center Pin</span>
    </button>
  </div>
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

      var deviceLocBtn = document.getElementById('deviceLocBtn');
      var deviceLocLabel = document.getElementById('deviceLocLabel');
      var isDeviceLocEnabled = false;
      var deviceMarker = null;
      var geoWatchId = null;
      var hasFittedDeviceOnce = false;

      var deviceIconHtml = '<div class="pda-device-loc-wrap">' +
        '<div class="pda-device-loc-pulse"></div>' +
        '<div class="pda-device-loc-disc">' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
        '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/>' +
        '<path d="M12 18h.01"/>' +
        '</svg>' +
        '</div></div>';

      var deviceDivIcon = L.divIcon({
        html: deviceIconHtml,
        className: '',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      function updateDeviceMarker(lat, lng) {
        if (!isDeviceLocEnabled) return;
        if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) return;
        var pos = [lat, lng];
        if (!deviceMarker) {
          deviceMarker = L.marker(pos, { icon: deviceDivIcon, zIndexOffset: 500 }).addTo(map);
          deviceMarker.bindTooltip('Device Location', {
            direction: 'top',
            offset: [0, -16],
            opacity: 0.92
          });
        } else {
          deviceMarker.setLatLng(pos);
        }
        deviceLocLabel.textContent = 'My Location';
        if (!hasFittedDeviceOnce) {
          hasFittedDeviceOnce = true;
          try {
            map.fitBounds(L.latLngBounds([target, pos]), {
              padding: [48, 48],
              maxZoom: 19,
              animate: true
            });
          } catch (e) {}
        }
      }

      function stopDeviceTracking() {
        if (geoWatchId !== null && navigator.geolocation) {
          try {
            navigator.geolocation.clearWatch(geoWatchId);
          } catch (e) {}
          geoWatchId = null;
        }
        if (deviceMarker) {
          map.removeLayer(deviceMarker);
          deviceMarker = null;
        }
        hasFittedDeviceOnce = false;
        deviceLocBtn.classList.remove('active');
        deviceLocLabel.textContent = 'My Location';
        try {
          window.parent.postMessage({ type: 'TTD_PDA_LOCATION_TOGGLE', enabled: false }, '*');
        } catch (e) {}
      }

      function startDeviceTracking() {
        deviceLocBtn.classList.add('active');
        hasFittedDeviceOnce = false;

        // 1. Check cached location if accessible
        try {
          var raw = (window.sessionStorage && window.sessionStorage.getItem('ttd_cached_location')) ||
                    (window.localStorage && window.localStorage.getItem('ttd_cached_location'));
          if (raw) {
            var cached = JSON.parse(raw);
            if (cached && typeof cached.latitude === 'number' && typeof cached.longitude === 'number') {
              updateDeviceMarker(cached.latitude, cached.longitude);
            }
          }
        } catch (e) {}

        // 2. Ask parent PDA window for immediate cached + live GPS coordinates
        try {
          window.parent.postMessage({ type: 'TTD_PDA_LOCATION_TOGGLE', enabled: true }, '*');
        } catch (e) {}

        // 3. Direct browser geolocation watch inside iframe
        if (navigator.geolocation) {
          if (!deviceMarker) {
            deviceLocLabel.textContent = 'Locating...';
          }
          try {
            geoWatchId = navigator.geolocation.watchPosition(
              function(pos) {
                if (!isDeviceLocEnabled) return;
                updateDeviceMarker(pos.coords.latitude, pos.coords.longitude);
              },
              function() {
                if (!isDeviceLocEnabled) return;
                navigator.geolocation.getCurrentPosition(
                  function(pos2) {
                    if (!isDeviceLocEnabled) return;
                    updateDeviceMarker(pos2.coords.latitude, pos2.coords.longitude);
                  },
                  function() {
                    if (!deviceMarker) {
                      deviceLocLabel.textContent = 'My Location';
                    }
                  },
                  { enableHighAccuracy: false, timeout: 5000, maximumAge: 180000 }
                );
              },
              { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
            );
          } catch (e) {}
        }
      }

      deviceLocBtn.addEventListener('click', function() {
        isDeviceLocEnabled = !isDeviceLocEnabled;
        if (isDeviceLocEnabled) {
          startDeviceTracking();
        } else {
          stopDeviceTracking();
        }
      });

      window.addEventListener('message', function(ev) {
        var data = ev && ev.data;
        if (data && data.type === 'TTD_PDA_LOCATION_UPDATE') {
          updateDeviceMarker(data.lat, data.lng);
        }
      });

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
  type: 'GENERATOR' | 'TANK' | 'PLANT' | 'PDA';
  area: string;
  location: string;
  what3words: string;
  capacity?: number;
  rentalSerialNumber: string;
  isOn?: boolean;
  checkInStatus?: 'checked_in' | 'checked_out' | 'none';
  txCount?: number;
  recentTransactions?: FleetMapTransactionItem[];
  batteryLevel?: number | null;
  isCharging?: boolean | null;
  appVersion?: string | null;
  lastSeenAt?: string;
  lat: number;
  lng: number;
}

export interface FleetMapViewState {
  lat: number;
  lng: number;
  zoom: number;
}

const FLEET_MAP_VIEW_STORAGE_KEY = 'ttd_admin_fleet_map_view_v1';
let lastFleetMapView: FleetMapViewState | null = null;

export function getSavedFleetMapView(): FleetMapViewState | null {
  if (lastFleetMapView) return lastFleetMapView;
  try {
    const raw = localStorage.getItem(FLEET_MAP_VIEW_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed.lat === 'number' &&
        !Number.isNaN(parsed.lat) &&
        typeof parsed.lng === 'number' &&
        !Number.isNaN(parsed.lng) &&
        typeof parsed.zoom === 'number' &&
        !Number.isNaN(parsed.zoom)
      ) {
        lastFleetMapView = { lat: parsed.lat, lng: parsed.lng, zoom: parsed.zoom };
        return lastFleetMapView;
      }
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

export function saveFleetMapView(view: FleetMapViewState): void {
  if (
    typeof view?.lat !== 'number' ||
    Number.isNaN(view.lat) ||
    typeof view?.lng !== 'number' ||
    Number.isNaN(view.lng) ||
    typeof view?.zoom !== 'number' ||
    Number.isNaN(view.zoom)
  ) {
    return;
  }
  lastFleetMapView = { lat: view.lat, lng: view.lng, zoom: view.zoom };
  try {
    localStorage.setItem(FLEET_MAP_VIEW_STORAGE_KEY, JSON.stringify(lastFleetMapView));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Generates a self-contained HTML document (`srcDoc`) for the Admin Console Fleet Satellite Map View.
 * Renders pure Google Satellite imagery (`lyrs=s`, zero POI clutter) with an Equipment Type Icon
 * at the resolved location for each equipment ID.
 */
export function getFleetSatelliteMapSrcDoc(
  markers: FleetMapMarkerItem[],
  initialView?: FleetMapViewState | null
): string {
  const markersJson = JSON.stringify(markers).replace(/</g, '\\u003c');
  const resolvedView = initialView !== undefined ? initialView : getSavedFleetMapView();
  const savedViewJson = JSON.stringify(resolvedView || null).replace(/</g, '\\u003c');

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
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      transform: translate(-50%, -16px);
      cursor: pointer;
      user-select: none;
    }
    .eq-map-leader {
      position: absolute;
      left: 0;
      top: -16px;
      width: 100px;
      height: 32px;
      transform-origin: 0 16px;
      pointer-events: none;
      will-change: transform;
    }
    .leaflet-zoom-anim .eq-map-leader {
      transition: transform 0.25s cubic-bezier(0, 0, 0.25, 1);
    }
    .eq-map-icon-box {
      position: relative;
      z-index: 2;
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
      position: relative;
      z-index: 2;
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
      padding: 8px 12px !important;
      box-shadow: 0 8px 22px rgba(0, 0, 0, 0.38) !important;
      min-width: 280px;
      width: max-content !important;
      max-width: none !important;
      white-space: nowrap !important;
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
      gap: 10px;
      padding-bottom: 5px;
      margin-bottom: 5px;
      border-bottom: 1px solid #E2E8F0;
      white-space: nowrap;
    }
    .tx-balloon-hdr-left {
      display: inline-flex;
      align-items: baseline;
      gap: 6px;
      white-space: nowrap;
    }
    .tx-balloon-hdr-status {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-left: auto;
      flex-shrink: 0;
    }
    .tx-balloon-status-sq {
      width: 16px;
      height: 16px;
      border-radius: 3px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .tx-balloon-id {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      font-weight: 800;
      color: #0F172A;
      white-space: nowrap;
    }
    .tx-balloon-hdr-meta {
      font-size: 11px;
      font-weight: 500;
      color: #475569;
      white-space: nowrap;
    }
    .tx-balloon-sub {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: #475569;
      margin-bottom: 6px;
      line-height: 1.3;
      white-space: nowrap;
    }
    .tx-balloon-w3w {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 600;
      color: #2563EB;
      white-space: nowrap;
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
      padding: 3px 6px;
      border-radius: 4px;
      background: #F8FAFC;
      border: 1px solid #F1F5F9;
      font-size: 11px;
      line-height: 1.25;
      white-space: nowrap;
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
      var savedView = ${savedViewJson};
      if (!savedView) {
        try {
          var rawView = window.localStorage && window.localStorage.getItem('${FLEET_MAP_VIEW_STORAGE_KEY}');
          if (rawView) {
            var parsedView = JSON.parse(rawView);
            if (parsedView && typeof parsedView.lat === 'number' && typeof parsedView.lng === 'number' && typeof parsedView.zoom === 'number') {
              savedView = parsedView;
            }
          }
        } catch (e) {}
      }

      var hasValidSavedView = Boolean(
        savedView &&
        typeof savedView.lat === 'number' && !isNaN(savedView.lat) &&
        typeof savedView.lng === 'number' && !isNaN(savedView.lng) &&
        typeof savedView.zoom === 'number' && !isNaN(savedView.zoom)
      );

      var defaultCenter = [52.0733, -1.0147];
      var initialCenter = hasValidSavedView ? [savedView.lat, savedView.lng] : defaultCenter;
      var initialZoom = hasValidSavedView ? savedView.zoom : 16;

      var map = L.map('map', {
        center: initialCenter,
        zoom: initialZoom,
        maxZoom: 21,
        minZoom: 3,
        zoomControl: true
      });

      var leaderPane = map.createPane('leaderPane');
      leaderPane.style.zIndex = '590';
      leaderPane.style.pointerEvents = 'none';

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
        if (type === 'PDA') {
          return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="' + color + '" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">' +
            '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/>' +
            '<path d="M12 18h.01"/>' +
            '</svg>';
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
          return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#DC2626" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
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
      var leaderTrianglesById = {};
      var currentRawItems = items || [];
      var currentAdjustedItems = [];
      var activePinnedId = null;
      var suppressedHoverById = {};
      var areBalloonsEnabled = true;
      var balloonCooldownTimer = null;
      var hasFittedOnce = hasValidSavedView;
      var isViewTrackingReady = hasValidSavedView;
      var ICON_RADIUS_PX = 16; // 32px diameter icon disc

      function closeAllOtherTooltips(exceptEqId) {
        Object.keys(markersById).forEach(function(id) {
          if (id !== exceptEqId && markersById[id]) {
            markersById[id].closeTooltip();
          }
        });
      }

      function suspendBalloonsForZoom() {
        areBalloonsEnabled = false;
        activePinnedId = null;
        closeAllOtherTooltips(null);
        if (balloonCooldownTimer) {
          clearTimeout(balloonCooldownTimer);
        }
        balloonCooldownTimer = setTimeout(function() {
          balloonCooldownTimer = null;
          areBalloonsEnabled = true;
        }, 2000);
      }

      map.on('click', function() {
        activePinnedId = null;
        closeAllOtherTooltips(null);
      });

      function getIconDiscColor(type) {
        if (type === 'PDA') return '#64748B';
        return type === 'GENERATOR' ? '#EC721E' : type === 'TANK' ? '#2563EB' : '#16A34A';
      }

      function computeLeaderMetricsForZoom(item, zoomLevel) {
        if (!item || !item.isSharedLocation || typeof item.origLat !== 'number' || typeof item.origLng !== 'number') {
          return null;
        }
        var centerPt = map.project([item.lat, item.lng], zoomLevel);
        var targetPt = map.project([item.origLat, item.origLng], zoomLevel);
        var dx = targetPt.x - centerPt.x;
        var dy = targetPt.y - centerPt.y;
        var len = Math.sqrt(dx * dx + dy * dy);
        var angleRad = Math.atan2(dy, dx);
        return {
          len: len,
          angleRad: angleRad
        };
      }

      function updateLeaderTrianglesForZoom(zoomLevel) {
        if (typeof zoomLevel !== 'number' || isNaN(zoomLevel)) {
          zoomLevel = map.getZoom();
        }
        var sharedGroups = {};
        currentAdjustedItems.forEach(function(item) {
          if (item.isSharedLocation && item.groupKey) {
            if (!sharedGroups[item.groupKey]) sharedGroups[item.groupKey] = [];
            sharedGroups[item.groupKey].push(item);
          }
        });

        var groupOverlaps = {};
        Object.keys(sharedGroups).forEach(function(gKey) {
          var grp = sharedGroups[gKey];
          var pts = grp.map(function(c) {
            return map.project([c.lat, c.lng], zoomLevel);
          });
          var minDistPx = Infinity;
          for (var i = 0; i < pts.length; i++) {
            for (var j = i + 1; j < pts.length; j++) {
              var dx = pts[i].x - pts[j].x;
              var dy = pts[i].y - pts[j].y;
              var dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < minDistPx) minDistPx = dist;
            }
          }
          groupOverlaps[gKey] = minDistPx < (ICON_RADIUS_PX * 2);
        });

        currentAdjustedItems.forEach(function(item) {
          var leaderMarker = leaderTrianglesById[item.equipmentId];
          if (!leaderMarker) return;
          var rootEl = leaderMarker.getElement();
          if (!rootEl) return;
          var innerEl = rootEl.querySelector('.eq-map-leader');
          if (!innerEl) return;

          var metrics = computeLeaderMetricsForZoom(item, zoomLevel);
          if (!metrics) {
            innerEl.style.visibility = 'hidden';
            return;
          }
          var shouldShow = !groupOverlaps[item.groupKey] && metrics.len > ICON_RADIUS_PX;
          innerEl.style.transform =
            'rotate(' + metrics.angleRad + 'rad) scaleX(' + (Math.max(metrics.len, 0.1) / 100) + ')';
          innerEl.style.visibility = shouldShow ? 'visible' : 'hidden';
        });
      }

      function emitCurrentMapView() {
        if (!isViewTrackingReady) return;
        var c = map.getCenter();
        var z = map.getZoom();
        if (!c || typeof c.lat !== 'number' || typeof c.lng !== 'number' || typeof z !== 'number') return;
        var payload = { lat: c.lat, lng: c.lng, zoom: z };
        try {
          if (window.localStorage) {
            window.localStorage.setItem('${FLEET_MAP_VIEW_STORAGE_KEY}', JSON.stringify(payload));
          }
        } catch (e) {}
        try {
          window.parent.postMessage({
            type: 'TTD_MAP_VIEW_CHANGED',
            lat: c.lat,
            lng: c.lng,
            zoom: z
          }, '*');
        } catch (e) {}
      }

      map.on('dragstart zoomstart', function() {
        hasFittedOnce = true;
        isViewTrackingReady = true;
      });

      map.on('zoomstart', function() {
        suspendBalloonsForZoom();
      });

      map.on('moveend zoomend', function() {
        emitCurrentMapView();
      });

      // Animate leader triangle length in lockstep with Leaflet's zoom transition so base stays 32px and size never jumps after zoom
      map.on('zoomanim', function(ev) {
        suspendBalloonsForZoom();
        if (ev && typeof ev.zoom === 'number') {
          updateLeaderTrianglesForZoom(ev.zoom);
        }
      });

      map.on('zoomend', function() {
        suspendBalloonsForZoom();
      });

      map.on('zoomend viewreset', function() {
        updateLeaderTrianglesForZoom(map.getZoom());
      });

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
            var singleCopy = {};
            Object.keys(group[0]).forEach(function(k) { singleCopy[k] = group[0][k]; });
            singleCopy.origLat = group[0].lat;
            singleCopy.origLng = group[0].lng;
            singleCopy.isSharedLocation = false;
            singleCopy.groupKey = key;
            result.push(singleCopy);
          } else {
            var radiusLat = 0.000042;
            var radiusLng = 0.000068;
            group.forEach(function(item, idx) {
              var angle = (2 * Math.PI * idx) / group.length;
              var copy = {};
              Object.keys(item).forEach(function(k) { copy[k] = item[k]; });
              copy.origLat = item.lat;
              copy.origLng = item.lng;
              copy.isSharedLocation = true;
              copy.groupKey = key;
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
        currentRawItems = rawList || [];
        var adjusted = spreadOverlappingItems(currentRawItems);
        currentAdjustedItems = adjusted;
        boundsPoints = [];
        var seenIds = {};

        adjusted.forEach(function(item) {
          var pt = [item.lat, item.lng];
          boundsPoints.push(pt);
          seenIds[item.equipmentId] = true;

          var bgColor = getIconDiscColor(item.type);

          // Render or update the triangular leader marker in leaderPane (z-index 590, underneath all icon discs)
          if (item.isSharedLocation) {
            var leaderHtml = '<div class="eq-map-leader" style="visibility:hidden">' +
              '<svg width="100" height="32" viewBox="0 0 100 32" preserveAspectRatio="none" style="display:block;overflow:visible">' +
                '<polygon points="0,0 0,32 100,16" fill="' + bgColor + '" />' +
              '</svg>' +
            '</div>';
            var leaderIcon = L.divIcon({
              html: leaderHtml,
              className: '',
              iconSize: [0, 0],
              iconAnchor: [0, 0]
            });
            if (leaderTrianglesById[item.equipmentId]) {
              var oldLeaderLatLng = leaderTrianglesById[item.equipmentId].getLatLng();
              if (Math.abs(oldLeaderLatLng.lat - pt[0]) > 1e-7 || Math.abs(oldLeaderLatLng.lng - pt[1]) > 1e-7) {
                leaderTrianglesById[item.equipmentId].setLatLng(pt);
              }
              var existingRoot = leaderTrianglesById[item.equipmentId].getElement();
              var existingPoly = existingRoot && existingRoot.querySelector('polygon');
              if (existingPoly) {
                existingPoly.setAttribute('fill', bgColor);
              } else {
                leaderTrianglesById[item.equipmentId].setIcon(leaderIcon);
              }
            } else {
              leaderTrianglesById[item.equipmentId] = L.marker(pt, {
                pane: 'leaderPane',
                icon: leaderIcon,
                interactive: false,
                keyboard: false
              }).addTo(map);
            }
          } else if (leaderTrianglesById[item.equipmentId]) {
            map.removeLayer(leaderTrianglesById[item.equipmentId]);
            delete leaderTrianglesById[item.equipmentId];
          }
          var iconColor = '#FFFFFF';
          var chkColor = item.checkInStatus === 'checked_in'
            ? '#16A34A'
            : item.checkInStatus === 'checked_out'
              ? '#DC2626'
              : '#94A3B8';
          var pwrColor = item.isOn ? '#16A34A' : '#DC2626';
          var statusSqHtml = item.type === 'PDA'
            ? ''
            : item.type === 'GENERATOR'
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

          var balloonHtml = '';
          if (item.type === 'PDA') {
            var batStr = typeof item.batteryLevel === 'number'
              ? (Math.round(item.batteryLevel) + '%' + (item.isCharging ? ' (Charging)' : ''))
              : '—';
            var verStr = item.appVersion ? ('V' + String(item.appVersion).replace(/^[vV]/, '')) : '—';
            balloonHtml = '<div>' +
              '<div class="tx-balloon-hdr">' +
                '<span class="tx-balloon-hdr-left">' +
                  '<span class="tx-balloon-id">' + item.equipmentId + '</span>' +
                  '<span class="tx-balloon-hdr-meta">• PDA • ' + verStr + '</span>' +
                '</span>' +
              '</div>' +
              '<div class="tx-balloon-sub">' +
                '<span>Battery: <strong>' + batStr + '</strong></span>' +
                '<span>•</span>' +
                '<span class="tx-balloon-w3w">' + (item.what3words || '') + '</span>' +
              '</div>' +
              (item.lastSeenAt
                ? '<div class="tx-balloon-row"><span class="tx-balloon-ts">Last active:</span><span class="tx-balloon-val">' + item.lastSeenAt + '</span></div>'
                : '') +
            '</div>';
          } else {
            var txList = Array.isArray(item.recentTransactions) ? item.recentTransactions : [];
            var maxBalloonTx = 10;
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

            var hdrMetaParts = [];
            if (item.type === 'GENERATOR' && item.capacity) {
              hdrMetaParts.push(item.capacity + ' kVA');
            } else if (item.type === 'TANK' && item.capacity) {
              hdrMetaParts.push(item.capacity + ' L');
            } else if (item.capacity) {
              hdrMetaParts.push(String(item.capacity));
            }
            if (item.rentalSerialNumber) {
              hdrMetaParts.push(item.rentalSerialNumber);
            }

            var w3wDisplay = item.what3words
              ? (item.what3words.indexOf('///') === 0 ? item.what3words : '///' + item.what3words)
              : '';
            var areaLocStr = (item.area && item.location)
              ? (item.area + ' / ' + item.location)
              : (item.area || item.location || '');

            var chkSqSymbolSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#FFFFFF" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
            var pwrSqSymbolSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#FFFFFF" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/></svg>';

            var balloonStatusHtml = '<span class="tx-balloon-hdr-status">' +
              '<span class="tx-balloon-status-sq" style="background:' + chkColor + '">' + chkSqSymbolSvg + '</span>' +
              (item.type === 'GENERATOR'
                ? '<span class="tx-balloon-status-sq" style="background:' + pwrColor + '">' + pwrSqSymbolSvg + '</span>'
                : '') +
            '</span>';

            balloonHtml = '<div>' +
              '<div class="tx-balloon-hdr">' +
                '<span class="tx-balloon-hdr-left">' +
                  '<span class="tx-balloon-id">' + item.equipmentId + '</span>' +
                  (hdrMetaParts.length > 0 ? '<span class="tx-balloon-hdr-meta">• ' + hdrMetaParts.join(' • ') + '</span>' : '') +
                '</span>' +
                balloonStatusHtml +
              '</div>' +
              '<div class="tx-balloon-sub">' +
                '<span>' + areaLocStr + '</span>' +
                (w3wDisplay ? '<span>•</span><span class="tx-balloon-w3w">' + w3wDisplay + '</span>' : '') +
              '</div>' +
              txRowsHtml +
            '</div>';
          }

          var existing = markersById[item.equipmentId];
          if (existing) {
            var oldLatLng = existing.getLatLng();
            if (Math.abs(oldLatLng.lat - pt[0]) > 1e-7 || Math.abs(oldLatLng.lng - pt[1]) > 1e-7) {
              existing.setLatLng(pt);
            }
            existing.setIcon(divIcon);
            existing.setTooltipContent(balloonHtml);
            if (activePinnedId === item.equipmentId) {
              closeAllOtherTooltips(item.equipmentId);
              existing.openTooltip();
            }
          } else {
            var eqId = item.equipmentId;
            var marker = L.marker(pt, { icon: divIcon }).addTo(map);
            marker.bindTooltip(balloonHtml, {
              direction: 'top',
              offset: [0, -24],
              opacity: 1,
              className: 'eq-tx-balloon'
            });
            marker.off('mouseover');
            marker.off('mouseout');
            marker.on('mouseover', function() {
              if (!areBalloonsEnabled) return;
              if (!suppressedHoverById[eqId]) {
                closeAllOtherTooltips(eqId);
                marker.openTooltip();
              }
            });
            marker.on('mouseout', function() {
              suppressedHoverById[eqId] = false;
              if (activePinnedId !== eqId) {
                marker.closeTooltip();
                if (areBalloonsEnabled && activePinnedId && markersById[activePinnedId]) {
                  markersById[activePinnedId].openTooltip();
                }
              }
            });
            marker.on('click', function(ev) {
              if (ev && ev.originalEvent) {
                ev.originalEvent.stopPropagation();
              }
              if (!areBalloonsEnabled) return;
              if (activePinnedId === eqId) {
                activePinnedId = null;
                suppressedHoverById[eqId] = true;
                marker.closeTooltip();
              } else {
                activePinnedId = eqId;
                suppressedHoverById[eqId] = false;
                closeAllOtherTooltips(eqId);
                marker.openTooltip();
              }
            });
            markersById[eqId] = marker;
          }
        });

        Object.keys(markersById).forEach(function(eqId) {
          if (!seenIds[eqId]) {
            map.removeLayer(markersById[eqId]);
            delete markersById[eqId];
            if (activePinnedId === eqId) {
              activePinnedId = null;
            }
            delete suppressedHoverById[eqId];
          }
        });

        Object.keys(leaderTrianglesById).forEach(function(eqId) {
          if (!seenIds[eqId]) {
            map.removeLayer(leaderTrianglesById[eqId]);
            delete leaderTrianglesById[eqId];
          }
        });

        if (!hasFittedOnce && boundsPoints.length > 0) {
          hasFittedOnce = true;
          isViewTrackingReady = true;
          fitAll();
          emitCurrentMapView();
        }

        updateLeaderTrianglesForZoom(map.getZoom());
      }

      renderOrUpdateMarkers(items);

      window.addEventListener('message', function(e) {
        if (!e.data || typeof e.data !== 'object') return;
        if (e.data.type === 'TTD_MAP_UPDATE_MARKERS' && Array.isArray(e.data.markers)) {
          renderOrUpdateMarkers(e.data.markers);
        }
      });

      document.getElementById('fitBoundsBtn').addEventListener('click', function() {
        hasFittedOnce = true;
        isViewTrackingReady = true;
        fitAll();
        emitCurrentMapView();
      });
    })();
  </script>
</body>
</html>`;
}
