import React, { useState } from 'react';
import { X, Plus, Sparkles, MapPin, Check, Zap } from 'lucide-react';
import type { Equipment, AssetType } from '../../types';

interface AssetFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (asset: Equipment) => Promise<void>;
  initialAsset?: Equipment | null;
  existingAssets: Equipment[];
}

const COMMON_AREAS = [
  'North Zone',
  'Main Arena',
  'Logistics Hub',
  'South Gate',
  'West Gate',
  'East Camp',
  'Production Village',
];

const GEN_CAPACITIES = [60, 100, 150, 200, 250, 500, 1000];
const TANK_CAPACITIES = [1000, 2000, 2500, 3000, 4500, 5000, 10000];

export const AssetFormModal: React.FC<AssetFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialAsset,
  existingAssets,
}) => {
  const isEditMode = Boolean(initialAsset);

  // Auto-suggest next sequential Equipment ID based on latest fleet
  const suggestNextId = (preferredPrefix = 'TTD-MAT-') => {
    let maxNum = 0;
    for (const eq of existingAssets) {
      if (eq.equipmentId.startsWith(preferredPrefix)) {
        const numPart = parseInt(eq.equipmentId.replace(preferredPrefix, ''), 10);
        if (!isNaN(numPart) && numPart > maxNum) {
          maxNum = numPart;
        }
      }
    }
    const nextNum = maxNum + 1;
    const formattedNum = String(nextNum).padStart(4, '0');
    return `${preferredPrefix}${formattedNum}`;
  };

  // Form input states initialized once on mount
  const [equipmentId, setEquipmentId] = useState<string>(() => {
    return initialAsset?.equipmentId || suggestNextId();
  });

  const [type, setType] = useState<AssetType>(() => {
    return initialAsset?.type || 'GENERATOR';
  });

  const [capacity, setCapacity] = useState<string>(() => {
    if (initialAsset) {
      return initialAsset.capacity !== undefined ? String(initialAsset.capacity) : '';
    }
    return '100';
  });

  const [area, setArea] = useState<string>(() => {
    return initialAsset?.area || 'North Zone';
  });

  const [location, setLocation] = useState<string>(() => {
    return initialAsset?.location || '';
  });

  const [what3words, setWhat3words] = useState<string>(() => {
    return initialAsset?.what3words || '///field.power.setup';
  });

  const [rentalSerialNumber, setRentalSerialNumber] = useState<string>(() => {
    if (initialAsset) return initialAsset.rentalSerialNumber || '';
    return `RSN-${Math.floor(10000 + Math.random() * 90000)}`;
  });

  const [isPoweredUp, setIsPoweredUp] = useState<boolean>(() => {
    return Boolean(initialAsset?.poweredUpTimestamp && !initialAsset?.poweredDownTimestamp);
  });

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanId = equipmentId.trim().toUpperCase();
    if (!cleanId) {
      setErrorMsg('Equipment ID is required.');
      return;
    }

    if (!isEditMode && existingAssets.some((a) => a.equipmentId.toUpperCase() === cleanId)) {
      setErrorMsg(`An asset with Equipment ID "${cleanId}" already exists.`);
      return;
    }

    let w3w = what3words.trim();
    if (w3w && !w3w.startsWith('///')) {
      w3w = `///${w3w}`;
    }

    const parsedCap = type === 'PLANT' ? undefined : capacity ? parseInt(capacity, 10) : undefined;

    const nowIso = new Date().toISOString().replace('T', ' ').substring(0, 19);

    const updatedEquipment: Equipment = {
      equipmentId: cleanId,
      type,
      capacity: parsedCap,
      area: area.trim() || 'Site Area',
      location: location.trim() || 'Field Station',
      what3words: w3w || '///field.power.setup',
      rentalSerialNumber: rentalSerialNumber.trim() || 'RSN-UNKNOWN',
      poweredUpTimestamp:
        type === 'GENERATOR'
          ? isPoweredUp
            ? initialAsset?.poweredUpTimestamp || nowIso
            : undefined
          : undefined,
      poweredDownTimestamp:
        type === 'GENERATOR' && !isPoweredUp && initialAsset?.poweredUpTimestamp
          ? nowIso
          : undefined,
      updatedAt: new Date().toISOString(),
    };

    setIsSubmitting(true);
    try {
      await onSave(updatedEquipment);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Failed to save asset: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div className="admin-modal-panel" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '22px' }}>
          <div>
            <h2 className="admin-card-title" style={{ fontSize: '1.35rem' }}>
              {isEditMode ? 'Edit Fleet Asset' : 'Register New Fleet Asset'}
            </h2>
            <p style={{ fontSize: '0.84rem', color: 'var(--adm-text-secondary)' }}>
              {isEditMode
                ? `Update equipment details and telemetry for ${initialAsset?.equipmentId}`
                : 'Add a generator, tank, or plant to the master tracking database'}
            </p>
          </div>
          <button onClick={onClose} className="admin-btn admin-btn-outline admin-btn-sm" style={{ padding: '6px' }}>
            <X size={18} />
          </button>
        </div>

        {errorMsg && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              color: '#fca5a5',
              fontSize: '0.88rem',
              marginBottom: '20px',
            }}
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Equipment ID & Type Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
            <div className="admin-input-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="admin-label">Equipment ID *</label>
                {!isEditMode && (
                  <button
                    type="button"
                    onClick={() => setEquipmentId(suggestNextId())}
                    className="admin-btn admin-btn-outline admin-btn-sm"
                    style={{ fontSize: '0.72rem', padding: '2px 8px', gap: '4px' }}
                  >
                    <Sparkles size={12} color="#f59e0b" />
                    <span>Next ID</span>
                  </button>
                )}
              </div>
              <input
                type="text"
                className="admin-input admin-mono"
                value={equipmentId}
                onChange={(e) => setEquipmentId(e.target.value.toUpperCase())}
                placeholder="TTD-MAT-0001"
                disabled={isEditMode}
                required
              />
              <span style={{ fontSize: '0.74rem', color: 'var(--adm-text-muted)' }}>
                Printed on scannable QR label (format: TTD-vvv-nnnn)
              </span>
            </div>

            <div className="admin-input-group">
              <label className="admin-label">Asset Classification *</label>
              <select
                className="admin-select"
                value={type}
                onChange={(e) => {
                  const newType = e.target.value as AssetType;
                  setType(newType);
                  if (newType === 'GENERATOR' && !capacity) setCapacity('100');
                  if (newType === 'TANK' && !capacity) setCapacity('3000');
                }}
              >
                <option value="GENERATOR">⚡ Generator (kVA)</option>
                <option value="TANK">🛢️ Bulk Fuel Tank (Litres)</option>
                <option value="PLANT">🚜 Plant Machinery</option>
              </select>
            </div>
          </div>

          {/* Capacity rating */}
          {type !== 'PLANT' ? (
            <div className="admin-input-group">
              <label className="admin-label">
                {type === 'GENERATOR' ? 'Power Capacity (kVA) *' : 'Fuel Storage Capacity (Litres) *'}
              </label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="number"
                  min="1"
                  className="admin-input admin-mono"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  placeholder={type === 'GENERATOR' ? 'e.g. 100' : 'e.g. 3000'}
                  required
                />
                <span
                  style={{
                    padding: '10px 14px',
                    background: 'var(--adm-surface-2)',
                    borderRadius: '8px',
                    fontFamily: 'var(--adm-font-mono)',
                    fontSize: '0.85rem',
                    color: 'var(--adm-text-secondary)',
                    border: '1px solid var(--adm-border-subtle)',
                  }}
                >
                  {type === 'GENERATOR' ? 'kVA' : 'Litres'}
                </span>
              </div>

              {/* Quick Select capacity chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                {(type === 'GENERATOR' ? GEN_CAPACITIES : TANK_CAPACITIES).map((cap) => (
                  <button
                    key={cap}
                    type="button"
                    onClick={() => setCapacity(String(cap))}
                    className="admin-btn admin-btn-outline admin-btn-sm"
                    style={{
                      padding: '3px 8px',
                      fontSize: '0.74rem',
                      background: capacity === String(cap) ? 'rgba(245, 158, 11, 0.2)' : undefined,
                      borderColor: capacity === String(cap) ? 'var(--adm-accent-amber)' : undefined,
                      color: capacity === String(cap) ? '#fbbf24' : undefined,
                    }}
                  >
                    {cap} {type === 'GENERATOR' ? 'kVA' : 'L'}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: '12px 16px',
                background: 'var(--adm-surface-2)',
                borderRadius: '8px',
                marginBottom: '18px',
                border: '1px solid var(--adm-border-subtle)',
                fontSize: '0.84rem',
                color: 'var(--adm-text-secondary)',
              }}
            >
              ℹ️ Plant machinery (e.g. Telehandlers, Tower Lights) does not use a fixed capacity rating.
            </div>
          )}

          {/* Area & Location */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="admin-input-group">
              <label className="admin-label">Zone / Area *</label>
              <input
                type="text"
                className="admin-input"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="e.g. North Zone"
                required
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                {COMMON_AREAS.slice(0, 4).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setArea(a)}
                    className="admin-btn admin-btn-outline admin-btn-sm"
                    style={{ padding: '2px 7px', fontSize: '0.7rem' }}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            <div className="admin-input-group">
              <label className="admin-label">Specific Location Description *</label>
              <input
                type="text"
                className="admin-input"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Stage Alpha Power Compound"
                required
              />
            </div>
          </div>

          {/* What3Words & Serial Number */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="admin-input-group">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <label className="admin-label">What3Words Reference *</label>
                {what3words && (
                  <a
                    href={`https://what3words.com/${what3words.replace(/^\/\/\//, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: '0.72rem', color: '#06b6d4', textDecoration: 'none' }}
                  >
                    View Map ↗
                  </a>
                )}
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  className="admin-input admin-mono"
                  value={what3words}
                  onChange={(e) => setWhat3words(e.target.value)}
                  placeholder="///puzzle.stages.daring"
                  style={{ paddingLeft: '32px' }}
                  required
                />
                <MapPin
                  size={15}
                  style={{
                    position: 'absolute',
                    left: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#ef4444',
                  }}
                />
              </div>
            </div>

            <div className="admin-input-group">
              <label className="admin-label">Rental Serial Number *</label>
              <input
                type="text"
                className="admin-input admin-mono"
                value={rentalSerialNumber}
                onChange={(e) => setRentalSerialNumber(e.target.value.toUpperCase())}
                placeholder="RSN-40291"
                required
              />
            </div>
          </div>

          {/* Generator Power Status Switch */}
          {type === 'GENERATOR' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px',
                background: 'var(--adm-surface-2)',
                borderRadius: 'var(--adm-radius-md)',
                border: '1px solid var(--adm-border-subtle)',
                marginBottom: '24px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: isPoweredUp ? 'rgba(16, 185, 129, 0.2)' : 'rgba(100, 116, 139, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: isPoweredUp ? '#10b981' : '#94a3b8',
                  }}
                >
                  <Zap size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#ffffff' }}>
                    Generator Power Status
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--adm-text-secondary)' }}>
                    {isPoweredUp ? 'Online & Energized (Running)' : 'Standby (Offline)'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsPoweredUp(!isPoweredUp)}
                className={`admin-btn ${isPoweredUp ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                style={{ fontSize: '0.82rem', padding: '6px 14px' }}
              >
                {isPoweredUp ? 'Running' : 'Standby'}
              </button>
            </div>
          )}

          {/* Form Actions */}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end',
              paddingTop: '20px',
              borderTop: '1px solid var(--adm-border-subtle)',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              className="admin-btn admin-btn-outline"
              disabled={isSubmitting}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="admin-btn admin-btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span>Saving Asset...</span>
              ) : (
                <>
                  {isEditMode ? <Check size={16} /> : <Plus size={16} />}
                  <span>{isEditMode ? 'Update Asset' : 'Save New Asset'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
