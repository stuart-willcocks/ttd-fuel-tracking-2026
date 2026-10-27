import React, { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import { Printer, Download, X } from 'lucide-react';
import type { Equipment } from '../../types';

interface AssetQRLabelModalProps {
  asset: Equipment | null;
  isOpen: boolean;
  onClose: () => void;
}

export const AssetQRLabelModal: React.FC<AssetQRLabelModalProps> = ({ asset, isOpen, onClose }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const isMouseDownOnBackdrop = useRef<boolean>(false);

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
        style={{ maxWidth: '420px', background: '#FFFFFF', textAlign: 'center' }}
      >
        {/* Header Close button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }} className="no-print">
          <button onClick={onClose} className="admin-btn admin-btn-outline admin-btn-sm" style={{ padding: '6px' }}>
            <X size={18} />
          </button>
        </div>

        {/* Display only the QR code and the equipment ID - but no other information */}
        <div id="printable-asset-label" className="qr-label-card" style={{ textAlign: 'center', padding: '24px 20px', border: 'none', boxShadow: 'none' }}>
          <div
            style={{
              fontSize: '1.75rem',
              fontWeight: 800,
              color: '#000000',
              marginBottom: '16px',
              fontFamily: 'var(--adm-font-mono)',
              letterSpacing: '0.04em',
            }}
          >
            {asset.equipmentId}
          </div>

          {qrDataUrl && (
            <img
              src={qrDataUrl}
              alt={`QR Code for ${asset.equipmentId}`}
              style={{
                width: '280px',
                height: '280px',
                display: 'block',
                margin: '0 auto',
              }}
            />
          )}
        </div>

        {/* Modal Actions */}
        <div
          className="no-print"
          style={{
            display: 'flex',
            gap: '12px',
            marginTop: '20px',
            paddingTop: '16px',
            borderTop: '1px solid var(--adm-border-subtle)',
            justifyContent: 'center',
          }}
        >
          <button onClick={handleDownload} className="admin-btn admin-btn-secondary">
            <Download size={16} />
            <span>Download PNG</span>
          </button>

          <button onClick={handlePrint} className="admin-btn admin-btn-primary">
            <Printer size={16} />
            <span>Print</span>
          </button>
        </div>
      </div>
    </div>
  );
};
