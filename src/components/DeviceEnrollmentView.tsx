import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  RefreshCw,
  KeyRound,
  Smartphone,
  AlertTriangle,
} from 'lucide-react';
import {
  saveDeviceEnrollment,
  getDeviceStatus,
  getDeviceId,
  getDeviceName,
  getDeviceToken,
} from '../services/device';
import { verifyRemoteDeviceToken, registerRemoteDeviceRequest } from '../services/api';

interface DeviceEnrollmentViewProps {
  onEnrolled: () => void;
}

export const DeviceEnrollmentView: React.FC<DeviceEnrollmentViewProps> = ({
  onEnrolled,
}) => {
  const initialStatus = getDeviceStatus();
  const initialId = getDeviceId();
  const initialToken = getDeviceToken();
  const initialName = getDeviceName();

  const [deviceIdInput, setDeviceIdInput] = useState(initialId || '');
  const [deviceNameInput, setDeviceNameInput] = useState(
    initialName && initialName !== 'Unregistered PDA' && initialName !== initialId ? initialName : ''
  );
  const [pendingToken, setPendingToken] = useState(initialToken || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [pendingApprovalDeviceId, setPendingApprovalDeviceId] = useState<string | null>(
    initialStatus === 'pending' && initialId ? initialId : null
  );

  const isRevoked = initialStatus === 'revoked';

  // Submit registration request to Admin Console
  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = deviceIdInput.trim().toUpperCase();
    const cleanName = deviceNameInput.trim() || cleanId;

    if (!cleanId) {
      setErrorMsg('Please enter a valid Device ID (e.g. TC26-01).');
      return;
    }

    setErrorMsg(null);
    setIsProcessing(true);

    try {
      const reg = await registerRemoteDeviceRequest(cleanId, cleanName);
      setPendingToken(reg.token);
      saveDeviceEnrollment({
        deviceId: cleanId,
        deviceName: cleanName,
        authToken: reg.token,
        status: 'pending',
      });
      setPendingApprovalDeviceId(cleanId);
      setSuccessMsg(`Registration request submitted for ${cleanId}.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  // Auto-recover if this browser already has a stored Device ID + Token that is re-activated in the Admin Console
  useEffect(() => {
    const storedId = getDeviceId();
    const storedTok = getDeviceToken();
    if (!storedId || !storedTok || pendingApprovalDeviceId) return;

    let cancelled = false;
    const checkStoredDevice = async () => {
      try {
        const check = await verifyRemoteDeviceToken(storedId, storedTok);
        if (!cancelled && check.valid && check.status === 'active' && check.authToken) {
          saveDeviceEnrollment({
            deviceId: storedId,
            deviceName: check.deviceName || storedId,
            authToken: check.authToken,
            status: 'active',
          });
          setSuccessMsg(`Device ${storedId} is active and authorized!`);
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
    const poll = async () => {
      try {
        const tokenToCheck = pendingToken || getDeviceToken() || 'approved_by_admin';
        const check = await verifyRemoteDeviceToken(pendingApprovalDeviceId, tokenToCheck);
        if (!cancelled && (check.valid || check.status === 'active')) {
          saveDeviceEnrollment({
            deviceId: pendingApprovalDeviceId,
            deviceName: check.deviceName || deviceNameInput.trim() || pendingApprovalDeviceId,
            authToken: check.authToken || tokenToCheck,
            status: 'active',
          });
          setSuccessMsg(`Device ${pendingApprovalDeviceId} has been approved!`);
          setTimeout(() => {
            if (!cancelled) onEnrolled();
          }, 800);
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
  }, [pendingApprovalDeviceId, pendingToken, deviceNameInput, onEnrolled]);

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
              background: isRevoked ? 'rgba(239, 68, 68, 0.25)' : 'rgba(0,0,0,0.25)',
              color: isRevoked ? '#EF4444' : '#FFFFFF',
              border: isRevoked ? '1px solid #EF4444' : 'none',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '0.72rem',
              fontWeight: 800,
            }}
          >
            {isRevoked ? <ShieldAlert size={13} color="#EF4444" /> : <Smartphone size={13} />}
            <span>{isRevoked ? 'LOCKED (REVOKED)' : 'LOCKED (UNREGISTERED)'}</span>
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
          <div style={{ textAlign: 'center', marginBottom: '14px' }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                margin: '0 auto 8px auto',
                borderRadius: '10px',
                background: isRevoked ? 'rgba(239, 68, 68, 0.15)' : 'rgba(236, 114, 30, 0.15)',
                border: `1px solid ${isRevoked ? '#EF4444' : '#EC721E'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isRevoked ? '#EF4444' : '#EC721E',
              }}
            >
              {isRevoked ? <ShieldAlert size={24} /> : <KeyRound size={24} />}
            </div>

            <h1 style={{ fontSize: '1.2rem', fontWeight: 800, margin: '0 0 4px 0', color: '#FFFFFF' }}>
              {isRevoked ? 'Device Decommissioned' : 'PDA Registration Required'}
            </h1>
            <p style={{ fontSize: '0.8rem', color: '#94A3B8', margin: 0, lineHeight: 1.4 }}>
              {isRevoked
                ? 'Authorization for this scanner has been revoked by an administrator. Submit a registration request below or re-activate this device in the Admin Console.'
                : 'This handheld is locked down. Submit a registration request below and approve it in the Admin Console.'}
            </p>
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
                Device ID (e.g. TC26-01) *
              </label>
              <input
                type="text"
                value={deviceIdInput}
                onChange={(e) => setDeviceIdInput(e.target.value.toUpperCase())}
                placeholder="e.g. TC26-01"
                disabled={isProcessing || Boolean(pendingApprovalDeviceId)}
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
                }}
              />
            </div>

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
                Device Label / Description (Optional)
              </label>
              <input
                type="text"
                value={deviceNameInput}
                onChange={(e) => setDeviceNameInput(e.target.value)}
                placeholder="e.g. North Yard Scanner 1"
                disabled={isProcessing || Boolean(pendingApprovalDeviceId)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#030712',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#FFFFFF',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
            </div>

            {pendingApprovalDeviceId ? (
              <div>
                <div
                  style={{
                    background: 'rgba(234, 179, 8, 0.15)',
                    border: '1px solid #EAB308',
                    padding: '12px',
                    borderRadius: '6px',
                    color: '#FDE047',
                    fontSize: '0.82rem',
                    textAlign: 'center',
                    marginBottom: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 700 }}>
                    <RefreshCw size={14} className="admin-spin" />
                    <span>Awaiting Admin Approval...</span>
                  </div>
                  <div style={{ marginTop: '4px', fontSize: '0.75rem', opacity: 0.85 }}>
                    Open Admin Console &rarr; PDAs tab and click &ldquo;Approve&rdquo; for <strong>{pendingApprovalDeviceId}</strong>.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPendingApprovalDeviceId(null);
                    setSuccessMsg(null);
                  }}
                  style={{
                    width: '100%',
                    padding: '9px',
                    background: 'transparent',
                    color: '#94A3B8',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                  }}
                >
                  Change Device ID
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
