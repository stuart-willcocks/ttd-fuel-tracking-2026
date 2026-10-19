import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Printer, Download, X, QrCode as QrIcon } from 'lucide-react';
import type { Equipment } from '../../types';

interface AssetQRLabelModalProps {
  asset: Equipment | null;
  isOpen: boolean;
  onClose: () => void;
}

export const AssetQRLabelModal: React.FC<AssetQRLabelModalProps> = ({ asset, isOpen, onClose }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    if (!asset) return;

    QRCode.toDataURL(asset.equipmentId, {
      width: 320,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'H',
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('Failed to generate QR code:', err));
  }, [asset]);

  if (!isOpen || !asset) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `QR_${asset.equipmentId}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const getCapacityText = () => {
    if (asset.type === 'GENERATOR' && asset.capacity) return `${asset.capacity} kVA`;
    if (asset.type === 'TANK' && asset.capacity) return `${asset.capacity.toLocaleString()} Litres`;
    return 'N/A';
  };

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div className="admin-modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }} className="no-print">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ padding: '8px', background: 'rgba(245, 158, 11, 0.15)', borderRadius: '8px', color: '#f59e0b' }}>
              <QrIcon size={22} />
            </div>
            <div>
              <h3 style={{ fontFamily: 'var(--adm-font-display)', fontSize: '1.2rem', fontWeight: 700 }}>
                Asset QR Label Generator
              </h3>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                Zebra TC26 Handheld Scannable Tag
              </p>
            </div>
          </div>
          <button onClick={onClose} className="admin-btn admin-btn-outline admin-btn-sm" style={{ padding: '6px' }}>
            <X size={18} />
          </button>
        </div>

        {/* The Printable Asset Label */}
        <div id="printable-asset-label" className="qr-label-card">
          <div className="qr-label-header">
            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.08em', color: '#444' }}>
                TTD POWER &amp; FUEL LOGISTICS
              </div>
              <div className="qr-label-title" style={{ color: '#000000' }}>
                {asset.equipmentId}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span
                style={{
                  display: 'inline-block',
                  background: '#000000',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '0.75rem',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                }}
              >
                {asset.type}
              </span>
            </div>
          </div>

          <div className="qr-label-content">
            {qrDataUrl && (
              <img
                src={qrDataUrl}
                alt={`QR Code for ${asset.equipmentId}`}
                className="qr-label-image"
              />
            )}
            <dl className="qr-label-meta" style={{ flex: 1 }}>
              <dt>Location / Zone</dt>
              <dd style={{ fontSize: '0.9rem' }}>{asset.area} - {asset.location}</dd>

              <dt>What3Words Position</dt>
              <dd style={{ color: '#b91c1c' }}>{asset.what3words}</dd>

              <dt>Capacity Rating</dt>
              <dd>{getCapacityText()}</dd>

              <dt>Rental Serial Number</dt>
              <dd style={{ marginBottom: 0 }}>{asset.rentalSerialNumber || 'N/A'}</dd>
            </dl>
          </div>

          <div
            style={{
              marginTop: '14px',
              paddingTop: '8px',
              borderTop: '1px dashed #777777',
              fontSize: '0.65rem',
              color: '#555555',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>Scan with Zebra TC26 Handheld</span>
            <span>TTD FLEET TRACKING 2026</span>
          </div>
        </div>

        {/* Modal Actions */}
        <div
          className="no-print"
          style={{
            display: 'flex',
            gap: '12px',
            marginTop: '24px',
            paddingTop: '18px',
            borderTop: '1px solid var(--adm-border-subtle)',
            justifyContent: 'flex-end',
          }}
        >
          <button onClick={handleDownload} className="admin-btn admin-btn-secondary">
            <Download size={16} />
            <span>Download PNG</span>
          </button>

          <button onClick={handlePrint} className="admin-btn admin-btn-primary">
            <Printer size={16} />
            <span>Print Label Tag</span>
          </button>
        </div>
      </div>
    </div>
  );
};
