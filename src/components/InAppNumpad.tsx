import React from 'react';
import { Delete } from 'lucide-react';

export interface InAppNumpadProps {
  disabled?: boolean;
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onClear: () => void;
}

export const InAppNumpad: React.FC<InAppNumpadProps> = ({
  disabled = false,
  onDigit,
  onBackspace,
  onClear,
}) => {
  const triggerHaptic = () => {
    if (disabled) return;
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate?.(15);
    }
  };

  const handleDigit = (d: string) => {
    if (disabled) return;
    triggerHaptic();
    onDigit(d);
  };

  const handleBackspace = () => {
    if (disabled) return;
    triggerHaptic();
    onBackspace();
  };

  const handleClear = () => {
    if (disabled) return;
    triggerHaptic();
    onClear();
  };

  return (
    <div className={`inapp-numpad-container ${disabled ? 'is-disabled' : ''}`}>
      {/* Main 3x4 Industrial Touch Numpad */}
      <div className="inapp-numpad-grid">
        <button
          type="button"
          disabled={disabled}
          className={`inapp-num-key ${disabled ? 'is-disabled' : ''}`}
          onClick={() => handleDigit('1')}
        >
          1
        </button>
        <button
          type="button"
          disabled={disabled}
          className={`inapp-num-key ${disabled ? 'is-disabled' : ''}`}
          onClick={() => handleDigit('2')}
        >
          2
        </button>
        <button
          type="button"
          disabled={disabled}
          className={`inapp-num-key ${disabled ? 'is-disabled' : ''}`}
          onClick={() => handleDigit('3')}
        >
          3
        </button>

        <button
          type="button"
          disabled={disabled}
          className={`inapp-num-key ${disabled ? 'is-disabled' : ''}`}
          onClick={() => handleDigit('4')}
        >
          4
        </button>
        <button
          type="button"
          disabled={disabled}
          className={`inapp-num-key ${disabled ? 'is-disabled' : ''}`}
          onClick={() => handleDigit('5')}
        >
          5
        </button>
        <button
          type="button"
          disabled={disabled}
          className={`inapp-num-key ${disabled ? 'is-disabled' : ''}`}
          onClick={() => handleDigit('6')}
        >
          6
        </button>

        <button
          type="button"
          disabled={disabled}
          className={`inapp-num-key ${disabled ? 'is-disabled' : ''}`}
          onClick={() => handleDigit('7')}
        >
          7
        </button>
        <button
          type="button"
          disabled={disabled}
          className={`inapp-num-key ${disabled ? 'is-disabled' : ''}`}
          onClick={() => handleDigit('8')}
        >
          8
        </button>
        <button
          type="button"
          disabled={disabled}
          className={`inapp-num-key ${disabled ? 'is-disabled' : ''}`}
          onClick={() => handleDigit('9')}
        >
          9
        </button>

        <button
          type="button"
          disabled={disabled}
          className={`inapp-num-key action-clear ${disabled ? 'is-disabled' : ''}`}
          onClick={handleClear}
          title="Clear field"
        >
          C
        </button>
        <button
          type="button"
          disabled={disabled}
          className={`inapp-num-key ${disabled ? 'is-disabled' : ''}`}
          onClick={() => handleDigit('0')}
        >
          0
        </button>
        <button
          type="button"
          disabled={disabled}
          className={`inapp-num-key action-backspace ${disabled ? 'is-disabled' : ''}`}
          onClick={handleBackspace}
          title="Backspace"
        >
          <Delete size={20} />
        </button>
      </div>
    </div>
  );
};
