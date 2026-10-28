import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ShieldAlert, QrCode, CheckCircle2, RefreshCw, KeyRound, Smartphone, AlertTriangle } from 'lucide-react';
import { saveDeviceEnrollment, getDeviceStatus } from '../services/device';
import { verifyRemoteDeviceToken, registerRemoteDeviceRequest } from '../services/api';

interface DeviceEnrollmentViewProps {
  onEnrolled: () => void;
}

export const DeviceEnrollmentView: React.FC<DeviceEnrollmentViewProps> = ({ onEnrolled }) => {
  const [activeTab, setActiveTab] = useState<'scan' | 'manual'>('scan');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [deviceIdInput, setDeviceIdInput] = useState('');
  const [authTokenInput, setAuthTokenInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [pendingApprovalDeviceId, setPendingApprovalDeviceId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const isRevoked = getDeviceStatus() === 'revoked';

  // Reliable focus handler for Zebra TC26 laser barcode scanner
  const focusScannerInput = useCallback(() => {
    if (activeTab === 'scan' && inputRef.current && document.activeElement !== inputRef.current) {
      inputRef.current.focus({ preventScroll: true });
    }
  }, [activeTab]);

  useEffect(() => {
    focusScannerInput();
    const t = setTimeout(focusScannerInput, 100);
    return () => clearTimeout(t);
  }, [focusScannerInput]);

  useEffect(() => {
    if (activeTab === 'scan') {
      const interval = setInterval(() => {
        if (document.activeElement !== inputRef.current) {
          focusScannerInput();
        }
      }, 500);
      return () => clearInterval(interval);
    }
  }, [activeTab, focusScannerInput]);

  // Handle scanned QR code payload
  const handleEnrollmentPayload = async (rawPayload: string) => {
    const trimmed = rawPayload.trim();
    if (!trimmed) return;

    setErrorMsg(null);
    setIsProcessing(true);

    try {
      let targetDeviceId = '';
      let targetToken = '';
      let targetName = '';

      if (trimmed.startsWith('TTD-ENROLL:')) {
        const payloadStr = trimmed.slice('TTD-ENROLL:'.length).trim();
        if (payloadStr.startsWith('{')) {
          const parsed = JSON.parse(payloadStr);
          targetDeviceId = (parsed.deviceId || '').trim().toUpperCase();
          targetToken = (parsed.token || '').trim();
          targetName = (parsed.name || '').trim();
        } else {
          // Format TTD-ENROLL:DEVICE_ID:TOKEN
          const parts = payloadStr.split(':');
          targetDeviceId = (parts[0] || '').trim().toUpperCase();
          targetToken = (parts[1] || '').trim();
        }
      } else if (trimmed.startsWith('{') && trimmed.includes('deviceId')) {
        const parsed = JSON.parse(trimmed);
        targetDeviceId = (parsed.deviceId || '').trim().toUpperCase();
        targetToken = (parsed.token || '').trim();
        targetName = (parsed.name || '').trim();
      } else {
        throw new Error('Unrecognized enrollment QR code. Please scan the Admin Console Enrollment QR code.');
      }

      if (!targetDeviceId || !targetToken) {
        throw new Error('Invalid enrollment payload: Device ID or Token is missing.');
      }

      // Verify credentials with cloud / backend
      const result = await verifyRemoteDeviceToken(targetDeviceId, targetToken);

      if (result.valid || result.status === 'active') {
        saveDeviceEnrollment({
          deviceId: targetDeviceId,
          deviceName: targetName || result.deviceName || targetDeviceId,
          authToken: targetToken,
          status: 'active',
        });
        setSuccessMsg(`Authorized successfully as ${targetDeviceId}!`);
        setTimeout(() => {
          onEnrolled();
        }, 800);
      } else if (result.status === 'pending') {
        setPendingApprovalDeviceId(targetDeviceId);
        setErrorMsg(`Device ${targetDeviceId} is awaiting administrator approval in Admin Console.`);
      } else {
        throw new Error(`Device authorization rejected (Status: ${result.status}).`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      setBarcodeInput('');
    } finally {
      setIsProcessing(false);
      focusScannerInput();
    }
  };

  // Barcode input submit (Zebra hardware scanner sends Enter)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleEnrollmentPayload(barcodeInput);
    }
  };

  // Manual submission handler
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = deviceIdInput.trim().toUpperCase();
    const cleanToken = authTokenInput.trim();

    if (!cleanId) {
      setErrorMsg('Please enter a valid Device ID (e.g. TC26-01).');
      return;
    }

    setErrorMsg(null);
    setIsProcessing(true);

    try {
      if (cleanToken) {
        // Direct verification with provided token
        const result = await verifyRemoteDeviceToken(cleanId, cleanToken);
        if (result.valid || result.status === 'active') {
          saveDeviceEnrollment({
            deviceId: cleanId,
            deviceName: result.deviceName || cleanId,
            authToken: cleanToken,
            status: 'active',
          });
          setSuccessMsg(`Authorized successfully as ${cleanId}!`);
          setTimeout(() => {
            onEnrolled();
          }, 800);
          return;
        } else {
          throw new Error(`Authorization code incorrect or status is ${result.status}.`);
        }
      }

      // No token provided: request registration from Admin
      const reg = await registerRemoteDeviceRequest(cleanId);
      if (reg.status === 'active') {
        saveDeviceEnrollment({
          deviceId: cleanId,
          authToken: reg.token,
          status: 'active',
        });
        setSuccessMsg(`Device ${cleanId} authorized!`);
        setTimeout(() => {
          onEnrolled();
        }, 800);
      } else {
        setPendingApprovalDeviceId(cleanId);
        setSuccessMsg(`Registration request submitted for ${cleanId}.`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  // Auto-poll approval status if pending
  useEffect(() => {
    if (!pendingApprovalDeviceId) return;

    const poll = async () => {
      try {
        const check = await verifyRemoteDeviceToken(pendingApprovalDeviceId, authTokenInput || '');
        if (check.valid || check.status === 'active') {
          saveDeviceEnrollment({
            deviceId: pendingApprovalDeviceId,
            deviceName: check.deviceName || pendingApprovalDeviceId,
            authToken: authTokenInput || 'approved_by_admin',
            status: 'active',
          });
          setSuccessMsg(`Device ${pendingApprovalDeviceId} has been approved!`);
          setTimeout(() => {
            onEnrolled();
          }, 800);
        }
      } catch {
        // Silently retry
      }
    };

    const interval = setInterval(poll, 3500);
    return () => clearInterval(interval);
  }, [pendingApprovalDeviceId, authTokenInput, onEnrolled]);

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
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '2px solid rgba(0,0,0,0.2)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src="/logo-01.png" alt="TTD Logo" style={{ height: '32px', width: 'auto', display: 'block' }} />
          <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#000000', letterSpacing: '-0.01em' }}>
            TTD Fuel Tracking
          </span>
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            background: 'rgba(0,0,0,0.25)',
            color: '#FFFFFF',
            padding: '3px 8px',
            borderRadius: '4px',
            fontSize: '0.72rem',
            fontWeight: 700,
          }}
        >
          <Smartphone size={13} />
          <span>PDA Security</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div
        style={{
          flex: 1,
          padding: '20px 16px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          overflowY: 'auto',
          boxSizing: 'border-box',
        }}
      >
        <div>
          {/* Header Badge */}
          <div style={{ textAlign: 'center', marginBottom: '18px' }}>
            <div
              style={{
                width: '54px',
                height: '54px',
                margin: '0 auto 12px auto',
                borderRadius: '12px',
                background: isRevoked ? 'rgba(239, 68, 68, 0.15)' : 'rgba(236, 114, 30, 0.15)',
                border: `1px solid ${isRevoked ? '#EF4444' : '#EC721E'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isRevoked ? '#EF4444' : '#EC721E',
              }}
            >
              {isRevoked ? <ShieldAlert size={28} /> : <KeyRound size={28} />}
            </div>

            <h1 style={{ fontSize: '1.35rem', fontWeight: 800, margin: '0 0 6px 0', color: '#FFFFFF' }}>
              {isRevoked ? 'Device Decommissioned' : 'PDA Registration Required'}
            </h1>
            <p style={{ fontSize: '0.84rem', color: '#94A3B8', margin: 0, lineHeight: 1.45 }}>
              {isRevoked
                ? 'Authorization for this scanner was revoked by an administrator.'
                : 'This device must be enrolled and authorized before recording fuel transactions.'}
            </p>
          </div>

          {/* Feedback Banners */}
          {errorMsg && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.18)',
                border: '1px solid #EF4444',
                color: '#FCA5A5',
                padding: '10px 12px',
                borderRadius: '6px',
                fontSize: '0.82rem',
                marginBottom: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div
              style={{
                background: 'rgba(34, 197, 94, 0.18)',
                border: '1px solid #22C55E',
                color: '#86EFAC',
                padding: '10px 12px',
                borderRadius: '6px',
                fontSize: '0.82rem',
                marginBottom: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Mode Switch Tabs */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '6px',
              background: '#0F172A',
              padding: '4px',
              borderRadius: '6px',
              marginBottom: '16px',
              border: '1px solid #1E293B',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setActiveTab('scan');
                setErrorMsg(null);
                setTimeout(focusScannerInput, 80);
              }}
              style={{
                padding: '8px 12px',
                borderRadius: '4px',
                border: 'none',
                background: activeTab === 'scan' ? '#EC721E' : 'transparent',
                color: activeTab === 'scan' ? '#000000' : '#94A3B8',
                fontWeight: activeTab === 'scan' ? 700 : 500,
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <QrCode size={15} />
              <span>Scan QR Code</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('manual');
                setErrorMsg(null);
              }}
              style={{
                padding: '8px 12px',
                borderRadius: '4px',
                border: 'none',
                background: activeTab === 'manual' ? '#EC721E' : 'transparent',
                color: activeTab === 'manual' ? '#000000' : '#94A3B8',
                fontWeight: activeTab === 'manual' ? 700 : 500,
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <KeyRound size={15} />
              <span>Manual Entry</span>
            </button>
          </div>

          {/* Tab 1: Hardware Barcode Scanner View */}
          {activeTab === 'scan' && (
            <div
              style={{
                background: '#0F172A',
                border: '1px solid #1E293B',
                borderRadius: '8px',
                padding: '18px 14px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  margin: '0 auto 12px auto',
                  borderRadius: '50%',
                  background: 'rgba(37, 99, 235, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#60A5FA',
                }}
              >
                <QrCode size={26} />
              </div>

              <div style={{ fontWeight: 700, fontSize: '0.94rem', color: '#F8FAFC', marginBottom: '6px' }}>
                Aim Laser Scanner at Admin QR
              </div>
              <p style={{ fontSize: '0.78rem', color: '#94A3B8', margin: '0 0 16px 0', lineHeight: 1.4 }}>
                In the Admin Console, click <strong>PDAs &rarr; Register New PDA</strong>, then point this scanner at the screen and pull the trigger.
              </p>

              {/* Dedicated Zebra Laser Scanner Hardware Input */}
              <div style={{ position: 'relative' }}>
                <input
                  ref={inputRef}
                  type="text"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  inputMode="none"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck="false"
                  placeholder="Laser Scanner Ready"
                  disabled={isProcessing}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    background: '#030712',
                    border: '2px solid #EC721E',
                    borderRadius: '6px',
                    color: '#FFFFFF',
                    fontSize: '0.9rem',
                    textAlign: 'center',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    outline: 'none',
                    boxSizing: 'border-box',
                    caretColor: '#EC721E',
                  }}
                />
              </div>

              {isProcessing && (
                <div
                  style={{
                    marginTop: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    color: '#EC721E',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                  }}
                >
                  <RefreshCw size={14} className="admin-spin" />
                  <span>Validating authorization...</span>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Manual Registration Form */}
          {activeTab === 'manual' && (
            <form
              onSubmit={handleManualSubmit}
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
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    color: '#94A3B8',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    marginBottom: '6px',
                  }}
                >
                  Device ID (e.g. TC26-01, BOWSER-1)
                </label>
                <input
                  type="text"
                  value={deviceIdInput}
                  onChange={(e) => setDeviceIdInput(e.target.value)}
                  placeholder="Enter Device ID"
                  required
                  disabled={isProcessing || Boolean(pendingApprovalDeviceId)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: '#030712',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#FFFFFF',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    boxSizing: 'border-box',
                    outline: 'none',
                    textTransform: 'uppercase',
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
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
                  Authorization Code (Optional)
                </label>
                <input
                  type="text"
                  value={authTokenInput}
                  onChange={(e) => setAuthTokenInput(e.target.value)}
                  placeholder="Provided by Administrator"
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
                    Open the Admin Console &rarr; PDAs tab to click &ldquo;Approve&rdquo;.
                  </div>
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
                      <span>Registering...</span>
                    </>
                  ) : (
                    <span>Register Device</span>
                  )}
                </button>
              )}
            </form>
          )}
        </div>

        {/* Footer info */}
        <div style={{ textAlign: 'center', paddingTop: '14px', borderTop: '1px solid #1E293B' }}>
          <span style={{ fontSize: '0.72rem', color: '#64748B', fontFamily: 'monospace' }}>
            TTD Fuel Tracking • Offline-First PWA Security
          </span>
        </div>
      </div>
    </div>
  );
};
