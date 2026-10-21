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
  FileSpreadsheet,
  Trash2,
} from 'lucide-react';
import {
  getSupabaseConfig,
  saveSupabaseConfig,
  isSupabaseConfigured,
  getSupabaseClient,
  SUPABASE_SQL_SCHEMA,
} from '../../services/supabase';
import { parseCSV, mapRowToEquipment, mapRowToTransactions } from '../../utils/csvParser';
import { wipeAndImportFleet } from '../../services/api';

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

  // CSV Import State
  const [csvText, setCsvText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null);

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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvText(text || '');
      setImportResult(null);
    };
    reader.readAsText(file);
  };

  const handleExecuteImport = async () => {
    if (!csvText.trim()) {
      setImportResult({ success: false, message: 'Please provide CSV content first.' });
      return;
    }

    const { rows } = parseCSV(csvText);
    if (rows.length === 0) {
      setImportResult({ success: false, message: 'Could not parse any data rows from the CSV.' });
      return;
    }

    const equipmentList = rows.map((row, idx) => mapRowToEquipment(row, idx));
    const transactionsList = rows.flatMap((row, idx) =>
      mapRowToTransactions(row, idx, equipmentList[idx])
    );

    if (
      !window.confirm(
        `WARNING: This will permanently DELETE ALL existing records and transactions in Supabase, and import ${equipmentList.length} assets and ${transactionsList.length} transactions. Proceed?`
      )
    ) {
      return;
    }

    setIsImporting(true);
    setImportResult(null);

    try {
      const { equipmentCount, transactionCount } = await wipeAndImportFleet(
        equipmentList,
        transactionsList
      );
      await onTriggerSync();
      setImportResult({
        success: true,
        message: `Success! Wiped old database and imported ${equipmentCount} assets and ${transactionCount} transactions (including all fuel transfers).`,
      });
      setCsvText('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setImportResult({
        success: false,
        message: `Import failed: ${msg}`,
      });
    } finally {
      setIsImporting(false);
    }
  };

  const parsedPreview = csvText.trim() ? parseCSV(csvText) : null;
  const parsedCount = parsedPreview ? parsedPreview.rows.length : 0;

  return (
    <div className="admin-page-container">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontFamily: 'var(--adm-font-display)', fontSize: '1.65rem', fontWeight: 800, color: '#ffffff' }}>
          System Configuration &amp; Cloud Database
        </h1>
        <p style={{ fontSize: '0.86rem', color: 'var(--adm-text-secondary)', marginTop: '2px' }}>
          Supabase PostgreSQL integration, real-world data import, and database administration
        </p>
      </div>

      {/* Bulk Import / Wipe Database Card */}
      <div className="admin-card" style={{ marginBottom: '24px', borderColor: 'var(--adm-border)' }}>
        <div className="admin-card-header">
          <div>
            <h2 className="admin-card-title">
              <FileSpreadsheet size={18} color="#eab308" />
              <span>Import Real-World Fleet (Wipe &amp; Replace)</span>
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--adm-text-secondary)', marginTop: '2px' }}>
              Upload or paste CSV exported from Google Sheets or Excel to wipe existing records and populate the fleet.
            </p>
          </div>
          <span className="admin-badge" style={{ background: '#1e293b', color: '#94a3b8' }}>
            RFC 4180 CSV
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '10px' }}>
          <div>
            <label className="admin-label">1. Upload CSV File</label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileUpload}
              className="admin-input"
              style={{ padding: '8px 12px' }}
            />
            <p style={{ fontSize: '0.78rem', color: 'var(--adm-text-muted)', marginTop: '6px' }}>
              From Google Sheets: File &rarr; Download &rarr; Comma Separated Values (.csv)
            </p>
          </div>

          <div>
            <label className="admin-label">Or Paste CSV Text</label>
            <textarea
              className="admin-input admin-mono"
              rows={4}
              placeholder="Asset ID, Type, Capacity, Area, Location, What3Words, Serial..."
              value={csvText}
              onChange={(e) => {
                setCsvText(e.target.value);
                setImportResult(null);
              }}
              style={{ fontSize: '0.78rem', resize: 'vertical' }}
            />
          </div>
        </div>

        {parsedCount > 0 && (
          <div
            style={{
              marginTop: '16px',
              padding: '12px 16px',
              borderRadius: '8px',
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              color: '#93c5fd',
              fontSize: '0.84rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <strong>CSV Ready:</strong> Found <strong>{parsedCount}</strong> equipment records ready to import.
              <span style={{ marginLeft: '10px', opacity: 0.8 }}>
                Detected columns: {parsedPreview?.headers.slice(0, 6).join(', ')}
              </span>
            </div>
            <button
              onClick={handleExecuteImport}
              disabled={isImporting}
              className="admin-btn"
              style={{
                background: '#ef4444',
                color: '#ffffff',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Trash2 size={16} />
              <span>{isImporting ? 'Wiping & Importing...' : `Wipe & Import ${parsedCount} Assets`}</span>
            </button>
          </div>
        )}

        {importResult && (
          <div
            style={{
              marginTop: '16px',
              padding: '12px 16px',
              borderRadius: '8px',
              background: importResult.success ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              border: `1px solid ${importResult.success ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
              color: importResult.success ? '#34d399' : '#fca5a5',
              fontSize: '0.86rem',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            {importResult.success ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span>{importResult.message}</span>
          </div>
        )}
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
            <button
              type="button"
              onClick={() => {
                window.open('/', 'TTD_PDA_WINDOW', 'width=430,height=800,menubar=no,toolbar=no,location=no,status=no,resizable=no,scrollbars=no');
              }}
              className="admin-btn admin-btn-outline"
              style={{ width: '100%', gap: '8px' }}
            >
              <span>Open Field Scanner App (Locked PDA Window)</span>
              <ExternalLink size={14} />
            </button>
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
