import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Play,
  Square,
  RefreshCw,
  ShieldAlert,
  ExternalLink,
  LogOut,
  Trash2,
} from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import '../admin/admin.css';
import { AdminLoginView } from '../admin/components/AdminLoginView';
import type { Equipment, Transaction, TransactionType } from '../types';
import { generateUUID } from '../types';
import { fetchRemoteEquipment, postRemoteTransaction } from '../services/api';
import {
  isSupabaseConfigured,
  getAdminSession,
  onAdminAuthStateChange,
  signOutAdmin,
  getInitialAuthUrlInfo,
  subscribeToCloudChanges,
  broadcastFleetResync,
} from '../services/supabase';
import { checkRemoteAppVersion, performAppUpdate, verifyPostUpdateBuild } from '../services/appUpdate';
import { APP_VERSION, getIsStaging } from '../version';

const ALLOWED_STRESS_TEST_EMAIL = 'design@stuartwillcocks.co.uk';

interface ExecutionLogEntry {
  index: number;
  txId: string;
  equipmentId: string;
  transactionType: TransactionType;
  summary: string;
  fuelLitres?: number;
  defLitres?: number;
  timestamp: string;
  durationMs: number;
  status: 'success' | 'error';
  errorMessage?: string;
}

export const StressTestApp: React.FC = () => {
  const initialAuthInfo = getInitialAuthUrlInfo();
  const [adminSession, setAdminSession] = useState<Session | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(() => isSupabaseConfigured());
  const [isPasswordRecovery, setIsPasswordRecovery] = useState<boolean>(
    () => initialAuthInfo.isInviteOrRecovery
  );

  const [assets, setAssets] = useState<Equipment[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Stress Test Configuration State
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('10');
  const [startFuelLitres, setStartFuelLitres] = useState<string>('50');
  const [startDefLitres, setStartDefLitres] = useState<string>('10');
  const [incrementLitres, setIncrementLitres] = useState<string>('5');
  const [rateValue, setRateValue] = useState<string>('1');
  const [rateUnit, setRateUnit] = useState<'per_second' | 'interval_ms'>('per_second');
  const [simulatedDeviceId, setSimulatedDeviceId] = useState<string>('STRESS-TEST-SIM');

  // Bookend Transaction Toggles
  const [includeCheckIn, setIncludeCheckIn] = useState<boolean>(false);
  const [includePowerUp, setIncludePowerUp] = useState<boolean>(false);
  const [includePowerDown, setIncludePowerDown] = useState<boolean>(false);
  const [includeCheckOut, setIncludeCheckOut] = useState<boolean>(false);

  // Execution State
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [sentCount, setSentCount] = useState<number>(0);
  const [successCount, setSuccessCount] = useState<number>(0);
  const [errorCount, setErrorCount] = useState<number>(0);
  const [logs, setLogs] = useState<ExecutionLogEntry[]>([]);
  const abortRef = useRef<boolean>(false);
  const [hasNewVersion, setHasNewVersion] = useState<boolean>(false);
  const [newVersionTag, setNewVersionTag] = useState<string | null>(null);

  const isStaging = getIsStaging();
  const userEmail = adminSession?.user?.email?.trim().toLowerCase() || '';
  const isAuthorizedUser = userEmail === ALLOWED_STRESS_TEST_EMAIL;

  // Automatic version check & cache-busted reload
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('v=')) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('v');
        const cleanSearch = url.searchParams.toString();
        window.history.replaceState({}, '', url.pathname + (cleanSearch ? `?${cleanSearch}` : '') + url.hash);
      } catch {}
    }

    const verification = verifyPostUpdateBuild();
    if (verification.status === 'verified') {
      try {
        sessionStorage.removeItem('ttd_stress_auto_update_target');
      } catch {}
    } else if (verification.status === 'retrying') {
      return;
    }

    const checkVersion = async () => {
      if (isRunning) return;
      const res = await checkRemoteAppVersion();
      if (res.hasUpdate && res.remoteBuild && res.remoteBuild > res.currentBuild) {
        setHasNewVersion(true);
        if (res.remoteVersion) setNewVersionTag(res.remoteVersion);
        if (res.remoteVersion) {
          try {
            const rawAttempt = sessionStorage.getItem('ttd_stress_auto_update_target');
            let shouldAutoUpdate = true;
            if (rawAttempt) {
              try {
                const parsed = JSON.parse(rawAttempt) as { version?: string; ts?: number };
                if (parsed.version === res.remoteVersion && parsed.ts && Date.now() - parsed.ts < 12000) {
                  shouldAutoUpdate = false;
                }
              } catch {}
            }
            if (shouldAutoUpdate) {
              sessionStorage.setItem(
                'ttd_stress_auto_update_target',
                JSON.stringify({ version: res.remoteVersion, ts: Date.now() })
              );
              performAppUpdate(res.remoteVersion);
              return;
            }
          } catch {}
        }
      } else {
        setHasNewVersion(false);
        try {
          sessionStorage.removeItem('ttd_stress_auto_update_target');
        } catch {}
      }
    };

    const initTimer = setTimeout(() => checkVersion(), 1500);
    const interval = setInterval(() => checkVersion(), 15000);
    const onFocusOrVisible = () => {
      if (typeof document === 'undefined' || !document.hidden) {
        checkVersion();
      }
    };
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);
    return () => {
      clearTimeout(initTimer);
      clearInterval(interval);
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, [isRunning]);

  // Auth Session Check
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setIsAuthChecking(false);
      return;
    }

    let mounted = true;
    const safetyTimer = setTimeout(() => {
      if (mounted) setIsAuthChecking(false);
    }, 2800);

    getAdminSession()
      .then((session) => {
        if (mounted) {
          setAdminSession(session);
          setIsAuthChecking(false);
        }
      })
      .catch(() => {
        if (mounted) setIsAuthChecking(false);
      });

    const unsubscribe = onAdminAuthStateChange((event, session) => {
      if (!mounted) return;
      setAdminSession(session);
      setIsAuthChecking(false);
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      unsubscribe();
    };
  }, []);

  const loadEquipment = async () => {
    setIsLoadingAssets(true);
    setLoadError(null);
    try {
      const list = await fetchRemoteEquipment();
      const sorted = [...list].sort((a, b) =>
        a.equipmentId.localeCompare(b.equipmentId, undefined, { numeric: true, sensitivity: 'base' })
      );
      setAssets(sorted);
      if (sorted.length > 0 && !selectedEquipmentId) {
        setSelectedEquipmentId(sorted[0].equipmentId);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLoadError(msg);
    } finally {
      setIsLoadingAssets(false);
    }
  };

  useEffect(() => {
    if (!isAuthorizedUser) return;
    loadEquipment();
    const unsubRealtime = isSupabaseConfigured()
      ? subscribeToCloudChanges(() => {})
      : () => {};
    return () => {
      unsubRealtime();
    };
  }, [isAuthorizedUser]);

  const selectedAsset = useMemo(
    () => assets.find((a) => a.equipmentId === selectedEquipmentId) || null,
    [assets, selectedEquipmentId]
  );

  const isGenerator = selectedAsset?.type === 'GENERATOR';
  const isDefApplicable = isGenerator;

  const getTransactionTypeForAsset = (asset: Equipment): TransactionType => {
    switch (asset.type) {
      case 'GENERATOR':
        return 'FuelTransferGenerator';
      case 'TANK':
        return 'FuelTransferTank';
      case 'PLANT':
        return 'FuelTransferPlant';
      default:
        return 'FuelTransferPlant';
    }
  };

  const getCheckInTypeForAsset = (asset: Equipment): TransactionType => {
    switch (asset.type) {
      case 'GENERATOR':
        return 'CheckInGenerator';
      case 'TANK':
        return 'CheckInTank';
      case 'PLANT':
        return 'CheckInPlant';
      default:
        return 'CheckInPlant';
    }
  };

  const getCheckOutTypeForAsset = (asset: Equipment): TransactionType => {
    switch (asset.type) {
      case 'GENERATOR':
        return 'CheckOutGenerator';
      case 'TANK':
        return 'CheckOutTank';
      case 'PLANT':
        return 'CheckOutPlant';
      default:
        return 'CheckOutPlant';
    }
  };

  const formatTxTypeLabel = (txType: TransactionType): string => {
    if (txType.startsWith('CheckIn')) return 'Check-In';
    if (txType.startsWith('CheckOut')) return 'Check-Out';
    if (txType === 'PoweredUp') return 'Power-Up';
    if (txType === 'PoweredDown') return 'Power-Down';
    return 'Fuel Transfer';
  };

  const computedIntervalMs = useMemo(() => {
    const num = Number(rateValue);
    if (!Number.isFinite(num) || num <= 0) return 1000;
    if (rateUnit === 'per_second') {
      return Math.max(0, Math.round(1000 / num));
    }
    return Math.max(0, Math.round(num));
  }, [rateValue, rateUnit]);

  const handleStop = () => {
    abortRef.current = true;
    setIsRunning(false);
  };

  const handleGenerateTestData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRunning || !selectedAsset) return;

    const fuelQty = Math.max(1, Math.min(5000, Math.floor(Number(quantity) || 1)));
    const initialFuel = Math.max(0, Math.round(Number(startFuelLitres) || 0));
    const initialDef = Math.max(0, Math.round(Number(startDefLitres) || 0));
    const stepLitres = Math.round(Number(incrementLitres) || 0);
    const delayMs = computedIntervalMs;
    const fuelTxType = getTransactionTypeForAsset(selectedAsset);
    const devId = simulatedDeviceId.trim() || 'STRESS-TEST-SIM';

    interface PlannedStep {
      transactionType: TransactionType;
      summary: string;
      fuelLitres?: number;
      defLitres?: number;
      fields: Partial<Transaction>;
    }

    const steps: PlannedStep[] = [];

    if (includeCheckIn) {
      const checkInType = getCheckInTypeForAsset(selectedAsset);
      if (selectedAsset.type === 'GENERATOR') {
        steps.push({
          transactionType: checkInType,
          summary: 'Fuel 100% • DEF 100% • 1000 kWh',
          fields: {
            checkInFuelPercentage: 100,
            checkInDefPercentage: 100,
            checkInKWH: 1000,
          },
        });
      } else if (selectedAsset.type === 'TANK') {
        steps.push({
          transactionType: checkInType,
          summary: 'Fuel 8/8',
          fields: {
            checkInFuelEighths: 8,
          },
        });
      } else {
        steps.push({
          transactionType: checkInType,
          summary: 'Fuel 100%',
          fields: {
            checkInFuelPercentage: 100,
          },
        });
      }
    }

    if (includePowerUp && selectedAsset.type === 'GENERATOR') {
      steps.push({
        transactionType: 'PoweredUp',
        summary: 'ON',
        fields: {},
      });
    }

    for (let i = 0; i < fuelQty; i++) {
      const currentFuel = Math.max(0, initialFuel + i * stepLitres);
      const currentDef = isDefApplicable ? Math.max(0, initialDef + i * stepLitres) : undefined;
      steps.push({
        transactionType: fuelTxType,
        summary:
          currentDef !== undefined
            ? `Fuel ${currentFuel}L • DEF ${currentDef}L`
            : `Fuel ${currentFuel}L`,
        fuelLitres: currentFuel,
        defLitres: currentDef,
        fields: {
          fuelTransferLitres: currentFuel,
          defTransferLitres: currentDef,
        },
      });
    }

    if (includePowerDown && selectedAsset.type === 'GENERATOR') {
      steps.push({
        transactionType: 'PoweredDown',
        summary: 'OFF',
        fields: {},
      });
    }

    if (includeCheckOut) {
      const checkOutType = getCheckOutTypeForAsset(selectedAsset);
      if (selectedAsset.type === 'GENERATOR') {
        steps.push({
          transactionType: checkOutType,
          summary: 'Fuel 85% • DEF 85% • 1250 kWh',
          fields: {
            checkOutFuelPercentage: 85,
            checkOutDefPercentage: 85,
            checkOutKWH: 1250,
          },
        });
      } else if (selectedAsset.type === 'TANK') {
        steps.push({
          transactionType: checkOutType,
          summary: 'Fuel 6/8',
          fields: {
            checkOutFuelEighths: 6,
          },
        });
      } else {
        steps.push({
          transactionType: checkOutType,
          summary: 'Fuel 85%',
          fields: {
            checkOutFuelPercentage: 85,
          },
        });
      }
    }

    abortRef.current = false;
    setIsRunning(true);
    setSentCount(0);
    setSuccessCount(0);
    setErrorCount(0);
    setLogs([]);

    let lastTimestampMs = 0;

    for (let i = 0; i < steps.length; i++) {
      if (abortRef.current) break;

      const step = steps[i];
      const nowMs = Math.max(Date.now(), lastTimestampMs + 1);
      lastTimestampMs = nowMs;
      const nowIso = new Date(nowMs).toISOString();
      const txId = generateUUID();

      const tx: Transaction = {
        id: txId,
        equipmentId: selectedAsset.equipmentId,
        transactionTimestamp: nowIso,
        transactionType: step.transactionType,
        ...step.fields,
        syncStatus: 'synced',
        deviceId: devId,
        createdAt: nowIso,
      };

      const startMs = performance.now();
      try {
        await postRemoteTransaction(tx);
        const elapsedMs = Math.round(performance.now() - startMs);
        setSentCount((prev) => prev + 1);
        setSuccessCount((prev) => prev + 1);
        setLogs((prev) => [
          {
            index: i + 1,
            txId,
            equipmentId: selectedAsset.equipmentId,
            transactionType: step.transactionType,
            summary: step.summary,
            fuelLitres: step.fuelLitres,
            defLitres: step.defLitres,
            timestamp: nowIso,
            durationMs: elapsedMs,
            status: 'success',
          },
          ...prev.slice(0, 249),
        ]);
      } catch (err: unknown) {
        const elapsedMs = Math.round(performance.now() - startMs);
        const msg = err instanceof Error ? err.message : String(err);
        setSentCount((prev) => prev + 1);
        setErrorCount((prev) => prev + 1);
        setLogs((prev) => [
          {
            index: i + 1,
            txId,
            equipmentId: selectedAsset.equipmentId,
            transactionType: step.transactionType,
            summary: step.summary,
            fuelLitres: step.fuelLitres,
            defLitres: step.defLitres,
            timestamp: nowIso,
            durationMs: elapsedMs,
            status: 'error',
            errorMessage: msg,
          },
          ...prev.slice(0, 249),
        ]);
      }

      if (i < steps.length - 1 && !abortRef.current && delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    broadcastFleetResync();
    setIsRunning(false);
  };

  if (isAuthChecking) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0B0F19',
          color: '#94A3B8',
          fontSize: '0.9rem',
        }}
      >
        Loading...
      </div>
    );
  }

  if (!adminSession || isPasswordRecovery) {
    return (
      <AdminLoginView
        isPasswordRecovery={isPasswordRecovery}
        initialError={initialAuthInfo.errorDescription}
        onPasswordRecoveryComplete={() => setIsPasswordRecovery(false)}
      />
    );
  }

  if (!isAuthorizedUser) {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#0B0F19',
          color: '#F8FAFC',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}
      >
        <div
          style={{
            maxWidth: '420px',
            width: '100%',
            background: '#111827',
            border: '1px solid #334155',
            borderRadius: '10px',
            padding: '24px',
            textAlign: 'center',
          }}
        >
          <ShieldAlert size={28} color="#94A3B8" style={{ marginBottom: '12px' }} />
          <h1 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 8px 0' }}>
            Access Restricted
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#94A3B8', margin: '0 0 18px 0' }}>
            Signed in as <code>{userEmail || 'unknown'}</code>.
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <a
              href="/admin"
              style={{
                padding: '8px 14px',
                borderRadius: '6px',
                background: '#1E293B',
                color: '#F8FAFC',
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: '0.84rem',
                border: '1px solid #334155',
              }}
            >
              Admin Console
            </a>
            <button
              type="button"
              onClick={async () => {
                await signOutAdmin();
                setAdminSession(null);
              }}
              style={{
                padding: '8px 14px',
                borderRadius: '6px',
                background: '#334155',
                color: '#F8FAFC',
                border: 'none',
                fontWeight: 600,
                fontSize: '0.84rem',
                cursor: 'pointer',
              }}
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const fuelTransferCount = Math.max(1, Math.floor(Number(quantity) || 1));
  const extraBookendCount =
    (includeCheckIn ? 1 : 0) +
    (includePowerUp && isGenerator ? 1 : 0) +
    (includePowerDown && isGenerator ? 1 : 0) +
    (includeCheckOut ? 1 : 0);
  const totalPlanned = fuelTransferCount + extraBookendCount;
  const progressPct = isRunning || sentCount > 0 ? Math.min(100, Math.round((sentCount / totalPlanned) * 100)) : 0;

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#94A3B8',
    marginBottom: '5px',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    background: '#090D16',
    border: '1px solid #334155',
    borderRadius: '6px',
    color: '#F8FAFC',
    fontSize: '0.9rem',
    fontFamily: "'JetBrains Mono', monospace",
    boxSizing: 'border-box',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0B0F19', color: '#F8FAFC', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header
        style={{
          background: '#111827',
          borderBottom: '1px solid #1E293B',
          padding: '10px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1rem', fontWeight: 700 }}>Stress Test</span>
          <span
            onClick={() => {
              if (hasNewVersion) {
                performAppUpdate(newVersionTag || undefined);
              }
            }}
            style={{
              color: '#94A3B8',
              fontSize: '0.75rem',
              fontFamily: 'monospace',
              cursor: hasNewVersion ? 'pointer' : 'default',
            }}
          >
            v{APP_VERSION}{isStaging ? ' (staging)' : ''}{hasNewVersion ? ' • Update' : ''}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <a
            href="/admin"
            target="_blank"
            rel="noreferrer"
            style={{
              color: '#CBD5E1',
              textDecoration: 'none',
              fontSize: '0.8rem',
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid #334155',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <span>Admin</span>
            <ExternalLink size={12} />
          </a>

          <a
            href="/pda"
            target="_blank"
            rel="noreferrer"
            style={{
              color: '#CBD5E1',
              textDecoration: 'none',
              fontSize: '0.8rem',
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid #334155',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <span>PDA</span>
            <ExternalLink size={12} />
          </a>

          <button
            type="button"
            onClick={async () => {
              await signOutAdmin();
              setAdminSession(null);
            }}
            style={{
              background: 'transparent',
              color: '#CBD5E1',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <LogOut size={13} />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main
        style={{
          maxWidth: '1140px',
          width: '100%',
          margin: '0 auto',
          padding: '20px 24px',
          boxSizing: 'border-box',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '20px',
          alignItems: 'start',
        }}
      >
        {/* Left: Configuration */}
        <section
          style={{
            background: '#111827',
            border: '1px solid #1E293B',
            borderRadius: '8px',
            padding: '18px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '14px',
            }}
          >
            <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Parameters</h2>
            <button
              type="button"
              onClick={loadEquipment}
              disabled={isLoadingAssets || isRunning}
              style={{
                background: 'transparent',
                color: '#94A3B8',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '4px 8px',
                fontSize: '0.75rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <RefreshCw size={12} className={isLoadingAssets ? 'admin-spin' : ''} />
              <span>Reload</span>
            </button>
          </div>

          {loadError && (
            <div
              style={{
                border: '1px solid #EF4444',
                color: '#FCA5A5',
                padding: '8px 10px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                marginBottom: '12px',
              }}
            >
              {loadError}
            </div>
          )}

          <form onSubmit={handleGenerateTestData} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Equipment</label>
              <select
                value={selectedEquipmentId}
                onChange={(e) => setSelectedEquipmentId(e.target.value)}
                disabled={isRunning || assets.length === 0}
                required
                style={inputStyle}
              >
                {assets.length === 0 ? (
                  <option value="">No equipment found</option>
                ) : (
                  assets.map((asset) => {
                    const meta = [asset.type, asset.area].filter(Boolean).join(' • ');
                    return (
                      <option key={asset.equipmentId} value={asset.equipmentId}>
                        {meta ? `${asset.equipmentId} (${meta})` : asset.equipmentId}
                      </option>
                    );
                  })
                )}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Bookends</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '7px 10px',
                    borderRadius: '6px',
                    background: '#090D16',
                    border: '1px solid #334155',
                    fontSize: '0.82rem',
                    cursor: isRunning ? 'not-allowed' : 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={includeCheckIn}
                    onChange={(e) => setIncludeCheckIn(e.target.checked)}
                    disabled={isRunning}
                  />
                  <span>Check-In</span>
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '7px 10px',
                    borderRadius: '6px',
                    background: '#090D16',
                    border: '1px solid #334155',
                    fontSize: '0.82rem',
                    opacity: isGenerator ? 1 : 0.4,
                    cursor: isRunning || !isGenerator ? 'not-allowed' : 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isGenerator && includePowerUp}
                    onChange={(e) => setIncludePowerUp(e.target.checked)}
                    disabled={isRunning || !isGenerator}
                  />
                  <span>Power-Up</span>
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '7px 10px',
                    borderRadius: '6px',
                    background: '#090D16',
                    border: '1px solid #334155',
                    fontSize: '0.82rem',
                    opacity: isGenerator ? 1 : 0.4,
                    cursor: isRunning || !isGenerator ? 'not-allowed' : 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isGenerator && includePowerDown}
                    onChange={(e) => setIncludePowerDown(e.target.checked)}
                    disabled={isRunning || !isGenerator}
                  />
                  <span>Power-Down</span>
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '7px 10px',
                    borderRadius: '6px',
                    background: '#090D16',
                    border: '1px solid #334155',
                    fontSize: '0.82rem',
                    cursor: isRunning ? 'not-allowed' : 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={includeCheckOut}
                    onChange={(e) => setIncludeCheckOut(e.target.checked)}
                    disabled={isRunning}
                  />
                  <span>Check-Out</span>
                </label>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={labelStyle}>Quantity</label>
                <input
                  type="number"
                  min={1}
                  max={5000}
                  step={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  disabled={isRunning}
                  required
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Increment (L)</label>
                <input
                  type="number"
                  step={1}
                  value={incrementLitres}
                  onChange={(e) => setIncrementLitres(e.target.value)}
                  disabled={isRunning}
                  required
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={labelStyle}>Start Fuel (L)</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={startFuelLitres}
                  onChange={(e) => setStartFuelLitres(e.target.value)}
                  disabled={isRunning}
                  required
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ ...labelStyle, opacity: isDefApplicable ? 1 : 0.4 }}>Start DEF (L)</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={startDefLitres}
                  onChange={(e) => setStartDefLitres(e.target.value)}
                  disabled={isRunning || !isDefApplicable}
                  required={isDefApplicable}
                  style={{
                    ...inputStyle,
                    opacity: isDefApplicable ? 1 : 0.4,
                    cursor: isDefApplicable ? 'text' : 'not-allowed',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={labelStyle}>Rate</label>
                <input
                  type="number"
                  min={0.1}
                  step="any"
                  value={rateValue}
                  onChange={(e) => setRateValue(e.target.value)}
                  disabled={isRunning}
                  required
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Unit</label>
                <select
                  value={rateUnit}
                  onChange={(e) => setRateUnit(e.target.value as 'per_second' | 'interval_ms')}
                  disabled={isRunning}
                  style={{ ...inputStyle, fontFamily: 'inherit' }}
                >
                  <option value="per_second">Tx / sec</option>
                  <option value="interval_ms">Interval (ms)</option>
                </select>
              </div>
            </div>

            <div>
              <label style={labelStyle}>Device ID</label>
              <input
                type="text"
                value={simulatedDeviceId}
                onChange={(e) => setSimulatedDeviceId(e.target.value.toUpperCase())}
                disabled={isRunning}
                placeholder="STRESS-TEST-SIM"
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              <button
                type="submit"
                disabled={isRunning || !selectedAsset}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: isRunning ? '#334155' : '#E2E8F0',
                  color: isRunning ? '#94A3B8' : '#0F172A',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: isRunning || !selectedAsset ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                {isRunning ? (
                  <>
                    <RefreshCw size={15} className="admin-spin" />
                    <span>Running ({sentCount}/{totalPlanned})</span>
                  </>
                ) : (
                  <>
                    <Play size={15} fill="#0F172A" />
                    <span>Start ({totalPlanned})</span>
                  </>
                )}
              </button>

              {isRunning && (
                <button
                  type="button"
                  onClick={handleStop}
                  style={{
                    padding: '10px 14px',
                    background: '#1E293B',
                    color: '#F8FAFC',
                    border: '1px solid #475569',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.88rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Square size={14} fill="#F8FAFC" />
                  <span>Stop</span>
                </button>
              )}
            </div>
          </form>
        </section>

        {/* Right: Log */}
        <section
          style={{
            background: '#111827',
            border: '1px solid #1E293B',
            borderRadius: '8px',
            padding: '18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Log</h2>
            {logs.length > 0 && !isRunning && (
              <button
                type="button"
                onClick={() => {
                  setLogs([]);
                  setSentCount(0);
                  setSuccessCount(0);
                  setErrorCount(0);
                }}
                style={{
                  background: 'transparent',
                  color: '#94A3B8',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <Trash2 size={12} />
                <span>Clear</span>
              </button>
            )}
          </div>

          {/* Counters */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            <div style={{ background: '#090D16', border: '1px solid #1E293B', borderRadius: '6px', padding: '10px' }}>
              <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>Sent</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, fontFamily: 'monospace', marginTop: '2px' }}>
                {sentCount}/{totalPlanned}
              </div>
            </div>

            <div style={{ background: '#090D16', border: '1px solid #1E293B', borderRadius: '6px', padding: '10px' }}>
              <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>OK</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, fontFamily: 'monospace', marginTop: '2px' }}>
                {successCount}
              </div>
            </div>

            <div style={{ background: '#090D16', border: '1px solid #1E293B', borderRadius: '6px', padding: '10px' }}>
              <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>Errors</div>
              <div
                style={{
                  fontSize: '1.2rem',
                  fontWeight: 700,
                  color: errorCount > 0 ? '#EF4444' : '#F8FAFC',
                  fontFamily: 'monospace',
                  marginTop: '2px',
                }}
              >
                {errorCount}
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div
            style={{
              width: '100%',
              height: '6px',
              background: '#090D16',
              borderRadius: '999px',
              overflow: 'hidden',
              border: '1px solid #1E293B',
            }}
          >
            <div
              style={{
                width: `${progressPct}%`,
                height: '100%',
                background: '#94A3B8',
                transition: 'width 0.15s ease',
              }}
            />
          </div>

          {/* Table */}
          <div
            style={{
              background: '#090D16',
              border: '1px solid #1E293B',
              borderRadius: '6px',
              maxHeight: '420px',
              overflowY: 'auto',
            }}
          >
            {logs.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: '#64748B', fontSize: '0.82rem' }}>
                No transactions sent.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #1E293B', textAlign: 'left', color: '#94A3B8' }}>
                    <th style={{ padding: '7px 10px' }}>#</th>
                    <th style={{ padding: '7px 10px' }}>Asset</th>
                    <th style={{ padding: '7px 10px' }}>Type</th>
                    <th style={{ padding: '7px 10px' }}>Details</th>
                    <th style={{ padding: '7px 10px' }}>Time</th>
                    <th style={{ padding: '7px 10px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((entry) => (
                    <tr key={entry.txId} style={{ borderBottom: '1px solid #1E293B' }}>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: '#94A3B8' }}>
                        {entry.index}
                      </td>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: 600 }}>
                        {entry.equipmentId}
                      </td>
                      <td style={{ padding: '6px 10px', color: '#CBD5E1', whiteSpace: 'nowrap' }}>
                        {formatTxTypeLabel(entry.transactionType)}
                      </td>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: '#E2E8F0' }}>
                        {entry.summary}
                      </td>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: '#94A3B8' }}>
                        {entry.durationMs}ms
                      </td>
                      <td
                        style={{
                          padding: '6px 10px',
                          fontWeight: 600,
                          color: entry.status === 'error' ? '#EF4444' : '#94A3B8',
                        }}
                        title={entry.errorMessage}
                      >
                        {entry.status === 'success' ? 'OK' : 'Error'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default StressTestApp;
