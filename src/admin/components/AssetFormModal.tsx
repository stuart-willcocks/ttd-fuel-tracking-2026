import React, { useState, useMemo, useEffect } from 'react';
import { X, Plus, Sparkles, MapPin, Check, Zap, Trash2 } from 'lucide-react';
import type { Equipment, AssetType } from '../../types';
import { EquipmentTypeIcon } from '../../components/EquipmentTypeIcon';

interface AssetFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (asset: Equipment) => Promise<void>;
  initialAsset?: Equipment | null;
  existingAssets: Equipment[];
  onTogglePower?: (asset: Equipment) => void;
  onDelete?: (asset: Equipment) => void;
  isPowerOn?: boolean;
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
  onTogglePower,
  onDelete,
  isPowerOn = false,
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

  // Form input states
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

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Synchronize state when initialAsset changes or modal opens
  useEffect(() => {
    if (initialAsset) {
      setEquipmentId(initialAsset.equipmentId);
      setType(initialAsset.type);
      setCapacity(initialAsset.capacity !== undefined ? String(initialAsset.capacity) : '');
      setArea(initialAsset.area || 'North Zone');
      setLocation(initialAsset.location || '');
      setWhat3words(initialAsset.what3words || '///field.power.setup');
      setRentalSerialNumber(initialAsset.rentalSerialNumber || '');
    } else {
      setEquipmentId(suggestNextId());
      setType('GENERATOR');
      setCapacity('100');
      setArea('North Zone');
      setLocation('');
      setWhat3words('///field.power.setup');
      setRentalSerialNumber(`RSN-${Math.floor(10000 + Math.random() * 90000)}`);
    }
    setErrorMsg(null);
  }, [initialAsset, isOpen]);

  // Form dirty check: only true if any value differs from initialAsset
  const isDirty = useMemo(() => {
    if (!isEditMode || !initialAsset) return true;

    const parsedCap = type === 'PLANT' ? undefined : capacity ? parseInt(capacity, 10) : undefined;
    const initCap = initialAsset.capacity;
    const capMatches = (parsedCap === undefined && initCap === undefined) || parsedCap === initCap;

    const currentW3w = what3words.trim();
    const normW3w = currentW3w ? (currentW3w.startsWith('///') ? currentW3w : `///${currentW3w}`) : '';
    const initW3w = (initialAsset.what3words || '').trim();

    return (
      type !== initialAsset.type ||
      !capMatches ||
      area.trim() !== (initialAsset.area || '').trim() ||
      location.trim() !== (initialAsset.location || '').trim() ||
      normW3w !== initW3w ||
      rentalSerialNumber.trim().toUpperCase() !== (initialAsset.rentalSerialNumber || '').trim().toUpperCase()
    );
  }, [isEditMode, initialAsset, type, capacity, area, location, what3words, rentalSerialNumber]);

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

    const updatedEquipment: Equipment = {
      equipmentId: cleanId,
      type,
      capacity: parsedCap,
      area: area.trim() || 'Site Area',
      location: location.trim() || 'Field Station',
      what3words: w3w || '///field.power.setup',
      rentalSerialNumber: rentalSerialNumber.trim() || 'RSN-UNKNOWN',
      poweredUpTimestamp: initialAsset?.poweredUpTimestamp,
      poweredDownTimestamp: initialAsset?.poweredDownTimestamp,
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <h2 className="admin-card-title" style={{ fontSize: '1.35rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {isEditMode ? 'Edit Equipment' : 'Register new equipment ID'}
              {isEditMode && <EquipmentTypeIcon type={type} size={20} />}
            </h2>
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
              color: '#dc2626',
              fontSize: '0.88rem',
              marginBottom: '20px',
            }}
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Row 1: Equipment ID */}
          <div className="admin-input-group" style={{ marginBottom: '16px' }}>
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
          </div>

          {/* Row 2: Equipment type dropdown with capacity to the right (~20% width) */}
          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', marginBottom: '16px' }}>
            {/* Equipment Type Dropdown */}
            <div className="admin-input-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="admin-label">Equipment type *</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '38px',
                    height: '38px',
                    background: 'var(--adm-surface-2)',
                    borderRadius: '6px',
                    border: '1px solid var(--adm-border-subtle)',
                    flexShrink: 0,
                  }}
                >
                  <EquipmentTypeIcon type={type} size={20} />
                </div>
                <select
                  className="admin-select"
                  style={{ flex: 1 }}
                  value={type}
                  onChange={(e) => {
                    const newType = e.target.value as AssetType;
                    setType(newType);
                    if (newType === 'GENERATOR' && !capacity) setCapacity('100');
                    if (newType === 'TANK' && !capacity) setCapacity('3000');
                  }}
                >
                  <option value="GENERATOR">Generator</option>
                  <option value="TANK">Bulk Fuel Tank</option>
                  <option value="PLANT">Plant Machinery</option>
                </select>
              </div>
            </div>

            {/* Capacity Text Box (reduced width to ~20% of modal) */}
            <div className="admin-input-group" style={{ width: '110px', flexShrink: 0, marginBottom: 0 }}>
              <label className="admin-label">Capacity *</label>
              {type !== 'PLANT' ? (
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type="number"
                    min="1"
                    className="admin-input admin-mono"
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    placeholder={type === 'GENERATOR' ? '100' : '3000'}
                    style={{ paddingRight: type === 'GENERATOR' ? '36px' : '26px' }}
                    required
                  />
                  <span
                    style={{
                      position: 'absolute',
                      right: '8px',
                      fontSize: '0.72rem',
                      fontFamily: 'var(--adm-font-mono)',
                      fontWeight: 600,
                      color: 'var(--adm-text-muted)',
                      pointerEvents: 'none',
                    }}
                  >
                    {type === 'GENERATOR' ? 'kVA' : 'L'}
                  </span>
                </div>
              ) : (
                <input
                  type="text"
                  className="admin-input"
                  value="Unrated"
                  disabled
                  style={{ color: 'var(--adm-text-muted)', background: 'var(--adm-surface-2)', textAlign: 'center' }}
                />
              )}
            </div>
          </div>

          {/* Quick presets for Capacity */}
          {type !== 'PLANT' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--adm-text-muted)', alignSelf: 'center', marginRight: '4px' }}>
                Presets:
              </span>
              {(type === 'GENERATOR' ? GEN_CAPACITIES : TANK_CAPACITIES).map((cap) => (
                <button
                  key={cap}
                  type="button"
                  onClick={() => setCapacity(String(cap))}
                  className="admin-btn admin-btn-outline admin-btn-sm"
                  style={{
                    padding: '2px 7px',
                    fontSize: '0.7rem',
                    background: capacity === String(cap) ? 'rgba(37, 99, 235, 0.15)' : undefined,
                    borderColor: capacity === String(cap) ? '#2563EB' : undefined,
                    color: capacity === String(cap) ? '#2563EB' : undefined,
                  }}
                >
                  {cap} {type === 'GENERATOR' ? 'kVA' : 'L'}
                </button>
              ))}
            </div>
          )}

          {/* Area & Location */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div className="admin-input-group" style={{ marginBottom: 0 }}>
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

            <div className="admin-input-group" style={{ marginBottom: 0 }}>
              <label className="admin-label">Location *</label>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <div className="admin-input-group" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <label className="admin-label">What3Words Reference *</label>
                {what3words && (
                  <a
                    href={`https://what3words.com/${what3words.replace(/^\/\/\//, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: '0.72rem', color: '#2563EB', textDecoration: 'none' }}
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

            <div className="admin-input-group" style={{ marginBottom: 0 }}>
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

          {/* Form Actions: Turn On/Off and Delete buttons in edit mode on left; Cancel and Update Asset on right */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: isEditMode ? 'space-between' : 'flex-end',
              paddingTop: '20px',
              borderTop: '1px solid var(--adm-border-subtle)',
            }}
          >
            {isEditMode && initialAsset && (
              <div style={{ display: 'flex', gap: '8px' }}>
                {initialAsset.type === 'GENERATOR' && onTogglePower && (
                  <button
                    type="button"
                    onClick={() => onTogglePower(initialAsset)}
                    className="admin-btn admin-btn-outline admin-btn-sm"
                    title={isPowerOn ? 'Turn Generator OFF' : 'Turn Generator ON'}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      color: isPowerOn ? '#DC2626' : '#16A34A',
                      borderColor: isPowerOn ? 'rgba(220, 38, 38, 0.4)' : 'rgba(22, 163, 74, 0.4)',
                      fontWeight: 600,
                    }}
                  >
                    <Zap size={14} />
                    <span>{isPowerOn ? 'Turn OFF' : 'Turn ON'}</span>
                  </button>
                )}

                {onDelete && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onDelete(initialAsset);
                    }}
                    className="admin-btn admin-btn-outline admin-btn-sm"
                    title="Decommission & Delete Equipment"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      color: '#DC2626',
                      borderColor: 'rgba(220, 38, 38, 0.4)',
                      fontWeight: 600,
                    }}
                  >
                    <Trash2 size={14} />
                    <span>Delete</span>
                  </button>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
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
                disabled={isSubmitting || (isEditMode && !isDirty)}
                style={{
                  opacity: isEditMode && !isDirty ? 0.45 : 1,
                  cursor: isEditMode && !isDirty ? 'not-allowed' : 'pointer',
                }}
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
          </div>
        </form>
      </div>
    </div>
  );
};
