import React, { useState } from 'react';
import { X, Cloud, Key, Copy, Check, Database, Sparkles } from 'lucide-react';
import {
  getSupabaseConfig,
  saveSupabaseConfig,
  isSupabaseConfigured,
  SUPABASE_SQL_SCHEMA,
} from '../services/supabase';

interface SupabaseConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved: () => void;
}

export const SupabaseConfigModal: React.FC<SupabaseConfigModalProps> = ({
  isOpen,
  onClose,
  onConfigSaved,
}) => {
  const currentConfig = getSupabaseConfig();
  const [url, setUrl] = useState(currentConfig.url);
  const [anonKey, setAnonKey] = useState(currentConfig.anonKey);
  const [copied, setCopied] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveSupabaseConfig(url.trim(), anonKey.trim());
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
    onConfigSaved();
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card wide-modal">
        <div className="modal-header">
          <div className="modal-icon-badge">
            <Cloud size={22} className="modal-alert-icon" />
          </div>
          <div className="modal-header-titles">
            <h3 className="modal-title">Supabase Cloud Backend</h3>
            <p className="modal-subtitle">
              PostgreSQL ACID Database • Replaces fragile Apps Script locks
            </p>
          </div>
          <button className="close-corner-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="supabase-modal-content">
          {/* Status info banner */}
          <div className={`backend-status-card ${isSupabaseConfigured() ? 'connected' : 'simulated'}`}>
            <Database size={20} />
            <div>
              <strong>
                {isSupabaseConfigured()
                  ? 'Connected to Live Supabase Instance'
                  : 'Operating in Standalone Simulated Cloud Mode'}
              </strong>
              <p>
                {isSupabaseConfigured()
                  ? 'All 5 Zebra PDAs sync directly to PostgreSQL without lock contention.'
                  : 'Prototype works 100% offline out-of-the-box. Enter your free Supabase URL & Key below whenever you are ready to link a live database.'}
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSave} className="config-form">
            <div className="field-block">
              <label className="field-label-row">
                <span>Supabase Project URL</span>
                <span className="field-hint">e.g. https://your-project.supabase.co</span>
              </label>
              <div className="field-input-wrap">
                <Cloud size={16} className="field-input-icon" />
                <input
                  type="text"
                  className="styled-input"
                  placeholder="https://xyzcompany.supabase.co"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
            </div>

            <div className="field-block">
              <label className="field-label-row">
                <span>Supabase Anon Public API Key</span>
                <span className="field-hint">From Supabase Settings &gt; API</span>
              </label>
              <div className="field-input-wrap">
                <Key size={16} className="field-input-icon" />
                <input
                  type="password"
                  className="styled-input"
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  value={anonKey}
                  onChange={(e) => setAnonKey(e.target.value)}
                />
              </div>
            </div>

            <div className="config-actions-bar">
              <button type="submit" className="save-config-btn">
                {savedSuccess ? (
                  <>
                    <Check size={16} />
                    <span>Configuration Saved!</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>Save Credentials</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* SQL Schema Copy Box */}
          <div className="schema-export-box">
            <div className="schema-header">
              <span className="schema-title">PostgreSQL Database Schema (Postgres 15+)</span>
              <button className="copy-sql-btn" onClick={handleCopySql}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                <span>{copied ? 'Copied to Clipboard!' : 'Copy SQL'}</span>
              </button>
            </div>
            <pre className="sql-code-block">{SUPABASE_SQL_SCHEMA}</pre>
          </div>
        </div>

        <div className="modal-actions-row">
          <button className="modal-btn-abort" onClick={onClose}>
            <span>Done</span>
          </button>
        </div>
      </div>
    </div>
  );
};
