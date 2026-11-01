import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Plus,
  Search,
  Download,
  QrCode,
  Edit,
  MapPin,
  AlertTriangle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Smartphone,
} from 'lucide-react';
import type { Equipment, Transaction, AuthorizedDevice } from '../../types';
import { EquipmentTypeIcon } from '../../components/EquipmentTypeIcon';
import { formatPdaTimestamp } from '../../utils/dateFormat';
import {
  getGoogleMapsExternalUrl,
  handleWhat3WordsLinkClick,
  openMoveEquipmentModal,
  getCachedWhat3WordsCoordinates,
  convertWhat3WordsToCoordinates,
  convertCoordinatesToWhat3Words,
  getWhat3WordsApiKey,
  isValidWhat3WordsFormat,
  normalizeWhat3Words,
  getFleetSatelliteMapSrcDoc,
  getSavedFleetMapView,
  saveFleetMapView,
  type FleetMapMarkerItem,
  type FleetMapTransactionItem,
} from '../../services/what3words';
import { postRemoteEquipment } from '../../services/api';

interface AssetsViewProps {
  assets: Equipment[];
  transactions: Transaction[];
  devices?: AuthorizedDevice[];
  viewMode?: 'TABLE' | 'MAP';
  onOpenCreateModal: () => void;
  onOpenEditModal: (asset: Equipment) => void;
  onOpenQRModal: (asset: Equipment) => void;
  onSelectAsset: (equipmentId: string) => void;
  onSelectPda?: (deviceId: string) => void;
  onSwitchToTableWithEquipment?: (equipmentId: string) => void;
  onOpenDangerZone?: () => void;
  onMoveAsset?: (updatedAsset: Equipment) => Promise<void>;
}

type TypeFilter = 'ALL' | 'GENERATOR' | 'TANK' | 'PLANT';
type CheckInFilter = 'ALL' | 'NONE' | 'CHECKED_IN' | 'CHECKED_OUT';
type PowerFilter = 'ALL' | 'POWERED_UP' | 'POWERED_DOWN';

interface MapSearchSuggestion {
  kind: 'w3w' | 'place' | 'coords';
  title: string;
  subtitle: string;
  w3w?: string;
  lat?: number;
  lng?: number;
}

