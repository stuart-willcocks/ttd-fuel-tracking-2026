import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapPin, RotateCcw } from 'lucide-react';
import { IconBack, IconSubmit, IconCancel } from './icons/AppIcons';
import type { Equipment } from '../types';
import { EquipmentTypeIcon } from './EquipmentTypeIcon';
import {
  convertWhat3WordsToCoordinates,
  convertCoordinatesToWhat3Words,
  formatGpsCoordinates,
  getCachedWhat3WordsCoordinates,
  getPdaRelocateMapSrcDoc,
  isValidWhat3WordsFormat,
  normalizeWhat3Words,
  primeWhat3WordsCache,
  type W3WCoordinates,
  type W3WReverseResult,
} from '../services/what3words';
import { getCurrentLocation } from '../services/telemetry';
import { syncEngine } from '../services/syncEngine';

interface EditAssetModalProps {
  asset: Equipment;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: Equipment) => void | Promise<void>;
}

export const EditAssetModal: React.FC<EditAssetModalProps> = ({
  asset,
  isOpen,
  onClose,
  onSave,
}) => {
  const isGenerator = asset.type === 'GENERATOR';
  const isTank = asset.type === 'TANK';
  const isBattery = asset.type === 'BATTERY';
  const capacityUnit = isGenerator ? 'kVA' : isTank ? 'L' : '';

  const initialCleanW3w = useMemo(() => {
    const clean = normalizeWhat3Words(asset.what3words);
    if (clean) return clean;
    if (typeof asset.latitude === 'number' && typeof asset.longitude === 'number') {
      return formatGpsCoordinates(asset.latitude, asset.longitude);
    }
    return '';
  }, [asset.what3words, asset.latitude, asset.longitude]);

  const [capacity, setCapacity] = useState<string>(() =>
    asset.capacity !== undefined && asset.capacity !== null ? String(asset.capacity) : ''
  );
  const [serial, setSerial] = useState<string>(() => asset.rentalSerialNumber || '');
  const [relocatedW3w, setRelocatedW3w] = useState<W3WReverseResult | null>(null);
  const [isResolvingW3w, setIsResolvingW3w] = useState<boolean>(false);
  const [relocateError, setRelocateError] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const [resolvedInitialCoords, setResolvedInitialCoords] = useState<W3WCoordinates | null>(() => {
    if (typeof asset.latitude === 'number' && typeof asset.longitude === 'number') {
      return { lat: asset.latitude, lng: asset.longitude };
    }
    return getCachedWhat3WordsCoordinates(initialCleanW3w);
  });
  const [isResolvingInitialCoords, setIsResolvingInitialCoords] = useState<boolean>(false);

  const mapIframeRef = useRef<HTMLIFrameElement | null>(null);
  const lookupSeqRef = useRef<number>(0);

  // Reset form state when asset changes or view opens
  useEffect(() => {
    if (!isOpen) return;
    setCapacity(
      asset.capacity !== undefined && asset.capacity !== null ? String(asset.capacity) : ''
    );
    setSerial(asset.rentalSerialNumber || '');
    setRelocatedW3w(null);
    setIsResolvingW3w(false);
    setRelocateError(null);
    setIsConfirmOpen(false);
    setIsSaving(false);
  }, [asset.equipmentId, asset.capacity, asset.rentalSerialNumber, asset.what3words, isOpen]);

  // Resolve initial asset coordinates for the map if not yet cached
  useEffect(() => {
    if (!isOpen) return;
    if (typeof asset.latitude === 'number' && typeof asset.longitude === 'number') {
      setResolvedInitialCoords({ lat: asset.latitude, lng: asset.longitude });
      return;
    }
    const cached = getCachedWhat3WordsCoordinates(initialCleanW3w);
    if (cached) {
      setResolvedInitialCoords(cached);
      return;
    }
    if (!initialCleanW3w) {
      setResolvedInitialCoords(null);
      return;
    }

    let cancelled = false;
    setIsResolvingInitialCoords(true);
    convertWhat3WordsToCoordinates(initialCleanW3w)
      .then((coords) => {
        if (!cancelled && coords) {
          setResolvedInitialCoords(coords);
        }
      })
      .finally(() => {
        if (!cancelled) setIsResolvingInitialCoords(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, asset.equipmentId, asset.latitude, asset.longitude, initialCleanW3w]);

  // Stable map srcDoc so tapping the map does not reload the iframe
  const mapSrcDoc = useMemo(() => {
    if (!isOpen) return '';
    return getPdaRelocateMapSrcDoc(
      initialCleanW3w,
      resolvedInitialCoords?.lat,
      resolvedInitialCoords?.lng,
      asset.type
    );
  }, [isOpen, initialCleanW3w, resolvedInitialCoords?.lat, resolvedInitialCoords?.lng, asset.type]);

  // Listen for map relocation picks and GPS location requests from the iframe
  useEffect(() => {
    if (!isOpen) return;

    let watchId: number | null = null;
    let isTrackingActive = false;

    const postLocationToIframe = (lat: number, lng: number) => {
      mapIframeRef.current?.contentWindow?.postMessage(
        { type: 'TTD_PDA_LOCATION_UPDATE', lat, lng },
        '*'
      );
    };

    const stopWatch = () => {
      isTrackingActive = false;
      if (watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        try {
          navigator.geolocation.clearWatch(watchId);
        } catch {}
        watchId = null;
      }
    };

    const handleMessage = (ev: MessageEvent) => {
      if (
        mapIframeRef.current?.contentWindow &&
        ev.source !== mapIframeRef.current.contentWindow
      ) {
        return;
      }
      const data = ev.data;
      if (!data || typeof data !== 'object') return;

      if (
        data.type === 'TTD_PDA_RELOCATE_PICK' &&
        typeof data.lat === 'number' &&
        typeof data.lng === 'number'
      ) {
        const pickedLat = data.lat;
        const pickedLng = data.lng;
        const seq = ++lookupSeqRef.current;

        const applyGpsFallback = (lat: number, lng: number) => {
          const gpsStr = formatGpsCoordinates(lat, lng);
          const fallbackResult: W3WReverseResult = {
            words: gpsStr,
            formattedWords: gpsStr,
            lat,
            lng,
          };
          setIsResolvingW3w(false);
          setRelocateError(null);
          setRelocatedW3w(fallbackResult);
          mapIframeRef.current?.contentWindow?.postMessage(
            {
              type: 'TTD_PDA_RELOCATE_RESOLVED',
              lat,
              lng,
              formattedWords: gpsStr,
            },
            '*'
          );
        };

        // If PDA is offline (or in simulated offline mode), record and display GPS coordinates immediately
        if (!syncEngine.isEffectivelyOnline()) {
          applyGpsFallback(pickedLat, pickedLng);
          return;
        }

        setIsResolvingW3w(true);
        setRelocateError(null);

        convertCoordinatesToWhat3Words(pickedLat, pickedLng)
          .then((resolved) => {
            if (seq !== lookupSeqRef.current) return;
            if (!resolved) {
              // what3words API inaccessible for any reason: fallback to GPS coordinates
              applyGpsFallback(pickedLat, pickedLng);
              return;
            }
            setIsResolvingW3w(false);
            setRelocatedW3w(resolved);
            mapIframeRef.current?.contentWindow?.postMessage(
              {
                type: 'TTD_PDA_RELOCATE_RESOLVED',
                lat: resolved.lat,
                lng: resolved.lng,
                formattedWords: resolved.formattedWords,
              },
              '*'
            );
          })
          .catch(() => {
            if (seq !== lookupSeqRef.current) return;
            applyGpsFallback(pickedLat, pickedLng);
          });
        return;
      }

      if (data.type === 'TTD_PDA_LOCATION_TOGGLE') {
        if (!data.enabled) {
          stopWatch();
          return;
        }
        isTrackingActive = true;

        try {
          const raw =
            sessionStorage.getItem('ttd_cached_location') ||
            localStorage.getItem('ttd_cached_location');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (typeof parsed?.latitude === 'number' && typeof parsed?.longitude === 'number') {
              postLocationToIframe(parsed.latitude, parsed.longitude);
            }
          }
        } catch {}

        getCurrentLocation()
          .then((loc) => {
            if (isTrackingActive && loc) {
              postLocationToIframe(loc.latitude, loc.longitude);
            }
          })
          .catch(() => {});

        if (watchId === null && typeof navigator !== 'undefined' && navigator.geolocation) {
          try {
            watchId = navigator.geolocation.watchPosition(
              (pos) => {
                if (!isTrackingActive) return;
                postLocationToIframe(pos.coords.latitude, pos.coords.longitude);
              },
              () => {},
              { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
            );
          } catch {}
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      stopWatch();
    };
  }, [isOpen]);

  const handleResetRelocation = () => {
    lookupSeqRef.current += 1;
    setIsResolvingW3w(false);
    setRelocateError(null);
    setRelocatedW3w(null);
    mapIframeRef.current?.contentWindow?.postMessage(
      { type: 'TTD_PDA_RELOCATE_RESET' },
      '*'
    );
  };

  // Automatically resolve GPS coordinate relocation to what3words as soon as the service becomes available
  useEffect(() => {
    if (!isOpen || !relocatedW3w) return;
    if (isValidWhat3WordsFormat(relocatedW3w.words)) return;

    let cancelled = false;
    const tryResolveCandidate = async () => {
      if (cancelled || !syncEngine.isEffectivelyOnline()) return;
      const resolved = await convertCoordinatesToWhat3Words(
        relocatedW3w.lat,
        relocatedW3w.lng
      );
      if (cancelled || !resolved) return;
      setRelocatedW3w(resolved);
      mapIframeRef.current?.contentWindow?.postMessage(
        {
          type: 'TTD_PDA_RELOCATE_RESOLVED',
          lat: resolved.lat,
          lng: resolved.lng,
          formattedWords: resolved.formattedWords,
        },
        '*'
      );
    };

    tryResolveCandidate();
    const unsub = syncEngine.subscribe((state) => {
      if (state.isOnline) {
        tryResolveCandidate();
      }
    });
    const timer = setInterval(tryResolveCandidate, 8000);

    return () => {
      cancelled = true;
      unsub();
      clearInterval(timer);
    };
  }, [isOpen, relocatedW3w]);

  const parsedCapacity = useMemo(() => {
    if (isBattery) return undefined;
    const trimmed = capacity.trim();
    if (!trimmed) return undefined;
    const num = Number(trimmed);
    if (!Number.isInteger(num) || num <= 0) return NaN;
    return num;
  }, [capacity, isBattery]);

  const isCapacityValid = isBattery || !Number.isNaN(parsedCapacity);

  const isCapacityChanged = !isBattery && parsedCapacity !== asset.capacity;
  const isSerialChanged = serial.trim() !== (asset.rentalSerialNumber || '').trim();
  const isLocationChanged = Boolean(
    relocatedW3w && normalizeWhat3Words(relocatedW3w.words) !== initialCleanW3w
  );

  const isDirty = isCapacityChanged || isSerialChanged || isLocationChanged;
  const canSave = isDirty && isCapacityValid && !isResolvingW3w && !isSaving;

  if (!isOpen) return null;

  const effectiveCleanW3w = relocatedW3w
    ? normalizeWhat3Words(relocatedW3w.words)
    : initialCleanW3w;
  const isEffectiveW3wWords = isValidWhat3WordsFormat(effectiveCleanW3w);

  const handleOpenConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setIsConfirmOpen(true);
  };

  const handleConfirmSave = async () => {
    if (!canSave) return;
    setIsSaving(true);
    try {
      const formattedW3w = effectiveCleanW3w
        ? isEffectiveW3wWords
          ? `///${effectiveCleanW3w}`
          : effectiveCleanW3w
        : '';
      const nextLat = relocatedW3w ? relocatedW3w.lat : asset.latitude;
      const nextLng = relocatedW3w ? relocatedW3w.lng : asset.longitude;

      if (
        isEffectiveW3wWords &&
        effectiveCleanW3w &&
        typeof nextLat === 'number' &&
        typeof nextLng === 'number'
      ) {
        primeWhat3WordsCache(effectiveCleanW3w, nextLat, nextLng);
      }

      const updatedAsset: Equipment = {
        ...asset,
        capacity: parsedCapacity,
        rentalSerialNumber: serial.trim(),
        what3words: formattedW3w,
        latitude: nextLat,
        longitude: nextLng,
        updatedAt: new Date().toISOString(),
      };

      await onSave(updatedAsset);
      setIsConfirmOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="old-screen-container edit-asset-view-container">
      {/* 1. TOP BAR: Square red Back button on left + Equipment ID box */}
      <div className="scan-top-area">
        <div className="asset-detail-top-row">
          <button
            type="button"
            className="btn-pda-back-square"
            onClick={onClose}
            aria-label="Back"
            title="Back"
          >
            <IconBack size={24} color="#FFFFFF" />
          </button>
          <div className="old-scan-input asset-detail-id-box">
            <span className="asset-detail-id-icon">
              <EquipmentTypeIcon type={asset.type} size={24} />
            </span>
            <span className="asset-detail-id-text">{asset.equipmentId}</span>
          </div>
        </div>
      </div>

      {/* 2. EDIT DETAILS FORM + INTERACTIVE RELOCATION MAP */}
      <form onSubmit={handleOpenConfirm} className="edit-asset-view-body" noValidate>
        {/* Capacity / Size & Serial Number Row */}
        <div className="edit-asset-fields-row">
          {!isBattery && (
            <div className="edit-asset-field-col">
              <label htmlFor="pda-edit-capacity" className="edit-asset-field-label">
                Capacity / Size {capacityUnit ? `(${capacityUnit})` : ''}
              </label>
              <div className="edit-asset-input-wrap">
                <input
                  id="pda-edit-capacity"
                  type="text"
                  inputMode="numeric"
                  className="edit-asset-text-input"
                  placeholder={isGenerator ? '100' : isTank ? '3000' : 'Optional'}
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value.replace(/[^\d]/g, ''))}
                />
                {capacityUnit && <span className="edit-asset-input-unit">{capacityUnit}</span>}
              </div>
            </div>
          )}

          <div className="edit-asset-field-col">
            <label htmlFor="pda-edit-serial" className="edit-asset-field-label">
              Serial Number
            </label>
            <input
              id="pda-edit-serial"
              type="text"
              className="edit-asset-text-input"
              placeholder="RSN-12345"
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
            />
          </div>
        </div>

        {/* what3words Status & Map Relocation Section */}
        <div className="edit-asset-map-section">
          <div className="edit-asset-w3w-bar">
            <div className="edit-asset-w3w-info">
              <MapPin size={14} style={{ color: '#2563EB', flexShrink: 0 }} />
              {isResolvingW3w ? (
                <span className="edit-asset-w3w-resolving">Resolving what3words...</span>
              ) : (
                <span className="edit-asset-w3w-text">
                  {effectiveCleanW3w
                    ? isEffectiveW3wWords
                      ? `///${effectiveCleanW3w}`
                      : effectiveCleanW3w
                    : 'unassigned'}
                </span>
              )}
              {isLocationChanged && !isResolvingW3w && (
                <span className="edit-asset-w3w-badge">Relocated</span>
              )}
            </div>

            {relocatedW3w && (
              <button
                type="button"
                className="edit-asset-w3w-reset-btn"
                onClick={handleResetRelocation}
                title="Reset location to original"
              >
                <RotateCcw size={12} />
                <span>Reset</span>
              </button>
            )}
          </div>

          {relocateError && <div className="edit-asset-map-error">{relocateError}</div>}

          <div className="edit-asset-map-frame-wrap">
            {isResolvingInitialCoords ? (
              <div className="edit-asset-map-loading">
                Loading satellite map...
              </div>
            ) : (
              <iframe
                ref={mapIframeRef}
                srcDoc={mapSrcDoc}
                title={`Relocate ${asset.equipmentId} on map`}
                className="w3w-map-iframe"
                allow="geolocation"
              />
            )}
          </div>
        </div>

        {/* Bottom Submit & Cancel Buttons */}
        <div className="edit-asset-bottom-actions">
          <button
            type="submit"
            disabled={!canSave}
            className={`old-btn-submit ${canSave ? 'valid' : 'disabled'}`}
          >
            <IconSubmit size={22} />
            <span>Save Changes</span>
          </button>

          <button
            type="button"
            className="old-btn-cancel btn-pda-red"
            onClick={onClose}
          >
            <IconCancel size={22} />
            <span>Cancel</span>
          </button>
        </div>
      </form>

      {/* 3. USER CONFIRMATION MODAL BEFORE COMMITTING ANY CHANGES */}
      {isConfirmOpen && (
        <div className="modal-backdrop">
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Confirm Equipment Changes</h3>
            <p className="modal-subtitle">
              Verify updated details for {asset.equipmentId}:
            </p>

            <div className="values-table-wrap">
              <table className="values-table">
                <tbody>
                  <tr>
                    <td className="lbl">Asset</td>
                    <td
                      className="val font-equipment-id"
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <span>{asset.equipmentId}</span>
                      <EquipmentTypeIcon type={asset.type} size={22} />
                    </td>
                  </tr>
                  {!isBattery && (
                    <tr>
                      <td className="lbl">Capacity / Size</td>
                      <td className="val">
                        {parsedCapacity !== undefined
                          ? `${parsedCapacity}${capacityUnit ? ` ${capacityUnit}` : ''}`
                          : 'Unrated'}
                        {isCapacityChanged && (
                          <div style={{ fontSize: '11px', color: '#6B7280', fontWeight: 500 }}>
                            Previously:{' '}
                            {asset.capacity !== undefined
                              ? `${asset.capacity}${capacityUnit ? ` ${capacityUnit}` : ''}`
                              : 'Unrated'}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td className="lbl">Serial Number</td>
                    <td className="val">
                      {serial.trim() || '—'}
                      {isSerialChanged && (
                        <div style={{ fontSize: '11px', color: '#6B7280', fontWeight: 500 }}>
                          Previously: {asset.rentalSerialNumber || '—'}
                        </div>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="lbl">
                      {isEffectiveW3wWords ? 'what3words' : 'GPS Coordinates'}
                    </td>
                    <td
                      className="val confirm-w3w-cell"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      <div className="confirm-w3w-value">{effectiveCleanW3w || '—'}</div>
                      {isLocationChanged && (
                        <div className="confirm-w3w-prev">
                          Previously: {initialCleanW3w || '—'}
                        </div>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="modal-buttons-row">
              <button
                type="button"
                className="btn-modal-confirm"
                onClick={handleConfirmSave}
                disabled={isSaving}
              >
                <IconSubmit size={22} />
                <span>{isSaving ? 'Saving...' : 'Confirm & Save'}</span>
              </button>
              <button
                type="button"
                className="btn-modal-cancel btn-pda-red"
                onClick={() => setIsConfirmOpen(false)}
                disabled={isSaving}
              >
                <IconCancel size={22} />
                <span>Cancel</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
