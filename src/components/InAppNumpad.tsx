import React from 'react';
import { Delete, ArrowRight, Check } from 'lucide-react';

export interface InAppNumpadProps {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onNext?: () => void;
  nextLabel?: string;
  isLastField?: boolean;
  quickButtons?: Array<{ label: string; value: string | number; isDelta?: boolean }>;
  onQuickSelect?: (item: { label: string; value: string | number; isDelta?: boolean }) => void;
}

export const InAppNumpad: React.FC<InAppNumpadProps> = ({
  onDigit,
  onBackspace,
  onClear,
  onNext,
  nextLabel = 'Next',
  isLastField = false,
  quickButtons,
  onQuickSelect,
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

  const handleNext = () => {
    triggerHaptic();
    if (onNext) onNext();
  };

  return (
    <div className="inapp-numpad-container">
      {/* Quick Values / Shortcuts Row (e.g. 25%, 50%, 75%, 100% or +50L, +100L) */}
      {quickButtons && quickButtons.length > 0 && (
        <div
          className="inapp-numpad-quick-row"
          style={{
            gridTemplateColumns: onNext
              ? `repeat(${quickButtons.length + 1}, 1fr)`
              : `repeat(${quickButtons.length}, 1fr)`,
          }}
        >
          {quickButtons.map((qb, idx) => (
            <button
              key={idx}
              type="button"
              className="inapp-quick-btn"
              onClick={() => {
                triggerHaptic();
                onQuickSelect?.(qb);
              }}
            >
              {qb.label}
            </button>
          ))}
          {onNext && (
            <button
              type="button"
              className="inapp-quick-btn inapp-quick-next"
              onClick={handleNext}
              title={isLastField ? 'Done' : 'Next field'}
            >
              <span>{isLastField ? 'Done' : nextLabel}</span>
              {isLastField ? <Check size={14} /> : <ArrowRight size={14} />}
            </button>
          )}
        </div>
      )}

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
