import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, ArrowRight, List, Search, X, QrCode, Keyboard } from 'lucide-react';
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
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
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

  const handleOpenModal = () => {
    setSearchFilter('');
    setIsAssetModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsAssetModalOpen(false);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  const handleSelectAsset = (equipmentId: string) => {
    setIsAssetModalOpen(false);
    onAssetSelected(equipmentId);
  };

  const filteredAssets = availableAssets.filter((asset) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      asset.equipmentId.toLowerCase().includes(q) ||
      asset.type.toLowerCase().includes(q) ||
      asset.location.toLowerCase().includes(q) ||
      asset.area.toLowerCase().includes(q)
    );
  });

  return (
    <div className="scanner-view">
      {/* Barcode input for Zebra scanner - virtual keyboard hidden on focus */}
      <div className="scan-input-row">
        <input
          ref={inputRef}
          type="text"
          inputMode={isKeyboardVisible ? 'text' : 'none'}
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
          autoCapitalize="characters"
          spellCheck="false"
        />

        <button
          type="button"
          className={`btn-keyboard-toggle ${isKeyboardVisible ? 'active' : ''}`}
          onClick={() => {
            setIsKeyboardVisible((prev) => !prev);
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
          title={isKeyboardVisible ? 'Virtual keyboard enabled (tap to hide)' : 'Virtual keyboard hidden (tap to show)'}
        >
          <Keyboard size={16} />
        </button>

        <button
          type="button"
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

      {/* Button beneath the text box */}
      <button
        type="button"
        className="btn-select-asset"
        onClick={handleOpenModal}
      >
        <List size={16} />
        <span>Select asset from list</span>
      </button>

      {/* Hardware trigger status prompt */}
      <div className="scanner-ready-card">
        <div className="scanner-ready-icon-wrap">
          <QrCode size={26} />
        </div>
        <div className="scanner-ready-title">Hardware Scanner Ready</div>
        <div className="scanner-ready-desc">
          Pull the Zebra TC26 trigger to scan an asset QR code, or tap "Select asset from list" above.
        </div>
      </div>

      {/* Modal Dialog with all assets listed */}
      {isAssetModalOpen && (
        <div className="modal-backdrop" onClick={handleCloseModal}>
          <div className="modal-box asset-picker-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-simple">
              <h3 className="modal-title">Select Equipment</h3>
              <span className="picker-asset-count">{availableAssets.length} assets</span>
            </div>

            {/* Quick search inside dialog */}
            <div className="modal-search-row">
              <Search size={15} className="modal-search-icon" />
              <input
                type="text"
                className="modal-search-input"
                placeholder="Search by ID, type, location..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                autoFocus
              />
              {searchFilter && (
                <button
                  type="button"
                  className="btn-clear-search"
                  onClick={() => setSearchFilter('')}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Clean, concise asset list */}
            <div className="asset-picker-list">
              {filteredAssets.length === 0 ? (
                <div className="empty-picker-notice">No matching assets found</div>
              ) : (
                filteredAssets.map((asset) => (
                  <div
                    key={asset.equipmentId}
                    className="asset-compact-row picker-row"
                    onClick={() => handleSelectAsset(asset.equipmentId)}
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
                ))
              )}
            </div>

            {/* Red Cancel Button */}
            <div className="modal-single-button-row">
              <button
                type="button"
                className="btn-danger-cancel"
                onClick={handleCloseModal}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
