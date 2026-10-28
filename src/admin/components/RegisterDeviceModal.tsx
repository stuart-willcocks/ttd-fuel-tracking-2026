import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { Smartphone, QrCode, X, Check, Copy, AlertTriangle, ShieldCheck } from 'lucide-react';
import type { AuthorizedDevice } from '../../types';
import { generateSecureDeviceToken } from '../../services/device';

interface RegisterDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveDevice: (device: AuthorizedDevice) => Promise<void>;
  existingDevice?: AuthorizedDevice | null;
}

export const RegisterDeviceModal: React.FC<RegisterDeviceModalProps> = ({
  isOpen,
  onClose,
  onSaveDevice,
  existingDevice,
}) => {
  const [deviceId, setDeviceId] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [generatedToken, setGeneratedToken] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [isGenerated, setIsGenerated] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isMouseDownOnBackdrop = useRef<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      if (existingDevice) {
        setDeviceId(existingDevice.deviceId);
        setDeviceName(existingDevice.deviceName || '');
        setGeneratedToken(existingDevice.authToken);
        setIsGenerated(true);
        generateQRCode(existingDevice.deviceId, existingDevice.authToken, existingDevice.deviceName || '');
      } else {
        setDeviceId('');
        setDeviceName('');
        setGeneratedToken(generateSecureDeviceToken());
        setQrDataUrl('');
        setIsGenerated(false);
        setErrorMsg(null);
      }
      setCopied(false);
    }
  }, [isOpen, existingDevice]);

  const generateQRCode = async (id: string, token: string, name: string) => {
    const payload = `TTD-ENROLL:${JSON.stringify({
      deviceId: id.trim().toUpperCase(),
      token: token.trim(),
      name: name.trim() || id.trim().toUpperCase(),
    })}`;

    try {
      const url = await QRCode.toDataURL(payload, {
        width: 320,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
        errorCorrectionLevel: 'H',
      });
      setQrDataUrl(url);
    } catch (err) {
      console.error('Failed to generate enrollment QR code:', err);
      setErrorMsg('Failed to generate QR code.');
    }
  };

  if (!isOpen) return null;

  const handleBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    isMouseDownOnBackdrop.current = e.target === e.currentTarget;
  };

  const handleBackdropMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (isMouseDownOnBackdrop.current && e.target === e.currentTarget) {
      onClose();
    }
    isMouseDownOnBackdrop.current = false;
  };

  const handleCreateAndShowQR = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = deviceId.trim().toUpperCase();

    if (!cleanId) {
      setErrorMsg('Please specify a Device ID (e.g. TC26-01).');
      return;
    }

    if (!/^[A-Z0-9_-]{2,24}$/.test(cleanId)) {
      setErrorMsg('Device ID must be 2-24 characters containing only letters, numbers, hyphens or underscores.');
      return;
    }

    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      const token = generatedToken || generateSecureDeviceToken();
      const now = new Date().toISOString();

      const newDevice: AuthorizedDevice = {
        deviceId: cleanId,
        deviceName: deviceName.trim() || cleanId,
        authToken: token,
        status: 'active',
        registeredAt: existingDevice ? existingDevice.registeredAt : now,
        lastSeenAt: now,
      };

      await onSaveDevice(newDevice);
      await generateQRCode(cleanId, token, deviceName.trim());
      setIsGenerated(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Failed to register device: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyCode = () => {
    const cleanId = deviceId.trim().toUpperCase();
    const code = `TTD-ENROLL:${cleanId}:${generatedToken}`;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div
      className="admin-modal-backdrop"
      onMouseDown={handleBackdropMouseDown}
      onMouseUp={handleBackdropMouseUp}
    >
      <div
        className="admin-modal-panel"
        onMouseDown={(e) => {
          e.stopPropagation();
          isMouseDownOnBackdrop.current = false;
        }}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '520px' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '6px',
                background: 'rgba(37, 99, 235, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2563EB',
              }}
            >
              <Smartphone size={20} />
            </div>
            <div>
              <h2 className="admin-card-title" style={{ fontSize: '1.2rem', color: 'var(--adm-text-primary)', margin: 0 }}>
                {existingDevice ? `Enrollment QR: ${existingDevice.deviceId}` : 'Register New Zebra PDA'}
              </h2>
              <p style={{ fontSize: '0.78rem', color: 'var(--adm-text-secondary)', margin: '2px 0 0 0' }}>
                Define permanent device ID and authorize handheld scanner
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="admin-btn admin-btn-outline admin-btn-sm"
            style={{ padding: '6px' }}
          >
            <X size={18} />
          </button>
        </div>

        {errorMsg && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '6px',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#F87171',
              fontSize: '0.84rem',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertTriangle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {!isGenerated ? (
          /* Step 1: Define Device ID Form */
          <form onSubmit={handleCreateAndShowQR}>
            <div style={{ marginBottom: '16px' }}>
              <label className="admin-label">
                Permanent Device ID <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <input
                type="text"
                className="admin-input admin-mono"
                style={{ width: '100%', fontSize: '0.95rem', fontWeight: 700, textTransform: 'uppercase' }}
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value.toUpperCase())}
                placeholder="e.g. TC26-01, BOWSER-01"
                required
                autoFocus
              />
              <p style={{ fontSize: '0.76rem', color: 'var(--adm-text-muted)', marginTop: '5px' }}>
                Assigned permanently to this physical scanner. Recorded with all fuel transactions.
              </p>
            </div>

            <div style={{ marginBottom: '22px' }}>
              <label className="admin-label">Friendly Device Label (Optional)</label>
              <input
                type="text"
                className="admin-input"
                style={{ width: '100%' }}
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="e.g. Fuel Truck 1 Primary Scanner"
              />
              <p style={{ fontSize: '0.76rem', color: 'var(--adm-text-muted)', marginTop: '5px' }}>
                Helps identify the equipment or truck this scanner is assigned to.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" onClick={onClose} className="admin-btn admin-btn-outline">
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !deviceId.trim()}
                className="admin-btn admin-btn-primary"
              >
                <QrCode size={16} />
                <span>{isSubmitting ? 'Registering...' : 'Authorize & Show Enrollment QR'}</span>
              </button>
            </div>
          </form>
        ) : (
          /* Step 2: Show Enrollment QR Code */
          <div>
            <div
              style={{
                background: '#FFFFFF',
                border: '2px solid #000000',
                borderRadius: '4px',
                padding: '16px',
                textAlign: 'center',
                margin: '0 auto 18px auto',
                maxWidth: '340px',
              }}
            >
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`Enrollment QR for ${deviceId}`}
                  style={{ width: '260px', height: '260px', display: 'block', margin: '0 auto' }}
                />
              ) : (
                <div style={{ height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span>Generating QR...</span>
                </div>
              )}

              <div style={{ marginTop: '10px', borderTop: '1px solid #E2E8F0', paddingTop: '10px' }}>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', fontFamily: 'monospace' }}>
                  {deviceId}
                </div>
                {deviceName && deviceName !== deviceId && (
                  <div style={{ fontSize: '0.82rem', color: '#64748B', marginTop: '2px' }}>
                    {deviceName}
                  </div>
                )}
              </div>
            </div>

            <div
              style={{
                background: 'rgba(37, 99, 235, 0.08)',
                border: '1px solid rgba(37, 99, 235, 0.25)',
                borderRadius: '6px',
                padding: '12px 14px',
                marginBottom: '18px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <ShieldCheck size={20} color="#2563EB" style={{ flexShrink: 0 }} />
              <div style={{ fontSize: '0.82rem', color: 'var(--adm-text-primary)', lineHeight: 1.45 }}>
                <strong>Enrollment Instructions:</strong> Aim the Zebra TC26 laser barcode scanner at this QR code and pull the trigger. The PDA will authorize and unlock immediately.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleCopyCode}
                className="admin-btn admin-btn-outline"
                style={{ gap: '6px', fontSize: '0.82rem' }}
                title="Copy enrollment string for manual entry"
              >
                {copied ? <Check size={14} color="#16A34A" /> : <Copy size={14} />}
                <span>{copied ? 'Code Copied!' : 'Copy Code'}</span>
              </button>

              <button type="button" onClick={onClose} className="admin-btn admin-btn-primary">
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
