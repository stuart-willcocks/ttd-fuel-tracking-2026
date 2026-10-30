import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Zap,
  Play,
  Square,
  RefreshCw,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  LogOut,
  Trash2,
  Activity,
  Fuel,
  Droplets,
  Clock,
  Hash,
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
} from '../services/supabase';
import { APP_VERSION, getIsStaging } from '../version';

const ALLOWED_STRESS_TEST_EMAIL = 'design@stuartwillcocks.co.uk';

interface ExecutionLogEntry {
  index: number;
  txId: string;
  equipmentId: string;
  transactionType: TransactionType;
  fuelLitres: number;
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

  // Execution State
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [sentCount, setSentCount] = useState<number>(0);
  const [successCount, setSuccessCount] = useState<number>(0);
  const [errorCount, setErrorCount] = useState<number>(0);
  const [logs, setLogs] = useState<ExecutionLogEntry[]>([]);
  const abortRef = useRef<boolean>(false);

  const isStaging = getIsStaging();
  const userEmail = adminSession?.user?.email?.trim().toLowerCase() || '';
  const isAuthorizedUser = userEmail === ALLOWED_STRESS_TEST_EMAIL;

  // Auth Session Check
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setIsAuthChecking(false);
      return;
    }

    let mounted = true;
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
    if (isAuthorizedUser) {
      loadEquipment();
    }
  }, [isAuthorizedUser]);

  const selectedAsset = useMemo(
    () => assets.find((a) => a.equipmentId === selectedEquipmentId) || null,
    [assets, selectedEquipmentId]
  );

  // Generators support DEF in FuelTransferGenerator transactions
  const isDefApplicable = selectedAsset?.type === 'GENERATOR';

  const getTransactionTypeForAsset = (asset: Equipment): TransactionType => {
    switch (asset.type) {
      case 'GENERATOR':
        return 'FuelTransferGenerator';
      case 'TANK':
        return 'FuelTransferTank';
      case 'PLANT':
        return 'FuelTransferPlant';
      default:
        return 'FuelTransferGenerator';
    }
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

    const totalQty = Math.max(1, Math.min(5000, Math.floor(Number(quantity) || 1)));
    const initialFuel = Math.max(0, Math.round(Number(startFuelLitres) || 0));
    const initialDef = Math.max(0, Math.round(Number(startDefLitres) || 0));
    const stepLitres = Math.round(Number(incrementLitres) || 0);
    const delayMs = computedIntervalMs;
    const txType = getTransactionTypeForAsset(selectedAsset);
    const devId = simulatedDeviceId.trim() || 'STRESS-TEST-SIM';

    abortRef.current = false;
    setIsRunning(true);
    setSentCount(0);
    setSuccessCount(0);
    setErrorCount(0);
    setLogs([]);

    for (let i = 0; i < totalQty; i++) {
      if (abortRef.current) break;

      const currentFuel = Math.max(0, initialFuel + i * stepLitres);
      const currentDef = isDefApplicable ? Math.max(0, initialDef + i * stepLitres) : undefined;
      const nowIso = new Date().toISOString();
      const txId = generateUUID();

      const tx: Transaction = {
        id: txId,
        equipmentId: selectedAsset.equipmentId,
        transactionTimestamp: nowIso,
        transactionType: txType,
        fuelTransferLitres: currentFuel,
        defTransferLitres: currentDef,
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
            transactionType: txType,
            fuelLitres: currentFuel,
            defLitres: currentDef,
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
            transactionType: txType,
            fuelLitres: currentFuel,
            defLitres: currentDef,
            timestamp: nowIso,
            durationMs: elapsedMs,
            status: 'error',
            errorMessage: msg,
          },
          ...prev.slice(0, 249),
        ]);
      }

      if (i < totalQty - 1 && !abortRef.current && delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

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
          backgroundColor: '#0F172A',
          color: '#94A3B8',
          fontSize: '0.9rem',
          fontWeight: 600,
        }}
      >
        Verifying user session...
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

  // Strict Email Access Control Guard: ONLY design@stuartwillcocks.co.uk may access this app
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
            maxWidth: '460px',
            width: '100%',
            background: '#111827',
            border: '1px solid #EF4444',
            borderRadius: '12px',
            padding: '28px 24px',
            textAlign: 'center',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
          }}
        >
          <div
            style={{
              width: '54px',
              height: '54px',
              borderRadius: '12px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid #EF4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px auto',
              color: '#EF4444',
            }}
          >
            <ShieldAlert size={28} />
          </div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 8px 0' }}>
            Access Restricted
          </h1>
          <p style={{ fontSize: '0.88rem', color: '#94A3B8', margin: '0 0 20px 0', lineHeight: 1.5 }}>
            The Stress Test Simulator is restricted exclusively to{' '}
            <code style={{ color: '#F8FAFC', fontWeight: 700 }}>{ALLOWED_STRESS_TEST_EMAIL}</code>.
            You are currently signed in as <code style={{ color: '#FCA5A5' }}>{userEmail || 'unknown'}</code>.
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <a
              href="/admin"
              style={{
                padding: '10px 16px',
                borderRadius: '8px',
                background: '#1E293B',
                color: '#F8FAFC',
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: '0.85rem',
                border: '1px solid #334155',
              }}
            >
              Return to Admin Console
            </a>
            <button
              type="button"
              onClick={async () => {
                await signOutAdmin();
                setAdminSession(null);
              }}
              style={{
                padding: '10px 16px',
                borderRadius: '8px',
                background: '#EF4444',
                color: '#FFFFFF',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.85rem',
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

  const totalPlanned = Math.max(1, Math.floor(Number(quantity) || 1));
  const progressPct = isRunning || sentCount > 0 ? Math.min(100, Math.round((sentCount / totalPlanned) * 100)) : 0;

  return (
    <div style={{ minHeight: '100vh', background: '#0B0F19', color: '#F8FAFC', display: 'flex', flexDirection: 'column' }}>
      {/* Top Bar */}
      <header
        style={{
          background: '#EC721E',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          borderBottom: '2px solid rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src="/logo-01.png" alt="TTD Logo" style={{ height: '56px', width: 'auto', display: 'block' }} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#FFFFFF' }}>
                TTD Fuel Tracking
              </span>
              <span
                style={{
                  background: '#0B0F19',
                  color: '#FDE047',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  padding: '3px 8px',
                  borderRadius: '4px',
                  letterSpacing: '0.05em',
                }}
              >
                STRESS TEST SIMULATOR
              </span>
              <span
                style={{
                  background: 'rgba(0,0,0,0.25)',
                  color: '#FFFFFF',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                }}
              >
                V{APP_VERSION}{isStaging ? ' (STAGING)' : ''}
              </span>
            </div>
            <div style={{ fontSize: '0.76rem', color: 'rgba(255,255,255,0.9)', fontWeight: 600, marginTop: '2px' }}>
              Authorized User: {adminSession.user.email}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <a
            href="/admin"
            target="_blank"
            rel="noreferrer"
            className="admin-top-tool-btn"
            style={{ textDecoration: 'none' }}
          >
            <span>ADMIN CONSOLE</span>
            <ExternalLink size={12} />
          </a>

          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="admin-top-tool-btn"
            style={{ textDecoration: 'none' }}
          >
            <span>PDA APP</span>
            <ExternalLink size={12} />
          </a>

          <button
            type="button"
            onClick={async () => {
              await signOutAdmin();
              setAdminSession(null);
            }}
            className="admin-top-tool-btn"
          >
            <LogOut size={14} />
            <span>SIGN OUT</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main
        style={{
          maxWidth: '1240px',
          width: '100%',
          margin: '0 auto',
          padding: '24px',
          boxSizing: 'border-box',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
          gap: '24px',
          alignItems: 'start',
        }}
      >
        {/* Left Card: Configuration Form */}
        <section
          style={{
            background: '#111827',
            border: '1px solid #1E293B',
            borderRadius: '12px',
            padding: '22px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.35)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '18px',
              paddingBottom: '12px',
              borderBottom: '1px solid #1E293B',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={20} color="#EC721E" />
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>
                Transaction Load Generator
              </h2>
            </div>

            <button
              type="button"
              onClick={loadEquipment}
              disabled={isLoadingAssets || isRunning}
              style={{
                background: '#1E293B',
                color: '#E2E8F0',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '0.76rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <RefreshCw size={13} className={isLoadingAssets ? 'admin-spin' : ''} />
              <span>Reload Assets</span>
            </button>
          </div>

          {loadError && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid #EF4444',
                color: '#FCA5A5',
                padding: '10px 12px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertTriangle size={16} />
              <span>{loadError}</span>
            </div>
          )}

          <form onSubmit={handleGenerateTestData} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Equipment ID Selector */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  color: '#94A3B8',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: '6px',
                }}
              >
                Equipment ID
              </label>
              <select
                value={selectedEquipmentId}
                onChange={(e) => setSelectedEquipmentId(e.target.value)}
                disabled={isRunning || assets.length === 0}
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#030712',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#F8FAFC',
                  fontSize: '0.92rem',
                  fontWeight: 700,
                  fontFamily: "'JetBrains Mono', monospace",
                  boxSizing: 'border-box',
                }}
              >
                {assets.length === 0 ? (
                  <option value="">No equipment found</option>
                ) : (
                  assets.map((asset) => (
                    <option key={asset.equipmentId} value={asset.equipmentId}>
                      {asset.equipmentId} — {asset.type} ({asset.area} / {asset.location})
                    </option>
                  ))
                )}
              </select>
              {selectedAsset && (
                <div style={{ marginTop: '6px', fontSize: '0.76rem', color: '#94A3B8' }}>
                  Asset Type: <strong style={{ color: '#F8FAFC' }}>{selectedAsset.type}</strong> • Transaction Type:{' '}
                  <code style={{ color: '#38BDF8' }}>{getTransactionTypeForAsset(selectedAsset)}</code>
                </div>
              )}
            </div>

            {/* Quantity & Increment Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    color: '#94A3B8',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    marginBottom: '6px',
                  }}
                >
                  <Hash size={13} />
                  <span>Quantity of Transactions</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={5000}
                  step={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  disabled={isRunning}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: '#030712',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    color: '#F8FAFC',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    fontFamily: "'JetBrains Mono', monospace",
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    color: '#94A3B8',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    marginBottom: '6px',
                  }}
                >
                  Increment Amount (Litres)
                </label>
                <input
                  type="number"
                  step={1}
                  value={incrementLitres}
                  onChange={(e) => setIncrementLitres(e.target.value)}
                  disabled={isRunning}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: '#030712',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    color: '#F8FAFC',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    fontFamily: "'JetBrains Mono', monospace",
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* Starting Values for Fuel and DEF */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    color: '#94A3B8',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    marginBottom: '6px',
                  }}
                >
                  <Fuel size={13} color="#F59E0B" />
                  <span>Starting Fuel (Litres)</span>
                </label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={startFuelLitres}
                  onChange={(e) => setStartFuelLitres(e.target.value)}
                  disabled={isRunning}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: '#030712',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    color: '#F8FAFC',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    fontFamily: "'JetBrains Mono', monospace",
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    color: isDefApplicable ? '#94A3B8' : '#475569',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    marginBottom: '6px',
                  }}
                >
                  <Droplets size={13} color={isDefApplicable ? '#38BDF8' : '#475569'} />
                  <span>Starting DEF (Litres)</span>
                </label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={startDefLitres}
                  onChange={(e) => setStartDefLitres(e.target.value)}
                  disabled={isRunning || !isDefApplicable}
                  required={isDefApplicable}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: isDefApplicable ? '#030712' : '#090D16',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    color: isDefApplicable ? '#F8FAFC' : '#475569',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    fontFamily: "'JetBrains Mono', monospace",
                    boxSizing: 'border-box',
                    cursor: isDefApplicable ? 'text' : 'not-allowed',
                  }}
                />
                {!isDefApplicable && (
                  <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '4px' }}>
                    Not applicable for {selectedAsset?.type || 'this asset type'}
                  </div>
                )}
              </div>
            </div>

            {/* Send Rate Controls */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    color: '#94A3B8',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    marginBottom: '6px',
                  }}
                >
                  <Clock size={13} />
                  <span>Send Rate</span>
                </label>
                <input
                  type="number"
                  min={0.1}
                  step="any"
                  value={rateValue}
                  onChange={(e) => setRateValue(e.target.value)}
                  disabled={isRunning}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: '#030712',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    color: '#F8FAFC',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    fontFamily: "'JetBrains Mono', monospace",
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    color: '#94A3B8',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    marginBottom: '6px',
                  }}
                >
                  Rate Unit
                </label>
                <select
                  value={rateUnit}
                  onChange={(e) => setRateUnit(e.target.value as 'per_second' | 'interval_ms')}
                  disabled={isRunning}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: '#030712',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    color: '#F8FAFC',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="per_second">Transactions / second</option>
                  <option value="interval_ms">Milliseconds between transactions</option>
                </select>
              </div>
            </div>

            {/* Simulated Device ID */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  color: '#94A3B8',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: '6px',
                }}
              >
                Simulated Device ID Tag
              </label>
              <input
                type="text"
                value={simulatedDeviceId}
                onChange={(e) => setSimulatedDeviceId(e.target.value.toUpperCase())}
                disabled={isRunning}
                placeholder="STRESS-TEST-SIM"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#030712',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#F8FAFC',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  fontFamily: "'JetBrains Mono', monospace",
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Sequence Preview Box */}
            <div
              style={{
                background: '#090D16',
                border: '1px solid #1E293B',
                borderRadius: '8px',
                padding: '12px',
                fontSize: '0.8rem',
                color: '#94A3B8',
                lineHeight: 1.5,
              }}
            >
              <div style={{ fontWeight: 700, color: '#E2E8F0', marginBottom: '4px' }}>
                Sequence Preview ({totalPlanned} transactions @ {computedIntervalMs}ms interval):
              </div>
              <div>
                • Tx #1: Fuel = <strong>{Math.max(0, Math.round(Number(startFuelLitres) || 0))} L</strong>
                {isDefApplicable && (
                  <>
                    , DEF = <strong>{Math.max(0, Math.round(Number(startDefLitres) || 0))} L</strong>
                  </>
                )}
              </div>
              {totalPlanned > 1 && (
                <div>
                  • Tx #{totalPlanned}: Fuel ={' '}
                  <strong>
                    {Math.max(
                      0,
                      Math.round(Number(startFuelLitres) || 0) +
                        (totalPlanned - 1) * Math.round(Number(incrementLitres) || 0)
                    )}{' '}
                    L
                  </strong>
                  {isDefApplicable && (
                    <>
                      , DEF ={' '}
                      <strong>
                        {Math.max(
                          0,
                          Math.round(Number(startDefLitres) || 0) +
                            (totalPlanned - 1) * Math.round(Number(incrementLitres) || 0)
                        )}{' '}
                        L
                      </strong>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
              <button
                type="submit"
                disabled={isRunning || !selectedAsset}
                style={{
                  flex: 1,
                  padding: '13px 18px',
                  background: isRunning ? '#475569' : '#EC721E',
                  color: '#000000',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  cursor: isRunning || !selectedAsset ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                {isRunning ? (
                  <>
                    <RefreshCw size={16} className="admin-spin" />
                    <span>Generating Test Data ({sentCount}/{totalPlanned})...</span>
                  </>
                ) : (
                  <>
                    <Play size={16} fill="#000000" />
                    <span>Generate test data</span>
                  </>
                )}
              </button>

              {isRunning && (
                <button
                  type="button"
                  onClick={handleStop}
                  style={{
                    padding: '13px 18px',
                    background: '#EF4444',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 800,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Square size={15} fill="#FFFFFF" />
                  <span>Stop</span>
                </button>
              )}
            </div>
          </form>
        </section>

        {/* Right Card: Live Execution Progress & Telemetry Log */}
        <section
          style={{
            background: '#111827',
            border: '1px solid #1E293B',
            borderRadius: '12px',
            padding: '22px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.35)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: '12px',
              borderBottom: '1px solid #1E293B',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={20} color="#22C55E" />
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>
                Live Execution Feed
              </h2>
            </div>

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
                  padding: '5px 10px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <Trash2 size={12} />
                <span>Clear Log</span>
              </button>
            )}
          </div>

          {/* KPI Counters */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            <div
              style={{
                background: '#090D16',
                border: '1px solid #1E293B',
                borderRadius: '8px',
                padding: '12px',
              }}
            >
              <div style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase' }}>
                Dispatched
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, fontFamily: 'monospace', marginTop: '4px' }}>
                {sentCount} <span style={{ fontSize: '0.85rem', color: '#64748B' }}>/ {totalPlanned}</span>
              </div>
            </div>

            <div
              style={{
                background: 'rgba(34, 197, 94, 0.08)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                borderRadius: '8px',
                padding: '12px',
              }}
            >
              <div style={{ fontSize: '0.72rem', color: '#86EFAC', fontWeight: 700, textTransform: 'uppercase' }}>
                Succeeded
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#22C55E', fontFamily: 'monospace', marginTop: '4px' }}>
                {successCount}
              </div>
            </div>

            <div
              style={{
                background: errorCount > 0 ? 'rgba(239, 68, 68, 0.12)' : '#090D16',
                border: `1px solid ${errorCount > 0 ? 'rgba(239, 68, 68, 0.4)' : '#1E293B'}`,
                borderRadius: '8px',
                padding: '12px',
              }}
            >
              <div style={{ fontSize: '0.72rem', color: errorCount > 0 ? '#FCA5A5' : '#94A3B8', fontWeight: 700, textTransform: 'uppercase' }}>
                Errors
              </div>
              <div
                style={{
                  fontSize: '1.4rem',
                  fontWeight: 800,
                  color: errorCount > 0 ? '#EF4444' : '#94A3B8',
                  fontFamily: 'monospace',
                  marginTop: '4px',
                }}
              >
                {errorCount}
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: '#94A3B8', marginBottom: '6px' }}>
              <span>Batch Progress</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{progressPct}%</span>
            </div>
            <div
              style={{
                width: '100%',
                height: '10px',
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
                  background: '#22C55E',
                  transition: 'width 0.15s ease',
                }}
              />
            </div>
          </div>

          {/* Log Table */}
          <div
            style={{
              background: '#090D16',
              border: '1px solid #1E293B',
              borderRadius: '8px',
              maxHeight: '420px',
              overflowY: 'auto',
            }}
          >
            {logs.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: '#64748B', fontSize: '0.85rem' }}>
                Configure parameters on the left and press <strong>Generate test data</strong> to begin streaming fuel transfer transactions.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #1E293B', background: '#0F172A', textAlign: 'left', color: '#94A3B8' }}>
                    <th style={{ padding: '8px 10px' }}>#</th>
                    <th style={{ padding: '8px 10px' }}>Asset</th>
                    <th style={{ padding: '8px 10px' }}>Fuel (L)</th>
                    <th style={{ padding: '8px 10px' }}>DEF (L)</th>
                    <th style={{ padding: '8px 10px' }}>Latency</th>
                    <th style={{ padding: '8px 10px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((entry) => (
                    <tr key={entry.txId} style={{ borderBottom: '1px solid #1E293B' }}>
                      <td style={{ padding: '7px 10px', fontFamily: 'monospace', color: '#94A3B8' }}>
                        #{entry.index}
                      </td>
                      <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontWeight: 700 }}>
                        {entry.equipmentId}
                      </td>
                      <td style={{ padding: '7px 10px', fontFamily: 'monospace', color: '#FBBF24', fontWeight: 700 }}>
                        {entry.fuelLitres} L
                      </td>
                      <td style={{ padding: '7px 10px', fontFamily: 'monospace', color: '#38BDF8', fontWeight: 700 }}>
                        {entry.defLitres !== undefined ? `${entry.defLitres} L` : '—'}
                      </td>
                      <td style={{ padding: '7px 10px', fontFamily: 'monospace', color: '#94A3B8' }}>
                        {entry.durationMs}ms
                      </td>
                      <td style={{ padding: '7px 10px' }}>
                        {entry.status === 'success' ? (
                          <span style={{ color: '#22C55E', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 700 }}>
                            <CheckCircle2 size={13} />
                            <span>Sent</span>
                          </span>
                        ) : (
                          <span
                            title={entry.errorMessage}
                            style={{ color: '#EF4444', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 700 }}
                          >
                            <AlertTriangle size={13} />
                            <span>Failed</span>
                          </span>
                        )}
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
