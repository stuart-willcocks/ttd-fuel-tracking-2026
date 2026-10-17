import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, ArrowRight } from 'lucide-react';
import type { Equipment } from '../types';

interface ScannerViewProps {
  onAssetSelected: (equipmentId: string) => void;
  availableAssets: Equipment[];
}

export const ScannerView: React.FC<ScannerViewProps> = ({
  onAssetSelected,
  availableAssets,
}) => {
  const [barcodeInput, setBarcodeInput] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const EQUIPMENT_ID_REGEX = /^TTD-[A-Z0-9]{3}-\d{4}$/i;

  const handleProcessScan = (scannedValue: string) => {
    const trimmed = scannedValue.trim().toUpperCase();
    if (!trimmed) return;

    if (!EQUIPMENT_ID_REGEX.test(trimmed)) {
      setErrorMessage(
        `Invalid QR format "${trimmed}". Must match TTD-vvv-nnnn (e.g. TTD-MAT-0001).`
      );
      return;
    }

    setErrorMessage(null);
    onAssetSelected(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleProcessScan(barcodeInput);
    }
  };

  return (
    <div className="scanner-view">
      {/* Barcode input for Zebra scanner */}
      <div className="scan-input-row">
        <input
          ref={inputRef}
          type="text"
          className="scan-input"
          placeholder="TTD-vvv-nnnn (e.g. TTD-MAT-0001)"
          value={barcodeInput}
          onChange={(e) => {
            setBarcodeInput(e.target.value);
            setErrorMessage(null);
          }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
        />
        <button
          className="btn-primary-action"
          onClick={() => handleProcessScan(barcodeInput)}
          disabled={!barcodeInput.trim()}
        >
          <span>Find</span>
          <ArrowRight size={16} />
        </button>
      </div>

      {errorMessage && (
        <div className="error-message">
          <AlertCircle size={15} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Clean, compact asset list */}
      <div className="asset-list-section">
        <div className="list-heading-row">
          <span className="list-heading">Select Equipment</span>
          <span className="list-count">{availableAssets.length} assets</span>
        </div>

        <div className="asset-compact-table">
          {availableAssets.map((asset) => (
            <div
              key={asset.equipmentId}
              className="asset-compact-row"
              onClick={() => onAssetSelected(asset.equipmentId)}
            >
              <div className="row-left">
                <span className="row-id">{asset.equipmentId}</span>
                <span className="row-type">{asset.type}</span>
              </div>
              <div className="row-right">
                <span className="row-location">{asset.location}</span>
                <span className="row-area">{asset.area}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

