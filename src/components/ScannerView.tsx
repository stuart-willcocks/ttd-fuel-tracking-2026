import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, List, Search, X } from 'lucide-react';
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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const EQUIPMENT_ID_REGEX = /^TTD[-_][A-Z0-9]{3}[-_]\d{4}$/i;

  const checkAndSelectAsset = (value: string) => {
    const trimmed = value.trim().toUpperCase();
    if (EQUIPMENT_ID_REGEX.test(trimmed)) {
      setErrorMessage(null);
      // Check if an existing asset matches either the exact ID or alternate separator
      const alt = trimmed.includes('-')
        ? trimmed.replace(/-/g, '_')
        : trimmed.replace(/_/g, '-');
      const matched = availableAssets.find(
        (a) => a.equipmentId.toUpperCase() === trimmed || a.equipmentId.toUpperCase() === alt
      );
      onAssetSelected(matched ? matched.equipmentId : trimmed);
      return true;
    }
    return false;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setBarcodeInput(val);
    setErrorMessage(null);

    // If it matches TTD-xxx-nnnn or TTD_xxx_nnnn, immediately display asset without waiting for Enter
    checkAndSelectAsset(val);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const matched = checkAndSelectAsset(barcodeInput);
      if (!matched && barcodeInput.trim()) {
        setErrorMessage(
          `Invalid QR format "${barcodeInput.trim()}". Must match TTD-xxx-nnnn or TTD_xxx_nnnn.`
        );
      }
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
      {/* Barcode input for Zebra scanner - spans entire screen, text center justified, virtual keyboard hidden */}
      <div className="scan-input-row-full">
        <input
          ref={inputRef}
          type="text"
          inputMode="none"
          className="scan-input-fullscreen"
          placeholder="TTD-xxx-nnnn"
          value={barcodeInput}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck="false"
        />
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