export const AssetsView: React.FC<AssetsViewProps> = ({
  assets,
  transactions,
  devices = [],
  viewMode = 'TABLE',
  onOpenCreateModal,
  onOpenEditModal,
  onOpenQRModal,
  onSelectAsset,
  onSelectPda,
  onSwitchToTableWithEquipment,
  onOpenDangerZone,
  onMoveAsset,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [checkInFilter, setCheckInFilter] = useState<CheckInFilter>('ALL');
  const [powerFilter, setPowerFilter] = useState<PowerFilter>('ALL');
  const [showPdaLocations, setShowPdaLocations] = useState<boolean>(false);
  const [coordResolveTick, setCoordResolveTick] = useState(0);
  const mapIframeRef = useRef<HTMLIFrameElement | null>(null);
  const staticMapSrcDoc = useMemo(
    () => (viewMode === 'MAP' ? getFleetSatelliteMapSrcDoc([], getSavedFleetMapView()) : ''),
    [viewMode]
  );

  // In-Map Move State (triggered when user clicks "Move" inside an equipment double-click popup on the map)
  const [movingAssetId, setMovingAssetId] = useState<string | null>(null);
  const [moveCandidate, setMoveCandidate] = useState<{
    lat: number;
    lng: number;
    words?: string;
    formattedWords?: string;
    resolving: boolean;
    error?: string;
  } | null>(null);
  const [isSavingMove, setIsSavingMove] = useState(false);
  const moveLookupSeqRef = useRef(0);
  const movingAssetIdRef = useRef<string | null>(null);
  const moveCandidateRef = useRef<{
    lat: number;
    lng: number;
    words?: string;
    formattedWords?: string;
    resolving: boolean;
    error?: string;
  } | null>(null);
  const isSavingMoveRef = useRef(false);
  const pendingAutoConfirmRef = useRef(false);

  // Fleet Map Search State (location names, GPS coordinates, what3words locations)
  const [mapSearchInput, setMapSearchInput] = useState('');
  const [mapSearchResults, setMapSearchResults] = useState<MapSearchSuggestion[]>([]);
  const [mapSearchOpen, setMapSearchOpen] = useState(false);
  const [mapSearchLoading, setMapSearchLoading] = useState(false);
  const mapSearchDebounceRef = useRef<number | null>(null);
  const mapSearchReqSeqRef = useRef(0);
  const mapSearchContainerRef = useRef<HTMLDivElement | null>(null);

  // Single O(T + E) pass for transaction counts, check-in/check-out status, and generator power state per asset
  const { txCounts, checkInStatusByAsset, powerStateByAsset } = useMemo(() => {
    const countMap: Record<string, number> = {};
    const latestCheckTxTime: Record<string, number> = {};
    const statusMap: Record<string, 'checked_in' | 'checked_out' | 'none'> = {};
    const latestPowerTxTime: Record<string, number> = {};
    const latestPowerTxType: Record<string, 'PoweredUp' | 'PoweredDown'> = {};
    const powerMap: Record<string, boolean> = {};

    for (const a of assets) {
      statusMap[a.equipmentId] = 'none';
    }

    for (const t of transactions) {
      countMap[t.equipmentId] = (countMap[t.equipmentId] || 0) + 1;
      const typeStr = (t.transactionType || '').toString();
      if (typeStr.includes('CheckIn') || typeStr.includes('CheckOut')) {
        const ts = new Date(t.transactionTimestamp).getTime() || 0;
        if (latestCheckTxTime[t.equipmentId] === undefined || ts >= latestCheckTxTime[t.equipmentId]) {
          latestCheckTxTime[t.equipmentId] = ts;
          statusMap[t.equipmentId] = typeStr.includes('CheckIn') ? 'checked_in' : 'checked_out';
        }
      } else if (typeStr === 'PoweredUp' || typeStr === 'PoweredDown') {
        const ts = new Date(t.transactionTimestamp).getTime() || 0;
        if (latestPowerTxTime[t.equipmentId] === undefined || ts >= latestPowerTxTime[t.equipmentId]) {
          latestPowerTxTime[t.equipmentId] = ts;
          latestPowerTxType[t.equipmentId] = typeStr;
        }
      }
    }

    for (const a of assets) {
      if (a.type !== 'GENERATOR') {
        powerMap[a.equipmentId] = false;
        continue;
      }
      const pType = latestPowerTxType[a.equipmentId];
      if (pType) {
        powerMap[a.equipmentId] = pType === 'PoweredUp';
      } else {
        const upTime = a.poweredUpTimestamp ? new Date(a.poweredUpTimestamp).getTime() || 0 : 0;
        const downTime = a.poweredDownTimestamp ? new Date(a.poweredDownTimestamp).getTime() || 0 : 0;
        powerMap[a.equipmentId] = Boolean(a.poweredUpTimestamp && upTime >= downTime);
      }
    }

    return { txCounts: countMap, checkInStatusByAsset: statusMap, powerStateByAsset: powerMap };
  }, [assets, transactions]);

  // Filtered Assets
  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      // Search query
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        asset.equipmentId.toLowerCase().includes(q) ||
        asset.area.toLowerCase().includes(q) ||
        asset.location.toLowerCase().includes(q) ||
        asset.what3words.toLowerCase().includes(q) ||
        asset.rentalSerialNumber.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      // 1. Equipment Type filter
      if (typeFilter !== 'ALL' && asset.type !== typeFilter) return false;

      // 2. Check-in / Check-out status filter
      const chkStatus = checkInStatusByAsset[asset.equipmentId] || 'none';
      if (checkInFilter === 'NONE' && chkStatus !== 'none') return false;
      if (checkInFilter === 'CHECKED_IN' && chkStatus !== 'checked_in') return false;
      if (checkInFilter === 'CHECKED_OUT' && chkStatus !== 'checked_out') return false;

      // 3. Generator Power status filter (generators only)
      if (powerFilter !== 'ALL') {
        if (asset.type !== 'GENERATOR') return false;
        const isRunning = Boolean(powerStateByAsset[asset.equipmentId]);
        if (powerFilter === 'POWERED_UP' && !isRunning) return false;
        if (powerFilter === 'POWERED_DOWN' && isRunning) return false;
      }

      return true;
    });
  }, [assets, searchQuery, typeFilter, checkInFilter, powerFilter, checkInStatusByAsset, powerStateByAsset]);

  // Counts for pills
  const counts = useMemo(() => {
    return {
      all: assets.length,
      generator: assets.filter((a) => a.type === 'GENERATOR').length,
      tank: assets.filter((a) => a.type === 'TANK').length,
      plant: assets.filter((a) => a.type === 'PLANT').length,
      noCheckInOut: assets.filter((a) => (checkInStatusByAsset[a.equipmentId] || 'none') === 'none').length,
      checkedIn: assets.filter((a) => checkInStatusByAsset[a.equipmentId] === 'checked_in').length,
      checkedOut: assets.filter((a) => checkInStatusByAsset[a.equipmentId] === 'checked_out').length,
      poweredUp: assets.filter((a) => a.type === 'GENERATOR' && Boolean(powerStateByAsset[a.equipmentId])).length,
      poweredDown: assets.filter((a) => a.type === 'GENERATOR' && !powerStateByAsset[a.equipmentId]).length,
      pdaWithGps: devices.filter(
        (d) =>
          d.status === 'active' &&
          typeof d.latitude === 'number' &&
          !Number.isNaN(d.latitude) &&
          typeof d.longitude === 'number' &&
          !Number.isNaN(d.longitude)
      ).length,
    };
  }, [assets, devices, checkInStatusByAsset, powerStateByAsset]);

  // Sorting State
  type AssetSortField = 'equipmentId' | 'type' | 'capacity' | 'location' | 'what3words' | 'rentalSerialNumber' | 'powerState' | 'transactions';
  type SortDirection = 'asc' | 'desc';

  const [sortField, setSortField] = useState<AssetSortField>('equipmentId');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const handleSort = (field: AssetSortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Sorted Assets
  const sortedAssets = useMemo(() => {
    return [...filteredAssets].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'equipmentId':
          comparison = a.equipmentId.localeCompare(b.equipmentId, undefined, { numeric: true, sensitivity: 'base' });
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
        case 'capacity':
          comparison = (a.capacity || 0) - (b.capacity || 0);
          break;
        case 'location': {
          const locA = `${a.area} ${a.location}`;
          const locB = `${b.area} ${b.location}`;
          comparison = locA.localeCompare(locB);
          break;
        }
        case 'what3words':
          comparison = (a.what3words || '').localeCompare(b.what3words || '');
          break;
        case 'rentalSerialNumber':
          comparison = (a.rentalSerialNumber || '').localeCompare(b.rentalSerialNumber || '');
          break;
        case 'powerState': {
          const aOn = a.type === 'GENERATOR' && powerStateByAsset[a.equipmentId] ? 1 : 0;
          const bOn = b.type === 'GENERATOR' && powerStateByAsset[b.equipmentId] ? 1 : 0;
          comparison = aOn - bOn;
          break;
        }
        case 'transactions': {
          const aCount = txCounts[a.equipmentId] || 0;
          const bCount = txCounts[b.equipmentId] || 0;
          comparison = aCount - bCount;
          break;
        }
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredAssets, sortField, sortDirection, powerStateByAsset, txCounts]);

  const renderSortIndicator = (field: AssetSortField) => {
    if (sortField !== field) {
      return <ArrowUpDown size={12} style={{ opacity: 0.35, marginLeft: '6px' }} />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp size={12} style={{ color: 'var(--adm-accent-yellow)', marginLeft: '6px' }} />
    ) : (
      <ArrowDown size={12} style={{ color: 'var(--adm-accent-yellow)', marginLeft: '6px' }} />
    );
  };

  const handleCancelInMapMove = () => {
    moveLookupSeqRef.current += 1;
    pendingAutoConfirmRef.current = false;
    movingAssetIdRef.current = null;
    moveCandidateRef.current = null;
    isSavingMoveRef.current = false;
    setMovingAssetId(null);
    setMoveCandidate(null);
    setIsSavingMove(false);
    mapIframeRef.current?.contentWindow?.postMessage({ type: 'TTD_MAP_MOVE_END' }, '*');
  };

  const commitInMapMove = async (
    eqId: string,
    candidate: { lat: number; lng: number; words: string }
  ) => {
    const targetAsset = assets.find((a) => a.equipmentId === eqId);
    if (!targetAsset) {
      handleCancelInMapMove();
      return;
    }

    isSavingMoveRef.current = true;
    setIsSavingMove(true);
    try {
      const updatedAsset: Equipment = {
        ...targetAsset,
        what3words: candidate.words,
        latitude: candidate.lat,
        longitude: candidate.lng,
        updatedAt: new Date().toISOString(),
      };
      if (onMoveAsset) {
        await onMoveAsset(updatedAsset);
      } else {
        await postRemoteEquipment(updatedAsset);
      }
      setCoordResolveTick((prev) => prev + 1);
      handleCancelInMapMove();
    } catch {
      isSavingMoveRef.current = false;
      setIsSavingMove(false);
      setMoveCandidate((prev) => {
        const next = prev
          ? {
              ...prev,
              error: 'Failed to save new location to database. Please try again.',
            }
          : prev;
        moveCandidateRef.current = next;
        return next;
      });
      mapIframeRef.current?.contentWindow?.postMessage(
        {
          type: 'TTD_MAP_MOVE_SAVE_ERROR',
          error: 'Failed to save location. Try again.',
        },
        '*'
      );
    }
  };

  const handleConfirmInMapMove = async () => {
    const currentEqId = movingAssetIdRef.current || movingAssetId;
    const currentCand = moveCandidateRef.current || moveCandidate;
    if (!currentEqId || !currentCand || isSavingMoveRef.current) return;

    if (currentCand.resolving && !currentCand.words) {
      pendingAutoConfirmRef.current = true;
      isSavingMoveRef.current = true;
      setIsSavingMove(true);
      return;
    }

    if (!currentCand.words) return;
    await commitInMapMove(currentEqId, {
      lat: currentCand.lat,
      lng: currentCand.lng,
      words: currentCand.words,
    });
  };

  // Close map search dropdown when clicking outside
  useEffect(() => {
    if (viewMode !== 'MAP') return;
    const handleOutsideClick = (ev: MouseEvent) => {
      if (mapSearchContainerRef.current && !mapSearchContainerRef.current.contains(ev.target as Node)) {
        setMapSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [viewMode]);

  const looksLikeW3wQuery = (raw: string): boolean => {
    const trimmed = raw.trim();
    if (trimmed.startsWith('/')) return true;
    return /^[a-zA-Z]+\.[a-zA-Z]+(\.[a-zA-Z]*)?$/.test(trimmed);
  };

  const parseGpsCoordinatePair = (raw: string): { lat: number; lng: number } | null => {
    const cleaned = raw.trim().replace(/[°NSEWnsew]/g, (ch) => {
      const upper = ch.toUpperCase();
      if (upper === 'S' || upper === 'W') return '-';
      return '';
    });
    const m = cleaned.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
    if (!m) return null;
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    if (Number.isNaN(lat) || Number.isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return null;
    }
    return { lat, lng };
  };

  const panFleetMapTo = (lat: number, lng: number, zoom = 19) => {
    mapIframeRef.current?.contentWindow?.postMessage(
      {
        type: 'TTD_MAP_PAN_TO',
        lat,
        lng,
        zoom,
      },
      '*'
    );
  };

  const handleSelectMapSearchSuggestion = async (item: MapSearchSuggestion) => {
    setMapSearchOpen(false);
    if (item.kind === 'coords' && typeof item.lat === 'number' && typeof item.lng === 'number') {
      setMapSearchInput(`${item.lat.toFixed(6)}, ${item.lng.toFixed(6)}`);
      panFleetMapTo(item.lat, item.lng, 19);
      return;
    }
    if (item.kind === 'place' && typeof item.lat === 'number' && typeof item.lng === 'number') {
      setMapSearchInput(item.title);
      panFleetMapTo(item.lat, item.lng, 18);
      return;
    }
    if (item.kind === 'w3w' && item.w3w) {
      const clean = normalizeWhat3Words(item.w3w);
      setMapSearchInput(`///${clean}`);
      const coords = getCachedWhat3WordsCoordinates(clean) || (await convertWhat3WordsToCoordinates(clean));
      if (coords) {
        panFleetMapTo(coords.lat, coords.lng, 19);
      }
    }
  };

  const executeFleetMapSearch = async (rawQuery: string, isAutoSuggest: boolean) => {
    const q = rawQuery.trim();
    if (!q) {
      setMapSearchResults([]);
      setMapSearchOpen(false);
      setMapSearchLoading(false);
      return;
    }

    const reqId = ++mapSearchReqSeqRef.current;

    // 1. Direct GPS coordinate pair ("52.0733, -1.0147" or "52.0733 -1.0147")
    const gpsPair = parseGpsCoordinatePair(q);
    if (gpsPair) {
      const coordSuggestion: MapSearchSuggestion = {
        kind: 'coords',
        title: `${gpsPair.lat.toFixed(6)}, ${gpsPair.lng.toFixed(6)}`,
        subtitle: 'GPS Coordinates',
        lat: gpsPair.lat,
        lng: gpsPair.lng,
      };
      if (!isAutoSuggest) {
        await handleSelectMapSearchSuggestion(coordSuggestion);
        return;
      }
      setMapSearchResults([coordSuggestion]);
      setMapSearchOpen(true);
      setMapSearchLoading(false);
      return;
    }

    // 2. Direct full 3-word address on Enter/Search button
    const cleanW3wCandidate = normalizeWhat3Words(q);
    if (!isAutoSuggest && looksLikeW3wQuery(q) && isValidWhat3WordsFormat(cleanW3wCandidate)) {
      await handleSelectMapSearchSuggestion({
        kind: 'w3w',
        title: `///${cleanW3wCandidate}`,
        subtitle: 'what3words location',
        w3w: cleanW3wCandidate,
      });
      return;
    }

    setMapSearchLoading(true);
    setMapSearchOpen(true);

    try {
      const suggestions: MapSearchSuggestion[] = [];
      const promises: Promise<void>[] = [];

      if (looksLikeW3wQuery(q) && cleanW3wCandidate.split('.').length >= 2) {
        const apiKey = getWhat3WordsApiKey();
        const savedView = getSavedFleetMapView();
        const focusLat = savedView?.lat ?? 52.0733;
        const focusLng = savedView?.lng ?? -1.0147;
        const w3wUrl = `https://api.what3words.com/v3/autosuggest?input=${encodeURIComponent(cleanW3wCandidate)}&focus=${encodeURIComponent(`${focusLat},${focusLng}`)}&key=${encodeURIComponent(apiKey)}`;
        promises.push(
          fetch(w3wUrl)
            .then((r) => r.json())
            .then((data) => {
              if (Array.isArray(data?.suggestions)) {
                for (const s of data.suggestions.slice(0, 5)) {
                  if (s && typeof s.words === 'string') {
                    const cleanWords = normalizeWhat3Words(s.words);
                    suggestions.push({
                      kind: 'w3w',
                      title: `///${cleanWords}`,
                      subtitle: [s.nearestPlace, s.country].filter(Boolean).join(', '),
                      w3w: cleanWords,
                    });
                  }
                }
              }
            })
            .catch(() => {})
        );
      }

      if (!q.startsWith('/')) {
        const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(q)}`;
        promises.push(
          fetch(nomUrl, { headers: { Accept: 'application/json' } })
            .then((r) => r.json())
            .then((rows) => {
              if (Array.isArray(rows)) {
                for (const item of rows.slice(0, 5)) {
                  const lat = parseFloat(item?.lat);
                  const lng = parseFloat(item?.lon);
                  if (!Number.isNaN(lat) && !Number.isNaN(lng) && typeof item?.display_name === 'string') {
                    const parts = item.display_name.split(',');
                    suggestions.push({
                      kind: 'place',
                      title: (parts[0] || item.display_name).trim(),
                      subtitle: parts.slice(1).join(',').trim(),
                      lat,
                      lng,
                    });
                  }
                }
              }
            })
            .catch(() => {})
        );
      }

      await Promise.all(promises);
      if (reqId !== mapSearchReqSeqRef.current) return;

      setMapSearchLoading(false);
      if (!isAutoSuggest && suggestions.length === 1) {
        await handleSelectMapSearchSuggestion(suggestions[0]);
        return;
      }
      setMapSearchResults(suggestions);
    } catch {
      if (reqId === mapSearchReqSeqRef.current) {
        setMapSearchLoading(false);
        setMapSearchResults([]);
      }
    }
  };

  // Listen for actions triggered inside the Fleet Satellite Map iframe popups
  useEffect(() => {
    if (viewMode !== 'MAP') return;
    const handleMessage = (e: MessageEvent) => {
      if (mapIframeRef.current?.contentWindow && e.source !== mapIframeRef.current.contentWindow) return;
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'TTD_MAP_SELECT_ASSET' && typeof e.data.equipmentId === 'string') {
        onSelectAsset(e.data.equipmentId);
      } else if (e.data.type === 'TTD_MAP_EQUIPMENT_DETAILS' && typeof e.data.equipmentId === 'string') {
        setSearchQuery(e.data.equipmentId);
        setTypeFilter('ALL');
        setCheckInFilter('ALL');
        setPowerFilter('ALL');
        if (onSwitchToTableWithEquipment) {
          onSwitchToTableWithEquipment(e.data.equipmentId);
        }
      } else if (e.data.type === 'TTD_MAP_SELECT_PDA' && typeof e.data.deviceId === 'string') {
        if (onSelectPda) {
          onSelectPda(e.data.deviceId);
        }
      } else if (e.data.type === 'TTD_MAP_START_MOVE' && typeof e.data.equipmentId === 'string') {
        moveLookupSeqRef.current += 1;
        pendingAutoConfirmRef.current = false;
        movingAssetIdRef.current = e.data.equipmentId;
        moveCandidateRef.current = null;
        isSavingMoveRef.current = false;
        setMovingAssetId(e.data.equipmentId);
        setMoveCandidate(null);
        setIsSavingMove(false);
      } else if (
        e.data.type === 'TTD_MAP_MOVE_PICK_LOCATION' &&
        typeof e.data.equipmentId === 'string' &&
        typeof e.data.lat === 'number' &&
        typeof e.data.lng === 'number'
      ) {
        const pickedEqId = e.data.equipmentId;
        const pickedLat = e.data.lat;
        const pickedLng = e.data.lng;
        const seq = ++moveLookupSeqRef.current;
        pendingAutoConfirmRef.current = false;
        isSavingMoveRef.current = false;
        setIsSavingMove(false);
        movingAssetIdRef.current = pickedEqId;
        setMovingAssetId(pickedEqId);
        const initialCand = {
          lat: pickedLat,
          lng: pickedLng,
          resolving: true,
        };
        moveCandidateRef.current = initialCand;
        setMoveCandidate(initialCand);
        convertCoordinatesToWhat3Words(pickedLat, pickedLng).then((resolved) => {
          if (seq !== moveLookupSeqRef.current) return;
          if (!resolved) {
            pendingAutoConfirmRef.current = false;
            isSavingMoveRef.current = false;
            setIsSavingMove(false);
            const errCand = {
              lat: pickedLat,
              lng: pickedLng,
              resolving: false,
              error: 'Unable to resolve a what3words address for that point. Please double-click again.',
            };
            moveCandidateRef.current = errCand;
            setMoveCandidate(errCand);
            mapIframeRef.current?.contentWindow?.postMessage(
              {
                type: 'TTD_MAP_MOVE_SAVE_ERROR',
                error: 'Unable to resolve what3words. Double-click again.',
              },
              '*'
            );
            return;
          }
          const resolvedCand = {
            lat: resolved.lat,
            lng: resolved.lng,
            words: resolved.words,
            formattedWords: resolved.formattedWords,
            resolving: false,
          };
          moveCandidateRef.current = resolvedCand;
          setMoveCandidate(resolvedCand);
          mapIframeRef.current?.contentWindow?.postMessage(
            {
              type: 'TTD_MAP_MOVE_RESOLVED',
              lat: resolved.lat,
              lng: resolved.lng,
              w3wDisplay: resolved.formattedWords,
            },
            '*'
          );
          if (pendingAutoConfirmRef.current) {
            pendingAutoConfirmRef.current = false;
            commitInMapMove(pickedEqId, {
              lat: resolved.lat,
              lng: resolved.lng,
              words: resolved.words,
            });
          }
        });
      } else if (e.data.type === 'TTD_MAP_MOVE_CONFIRM') {
        handleConfirmInMapMove();
      } else if (e.data.type === 'TTD_MAP_MOVE_CANCEL') {
        handleCancelInMapMove();
      } else if (e.data.type === 'TTD_MAP_EDIT_ASSET' && typeof e.data.equipmentId === 'string') {
        const found = assets.find((a) => a.equipmentId === e.data.equipmentId);
        if (found) onOpenEditModal(found);
      } else if (
        e.data.type === 'TTD_MAP_VIEW_CHANGED' &&
        typeof e.data.lat === 'number' &&
        typeof e.data.lng === 'number' &&
        typeof e.data.zoom === 'number'
      ) {
        saveFleetMapView({
          lat: e.data.lat,
          lng: e.data.lng,
          zoom: e.data.zoom,
        });
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [viewMode, assets, onSelectAsset, onSelectPda, onSwitchToTableWithEquipment, onOpenEditModal]);

  // Resolve any uncached What3Words coordinates when switching to MAP view
  useEffect(() => {
    if (viewMode !== 'MAP') return;
    let cancelled = false;
    const missingAssets = assets.filter((a) => {
      if (typeof a.latitude === 'number' && typeof a.longitude === 'number') return false;
      if (getCachedWhat3WordsCoordinates(a.what3words)) return false;
      return isValidWhat3WordsFormat(a.what3words);
    });

    if (missingAssets.length === 0) return;

    const uniqueW3w = Array.from(new Set(missingAssets.map((a) => normalizeWhat3Words(a.what3words))));
    Promise.all(uniqueW3w.map((w) => convertWhat3WordsToCoordinates(w))).then(() => {
      if (cancelled) return;
      setCoordResolveTick((prev) => prev + 1);
      for (const a of missingAssets) {
        const coords = getCachedWhat3WordsCoordinates(a.what3words);
        if (coords) {
          postRemoteEquipment({ ...a, latitude: coords.lat, longitude: coords.lng }).catch(() => {});
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [viewMode, assets]);

  // Build map markers for all filtered assets with resolved coordinates
  const fleetMapMarkers = useMemo<FleetMapMarkerItem[]>(() => {
    void coordResolveTick;

    // Group and sort transactions newest-first per equipmentId
    const txByAsset = new Map<string, Transaction[]>();
    for (const tx of transactions) {
      const list = txByAsset.get(tx.equipmentId) || [];
      list.push(tx);
      txByAsset.set(tx.equipmentId, list);
    }

    const formatCompactTxSummary = (tx: Transaction): string => {
      const t = (tx.transactionType || '').toString();
      if (t.includes('FuelTransfer')) {
        const parts: string[] = [];
        parts.push(`Fuel: ${tx.fuelTransferLitres !== undefined ? tx.fuelTransferLitres : 0}L`);
        if (tx.defTransferLitres !== undefined) {
          parts.push(`DEF: ${tx.defTransferLitres}L`);
        }
        return parts.join(' • ');
      }
      if (t === 'PoweredUp') return 'Powered Up';
      if (t === 'PoweredDown') return 'Powered Down';

      const isCheckOut = t.includes('CheckOut');
      const fuelPct = isCheckOut ? tx.checkOutFuelPercentage : tx.checkInFuelPercentage;
      const fuelEighths = isCheckOut ? tx.checkOutFuelEighths : tx.checkInFuelEighths;
      const defPct = isCheckOut ? tx.checkOutDefPercentage : tx.checkInDefPercentage;
      const kwh = isCheckOut ? tx.checkOutKWH : tx.checkInKWH;

      const parts: string[] = [];
      if (fuelPct !== undefined) {
        parts.push(`Fuel: ${fuelPct}%`);
      } else if (fuelEighths !== undefined) {
        parts.push(`Fuel: ${fuelEighths}/8`);
      }
      if (defPct !== undefined) {
        parts.push(`DEF: ${defPct}%`);
      }
      if (kwh !== undefined) {
        parts.push(`kWh: ${kwh}`);
      }
      if (parts.length > 0) return parts.join(' • ');
      return isCheckOut ? 'Check Out' : 'Check In';
    };

    const items: FleetMapMarkerItem[] = [];
    for (const asset of sortedAssets) {
      const coords =
        typeof asset.latitude === 'number' && typeof asset.longitude === 'number'
          ? { lat: asset.latitude, lng: asset.longitude }
          : getCachedWhat3WordsCoordinates(asset.what3words);
      if (!coords) continue;

      const isOn =
        asset.type === 'GENERATOR' && Boolean(powerStateByAsset[asset.equipmentId]);

      const assetTxs = (txByAsset.get(asset.equipmentId) || [])
        .slice()
        .sort((a, b) => new Date(b.transactionTimestamp).getTime() - new Date(a.transactionTimestamp).getTime());

      const checkInStatus: 'checked_in' | 'checked_out' | 'none' =
        checkInStatusByAsset[asset.equipmentId] || 'none';

      const recentTransactions: FleetMapTransactionItem[] = assetTxs.slice(0, 10).map((tx) => ({
        id: tx.id,
        timestamp: formatPdaTimestamp(tx.transactionTimestamp),
        type: tx.transactionType,
        summary: formatCompactTxSummary(tx),
      }));

      items.push({
        equipmentId: asset.equipmentId,
        type: asset.type,
        area: asset.area,
        location: asset.location,
        what3words: asset.what3words,
        capacity: asset.capacity,
        rentalSerialNumber: asset.rentalSerialNumber,
        isOn,
        checkInStatus,
        txCount: txCounts[asset.equipmentId] || 0,
        recentTransactions,
        lat: coords.lat,
        lng: coords.lng,
      });
    }

    if (showPdaLocations) {
      for (const dev of devices) {
        if (
          dev.status !== 'active' ||
          typeof dev.latitude !== 'number' ||
          Number.isNaN(dev.latitude) ||
          typeof dev.longitude !== 'number' ||
          Number.isNaN(dev.longitude)
        ) {
          continue;
        }
        items.push({
          equipmentId: dev.deviceId,
          type: 'PDA',
          area: 'Handheld PDA',
          location: typeof dev.locationAccuracy === 'number' ? `GPS ±${dev.locationAccuracy}m` : 'GPS Active',
          what3words: `${dev.latitude.toFixed(5)}, ${dev.longitude.toFixed(5)}`,
          rentalSerialNumber: dev.appVersion ? `V${String(dev.appVersion).replace(/^[vV]/, '')}` : '',
          batteryLevel: dev.batteryLevel,
          isCharging: dev.isCharging,
          appVersion: dev.appVersion,
          lastSeenAt: dev.lastSeenAt ? formatPdaTimestamp(dev.lastSeenAt) : undefined,
          lat: dev.latitude,
          lng: dev.longitude,
        });
      }
    }

    return items;
  }, [
    sortedAssets,
    transactions,
    devices,
    showPdaLocations,
    txCounts,
    checkInStatusByAsset,
    powerStateByAsset,
    coordResolveTick,
  ]);

  // Push live marker/transaction updates into the map iframe without reloading or resetting center/zoom
  useEffect(() => {
    if (viewMode !== 'MAP') return;
    mapIframeRef.current?.contentWindow?.postMessage(
      { type: 'TTD_MAP_UPDATE_MARKERS', markers: fleetMapMarkers },
      '*'
    );
  }, [viewMode, fleetMapMarkers]);

  // Export to CSV
  const handleExportCsv = () => {
    const headers = [
      'EquipmentId',
      'Type',
      'Capacity',
      'Area',
      'Location',
      'What3Words',
      'RentalSerialNumber',
      'PoweredUpTimestamp',
      'PoweredDownTimestamp',
      'UpdatedAt',
    ];

    const rows = sortedAssets.map((a) => [
      `"${a.equipmentId}"`,
      `"${a.type}"`,
      a.capacity !== undefined ? a.capacity : '""',
      `"${a.area.replace(/"/g, '""')}"`,
      `"${a.location.replace(/"/g, '""')}"`,
      `"${a.what3words.replace(/"/g, '""')}"`,
      `"${a.rentalSerialNumber.replace(/"/g, '""')}"`,
      `"${a.poweredUpTimestamp || ''}"`,
      `"${a.poweredDownTimestamp || ''}"`,
      `"${a.updatedAt || ''}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `TTD_Fleet_Assets_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="admin-page-container">
      {/* Top Action Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '10px', marginBottom: '20px' }}>
        <button type="button" onClick={handleExportCsv} className="admin-btn admin-btn-secondary">
          <Download size={15} />
          <span>Export CSV</span>
        </button>

        <button type="button" onClick={onOpenCreateModal} className="admin-btn admin-btn-primary">
          <Plus size={16} />
          <span>Add New Asset</span>
        </button>

        {onOpenDangerZone && (
          <button
            type="button"
            onClick={onOpenDangerZone}
            className="admin-btn admin-btn-danger"
            style={{
              background: '#ef4444',
              color: '#ffffff',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              border: '1px solid #dc2626',
            }}
            title="Open Danger Zone database management"
          >
            <AlertTriangle size={15} />
            <span>Danger zone</span>
          </button>
        )}
      </div>

      {/* Control Bar: Search */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '14px',
          marginBottom: '20px',
          background: 'var(--adm-surface-1)',
          padding: '16px 20px',
          borderRadius: 'var(--adm-radius-lg)',
          border: '1px solid var(--adm-border-subtle)',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
          {/* Search Box */}
          <div className="admin-search-box">
            <Search size={16} className="admin-search-icon" />
            <input
              type="text"
              className="admin-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search"
            />
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
        {/* Group 1: Equipment Type (All equipment, Generators, Tanks, Plant) */}
        {[
          { key: 'ALL' as TypeFilter, label: 'All equipment', count: counts.all },
          { key: 'GENERATOR' as TypeFilter, label: 'Generators', icon: <EquipmentTypeIcon type="GENERATOR" size={13} />, count: counts.generator },
          { key: 'TANK' as TypeFilter, label: 'Tanks', icon: <EquipmentTypeIcon type="TANK" size={13} />, count: counts.tank },
          { key: 'PLANT' as TypeFilter, label: 'Plant', icon: <EquipmentTypeIcon type="PLANT" size={13} />, count: counts.plant },
        ].map((tab) => {
          const isSelected =
            tab.key === 'ALL'
              ? typeFilter === 'ALL' && checkInFilter === 'ALL' && powerFilter === 'ALL'
              : typeFilter === tab.key;
          return (
            <button
              key={`type-${tab.key}`}
              type="button"
              onClick={() => {
                if (tab.key === 'ALL') {
                  setTypeFilter('ALL');
                  setCheckInFilter('ALL');
                  setPowerFilter('ALL');
                } else {
                  setTypeFilter((prev) => (prev === tab.key ? 'ALL' : tab.key));
                  if (tab.key !== 'GENERATOR') {
                    setPowerFilter('ALL');
                  }
                }
              }}
              className={`admin-btn ${isSelected ? 'admin-btn-primary' : 'admin-btn-outline'} admin-btn-sm`}
              style={{
                background: isSelected ? '#2563EB' : 'transparent',
                borderColor: isSelected ? '#2563EB' : 'var(--adm-border-medium)',
                color: isSelected ? '#FFFFFF' : 'var(--adm-text-primary)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: isSelected ? 700 : 500,
              }}
            >
              {tab.icon}
              <span>{tab.label}</span>
              <span
                style={{
                  fontSize: '0.72rem',
                  padding: '1px 6px',
                  borderRadius: '999px',
                  background: isSelected ? 'rgba(255, 255, 255, 0.25)' : 'var(--adm-surface-3)',
                  color: isSelected ? '#FFFFFF' : 'var(--adm-text-secondary)',
                  fontFamily: 'var(--adm-font-mono)',
                }}
              >
                {tab.count}
              </span>
            </button>
          );
        })}

        <span style={{ width: '1px', height: '22px', background: 'var(--adm-border-medium)', margin: '0 2px' }} />

        {/* Group 2: Check-In / Check-Out Status (No check-in/check-out recorded, Checked-in, Checked-out) */}
        {[
          {
            key: 'NONE' as CheckInFilter,
            label: 'No check-in/check-out recorded',
            sqColor: '#94A3B8',
            count: counts.noCheckInOut,
          },
          {
            key: 'CHECKED_IN' as CheckInFilter,
            label: 'Checked-in',
            sqColor: '#16A34A',
            count: counts.checkedIn,
          },
          {
            key: 'CHECKED_OUT' as CheckInFilter,
            label: 'Checked-out',
            sqColor: '#DC2626',
            count: counts.checkedOut,
          },
        ].map((tab) => {
          const isSelected = checkInFilter === tab.key;
          return (
            <button
              key={`chk-${tab.key}`}
              type="button"
              onClick={() => setCheckInFilter((prev) => (prev === tab.key ? 'ALL' : tab.key))}
              className={`admin-btn ${isSelected ? 'admin-btn-primary' : 'admin-btn-outline'} admin-btn-sm`}
              style={{
                background: isSelected ? '#2563EB' : 'transparent',
                borderColor: isSelected ? '#2563EB' : 'var(--adm-border-medium)',
                color: isSelected ? '#FFFFFF' : 'var(--adm-text-primary)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: isSelected ? 700 : 500,
              }}
            >
              <span
                style={{
                  width: 13,
                  height: 13,
                  borderRadius: 3,
                  background: tab.sqColor,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
              <span>{tab.label}</span>
              <span
                style={{
                  fontSize: '0.72rem',
                  padding: '1px 6px',
                  borderRadius: '999px',
                  background: isSelected ? 'rgba(255, 255, 255, 0.25)' : 'var(--adm-surface-3)',
                  color: isSelected ? '#FFFFFF' : 'var(--adm-text-secondary)',
                  fontFamily: 'var(--adm-font-mono)',
                }}
              >
                {tab.count}
              </span>
            </button>
          );
        })}

        <span style={{ width: '1px', height: '22px', background: 'var(--adm-border-medium)', margin: '0 2px' }} />

        {/* Group 3: Power Status [Generators Only] (Powered up, Powered down) */}
        {[
          {
            key: 'POWERED_UP' as PowerFilter,
            label: 'Powered up',
            sqColor: '#16A34A',
            count: counts.poweredUp,
          },
          {
            key: 'POWERED_DOWN' as PowerFilter,
            label: 'Powered down',
            sqColor: '#DC2626',
            count: counts.poweredDown,
          },
        ].map((tab) => {
          const isSelected = powerFilter === tab.key;
          return (
            <button
              key={`pwr-${tab.key}`}
              type="button"
              onClick={() => {
                setPowerFilter((prev) => {
                  const next = prev === tab.key ? 'ALL' : tab.key;
                  if (next !== 'ALL' && typeFilter !== 'ALL' && typeFilter !== 'GENERATOR') {
                    setTypeFilter('GENERATOR');
                  }
                  return next;
                });
              }}
              className={`admin-btn ${isSelected ? 'admin-btn-primary' : 'admin-btn-outline'} admin-btn-sm`}
              style={{
                background: isSelected ? '#2563EB' : 'transparent',
                borderColor: isSelected ? '#2563EB' : 'var(--adm-border-medium)',
                color: isSelected ? '#FFFFFF' : 'var(--adm-text-primary)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: isSelected ? 700 : 500,
              }}
              title="Generators only"
            >
              <span
                style={{
                  width: 13,
                  height: 13,
                  borderRadius: 3,
                  background: tab.sqColor,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="#FFFFFF" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v10" />
                  <path d="M18.4 6.6a9 9 0 1 1-12.77.04" />
                </svg>
              </span>
              <span>{tab.label}</span>
              <span
                style={{
                  fontSize: '0.72rem',
                  padding: '1px 6px',
                  borderRadius: '999px',
                  background: isSelected ? 'rgba(255, 255, 255, 0.25)' : 'var(--adm-surface-3)',
                  color: isSelected ? '#FFFFFF' : 'var(--adm-text-secondary)',
                  fontFamily: 'var(--adm-font-mono)',
                }}
              >
                {tab.count}
              </span>
            </button>
          );
        })}

        {viewMode === 'MAP' && (
          <>
            <span style={{ width: '1px', height: '22px', background: 'var(--adm-border-medium)', margin: '0 2px' }} />

            <button
              type="button"
              onClick={() => setShowPdaLocations((prev) => !prev)}
              className={`admin-btn ${showPdaLocations ? 'admin-btn-primary' : 'admin-btn-outline'} admin-btn-sm`}
              style={{
                background: showPdaLocations ? '#2563EB' : 'transparent',
                borderColor: showPdaLocations ? '#2563EB' : 'var(--adm-border-medium)',
                color: showPdaLocations ? '#FFFFFF' : 'var(--adm-text-primary)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: showPdaLocations ? 700 : 500,
              }}
              title="Toggle PDA handheld GPS locations on map"
            >
              <span
                style={{
                  width: 15,
                  height: 15,
                  borderRadius: '50%',
                  background: '#64748B',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  color: '#FFFFFF',
                }}
              >
                <Smartphone size={10} />
              </span>
              <span>PDA locations</span>
              <span
                style={{
                  fontSize: '0.72rem',
                  padding: '1px 6px',
                  borderRadius: '999px',
                  background: showPdaLocations ? 'rgba(255, 255, 255, 0.25)' : 'var(--adm-surface-3)',
                  color: showPdaLocations ? '#FFFFFF' : 'var(--adm-text-secondary)',
                  fontFamily: 'var(--adm-font-mono)',
                }}
              >
                {counts.pdaWithGps}
              </span>
            </button>
          </>
        )}
      </div>

      {/* Main Content Area */}
      {viewMode === 'TABLE' && filteredAssets.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '60px 20px',
            background: 'var(--adm-surface-1)',
            borderRadius: 'var(--adm-radius-lg)',
            border: '1px solid var(--adm-border-subtle)',
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🔍</div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--adm-text-primary)', marginBottom: '6px' }}>
            No assets match your search criteria
          </h3>
          <p style={{ color: 'var(--adm-text-secondary)', fontSize: '0.9rem', marginBottom: '18px' }}>
            Try adjusting your search query or filter tabs.
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setTypeFilter('ALL');
              setCheckInFilter('ALL');
              setPowerFilter('ALL');
            }}
            className="admin-btn admin-btn-secondary"
          >
            Reset Filters
          </button>
        </div>
      ) : viewMode === 'TABLE' ? (
        /* Data Table View */
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('equipmentId')}>
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span>Equipment ID</span>
                    {renderSortIndicator('equipmentId')}
                  </div>
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('type')}>
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span>Equipment type</span>
                    {renderSortIndicator('type')}
                  </div>
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('capacity')}>
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span>Capacity</span>
                    {renderSortIndicator('capacity')}
                  </div>
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('location')}>
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span>Zone &amp; Location</span>
                    {renderSortIndicator('location')}
                  </div>
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('what3words')}>
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span>What3Words</span>
                    {renderSortIndicator('what3words')}
                  </div>
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('rentalSerialNumber')}>
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span>Rental Serial</span>
                    {renderSortIndicator('rentalSerialNumber')}
                  </div>
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('powerState')}>
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span>Power State</span>
                    {renderSortIndicator('powerState')}
                  </div>
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('transactions')}>
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span>Transactions</span>
                    {renderSortIndicator('transactions')}
                  </div>
                </th>
                <th style={{ textAlign: 'right', whiteSpace: 'nowrap', paddingRight: '20px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedAssets.map((asset) => {
                const isRunning = asset.type === 'GENERATOR' && Boolean(powerStateByAsset[asset.equipmentId]);
                return (
                  <tr key={asset.equipmentId}>
                    {/* Equipment ID */}
                    <td>
                      <button
                        onClick={() => onSelectAsset(asset.equipmentId)}
                        style={{
                          background: 'none',
                          border: 'none',
                          fontFamily: 'var(--adm-font-mono)',
                          fontWeight: 700,
                          fontSize: '0.92rem',
                          color: 'var(--adm-accent-yellow)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <span>{asset.equipmentId}</span>
                      </button>
                    </td>

                    {/* Classification */}
                    <td>
                      <span className={`admin-badge admin-badge-${asset.type.toLowerCase()}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                        <EquipmentTypeIcon type={asset.type} size={13} />
                        <span>{asset.type}</span>
                      </span>
                    </td>

                    {/* Capacity */}
                    <td style={{ fontWeight: 600 }}>
                      {asset.type === 'GENERATOR' && asset.capacity ? `${asset.capacity} kVA` : null}
                      {asset.type === 'TANK' && asset.capacity ? `${asset.capacity.toLocaleString()} L` : null}
                      {asset.type === 'PLANT' ? <span style={{ color: 'var(--adm-text-muted)' }}>Unrated</span> : null}
                    </td>

                    {/* Location */}
                    <td style={{ maxWidth: '220px' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.86rem', overflowWrap: 'break-word', wordBreak: 'break-word' }}>{asset.area}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--adm-text-muted)', overflowWrap: 'break-word', wordBreak: 'break-word' }}>{asset.location}</div>
                    </td>

                    {/* What3Words */}
                    <td>
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '8px',
                          flexWrap: 'nowrap',
                        }}
                      >
                        <a
                          href={getGoogleMapsExternalUrl(asset.what3words, asset.latitude, asset.longitude)}
                          onClick={(e) =>
                            handleWhat3WordsLinkClick(
                              e,
                              asset.what3words,
                              asset.latitude,
                              asset.longitude,
                              (coords) => {
                                postRemoteEquipment({
                                  ...asset,
                                  latitude: coords.lat,
                                  longitude: coords.lng,
                                }).catch(() => {});
                              },
                              asset.type
                            )
                          }
                          target="_blank"
                          rel="noreferrer"
                          title="Open location in Google Maps"
                          style={{
                            fontFamily: 'var(--adm-font-mono)',
                            fontSize: '0.8rem',
                            color: 'var(--adm-accent-yellow)',
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <MapPin size={12} />
                          <span>{asset.what3words}</span>
                        </a>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openMoveEquipmentModal(asset, async (updatedAsset) => {
                              if (onMoveAsset) {
                                await onMoveAsset(updatedAsset);
                              } else {
                                await postRemoteEquipment(updatedAsset);
                              }
                            });
                          }}
                          title={`Move ${asset.equipmentId} to a new location on the map`}
                          style={{
                            padding: '2px 8px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            borderRadius: '4px',
                            border: '1px solid var(--adm-border-medium)',
                            background: 'var(--adm-surface-2)',
                            color: 'var(--adm-text-primary)',
                            cursor: 'pointer',
                            lineHeight: 1.35,
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          Move
                        </button>
                      </div>
                    </td>

                    {/* Rental Serial */}
                    <td className="admin-mono" style={{ fontSize: '0.82rem', color: 'var(--adm-text-secondary)' }}>
                      {asset.rentalSerialNumber}
                    </td>

                    {/* Power State */}
                    <td>
                      {asset.type === 'GENERATOR' ? (
                        <span className={`admin-badge ${isRunning ? 'admin-badge-running' : 'admin-badge-standby'}`}>
                          <span className={`pulse-dot ${isRunning ? 'green' : 'slate'}`} />
                          {isRunning ? 'ON' : 'OFF'}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.78rem', color: 'var(--adm-text-muted)' }}>—</span>
                      )}
                    </td>

                    {/* Transactions */}
                    <td>
                      <button
                        type="button"
                        onClick={() => onSelectAsset(asset.equipmentId)}
                        className="admin-mono"
                        style={{
                          background: 'none',
                          border: 'none',
                          fontFamily: 'var(--adm-font-mono)',
                          fontWeight: 700,
                          color: (txCounts[asset.equipmentId] || 0) > 0 ? 'var(--adm-accent-yellow)' : 'var(--adm-text-muted)',
                          cursor: 'pointer',
                          fontSize: '0.88rem',
                          padding: '2px 4px',
                          textDecoration: (txCounts[asset.equipmentId] || 0) > 0 ? 'underline' : 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                        }}
                        title={`View ${txCounts[asset.equipmentId] || 0} transactions for ${asset.equipmentId}`}
                      >
                        {txCounts[asset.equipmentId] || 0}
                      </button>
                    </td>

                    {/* Action buttons */}
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap', paddingRight: '20px' }}>
                      <div style={{ display: 'inline-flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                        {/* QR Label Print */}
                        <button
                          onClick={() => onOpenQRModal(asset)}
                          className="admin-btn admin-btn-outline admin-btn-sm"
                          title="Generate & Print Physical QR Tag"
                          style={{ padding: '4px 7px' }}
                        >
                          <QrCode size={14} />
                        </button>

                        {/* Edit Asset */}
                        <button
                          onClick={() => onOpenEditModal(asset)}
                          className="admin-btn admin-btn-outline admin-btn-sm"
                          title="Edit Equipment Details"
                          style={{ padding: '4px 7px' }}
                        >
                          <Edit size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Google Satellite Fleet Map View */
        <div
          className="admin-card"
          style={{
            padding: 0,
            margin: 0,
            overflow: 'hidden',
            height: 'calc(100vh - 285px)',
            minHeight: '560px',
            border: '1px solid var(--adm-border-subtle)',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* In-Map Move Banner & Confirmation Bar */}
          {movingAssetId && (
            <div
              style={{
                padding: '10px 16px',
                background: moveCandidate?.words
                  ? 'rgba(30, 58, 138, 0.96)'
                  : 'rgba(15, 23, 42, 0.95)',
                borderBottom: '1px solid rgba(147, 197, 253, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap',
                zIndex: 1100,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: '#F59E0B',
                    color: '#0F172A',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Move Mode
                </span>
                {!moveCandidate ? (
                  <span style={{ fontSize: '0.86rem', color: '#F8FAFC', fontWeight: 600 }}>
                    Relocating{' '}
                    <strong style={{ fontFamily: 'var(--adm-font-mono)', color: '#FDE68A' }}>{movingAssetId}</strong> —{' '}
                    <strong>double-click</strong> on the map to place the asset at its new location.
                  </span>
                ) : moveCandidate.resolving ? (
                  <span style={{ fontSize: '0.86rem', color: '#93C5FD', fontWeight: 600 }}>
                    Resolving what3words location for ({moveCandidate.lat.toFixed(5)}, {moveCandidate.lng.toFixed(5)})...
                  </span>
                ) : moveCandidate.error ? (
                  <span style={{ fontSize: '0.86rem', color: '#FCA5A5', fontWeight: 600 }}>
                    {moveCandidate.error}
                  </span>
                ) : (
                  <span style={{ fontSize: '0.86rem', color: '#F8FAFC', fontWeight: 600 }}>
                    Confirm moving{' '}
                    <strong style={{ fontFamily: 'var(--adm-font-mono)', color: '#FDE68A' }}>{movingAssetId}</strong> to{' '}
                    <strong
                      style={{
                        fontFamily: 'var(--adm-font-mono)',
                        color: '#93C5FD',
                        background: 'rgba(15, 23, 42, 0.55)',
                        padding: '2px 7px',
                        borderRadius: '4px',
                      }}
                    >
                      {moveCandidate.formattedWords || `///${moveCandidate.words}`}
                    </strong>
                    ?
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {moveCandidate?.words && !moveCandidate.resolving && (
                  <button
                    type="button"
                    disabled={isSavingMove}
                    onClick={handleConfirmInMapMove}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '6px',
                      border: '1px solid #60A5FA',
                      background: '#2563EB',
                      color: '#FFFFFF',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: isSavingMove ? 'wait' : 'pointer',
                    }}
                  >
                    {isSavingMove ? 'Saving...' : 'Confirm new location'}
                  </button>
                )}
                <button
                  type="button"
                  disabled={isSavingMove}
                  onClick={handleCancelInMapMove}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid rgba(203, 213, 225, 0.4)',
                    background: 'rgba(30, 41, 59, 0.85)',
                    color: '#E2E8F0',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
            {/* Map Search Overlay (Location names, GPS coordinates, what3words locations) */}
            <div
              ref={mapSearchContainerRef}
              style={{
                position: 'absolute',
                top: '12px',
                left: '56px',
                zIndex: 1000,
                width: 'min(380px, calc(100% - 70px))',
              }}
            >
              <form
                onSubmit={(ev) => {
                  ev.preventDefault();
                  if (mapSearchDebounceRef.current) {
                    window.clearTimeout(mapSearchDebounceRef.current);
                  }
                  executeFleetMapSearch(mapSearchInput, false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.28)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    paddingLeft: '10px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    color: '#64748B',
                  }}
                >
                  <Search size={15} />
                </div>
                <input
                  type="text"
                  value={mapSearchInput}
                  onChange={(ev) => {
                    const val = ev.target.value;
                    setMapSearchInput(val);
                    if (mapSearchDebounceRef.current) {
                      window.clearTimeout(mapSearchDebounceRef.current);
                    }
                    if (!val.trim()) {
                      setMapSearchResults([]);
                      setMapSearchOpen(false);
                      setMapSearchLoading(false);
                      return;
                    }
                    mapSearchDebounceRef.current = window.setTimeout(() => {
                      executeFleetMapSearch(val, true);
                    }, 260);
                  }}
                  onFocus={() => {
                    if (mapSearchResults.length > 0) {
                      setMapSearchOpen(true);
                    }
                  }}
                  placeholder="Search place name, GPS (lat, lng) or ///w3w..."
                  style={{
                    flex: 1,
                    border: 'none',
                    outline: 'none',
                    padding: '8px 10px',
                    fontSize: '0.82rem',
                    fontWeight: 500,
                    color: '#0F172A',
                    background: 'transparent',
                  }}
                />
                {mapSearchInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setMapSearchInput('');
                      setMapSearchResults([]);
                      setMapSearchOpen(false);
                      setMapSearchLoading(false);
                    }}
                    title="Clear map search"
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: '#64748B',
                      padding: '0 8px',
                      fontSize: '0.9rem',
                      cursor: 'pointer',
                    }}
                  >
                    ✕
                  </button>
                )}
                <button
                  type="submit"
                  style={{
                    border: 'none',
                    borderLeft: '1px solid #E2E8F0',
                    background: '#F8FAFC',
                    color: '#0F172A',
                    padding: '8px 12px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Go
                </button>
              </form>

              {mapSearchOpen && (mapSearchLoading || mapSearchResults.length > 0 || mapSearchInput.trim().length > 0) && (
                <div
                  style={{
                    marginTop: '4px',
                    background: '#FFFFFF',
                    border: '1px solid #CBD5E1',
                    borderRadius: '8px',
                    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.32)',
                    maxHeight: '260px',
                    overflowY: 'auto',
                  }}
                >
                  {mapSearchLoading ? (
                    <div style={{ padding: '10px 12px', fontSize: '0.78rem', color: '#64748B', fontWeight: 600 }}>
                      Searching locations...
                    </div>
                  ) : mapSearchResults.length === 0 ? (
                    <div style={{ padding: '10px 12px', fontSize: '0.78rem', color: '#64748B' }}>
                      No matching locations, coordinates, or what3words found.
                    </div>
                  ) : (
                    mapSearchResults.map((res, idx) => (
                      <button
                        key={`${res.kind}-${res.title}-${idx}`}
                        type="button"
                        onClick={() => handleSelectMapSearchSuggestion(res)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '8px 12px',
                          border: 'none',
                          borderBottom: idx < mapSearchResults.length - 1 ? '1px solid #F1F5F9' : 'none',
                          background: '#FFFFFF',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            color: res.kind === 'w3w' ? '#2563EB' : '#0F172A',
                            fontFamily: res.kind === 'w3w' || res.kind === 'coords' ? 'var(--adm-font-mono)' : 'inherit',
                          }}
                        >
                          {res.title}
                        </div>
                        {res.subtitle && (
                          <div
                            style={{
                              fontSize: '0.72rem',
                              color: '#64748B',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {res.subtitle}
                          </div>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <iframe
              ref={mapIframeRef}
              srcDoc={staticMapSrcDoc}
              onLoad={() => {
                mapIframeRef.current?.contentWindow?.postMessage(
                  { type: 'TTD_MAP_UPDATE_MARKERS', markers: fleetMapMarkers },
                  '*'
                );
              }}
              title="Fleet Equipment Satellite Map"
              style={{
                width: '100%',
                height: '100%',
                border: '0',
                display: 'block',
              }}
              allow="geolocation"
            />
          </div>
        </div>
      )}
    </div>
  );
};
