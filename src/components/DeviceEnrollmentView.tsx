import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import {
  saveDeviceEnrollment,
  getDeviceStatus,
  getDeviceId,
  getDeviceToken,
} from '../services/device';
import { verifyRemoteDeviceToken, registerRemoteDeviceRequest } from '../services/api';
import { checkRemoteAppVersion, performAppUpdate } from '../services/appUpdate';
import { BUILD_NUMBER } from '../version';

interface DeviceEnrollmentViewProps {
  onEnrolled: () => void;
}

export const DeviceEnrollmentView: React.FC<DeviceEnrollmentViewProps> = ({
  onEnrolled,
}) => {
  const initialStatus = getDeviceStatus();
  const [deviceId, setDeviceId] = useState(getDeviceId());
  const initialToken = getDeviceToken();

  const [pendingToken, setPendingToken] = useState(initialToken || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [pendingApprovalDeviceId, setPendingApprovalDeviceId] = useState<string | null>(
    initialStatus === 'pending' && deviceId ? deviceId : null
  );

  // Automatically check for and apply app updates even while locked on the authorization screen
  useEffect(() => {
    let cancelled = false;
    const checkUpdate = async () => {
      try {
        const res = await checkRemoteAppVersion();
        if (!cancelled && res.hasUpdate) {
          const targetVer = res.remoteVersion || String(BUILD_NUMBER + 1);
          await performAppUpdate(targetVer);
        }
      } catch {
        // Ignore offline errors
      }
    };
    checkUpdate();
    const timer = setInterval(checkUpdate, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Submit registration request to Admin Console
  const handleRequestSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanId = deviceId.trim().toUpperCase();

    if (!cleanId) {
      setErrorMsg('Device ID is unavailable.');
      return;
    }

    setErrorMsg(null);
    setIsProcessing(true);

    try {
      const reg = await registerRemoteDeviceRequest(cleanId);
      setPendingToken(reg.token);
      saveDeviceEnrollment({
        deviceId: cleanId,
        authToken: reg.token,
        status: 'pending',
      });
      setPendingApprovalDeviceId(cleanId);
      setSuccessMsg(`Authorization request submitted (${cleanId}).`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  // Auto-recover if this browser already has a stored Device ID + Token that is active in the Admin Console
  useEffect(() => {
    const storedId = getDeviceId();
    const storedTok = getDeviceToken();
    if (!storedId || !storedTok || pendingApprovalDeviceId) return;

    let cancelled = false;
    const checkStoredDevice = async () => {
      try {
        const check = await verifyRemoteDeviceToken(storedId, storedTok, true);
        if (!cancelled && check.valid && check.status === 'active' && check.authToken) {
          const finalId = (check.deviceId || storedId).trim().toUpperCase();
          setDeviceId(finalId);
          saveDeviceEnrollment({
            deviceId: finalId,
            authToken: check.authToken,
            status: 'active',
          });
          setSuccessMsg(`Device authorized as ${finalId}!`);
          setTimeout(() => {
            if (!cancelled) onEnrolled();
          }, 500);
        }
      } catch {
        // Ignore offline errors
      }
    };

    checkStoredDevice();
    const interval = setInterval(checkStoredDevice, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pendingApprovalDeviceId, onEnrolled]);

  // Auto-poll approval status while awaiting Admin approval
  useEffect(() => {
    if (!pendingApprovalDeviceId) return;

    let cancelled = false;
    let lastReRegisterTime = 0;
    const poll = async () => {
      try {
        const tokenToCheck = pendingToken || getDeviceToken();
        if (!tokenToCheck) return;
        const check = await verifyRemoteDeviceToken(pendingApprovalDeviceId, tokenToCheck, true);
        if (!cancelled && (check.valid || check.status === 'active')) {
          const finalId = (check.deviceId || pendingApprovalDeviceId).trim().toUpperCase();
          setDeviceId(finalId);
          saveDeviceEnrollment({
            deviceId: finalId,
            authToken: check.authToken || tokenToCheck,
            status: 'active',
          });
          setSuccessMsg(`Device authorized as ${finalId}!`);
          setTimeout(() => {
            if (!cancelled) onEnrolled();
          }, 800);
        } else if (!cancelled && check.status === 'revoked') {
          // If no pending row exists in Supabase (or token didn't match), re-register automatically so the request appears in Admin Console
          const now = Date.now();
          if (now - lastReRegisterTime > 15000) {
            lastReRegisterTime = now;
            await registerRemoteDeviceRequest(pendingApprovalDeviceId, tokenToCheck).catch(() => {});
          }
        }
      } catch {
        // Silently retry
      }
    };

    poll();
    const interval = setInterval(poll, 3500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pendingApprovalDeviceId, pendingToken, onEnrolled]);

  return (
    <div
      style={{
        width: '100%',
        height: '100dvh',
        background: '#070A11',
        color: '#FFFFFF',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        overflow: 'hidden',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {/* Top Brand Banner */}
      <div
        style={{
          background: '#EC721E',
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '2px solid rgba(0,0,0,0.2)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img src="/logo-01.png" alt="TTD Logo" style={{ height: '60px', width: 'auto', display: 'block' }} />
          <span style={{ fontSize: '1rem', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.01em' }}>
            TTD Fuel Tracking
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              background: 'rgba(239, 68, 68, 0.25)',
              color: '#EF4444',
              border: '1px solid #EF4444',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '0.72rem',
              fontWeight: 800,
            }}
          >
            <ShieldAlert size={13} color="#EF4444" />
            <span>NOT AUTHORIZED</span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div
        style={{
          flex: 1,
          padding: '16px 14px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          overflowY: 'auto',
          boxSizing: 'border-box',
        }}
      >
        <div>
          {/* Header Icon & Title */}
          <div style={{ textAlign: 'center', marginBottom: '18px' }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                margin: '0 auto 10px auto',
                borderRadius: '10px',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid #EF4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#EF4444',
              }}
            >
              <ShieldAlert size={24} />
            </div>

            <h1 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: '#FFFFFF' }}>
              Device not authorized
            </h1>
          </div>

          {/* Feedback Banners */}
          {errorMsg && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.18)',
                border: '1px solid #EF4444',
                color: '#FCA5A5',
                padding: '9px 11px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertTriangle size={15} style={{ flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div
              style={{
                background: 'rgba(34, 197, 94, 0.18)',
                border: '1px solid #22C55E',
                color: '#86EFAC',
                padding: '9px 11px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Device Registration Request Form */}
          <form
            onSubmit={handleRequestSubmit}
            style={{
              background: '#0F172A',
              border: '1px solid #1E293B',
              borderRadius: '8px',
              padding: '16px 14px',
            }}
          >
            <div style={{ marginBottom: '14px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  color: '#94A3B8',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: '6px',
                }}
              >
                Temporary Device ID
              </label>
              <input
                type="text"
                value={deviceId}
                readOnly
                disabled
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#030712',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#FFFFFF',
                  fontSize: '0.9rem',
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  boxSizing: 'border-box',
                  outline: 'none',
                  cursor: 'not-allowed',
                }}
              />
            </div>

            {pendingApprovalDeviceId ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div
                  style={{
                    background: 'rgba(234, 179, 8, 0.15)',
                    border: '1px solid #EAB308',
                    padding: '12px',
                    borderRadius: '6px',
                    color: '#FDE047',
                    fontSize: '0.82rem',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 700 }}>
                    <RefreshCw size={14} className="admin-spin" />
                    <span>Awaiting Admin Approval...</span>
                  </div>
                  <div style={{ marginTop: '4px', fontSize: '0.75rem', opacity: 0.85 }}>
                    Open Admin Console &rarr; PDAs tab and click &ldquo;Approve&rdquo; for <strong>{pendingApprovalDeviceId}</strong> to assign its persistent Device ID.
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => handleRequestSubmit()}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    background: '#1E293B',
                    color: '#E2E8F0',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <RefreshCw size={13} className={isProcessing ? 'admin-spin' : undefined} />
                  <span>{isProcessing ? 'Resending Request...' : 'Resend Authorization Request'}</span>
                </button>
              </div>
            ) : (
              <button
                type="submit"
                disabled={isProcessing}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: '#EC721E',
                  color: '#000000',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 800,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                {isProcessing ? (
                  <>
                    <RefreshCw size={15} className="admin-spin" />
                    <span>Submitting Request...</span>
                  </>
                ) : (
                  <span>Request Authorization</span>
                )}
              </button>
            )}
          </form>
        </div>

        {/* Footer info */}
        <div style={{ textAlign: 'center', paddingTop: '12px', borderTop: '1px solid #1E293B' }}>
          <span style={{ fontSize: '0.72rem', color: '#64748B', fontFamily: 'monospace' }}>
            TTD Fuel Tracking • Offline-First PWA Security
          </span>
        </div>
      </div>
    </div>
  );
};

export default DeviceEnrollmentView;
