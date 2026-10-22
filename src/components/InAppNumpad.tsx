import React from 'react';
import { Delete } from 'lucide-react';

export interface InAppNumpadProps {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onClear: () => void;
}

export const InAppNumpad: React.FC<InAppNumpadProps> = ({
  onDigit,
  onBackspace,
  onClear,
}) => {
  const triggerHaptic = () => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate?.(15);
    }
  };

  const handleDigit = (d: string) => {
    triggerHaptic();
    onDigit(d);
  };

  const handleBackspace = () => {
    triggerHaptic();
    onBackspace();
  };

  const handleClear = () => {
    triggerHaptic();
    onClear();
  };

  return (
    <div className="inapp-numpad-container">
      {/* Main 3x4 Industrial Touch Numpad */}
      <div className="inapp-numpad-grid">
        <button type="button" className="inapp-num-key" onClick={() => handleDigit('1')}>
          1
        </button>
        <button type="button" className="inapp-num-key" onClick={() => handleDigit('2')}>
          2
        </button>
        <button type="button" className="inapp-num-key" onClick={() => handleDigit('3')}>
          3
        </button>

        <button type="button" className="inapp-num-key" onClick={() => handleDigit('4')}>
          4
        </button>
        <button type="button" className="inapp-num-key" onClick={() => handleDigit('5')}>
          5
        </button>
        <button type="button" className="inapp-num-key" onClick={() => handleDigit('6')}>
          6
        </button>

        <button type="button" className="inapp-num-key" onClick={() => handleDigit('7')}>
          7
        </button>
        <button type="button" className="inapp-num-key" onClick={() => handleDigit('8')}>
          8
        </button>
        <button type="button" className="inapp-num-key" onClick={() => handleDigit('9')}>
          9
        </button>

        <button
          type="button"
          className="inapp-num-key action-clear"
          onClick={handleClear}
          title="Clear field"
        >
          C
        </button>
        <button type="button" className="inapp-num-key" onClick={() => handleDigit('0')}>
          0
        </button>
        <button
          type="button"
          className="inapp-num-key action-backspace"
          onClick={handleBackspace}
          title="Backspace"
        >
          <Delete size={20} />
        </button>
      </div>
    </div>
  );
};
