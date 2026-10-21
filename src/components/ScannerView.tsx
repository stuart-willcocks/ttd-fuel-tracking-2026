import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AlertCircle, List, Search, X } from 'lucide-react';
import type { Equipment } from '../types';
import { EquipmentTypeIcon } from './EquipmentTypeIcon';

export interface ScannerViewProps {
  availableAssets: Equipment[];
  onAssetSelected: (equipmentId: string) => void;
  isAnyModalOpen?: boolean;
}

export const ScannerView: React.FC<ScannerViewProps> = ({
  availableAssets,
  onAssetSelected,
  isAnyModalOpen = false,
}) => {
  const [barcodeInput, setBarcodeInput] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isModalActive = isAssetModalOpen || isAnyModalOpen;

  // Reliable focus handler that prevents scroll jumping on Zebra TC26
  const focusInput = useCallback(() => {
    if (isModalActive) return;
    if (inputRef.current && document.activeElement !== inputRef.current) {
      inputRef.current.focus({ preventScroll: true });
    }
  }, [isModalActive]);

  // Initial focus on mount
  useEffect(() => {
    focusInput();
    const t = setTimeout(focusInput, 80);
    return () => clearTimeout(t);
  }, [focusInput]);

  // Re-focus whenever any modal closes
  useEffect(() => {
    if (!isModalActive) {
      focusInput();
      const t1 = setTimeout(focusInput, 50);
      const t2 = setTimeout(focusInput, 150);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [isModalActive, focusInput]);

  // Global listeners: clicks on screen restore focus to barcode input
  useEffect(() => {
    const handleGlobalInteraction = (e: Event) => {
      if (isModalActive) return;

      const target = e.target as HTMLElement | null;

      // If user clicked inside an active modal, ignore
      if (target?.closest('.modal-box')) return;

      // If user clicked button to open fleet list, allow
      if (target?.closest('.old-btn-select-fleet')) return;

      setTimeout(focusInput, 50);
      setTimeout(focusInput, 150);
    };

    const handleWindowFocus = () => {
      if (!isModalActive) {
        focusInput();
      }
    };

    window.addEventListener('pointerup', handleGlobalInteraction);
    window.addEventListener('click', handleGlobalInteraction);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      window.removeEventListener('pointerup', handleGlobalInteraction);
      window.removeEventListener('click', handleGlobalInteraction);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [isModalActive, focusInput]);

  // Keep-alive focus heartbeat: ensures barcode text box never stays unfocused
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isModalActive) {
        if (document.activeElement !== inputRef.current) {
          focusInput();
        }
      }
    }, 400);

    return () => clearInterval(interval);
  }, [isModalActive, focusInput]);

  // Helper to find asset in fleet matching input
  const findMatchingAsset = useCallback(
    (value: string): Equipment | null => {
      const trimmed = value.trim().toUpperCase();
      if (!trimmed) return null;
      const alt = trimmed.includes('-')
        ? trimmed.replace(/-/g, '_')
        : trimmed.replace(/_/g, '-');
      return (
        availableAssets.find(
          (a) =>
            a.equipmentId.toUpperCase() === trimmed ||
            a.equipmentId.toUpperCase() === alt
        ) || null
      );
    },
    [availableAssets]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setBarcodeInput(val);
    setErrorMessage(null);

    const match = findMatchingAsset(val);
    if (match) {
      setBarcodeInput('');
      onAssetSelected(match.equipmentId);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const match = findMatchingAsset(barcodeInput);
      if (match) {
        setBarcodeInput('');
        setErrorMessage(null);
        onAssetSelected(match.equipmentId);
      } else if (barcodeInput.trim()) {
        setErrorMessage(`Asset "${barcodeInput.trim()}" not found in fleet.`);
      }
    }
  };

  const handleBlur = () => {
    setTimeout(() => {
      if (!isModalActive) {
        focusInput();
      }
    }, 60);
  };

  const handleOpenModal = () => {
    setSearchQuery('');
    setIsAssetModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsAssetModalOpen(false);
    setSearchQuery('');
    setTimeout(focusInput, 80);
  };

  const handleSelectAsset = (equipmentId: string) => {
    setIsAssetModalOpen(false);
    setSearchQuery('');
    setBarcodeInput('');
    setErrorMessage(null);
    onAssetSelected(equipmentId);
  };

  // Real-time filtering across all text fields
  const filteredAssets = availableAssets.filter((asset) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      (asset.equipmentId && asset.equipmentId.toLowerCase().includes(q)) ||
      (asset.type && asset.type.toLowerCase().includes(q)) ||
      (asset.location && asset.location.toLowerCase().includes(q)) ||
      (asset.area && asset.area.toLowerCase().includes(q)) ||
      (asset.what3words && asset.what3words.toLowerCase().includes(q)) ||
      (asset.rentalSerialNumber && asset.rentalSerialNumber.toLowerCase().includes(q)) ||
      (asset.capacity !== undefined && String(asset.capacity).toLowerCase().includes(q))
    );
  });

  return (
    <div className="old-screen-container scan-screen-only">
      <div className="old-scanner-middle-area">
        {/* Full width rectangular scan input box */}
        <div className="scan-input-wrapper">
          <input
            ref={inputRef}
            type="text"
            inputMode="none"
            className="old-scan-input"
            placeholder="SCAN QR CODE"
            value={barcodeInput}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck="false"
          />
        </div>

        {errorMessage && (
          <div className="old-error-message">
            <AlertCircle size={15} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Full width rectangular "Choose from list" button */}
        <button
          type="button"
          className="old-btn-select-fleet"
          onClick={handleOpenModal}
        >
          <List size={16} />
          <span>Choose from list</span>
        </button>
      </div>

      {/* Asset Picker Modal */}
      {isAssetModalOpen && (
        <div className="modal-backdrop asset-picker-backdrop" onClick={handleCloseModal}>
          <div
            className="modal-box asset-picker-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header-simple">
              <h3 className="modal-title">Select Equipment</h3>
              <span className="picker-asset-count">
                {filteredAssets.length} {filteredAssets.length === availableAssets.length ? 'assets' : `of ${availableAssets.length}`}
              </span>
            </div>

            {/* Search Box labeled "Search" with "X" clear button */}
            <div className="picker-search-container">
              <label htmlFor="picker-search-input" className="picker-search-label">
                Search
              </label>
              <div className="picker-search-input-wrap">
                <Search size={16} className="picker-search-icon" />
                <input
                  ref={searchInputRef}
                  id="picker-search-input"
                  type="text"
                  className="picker-search-input"
                  placeholder="Search by ID, area, location, type..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck="false"
                />
                <button
                  type="button"
                  className={`picker-search-clear-btn ${!searchQuery ? 'picker-search-clear-empty' : ''}`}
                  onClick={() => {
                    setSearchQuery('');
                    searchInputRef.current?.focus();
                  }}
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="asset-picker-list">
              {filteredAssets.length === 0 ? (
                <div className="empty-picker-notice">
                  {searchQuery ? `No equipment matching "${searchQuery}"` : 'No assets available'}
                </div>
              ) : (
                filteredAssets.map((asset) => (
                  <div
                    key={asset.equipmentId}
                    className="asset-compact-row picker-row"
                    onClick={() => handleSelectAsset(asset.equipmentId)}
                  >
                    <div className="row-left">
                      <EquipmentTypeIcon type={asset.type} size={16} />
                      <span className="row-id">{asset.equipmentId}</span>
                    </div>
                    <div className="row-right">
                      <span className="row-location">{asset.location}</span>
                      <span className="row-area">{asset.area}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="modal-single-button-row">
              <button
                type="button"
                className="btn-modal-cancel"
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

export { ScannerView as ScanView };
