import React, { useEffect } from 'react';
import { Check } from 'lucide-react';
import { IconCancel } from './icons/AppIcons';

export interface ActionConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  subMessage?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'green' | 'red' | 'blue';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ActionConfirmModal: React.FC<ActionConfirmModalProps> = ({
  isOpen,
  title,
  message,
  subMessage,
  confirmLabel = 'Yes',
  cancelLabel = 'No',
  confirmVariant = 'green',
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onConfirm();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onConfirm, onCancel]);

  if (!isOpen) return null;

  const getConfirmBtnClass = () => {
    if (confirmVariant === 'red') return 'btn-pda-red';
    if (confirmVariant === 'blue') return 'btn-pda-blue';
    return 'btn-pda-green';
  };

  return (
    <div className="modal-backdrop action-confirm-backdrop">
      <div
        className="modal-box action-confirm-box"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {title && <h3 className="action-confirm-title">{title}</h3>}
        <p className="action-confirm-message">{message}</p>
        {subMessage && <p className="action-confirm-submessage">{subMessage}</p>}

        <div className="action-confirm-btn-row">
          <button
            type="button"
            className={`btn-confirm-action ${getConfirmBtnClass()}`}
            onClick={onConfirm}
          >
            <Check size={18} />
            <span>{confirmLabel}</span>
          </button>
          <button
            type="button"
            className="btn-confirm-action btn-pda-slate"
            onClick={onCancel}
          >
            <IconCancel size={18} />
            <span>{cancelLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
