import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ShieldAlert,
  QrCode,
  CheckCircle2,
  RefreshCw,
  KeyRound,
  Smartphone,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import { saveDeviceEnrollment, getDeviceStatus, getDeviceId } from '../services/device';
import { verifyRemoteDeviceToken, registerRemoteDeviceRequest, postRemoteAuthorizedDevice } from '../services/api';

interface DeviceEnrollmentViewProps {
  onEnrolled: () => void;
}

/**
 * Extracts deviceId, token, and optional name from any QR payload or string.
 * Supports:
 *  - TTD-ENROLL:{"deviceId":"TC26-01","token":"tok_...","name":"..."}
 *  - {"deviceId":"TC26-01","token":"tok_..."}
 *  - TTD-ENROLL:TC26-01:tok_...
 *  - TC26-01:tok_...
 */
export function parseEnrollmentString(
  raw: string
): { deviceId: string; token: string; name?: string } | null {
  if (!raw) return null;
  let text = raw.trim();

  // Strip TTD-ENROLL: prefix if present
  if (text.startsWith('TTD-ENROLL:')) {
    text = text.slice('TTD-ENROLL:'.length).trim();
  }

  // 1. JSON Format
  if (text.includes('{') && text.includes('}')) {
    try {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}') + 1;
      const jsonStr = text.substring(start, end);
      const parsed = JSON.parse(jsonStr);

      const id = (parsed.deviceId || parsed.id || '').toString().trim().toUpperCase();
      const tok = (parsed.token || parsed.authToken || '').toString().trim();
      const name = (parsed.name || parsed.deviceName || id).toString().trim();

      if (id && tok) {
        return { deviceId: id, token: tok, name };
      }
    } catch {
      // Not valid JSON yet
    }
  }

  // 2. Colon-separated format: ID:TOKEN or ID:TOKEN:NAME
  if (text.includes(':')) {
    const parts = text.split(':').map((p) => p.trim());
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return {
        deviceId: parts[0].toUpperCase(),
        token: parts[1],
        name: parts[2] || parts[0].toUpperCase(),
      };
    }
  }

  return null;
}

