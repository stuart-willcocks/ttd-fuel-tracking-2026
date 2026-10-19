import React, { useState } from 'react';
import {
  Database,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Copy,
  Check,
  RotateCcw,
  Smartphone,
  ExternalLink,
} from 'lucide-react';
import {
  getSupabaseConfig,
  saveSupabaseConfig,
  isSupabaseConfigured,
  getSupabaseClient,
  SUPABASE_SQL_SCHEMA,
} from '../../services/supabase';

interface SettingsViewProps {
  onTriggerSync: () => Promise<void>;
  onResetDatabase: () => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  onTriggerSync,
  onResetDatabase,
}) => {
  const currentConfig = getSupabaseConfig();
  const [url, setUrl] = useState(currentConfig.url);
  const [anonKey, setAnonKey] = useState(currentConfig.anonKey);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSaveConfig = () => {
    saveSupabaseConfig(url.trim(), anonKey.trim());
    setTestResult({ success: true, message: 'Supabase credentials saved successfully!' });
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    // Save current values first
    saveSupabaseConfig(url.trim(), anonKey.trim());

    try {
      const client = getSupabaseClient();
      if (!client) {
        setTestResult({
          success: false,
          message: 'Supabase client could not be initialized. Please check URL format.',
        });
        return;
      }

      const { error } = await client.from('equipment_list').select('count').limit(1);

      if (error) {
        setTestResult({
          success: false,
          message: `Connection error: ${error.message} (${error.code || 'PGRST'})`,
        });
      } else {
        setTestResult({
          success: true,
          message: `Connection successful! Cloud table 'equipment_list' responded with status 200 OK.`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestResult({
        success: false,
        message: `Connection failed: ${msg}`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      await onTriggerSync();
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="admin-page-container">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontFamily: 'var(--adm-font-display)', fontSize: '1.65rem', fontWeight: 800, color: '#ffffff' }}>
          System Configuration &amp; Cloud Database
        </h1>
        <p style={{ fontSize: '0.86rem', color: 'var(--adm-text-secondary)', marginTop: '2px' }}>
          Supabase PostgreSQL integration, replication status, and administrative controls
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '24px' }}>
        {/* Left Column: Supabase Connection */}
        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h2 className="admin-card-title">
                <Database size={18} color="#06b6d4" />
                <span>Supabase Cloud Integration</span>
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--adm-text-secondary)', marginTop: '2px' }}>
                PostgreSQL database configuration for real-time fleet synchronization
              </p>
            </div>
            <span
              className={`admin-sync-pill ${isSupabaseConfigured() ? 'online' : 'offline'}`}
              style={{ cursor: 'default' }}
            >
              <span className={`pulse-dot ${isSupabaseConfigured() ? 'green' : 'amber'}`} />
              <span>{isSupabaseConfigured() ? 'Configured' : 'Using Local API'}</span>
            </span>
          </div>

          <div className="admin-input-group">
            <label className="admin-label">Supabase Project URL</label>
            <input
              type="text"
              className="admin-input admin-mono"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-project.supabase.co"
            />
          </div>

          <div className="admin-input-group">
            <label className="admin-label">Supabase Anon Public API Key</label>
            <input
              type="password"
              className="admin-input admin-mono"
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
            />
          </div>

          {testResult && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                marginBottom: '18px',
                background: testResult.success ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                border: `1px solid ${testResult.success ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
                color: testResult.success ? '#34d399' : '#fca5a5',
                fontSize: '0.86rem',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              {testResult.success ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
              <span>{testResult.message}</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button
              onClick={handleTestConnection}
              className="admin-btn admin-btn-secondary"
              disabled={isTesting}
            >
              <RefreshCw size={14} className={isTesting ? 'admin-spin' : ''} />
              <span>{isTesting ? 'Testing Query...' : 'Test Cloud Connection'}</span>
            </button>

            <button onClick={handleSaveConfig} className="admin-btn admin-btn-primary">
              <Check size={16} />
              <span>Save Configuration</span>
            </button>
          </div>
        </div>

        {/* Right Column: Database Maintenance & Actions */}
        <div>
          {/* Resync & Reset Card */}
          <div className="admin-card">
            <div className="admin-card-header">
              <h2 className="admin-card-title">
                <RefreshCw size={18} color="#f59e0b" />
                <span>Data Replication</span>
              </h2>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--adm-text-secondary)', marginBottom: '16px', lineHeight: 1.5 }}>
              Force pull the latest assets and transactions from the central server into your workstation browser session.
            </p>

            <button
              onClick={handleSyncNow}
              className="admin-btn admin-btn-secondary"
              style={{ width: '100%', marginBottom: '20px' }}
              disabled={isSyncing}
            >
              <RefreshCw size={14} className={isSyncing ? 'admin-spin' : ''} />
              <span>{isSyncing ? 'Replicating...' : 'Force Full Database Resync'}</span>
            </button>

            <div style={{ paddingTop: '16px', borderTop: '1px solid var(--adm-border-subtle)' }}>
              <span style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--adm-text-muted)', fontWeight: 700 }}>
                Factory Reset Fleet
              </span>
              <p style={{ fontSize: '0.82rem', color: 'var(--adm-text-secondary)', margin: '6px 0 12px 0' }}>
                Restore default generator and tank assets and reset transactions.
              </p>
              <button
                onClick={onResetDatabase}
                className="admin-btn admin-btn-outline admin-btn-sm"
                style={{ color: '#ef4444' }}
              >
                <RotateCcw size={14} />
                <span>Reset Database to Seed Defaults</span>
              </button>
            </div>
          </div>

          {/* Handheld Companion Card */}
          <div className="admin-card">
            <div className="admin-card-header">
              <h2 className="admin-card-title">
                <Smartphone size={18} color="#10b981" />
                <span>Field Scanner Companion</span>
              </h2>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--adm-text-secondary)', marginBottom: '14px', lineHeight: 1.5 }}>
              Launch the mobile web app designed for Zebra TC26 laser barcode scanners in field operation.
            </p>
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="admin-btn admin-btn-outline"
              style={{ width: '100%' }}
            >
              <span>Open Field Scanner App</span>
              <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </div>

      {/* Database Schema SQL Documentation */}
      <div className="admin-card" style={{ marginTop: '10px' }}>
        <div className="admin-card-header">
          <div>
            <h2 className="admin-card-title">
              <span>PostgreSQL / Supabase Schema Definition</span>
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--adm-text-secondary)', marginTop: '2px' }}>
              Execute in Supabase SQL Editor if creating a new production cloud database
            </p>
          </div>
          <button onClick={handleCopySql} className="admin-btn admin-btn-outline admin-btn-sm">
            {copiedSql ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
            <span>{copiedSql ? 'Copied SQL!' : 'Copy SQL Script'}</span>
          </button>
        </div>

        <pre
          style={{
            padding: '16px',
            background: '#04070d',
            borderRadius: 'var(--adm-radius-md)',
            border: '1px solid var(--adm-border-subtle)',
            fontSize: '0.78rem',
            fontFamily: 'var(--adm-font-mono)',
            color: '#34d399',
            overflowX: 'auto',
            maxHeight: '260px',
          }}
        >
          {SUPABASE_SQL_SCHEMA}
        </pre>
      </div>
    </div>
  );
};
