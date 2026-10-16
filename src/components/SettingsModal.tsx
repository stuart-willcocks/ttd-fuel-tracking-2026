import React, { useState } from 'react';
import { X, Check, Copy, RefreshCw } from 'lucide-react';
import {
  getSupabaseConfig,
  saveSupabaseConfig,
  isSupabaseConfigured,
  SUPABASE_SQL_SCHEMA,
} from '../services/supabase';
import { APP_VERSION, BUILD_NUMBER, BUILD_TIME } from '../version';

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
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [showSql, setShowSql] = useState(false);

  if (!isOpen) return null;

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

  return (
    <div className="modal-backdrop">
      <div className="modal-box">
        <div className="modal-header-simple">
          <h3 className="modal-title">Settings & Sync</h3>
          <button className="btn-close" onClick={onClose}>
            <X size={18} />
          </button>
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

          <div className="mt-2">
            <button
              className="btn-link"
              onClick={() => setShowSql(!showSql)}
            >
              {showSql ? 'Hide PostgreSQL Schema' : 'View PostgreSQL Schema'}
            </button>
            {showSql && (
              <div className="sql-box">
                <div className="sql-box-header">
                  <span>Supabase Schema</span>
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
          <div className="settings-version-label">TTD Fuel Tracking • v{APP_VERSION} (build #{BUILD_NUMBER})</div>
          <div className="settings-version-sub">OTA Release Date: {BUILD_TIME}</div>
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
