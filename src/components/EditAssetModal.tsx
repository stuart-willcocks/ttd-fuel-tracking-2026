import React, { useState } from 'react';
import type { Equipment } from '../types';

interface EditAssetModalProps {
  asset: Equipment;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: Equipment) => void;
}

export const EditAssetModal: React.FC<EditAssetModalProps> = ({
  asset,
  isOpen,
  onClose,
  onSave,
}) => {
  const [area, setArea] = useState(asset.area);
  const [location, setLocation] = useState(asset.location);
  const [what3words, setWhat3words] = useState(asset.what3words);
  const [serial, setSerial] = useState(asset.rentalSerialNumber);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...asset,
      area: area.trim(),
      location: location.trim(),
      what3words: what3words.trim().startsWith('///') ? what3words.trim() : `///${what3words.trim()}`,
      rentalSerialNumber: serial.trim(),
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-box">
        <h3 className="modal-title">Edit Equipment Details</h3>
        <p className="modal-subtitle">{asset.equipmentId} ({asset.type})</p>

        <form onSubmit={handleSave} className="edit-form">
          <div className="form-field">
            <label>Area / Zone</label>
            <input
              type="text"
              className="text-input"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              required
            />
          </div>

          <div className="form-field">
            <label>Specific Location</label>
            <input
              type="text"
              className="text-input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              required
            />
          </div>

          <div className="form-field">
            <label>what3words Address</label>
            <input
              type="text"
              className="text-input"
              placeholder="///filled.count.soap"
              value={what3words}
              onChange={(e) => setWhat3words(e.target.value)}
              required
            />
          </div>

          <div className="form-field">
            <label>Rental Serial Number</label>
            <input
              type="text"
              className="text-input"
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              required
            />
          </div>

          <div className="modal-buttons-row">
            <button type="button" className="btn-modal-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-modal-confirm">
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
