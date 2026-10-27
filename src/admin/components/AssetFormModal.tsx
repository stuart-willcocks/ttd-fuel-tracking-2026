import React, { useState, useMemo, useEffect, useRef } from 'react';
import { X, Plus, Sparkles, MapPin, Check, Zap, Trash2, ChevronDown } from 'lucide-react';
import type { Equipment, AssetType } from '../../types';

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

const stripW3wPrefix = (str: string): string => str.replace(/^\/{1,3}/, '');

interface ComboBoxProps {
  value: string;
  onChange: (val: string) => void;
  options: (string | number)[];
  placeholder?: string;
  disabled?: boolean;
  type?: 'text' | 'number';
  unit?: string;
  style?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
  min?: string | number;
  required?: boolean;
}

const ComboBox: React.FC<ComboBoxProps> = ({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  type = 'text',
  unit,
  style,
  inputStyle,
  min,
  required = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  const filteredOptions = useMemo(() => {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return options;
    const matching = options.filter((opt) => String(opt).toLowerCase().includes(trimmed));
    return matching.length > 0 ? matching : options;
  }, [options, value]);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', ...style }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          type={type}
          min={min}
          className="admin-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          onFocus={() => {
            if (!disabled && options.length > 0) setIsOpen(true);
          }}
          style={{
            width: '100%',
            height: '38px',
            paddingRight: unit ? '64px' : '34px',
            ...inputStyle,
          }}
        />

        {unit && (
          <span
            style={{
              position: 'absolute',
              right: '28px',
              fontSize: '0.72rem',
              fontFamily: 'var(--adm-font-mono)',
              fontWeight: 600,
              color: 'var(--adm-text-muted)',
              pointerEvents: 'none',
            }}
          >
            {unit}
          </span>
        )}

        {!disabled && options.length > 0 && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setIsOpen((prev) => !prev)}
            style={{
              position: 'absolute',
              right: '4px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--adm-text-secondary)',
            }}
            title="Select existing value from database"
          >
            <ChevronDown size={14} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
          </button>
        )}
      </div>

      {isOpen && !disabled && options.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 2px)',
            left: 0,
            right: 0,
            maxHeight: '180px',
            overflowY: 'auto',
            background: '#FFFFFF',
            border: '1px solid var(--adm-border-medium)',
            boxShadow: 'var(--adm-shadow-lg)',
            zIndex: 1000,
          }}
        >
          {filteredOptions.map((opt) => (
            <div
              key={String(opt)}
              onClick={() => {
                onChange(String(opt));
                setIsOpen(false);
              }}
              style={{
                padding: '8px 12px',
                fontSize: '0.84rem',
                cursor: 'pointer',
                background: String(opt) === value ? 'rgba(37, 99, 235, 0.08)' : 'transparent',
                color: String(opt) === value ? '#2563EB' : 'var(--adm-text-primary)',
                fontWeight: String(opt) === value ? 700 : 400,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--adm-surface-2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = String(opt) === value ? 'rgba(37, 99, 235, 0.08)' : 'transparent';
              }}
            >
              <span>{opt}</span>
              {unit && <span style={{ fontSize: '0.72rem', color: 'var(--adm-text-muted)' }}>{unit}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface FormState {
  equipmentId: string;
  type: AssetType;
  capacity: string;
  area: string;
  location: string;
  what3words: string;
  rentalSerialNumber: string;
}

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
  const isMouseDownOnBackdrop = useRef<boolean>(false);

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
  const [equipmentId, setEquipmentId] = useState<string>('');
  const [type, setType] = useState<AssetType>('GENERATOR');
  const [capacity, setCapacity] = useState<string>('100');
  const [area, setArea] = useState<string>('North Zone');
  const [location, setLocation] = useState<string>('');
  const [what3words, setWhat3words] = useState<string>('field.power.setup');
  const [rentalSerialNumber, setRentalSerialNumber] = useState<string>('');

  const [initialFormState, setInitialFormState] = useState<FormState | null>(null);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Database options for Capacity combo box based on current equipment type
  const capacityOptions = useMemo(() => {
    if (type === 'PLANT') return [];
    const dbCapacities = existingAssets
      .filter((a) => a.type === type && typeof a.capacity === 'number' && a.capacity > 0)
      .map((a) => a.capacity as number);

    const defaultCaps = type === 'GENERATOR' ? GEN_CAPACITIES : TANK_CAPACITIES;
    const combined = Array.from(new Set([...dbCapacities, ...defaultCaps]));
    return combined.sort((a, b) => a - b);
  }, [existingAssets, type]);

  // Database options for Zone/area combo box
  const areaOptions = useMemo(() => {
    const dbAreas = existingAssets
      .map((a) => a.area?.trim())
      .filter((a): a is string => Boolean(a));
    const combined = Array.from(new Set([...dbAreas, ...COMMON_AREAS]));
    return combined.sort((a, b) => a.localeCompare(b));
  }, [existingAssets]);

  // Synchronize state when initialAsset changes or modal opens
  useEffect(() => {
    let initId = '';
    let initType: AssetType = 'GENERATOR';
    let initCap = '100';
    let initArea = 'North Zone';
    let initLoc = '';
    let initW3w = 'field.power.setup';
    let initRsn = '';

    if (initialAsset) {
      initId = initialAsset.equipmentId;
      initType = initialAsset.type;
      initCap = initialAsset.capacity !== undefined ? String(initialAsset.capacity) : '';
      initArea = initialAsset.area || 'North Zone';
      initLoc = initialAsset.location || '';
      initW3w = stripW3wPrefix(initialAsset.what3words || 'field.power.setup');
      initRsn = initialAsset.rentalSerialNumber || '';
    } else {
      initId = suggestNextId();
      initType = 'GENERATOR';
      initCap = '100';
      initArea = 'North Zone';
      initLoc = '';
      initW3w = 'field.power.setup';
      initRsn = `RSN-${Math.floor(10000 + Math.random() * 90000)}`;
    }

    setEquipmentId(initId);
    setType(initType);
    setCapacity(initCap);
    setArea(initArea);
    setLocation(initLoc);
    setWhat3words(initW3w);
    setRentalSerialNumber(initRsn);

    setInitialFormState({
      equipmentId: initId,
      type: initType,
      capacity: initCap,
      area: initArea,
      location: initLoc,
      what3words: initW3w,
      rentalSerialNumber: initRsn,
    });

    setErrorMsg(null);
  }, [initialAsset, isOpen]);

  // Form dirty check: true if any field differs from the initial form state
  const isDirty = useMemo(() => {
    if (!initialFormState) return false;

    const normCap = (t: AssetType, c: string) => (t === 'PLANT' ? '' : c.trim());
    const normW3w = (w: string) => stripW3wPrefix(w.trim());

    return (
      equipmentId.trim().toUpperCase() !== initialFormState.equipmentId.trim().toUpperCase() ||
      type !== initialFormState.type ||
      normCap(type, capacity) !== normCap(initialFormState.type, initialFormState.capacity) ||
      area.trim() !== initialFormState.area.trim() ||
      location.trim() !== initialFormState.location.trim() ||
      normW3w(what3words) !== normW3w(initialFormState.what3words) ||
      rentalSerialNumber.trim().toUpperCase() !== initialFormState.rentalSerialNumber.trim().toUpperCase()
    );
  }, [initialFormState, equipmentId, type, capacity, area, location, what3words, rentalSerialNumber]);

  // Mandatory fields validation
  const isValid = useMemo(() => {
    const cleanId = equipmentId.trim().toUpperCase();
    if (!cleanId) return false;
    if (!isEditMode && existingAssets.some((a) => a.equipmentId.toUpperCase() === cleanId)) {
      return false;
    }
    if (!type) return false;
    if (type !== 'PLANT') {
      const capNum = parseInt(capacity, 10);
      if (isNaN(capNum) || capNum <= 0) return false;
    }
    if (!area.trim()) return false;
    if (!location.trim()) return false;
    if (!stripW3wPrefix(what3words.trim())) return false;
    if (!rentalSerialNumber.trim()) return false;
    return true;
  }, [equipmentId, isEditMode, existingAssets, type, capacity, area, location, what3words, rentalSerialNumber]);

  const canSubmit = isDirty && isValid && !isSubmitting;

  if (!isOpen) return null;

  const handleBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    isMouseDownOnBackdrop.current = e.target === e.currentTarget;
  };

  const handleBackdropMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (isMouseDownOnBackdrop.current && e.target === e.currentTarget) {
      onClose();
    }
    isMouseDownOnBackdrop.current = false;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
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

    const cleanW3w = stripW3wPrefix(what3words.trim());
    const finalW3w = cleanW3w ? `///${cleanW3w}` : '///field.power.setup';

    const parsedCap = type === 'PLANT' ? undefined : capacity ? parseInt(capacity, 10) : undefined;

    const updatedEquipment: Equipment = {
      equipmentId: cleanId,
      type,
      capacity: parsedCap,
      area: area.trim() || 'Site Area',
      location: location.trim() || 'Field Station',
      what3words: finalW3w,
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
    <div
      className="admin-modal-backdrop"
      onMouseDown={handleBackdropMouseDown}
      onMouseUp={handleBackdropMouseUp}
    >
      <div
        className="admin-modal-panel"
        onMouseDown={(e) => {
          e.stopPropagation();
          isMouseDownOnBackdrop.current = false;
        }}
        onClick={(e) => e.stopPropagation()}
        style={{ minHeight: '520px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <h2 className="admin-card-title" style={{ fontSize: '1.35rem' }}>
              {isEditMode ? 'Edit Equipment' : 'Register new equipment ID'}
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
          {/* Row 1: Equipment ID (25% width) */}
          <div className="admin-input-group" style={{ marginBottom: '16px' }}>
            <label className="admin-label">Equipment ID *</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="text"
                className="admin-input admin-mono"
                value={equipmentId}
                onChange={(e) => setEquipmentId(e.target.value.toUpperCase())}
                placeholder="TTD-MAT-0001"
                disabled={isEditMode}
                style={{ width: '25%', minWidth: '130px', height: '38px' }}
                required
              />
              {!isEditMode && (
                <button
                  type="button"
                  onClick={() => setEquipmentId(suggestNextId())}
                  className="admin-btn admin-btn-outline admin-btn-sm"
                  style={{ fontSize: '0.74rem', padding: '6px 10px', gap: '4px', height: '38px' }}
                >
                  <Sparkles size={12} color="#f59e0b" />
                  <span>Next ID</span>
                </button>
              )}
            </div>
          </div>

          {/* Row 2: Equipment type dropdown (1/3 of current width) with capacity combo box to the right */}
          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', marginBottom: '16px' }}>
            {/* Equipment Type Dropdown (1/3 width) */}
            <div className="admin-input-group" style={{ width: '140px', flexShrink: 0, marginBottom: 0 }}>
              <label className="admin-label">Equipment type *</label>
              <select
                className="admin-select"
                style={{ width: '100%', height: '38px' }}
                value={type}
                onChange={(e) => {
                  const newType = e.target.value as AssetType;
                  setType(newType);
                  if (newType === 'GENERATOR' && !capacity) setCapacity('100');
                  if (newType === 'TANK' && !capacity) setCapacity('3000');
                }}
              >
                <option value="GENERATOR">Generator</option>
                <option value="TANK">Tank</option>
                <option value="PLANT">Plant</option>
              </select>
            </div>

            {/* Capacity Combo Box (Select from DB or create new) */}
            <div className="admin-input-group" style={{ width: '130px', flexShrink: 0, marginBottom: 0 }}>
              <label className="admin-label">Capacity *</label>
              {type !== 'PLANT' ? (
                <ComboBox
                  type="number"
                  min="1"
                  value={capacity}
                  onChange={(val) => setCapacity(val)}
                  options={capacityOptions}
                  placeholder={type === 'GENERATOR' ? '100' : '3000'}
                  unit={type === 'GENERATOR' ? 'kVA' : 'L'}
                  required
                />
              ) : (
                <input
                  type="text"
                  className="admin-input"
                  value="Unrated"
                  disabled
                  style={{
                    color: 'var(--adm-text-muted)',
                    background: 'var(--adm-surface-2)',
                    textAlign: 'center',
                    height: '38px',
                  }}
                />
              )}
            </div>
          </div>

          {/* Row 3: Zone/area combo box on its own line, 90% width (Select from DB or create new) */}
          <div className="admin-input-group" style={{ marginBottom: '16px' }}>
            <label className="admin-label">Zone/area *</label>
            <ComboBox
              type="text"
              value={area}
              onChange={(val) => setArea(val)}
              options={areaOptions}
              placeholder="e.g. North Zone"
              style={{ width: '90%' }}
              required
            />
          </div>

          {/* Row 4: Location on its own line, 90% width */}
          <div className="admin-input-group" style={{ marginBottom: '16px' }}>
            <label className="admin-label">Location *</label>
            <input
              type="text"
              className="admin-input"
              style={{ width: '90%', height: '38px' }}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Stage Alpha Power Compound"
              required
            />
          </div>

          {/* Row 5: What3Words on its own line, 90% width, no prefix /// characters */}
          <div className="admin-input-group" style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '90%' }}>
              <label className="admin-label">What3Words Reference *</label>
              {what3words && (
                <a
                  href={`https://what3words.com/${stripW3wPrefix(what3words)}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: '0.72rem', color: '#2563EB', textDecoration: 'none' }}
                >
                  View Map ↗
                </a>
              )}
            </div>
            <div style={{ position: 'relative', width: '90%' }}>
              <input
                type="text"
                className="admin-input admin-mono"
                value={what3words}
                onChange={(e) => setWhat3words(stripW3wPrefix(e.target.value))}
                placeholder="puzzle.stages.daring"
                style={{ paddingLeft: '32px', width: '100%', height: '38px' }}
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

          {/* Row 6: Rental Serial Number on its own line, 90% width */}
          <div className="admin-input-group" style={{ marginBottom: '20px' }}>
            <label className="admin-label">Rental Serial Number *</label>
            <input
              type="text"
              className="admin-input admin-mono"
              style={{ width: '90%', height: '38px' }}
              value={rentalSerialNumber}
              onChange={(e) => setRentalSerialNumber(e.target.value.toUpperCase())}
              placeholder="RSN-40291"
              required
            />
          </div>

          {/* Form Actions: Turn On/Off and Delete buttons in edit mode on left; Cancel and Update Asset on right */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: isEditMode && (onTogglePower || onDelete) ? 'space-between' : 'flex-end',
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
                disabled={!canSubmit}
                style={{
                  opacity: canSubmit ? 1 : 0.45,
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                }}
              >
                {isSubmitting ? (
                  <span>Saving Asset...</span>
                ) : (
                  <>
                    {isEditMode ? <Check size={16} /> : <Plus size={16} />}
                    <span>{isEditMode ? 'Update Asset' : 'Save new asset'}</span>
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

