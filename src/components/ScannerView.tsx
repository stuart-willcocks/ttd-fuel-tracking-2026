import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AlertCircle, List } from 'lucide-react';
import type { Equipment } from '../types';

interface ScannerViewProps {
  onAssetSelected: (equipmentId: string) => void;
  availableAssets: Equipment[];
  isAnyModalOpen?: boolean;
}

export const ScannerView: React.FC<ScannerViewProps> = ({
  onAssetSelected,
  availableAssets,
  isAnyModalOpen = false,
}) => {
  const [barcodeInput, setBarcodeInput] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isModalActive = isAssetModalOpen || isAnyModalOpen;

  // Reliable focus handler that prevents scroll jumping
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

  // Global listeners: clicks on fullscreen, sync, header buttons, or background restore focus to input
  useEffect(() => {
    const handleGlobalInteraction = (e: Event) => {
      if (isModalActive) return;

      const target = e.target as HTMLElement | null;

      // If user clicked inside an active modal, ignore
      if (target?.closest('.modal-box')) return;

      // If user clicked the button that opens the asset modal, allow modal to open
      if (target?.closest('.btn-select-asset')) return;

      // If user clicked the Settings button, allow Settings modal to open
      if (target?.closest('button[title*="Settings"]')) return;

      // For any other button (fullscreen, sync, status pill) or background tap:
      // Allow button click to execute, but immediately return focus to the scan input!
      setTimeout(focusInput, 50);
      setTimeout(focusInput, 150);
    };

    const handleWindowFocus = () => {
      if (!isModalActive) {
        focusInput();
      }
    };

    const handleFullscreenChange = () => {
      setTimeout(focusInput, 80);
      setTimeout(focusInput, 200);
    };

    window.addEventListener('pointerup', handleGlobalInteraction);
    window.addEventListener('click', handleGlobalInteraction);
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      window.removeEventListener('pointerup', handleGlobalInteraction);
      window.removeEventListener('click', handleGlobalInteraction);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, [isModalActive, focusInput]);

  // Keep-alive focus heartbeat: ensures barcode text box never stays unfocused on MAIN SCREEN
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

  const EQUIPMENT_ID_REGEX = /^TTD[-_][A-Z0-9]{3}[-_]\d{4}$/i;

  const checkAndSelectAsset = (value: string) => {
    const trimmed = value.trim().toUpperCase();
    if (EQUIPMENT_ID_REGEX.test(trimmed)) {
      setErrorMessage(null);
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

  const handleBlur = () => {
    setTimeout(() => {
      if (!isModalActive) {
        focusInput();
      }
    }, 60);
  };

  const handleOpenModal = () => {
    setIsAssetModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsAssetModalOpen(false);
    setTimeout(focusInput, 80);
  };

  const handleSelectAsset = (equipmentId: string) => {
    setIsAssetModalOpen(false);
    onAssetSelected(equipmentId);
  };

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
          onBlur={handleBlur}
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

      {/* Modal Dialog with all assets listed - no input box, no keyboard */}
      {isAssetModalOpen && (
        <div className="modal-backdrop" onClick={handleCloseModal}>
          <div className="modal-box asset-picker-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-simple">
              <h3 className="modal-title">Select Asset</h3>
              <span className="picker-asset-count">{availableAssets.length} assets</span>
            </div>

            {/* Clean, concise asset list */}
            <div className="asset-picker-list">
              {availableAssets.length === 0 ? (
                <div className="empty-picker-notice">No assets available</div>
              ) : (
                availableAssets.map((asset) => (
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

export { ScannerView as ScanView };
export type { ScannerViewProps as ScanViewProps };