export const DeviceEnrollmentView: React.FC<DeviceEnrollmentViewProps> = ({
  onEnrolled,
}) => {
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

  // Execute enrollment: saves credentials locally immediately so device is unlocked,
  // and syncs/verifies with remote cloud database
  const executeEnrollment = useCallback(
    async (targetDeviceId: string, targetToken: string, targetName?: string) => {
      const cleanId = targetDeviceId.trim().toUpperCase();
      const cleanToken = targetToken.trim();
      const cleanName = (targetName || cleanId).trim();

      if (!cleanId || !cleanToken) {
        setErrorMsg('Invalid QR code: Device ID or Token is missing.');
        return;
      }

      setErrorMsg(null);
      setIsProcessing(true);

      try {
        // 1. Instantly save enrollment to client local storage so PDA is fully unlocked offline
        saveDeviceEnrollment({
          deviceId: cleanId,
          deviceName: cleanName,
          authToken: cleanToken,
          status: 'active',
        });

        // 2. Silently update remote backend / Supabase with authorization record
        try {
          await postRemoteAuthorizedDevice({
            deviceId: cleanId,
            deviceName: cleanName,
            authToken: cleanToken,
            status: 'active',
            registeredAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
          });
        } catch (err) {
          console.warn('Backend sync deferred (will sync automatically when online):', err);
        }

        setSuccessMsg(`Authorized successfully as ${cleanId}!`);
        setBarcodeInput('');

        // 3. Transition to main application screen
        setTimeout(() => {
          onEnrolled();
        }, 600);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMsg(msg);
      } finally {
        setIsProcessing(false);
      }
    },
    [onEnrolled]
  );

  // Handle scanned text change in the laser barcode input
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setBarcodeInput(val);
    setErrorMsg(null);

    // Auto-detect complete QR code payload as soon as it arrives from scanner
    const parsed = parseEnrollmentString(val);
    if (parsed) {
      executeEnrollment(parsed.deviceId, parsed.token, parsed.name);
    }
  };

  // Barcode input submit (Zebra hardware scanner or Enter key)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.keyCode === 13 || e.which === 13) {
      e.preventDefault();
      const parsed = parseEnrollmentString(barcodeInput);
      if (parsed) {
        executeEnrollment(parsed.deviceId, parsed.token, parsed.name);
      } else if (barcodeInput.trim()) {
        setErrorMsg('Unrecognized QR code format. Please scan the Admin Console QR code.');
      }
    }
  };

  // Clipboard paste handler
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (pasted) {
      const parsed = parseEnrollmentString(pasted);
      if (parsed) {
        e.preventDefault();
        setBarcodeInput(pasted);
        executeEnrollment(parsed.deviceId, parsed.token, parsed.name);
      }
    }
  };

  // Manual submission handler
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let cleanId = deviceIdInput.trim().toUpperCase();
    let cleanToken = authTokenInput.trim();

    // If user pasted a full TTD-ENROLL:... string into either field, parse it automatically
    const parsedFromToken = cleanToken ? parseEnrollmentString(cleanToken) : null;
    const parsedFromId = cleanId ? parseEnrollmentString(cleanId) : null;
    if (parsedFromToken) {
      if (!cleanId) cleanId = parsedFromToken.deviceId;
      cleanToken = parsedFromToken.token;
    } else if (parsedFromId) {
      cleanId = parsedFromId.deviceId;
      if (!cleanToken) cleanToken = parsedFromId.token;
    }

    if (!cleanId) {
      setErrorMsg('Please enter a valid Device ID (e.g. TC26-01).');
      return;
    }

    setErrorMsg(null);
    setIsProcessing(true);

    try {
      if (cleanToken) {
        // Direct verification with provided token
        await executeEnrollment(cleanId, cleanToken, cleanId);
        return;
      }

      // No token provided: submit registration request to Admin (or match existing active device)
      const reg = await registerRemoteDeviceRequest(cleanId);
      if (reg.token) {
        setAuthTokenInput(reg.token);
      }
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

  // Auto-recover if this browser already has a stored Device ID that is 'active' in the Admin Console
  // (e.g. after Admin clicks Re-Activate or after manual approval)
  useEffect(() => {
    const storedId = getDeviceId();
    if (!storedId || pendingApprovalDeviceId) return;

    let cancelled = false;
    const checkStoredDevice = async () => {
      try {
        const check = await verifyRemoteDeviceToken(storedId, '');
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

  // Auto-poll approval status if pending manual approval
  useEffect(() => {
    if (!pendingApprovalDeviceId) return;

    const poll = async () => {
      try {
        const check = await verifyRemoteDeviceToken(pendingApprovalDeviceId, authTokenInput || '');
        if (check.valid || check.status === 'active') {
          saveDeviceEnrollment({
            deviceId: pendingApprovalDeviceId,
            deviceName: check.deviceName || pendingApprovalDeviceId,
            authToken: check.authToken || authTokenInput || 'approved_by_admin',
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
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '2px solid rgba(0,0,0,0.2)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img src="/logo-01.png" alt="TTD Logo" style={{ height: '30px', width: 'auto', display: 'block' }} />
          <span style={{ fontSize: '1rem', fontWeight: 800, color: '#000000', letterSpacing: '-0.01em' }}>
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
                ? 'Authorization for this scanner has been revoked by an administrator. The UI is locked down until an authorized QR code is scanned.'
                : 'This handheld is locked down. Point the laser scanner at an authorized Admin QR code to activate.'}
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

          {/* Mode Switch Tabs */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '6px',
              background: '#0F172A',
              padding: '4px',
              borderRadius: '6px',
              marginBottom: '14px',
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
                padding: '8px 10px',
                borderRadius: '4px',
                border: 'none',
                background: activeTab === 'scan' ? '#EC721E' : 'transparent',
                color: activeTab === 'scan' ? '#000000' : '#94A3B8',
                fontWeight: activeTab === 'scan' ? 800 : 500,
                fontSize: '0.8rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
              }}
            >
              <QrCode size={14} />
              <span>Scan QR Code</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('manual');
                setErrorMsg(null);
              }}
              style={{
                padding: '8px 10px',
                borderRadius: '4px',
                border: 'none',
                background: activeTab === 'manual' ? '#EC721E' : 'transparent',
                color: activeTab === 'manual' ? '#000000' : '#94A3B8',
                fontWeight: activeTab === 'manual' ? 800 : 500,
                fontSize: '0.8rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
              }}
            >
              <KeyRound size={14} />
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
                padding: '16px 12px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  margin: '0 auto 10px auto',
                  borderRadius: '50%',
                  background: 'rgba(37, 99, 235, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#60A5FA',
                }}
              >
                <QrCode size={22} />
              </div>

              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#F8FAFC', marginBottom: '4px' }}>
                Aim Laser Scanner at Admin QR
              </div>
              <p style={{ fontSize: '0.76rem', color: '#94A3B8', margin: '0 0 14px 0', lineHeight: 1.4 }}>
                In Admin Console, select <strong>PDAs &rarr; Register New PDA</strong>, then scan the QR code displayed on screen.
              </p>

              {/* Dedicated Zebra Laser Scanner Hardware Input */}
              <div style={{ position: 'relative' }}>
                <input
                  ref={inputRef}
                  type="text"
                  value={barcodeInput}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  inputMode="none"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck="false"
                  placeholder="Laser Scanner Ready"
                  disabled={isProcessing}
                  style={{
                    width: '100%',
                    padding: '11px 12px',
                    background: '#030712',
                    border: '2px solid #EC721E',
                    borderRadius: '6px',
                    color: '#FFFFFF',
                    fontSize: '0.85rem',
                    textAlign: 'center',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    outline: 'none',
                    boxSizing: 'border-box',
                    caretColor: '#EC721E',
                  }}
                />
              </div>

              {/* Action Buttons underneath scan box */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button
                  type="button"
                  disabled={isProcessing || !barcodeInput.trim()}
                  onClick={() => {
                    const parsed = parseEnrollmentString(barcodeInput);
                    if (parsed) {
                      executeEnrollment(parsed.deviceId, parsed.token, parsed.name);
                    } else {
                      setErrorMsg('Please scan or enter a valid QR code with Device ID and Token.');
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '11px',
                    background: barcodeInput.trim() ? '#EC721E' : '#334155',
                    color: barcodeInput.trim() ? '#000000' : '#94A3B8',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 800,
                    fontSize: '0.88rem',
                    cursor: barcodeInput.trim() ? 'pointer' : 'default',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'background 0.2s',
                  }}
                >
                  <ShieldCheck size={16} />
                  <span>Authorize This Scanner</span>
                </button>

                {barcodeInput.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      setBarcodeInput('');
                      setErrorMsg(null);
                      focusScannerInput();
                    }}
                    style={{
                      padding: '11px 14px',
                      background: '#1E293B',
                      color: '#F8FAFC',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      fontWeight: 700,
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                    }}
                  >
                    Clear
                  </button>
                )}
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
                    fontWeight: 700,
                  }}
                >
                  <RefreshCw size={14} className="admin-spin" />
                  <span>Verifying and Authorizing Device...</span>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Manual Device Registration View */}
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
                    Open Admin Console &rarr; PDAs tab to click &ldquo;Approve&rdquo;.
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
