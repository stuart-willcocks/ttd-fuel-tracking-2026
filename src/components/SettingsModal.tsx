import React, { useState } from 'react';
import { X, Check, Copy, RefreshCw, Smartphone } from 'lucide-react';
import {
  getSupabaseConfig,
  saveSupabaseConfig,
  isSupabaseConfigured,
  SUPABASE_SQL_SCHEMA,
  SUPABASE_SQL_MIGRATION,
} from '../services/supabase';
import { getDeviceId, getDeviceName, setDeviceName } from '../services/device';
import { APP_VERSION, BUILD_TIME } from '../version';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResetData: () => void;
  onTriggerSync: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onResetData,
  onTriggerSync,
}) => {
  const currentConfig = getSupabaseConfig();
  const [url, setUrl] = useState(currentConfig.url);
  const [anonKey, setAnonKey] = useState(currentConfig.anonKey);
  const [copied, setCopied] = useState(false);
  const [copiedMigration, setCopiedMigration] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [showSql, setShowSql] = useState(false);

  // PDA Device Identification
  const [deviceName, setDeviceNameState] = useState(getDeviceName());
  const [deviceSaved, setDeviceSaved] = useState(false);
  const persistentId = getDeviceId();

  if (!isOpen) return null;

  const handleSaveDeviceName = (name: string) => {
    setDeviceNameState(name);
    setDeviceName(name);
    setDeviceSaved(true);
    setTimeout(() => setDeviceSaved(false), 2000);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveSupabaseConfig(url.trim(), anonKey.trim());
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyMigration = () => {
    navigator.clipboard.writeText(SUPABASE_SQL_MIGRATION);
    setCopiedMigration(true);
    setTimeout(() => setCopiedMigration(false), 2000);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-box">
        <div className="modal-header-simple">
          <h3 className="modal-title">Settings & Sync</h3>
          <button className="btn-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* PDA / Device Identification Section */}
        <div className="settings-section">
          <h4 className="settings-heading" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Smartphone size={15} />
            <span>PDA / Device Identifier</span>
          </h4>
          <p className="settings-desc">
            Each transaction executed on this device is tagged with this PDA identifier:
          </p>

          <div className="form-field">
            <label>PDA Label (e.g. PDA 1 - 5)</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                className="text-input"
                value={deviceName}
                onChange={(e) => handleSaveDeviceName(e.target.value)}
                placeholder="PDA 1"
                maxLength={20}
              />
              {deviceSaved && (
                <span style={{ display: 'flex', alignItems: 'center', color: '#4ade80', fontSize: '11px', fontWeight: 600 }}>
                  <Check size={14} /> Saved
                </span>
              )}
            </div>

            <div className="pda-presets-row">
              {['PDA 1', 'PDA 2', 'PDA 3', 'PDA 4', 'PDA 5'].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`btn-pda-preset ${deviceName === preset ? 'active' : ''}`}
                  onClick={() => handleSaveDeviceName(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>

            <div className="pda-hardware-note">
              Unique Installation ID: <strong>{persistentId}</strong>
              <br />
              <span style={{ fontSize: '10px', opacity: 0.8 }}>
                (Web security standards prevent browsers from reading physical SIM numbers or hardware IMEIs, so this persistent identifier reliably tracks each PDA.)
              </span>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <h4 className="settings-heading">Central Multi-Device Sync</h4>
          <p className="settings-desc">
            All Zebra PDAs and PCs on this network sync through the local shared API:
          </p>
          <div className="api-status-badge">
            <span className="dot-green"></span>
            <span>Central API: Active (/api/transactions)</span>
          </div>

          <button className="btn-secondary w-full mt-2" onClick={onTriggerSync}>
            <RefreshCw size={14} />
            <span>Force Immediate Two-Way Sync</span>
          </button>
        </div>

        <div className="settings-section">
          <h4 className="settings-heading">Optional Supabase Cloud</h4>
          <p className="settings-desc">
            {isSupabaseConfigured()
              ? 'Connected to remote Supabase instance.'
              : 'Using shared local server. Enter credentials below if linking external Supabase cloud.'}
          </p>

          <form onSubmit={handleSave} className="settings-form">
            <div className="form-field">
              <label>Supabase URL</label>
              <input
                type="text"
                className="text-input"
                placeholder="https://xyz.supabase.co"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label>Anon Public Key</label>
              <input
                type="password"
                className="text-input"
                placeholder="eyJhbGciOi..."
                value={anonKey}
                onChange={(e) => setAnonKey(e.target.value)}
              />
            </div>

            <button type="submit" className="btn-secondary">
              {savedSuccess ? 'Saved!' : 'Save Credentials'}
            </button>
          </form>

          <div className="migration-card mt-3">
            <div className="migration-card-header">
              <span className="migration-title">Enable Device ID in Cloud:</span>
              <button
                type="button"
                className="btn-copy-small"
                onClick={handleCopyMigration}
              >
                {copiedMigration ? <Check size={12} /> : <Copy size={12} />}
                <span>{copiedMigration ? 'Copied' : 'Copy Migration SQL'}</span>
              </button>
            </div>
            <p className="migration-desc">
              Run this 2-line SQL in your Supabase SQL Editor to add the <code>device_id</code> column:
            </p>
            <pre className="sql-snippet-box">{SUPABASE_SQL_MIGRATION}</pre>
          </div>

          <div className="mt-2">
            <button
              className="btn-link"
              onClick={() => setShowSql(!showSql)}
            >
              {showSql ? 'Hide Full PostgreSQL Schema' : 'View Full PostgreSQL Schema'}
            </button>
            {showSql && (
              <div className="sql-box">
                <div className="sql-box-header">
                  <span>Full Supabase Schema</span>
                  <button className="btn-copy-small" onClick={handleCopySql}>
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <pre className="sql-pre">{SUPABASE_SQL_SCHEMA}</pre>
              </div>
            )}
          </div>
        </div>

        <div className="settings-section">
          <h4 className="settings-heading">Fleet Data Reset</h4>
          <p className="settings-desc">Restore sample fleet equipment and transactions.</p>
          <button className="btn-danger-outline" onClick={onResetData}>
            Reset Data to Default
          </button>
        </div>

        <div className="settings-version-block">
          <div className="settings-version-label">TTD Fuel Tracking • Version {APP_VERSION}</div>
          <div className="settings-version-sub">Build Time: {BUILD_TIME}</div>
        </div>

        <div className="modal-buttons-row">
          <button className="btn-modal-cancel" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
