import React, { useState, useMemo } from 'react';
import {
  Smartphone,
  Plus,
  QrCode,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Trash2,
  Search,
  CheckCircle2,
  RefreshCw,
  Copy,
  Check,
  Battery,
  BatteryCharging,
  BatteryMedium,
  BatteryWarning,
  MapPin,
  ExternalLink,
  Zap,
} from 'lucide-react';
import type { AuthorizedDevice, DeviceStatus } from '../../types';
import { SUPABASE_SQL_MIGRATION, TELEMETRY_SQL_MIGRATION, checkNativeTelemetryColumns } from '../../services/supabase';

interface DevicesViewProps {
  devices: AuthorizedDevice[];
  onOpenRegisterModal: (device?: AuthorizedDevice) => void;
  onUpdateStatus: (deviceId: string, status: DeviceStatus) => Promise<void>;
  onDeleteDevice: (deviceId: string) => Promise<void>;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const DevicesView: React.FC<DevicesViewProps> = ({
  devices,
  onOpenRegisterModal,
  onUpdateStatus,
  onDeleteDevice,
  onRefresh,
  isRefreshing,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | DeviceStatus>('ALL');
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedTelemetrySql, setCopiedTelemetrySql] = useState(false);
  const [hasNativeTelemetryColumns, setHasNativeTelemetryColumns] = useState<boolean | null>(null);
  const [showSqlDetails, setShowSqlDetails] = useState(false);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  React.useEffect(() => {
    setNowMs(Date.now());
    checkNativeTelemetryColumns().then(setHasNativeTelemetryColumns).catch(() => {});
  }, [devices, isRefreshing]);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const handleCopyMigrationSql = () => {
    navigator.clipboard.writeText(SUPABASE_SQL_MIGRATION);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  const handleCopyTelemetrySql = () => {
    navigator.clipboard.writeText(TELEMETRY_SQL_MIGRATION);
    setCopiedTelemetrySql(true);
    setTimeout(() => setCopiedTelemetrySql(false), 2500);
  };

  // Counts
  const counts = useMemo(() => {
    return {
      total: devices.length,
      active: devices.filter((d) => d.status === 'active').length,
      pending: devices.filter((d) => d.status === 'pending').length,
      revoked: devices.filter((d) => d.status === 'revoked').length,
    };
  }, [devices]);

  // Filtered devices
  const filteredDevices = useMemo(() => {
    return devices.filter((dev) => {
      if (statusFilter !== 'ALL' && dev.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const idMatch = dev.deviceId.toLowerCase().includes(q);
        const nameMatch = (dev.deviceName || '').toLowerCase().includes(q);
        if (!idMatch && !nameMatch) return false;
      }
      return true;
    });
  }, [devices, statusFilter, searchQuery]);

  const formatDate = (isoString?: string) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const formatTimeSinceSync = (isoString?: string) => {
    if (!isoString) return '—';
    const syncedMs = new Date(isoString).getTime();
    if (Number.isNaN(syncedMs)) return '—';

    const diffMs = Math.max(0, nowMs - syncedMs);
    const totalMinutes = Math.floor(diffMs / 60000);

    if (totalMinutes < 60) {
      return `${totalMinutes} ${totalMinutes === 1 ? 'min' : 'mins'}`;
    }

    if (totalMinutes < 1440) {
      const hours = Math.floor(totalMinutes / 60);
      const mins = totalMinutes % 60;
      return `${hours}h ${mins}m`;
    }

    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const mins = totalMinutes % 60;
    return `${days}d ${hours}h ${mins}m`;
  };

  const renderBattery = (dev: AuthorizedDevice) => {
    if (typeof dev.batteryLevel !== 'number' || dev.batteryLevel === null) {
      return <span style={{ color: 'var(--adm-text-muted)', fontSize: '0.82rem' }}>—</span>;
    }

    const level = Math.max(0, Math.min(100, Math.round(dev.batteryLevel)));
    const isCharging = Boolean(dev.isCharging);

    let color = '#10B981'; // Green
    let BatteryIcon = Battery;

    if (isCharging) {
      color = '#10B981';
      BatteryIcon = BatteryCharging;
    } else if (level <= 20) {
      color = '#EF4444'; // Red
      BatteryIcon = BatteryWarning;
    } else if (level <= 50) {
      color = '#F59E0B'; // Amber
      BatteryIcon = BatteryMedium;
    }

    const tooltip = [
      `Battery: ${level}%`,
      isCharging ? 'Status: Charging' : 'Status: On Battery',
      dev.lastTelemetryAt ? `Telemetry update: ${formatDate(dev.lastTelemetryAt)}` : null,
    ].filter(Boolean).join('\n');

    return (
      <div
        title={tooltip}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '2px 8px',
          borderRadius: '6px',
          background: isCharging ? 'rgba(16, 185, 129, 0.08)' : 'var(--adm-surface-2, #F8FAFC)',
          border: `1px solid ${color}33`,
        }}
      >
        <BatteryIcon size={15} color={color} style={{ flexShrink: 0 }} />
        <span style={{ fontWeight: 700, fontSize: '0.84rem', color }}>
          {level}%
        </span>
        {isCharging && (
          <span
            style={{
              fontSize: '0.64rem',
              fontWeight: 800,
              padding: '1px 4px',
              borderRadius: '3px',
              background: '#10B981',
              color: '#FFFFFF',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '2px',
              letterSpacing: '0.2px',
            }}
          >
            <Zap size={8} fill="#FFFFFF" />
            <span>CHG</span>
          </span>
        )}
      </div>
    );
  };

  const renderLocation = (dev: AuthorizedDevice) => {
    if (
      typeof dev.latitude !== 'number' ||
      typeof dev.longitude !== 'number' ||
      dev.latitude === null ||
      dev.longitude === null
    ) {
      return <span style={{ color: 'var(--adm-text-muted)', fontSize: '0.82rem' }}>—</span>;
    }

    const lat = dev.latitude.toFixed(5);
    const lon = dev.longitude.toFixed(5);
    const mapsUrl = `https://www.google.com/maps?q=${dev.latitude},${dev.longitude}`;

    const tooltip = [
      `Latitude: ${dev.latitude}`,
      `Longitude: ${dev.longitude}`,
      dev.locationAccuracy ? `Accuracy: ±${dev.locationAccuracy}m` : null,
      dev.lastTelemetryAt ? `Telemetry update: ${formatDate(dev.lastTelemetryAt)}` : null,
      'Click to open in Google Maps',
    ].filter(Boolean).join('\n');

    return (
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={tooltip}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          textDecoration: 'none',
          padding: '2px 8px',
          borderRadius: '6px',
          background: 'rgba(59, 130, 246, 0.08)',
          border: '1px solid rgba(59, 130, 246, 0.25)',
          color: '#2563EB',
          fontSize: '0.8rem',
          fontWeight: 600,
          transition: 'all 0.15s ease',
        }}
      >
        <MapPin size={13} style={{ flexShrink: 0, color: '#2563EB' }} />
        <span>{lat}, {lon}</span>
        {typeof dev.locationAccuracy === 'number' && (
          <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 500 }}>
            ±{dev.locationAccuracy}m
          </span>
        )}
        <ExternalLink size={10} style={{ opacity: 0.65, flexShrink: 0 }} />
      </a>
    );
  };

  const handleToggleRevoke = async (dev: AuthorizedDevice) => {
    const newStatus: DeviceStatus = dev.status === 'active' ? 'revoked' : 'active';
    const actionLabel = newStatus === 'revoked' ? 'revoke access for' : 're-activate';
    if (window.confirm(`Are you sure you want to ${actionLabel} PDA "${dev.deviceId}"?`)) {
      await onUpdateStatus(dev.deviceId, newStatus);
    }
  };

  const handleApprove = async (dev: AuthorizedDevice) => {
    await onUpdateStatus(dev.deviceId, 'active');
  };

  const handleDelete = async (dev: AuthorizedDevice) => {
    if (window.confirm(`Permanently remove PDA "${dev.deviceId}" from the authorized whitelist? This device will be immediately locked out.`)) {
      await onDeleteDevice(dev.deviceId);
    }
  };

  return (
    <div className="admin-page-container">
      {/* Top Action Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: 'var(--adm-font-display)',
              fontSize: '1.45rem',
              fontWeight: 800,
              color: 'var(--adm-text-primary)',
              margin: 0,
            }}
          >
            Authorized Field PDAs
          </h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--adm-text-secondary)', margin: '2px 0 0 0' }}>
            Manage Zebra TC26 hardware scanner authorization, whitelisting, and remote access
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            onClick={handleCopyMigrationSql}
            className="admin-btn admin-btn-outline"
            title="Copy SQL migration to create the authorized_devices table in your Supabase database"
          >
            {copiedSql ? <Check size={14} color="#10B981" /> : <Copy size={14} />}
            <span style={{ color: copiedSql ? '#10B981' : undefined }}>
              {copiedSql ? 'Copied Migration SQL!' : 'Copy SQL Migration'}
            </span>
          </button>

          <button
            type="button"
            onClick={onRefresh}
            className="admin-btn admin-btn-outline"
            disabled={isRefreshing}
            title="Refresh device statuses"
          >
            <RefreshCw size={14} className={isRefreshing ? 'admin-spin' : ''} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenRegisterModal()}
            className="admin-btn admin-btn-primary"
          >
            <Plus size={16} />
            <span>Register New PDA</span>
          </button>
        </div>
      </div>

      {/* Telemetry Migration Alert Banner (shown only when native columns don't exist yet) */}
      {hasNativeTelemetryColumns === false && (
        <div
          style={{
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            borderRadius: '10px',
            padding: '14px 18px',
            marginBottom: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.1rem' }}>⚠️</span>
                <strong style={{ color: '#B45309', fontSize: '0.94rem' }}>
                  Supabase Schema Migration: Define Native Telemetry Columns
                </strong>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--adm-text-secondary)', maxWidth: '720px' }}>
                Add dedicated columns (<code>battery_level</code>, <code>is_charging</code>, <code>latitude</code>, <code>longitude</code>, <code>location_accuracy</code>, <code>last_telemetry_at</code>) to <code>public.authorized_devices</code>. This removes all workarounds and enables full native telemetry streaming.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowSqlDetails(!showSqlDetails)}
                className="admin-btn admin-btn-outline"
                style={{ fontSize: '0.78rem', padding: '6px 10px' }}
              >
                {showSqlDetails ? 'Hide SQL' : 'View SQL'}
              </button>

              <button
                type="button"
                onClick={handleCopyTelemetrySql}
                className="admin-btn"
                style={{
                  background: '#F59E0B',
                  color: '#FFFFFF',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  padding: '7px 14px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {copiedTelemetrySql ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedTelemetrySql ? 'Copied 6-Line SQL!' : 'Copy Telemetry SQL'}</span>
              </button>
            </div>
          </div>

          {showSqlDetails && (
            <div
              style={{
                marginTop: '4px',
                background: '#1E293B',
                color: '#F8FAFC',
                padding: '12px 14px',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontFamily: 'monospace',
                overflowX: 'auto',
                lineHeight: 1.5,
              }}
            >
              <pre style={{ margin: 0 }}>{TELEMETRY_SQL_MIGRATION}</pre>
            </div>
          )}
        </div>
      )}

      {/* Summary KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '14px',
          marginBottom: '20px',
        }}
      >
        <div className="admin-card" style={{ padding: '14px 18px', margin: 0 }}>
          <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--adm-text-muted)', fontWeight: 700 }}>
            Total Enrolled
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--adm-text-primary)', marginTop: '4px' }}>
            {counts.total}
          </div>
        </div>

        <div className="admin-card" style={{ padding: '14px 18px', margin: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="pulse-dot green" />
            <span style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: '#16A34A', fontWeight: 700 }}>
              Active &amp; Authorized
            </span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#16A34A', marginTop: '4px' }}>
            {counts.active}
          </div>
        </div>

        <div className="admin-card" style={{ padding: '14px 18px', margin: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="pulse-dot amber" />
            <span style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: '#D97706', fontWeight: 700 }}>
              Pending Approval
            </span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#D97706', marginTop: '4px' }}>
            {counts.pending}
          </div>
        </div>

        <div className="admin-card" style={{ padding: '14px 18px', margin: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="pulse-dot slate" style={{ background: '#DC2626' }} />
            <span style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: '#DC2626', fontWeight: 700 }}>
              Revoked / Locked
            </span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#DC2626', marginTop: '4px' }}>
            {counts.revoked}
          </div>
        </div>
      </div>

      {/* Controls Bar: Search & Status Filters */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '16px',
          background: 'var(--adm-surface-1)',
          padding: '12px 16px',
          borderRadius: 'var(--adm-radius-lg)',
          border: '1px solid var(--adm-border-subtle)',
        }}
      >
        <div style={{ position: 'relative', width: '280px' }}>
          <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94A3B8' }} />
          <input
            type="text"
            className="admin-input"
            style={{ paddingLeft: '32px', width: '100%' }}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Device ID or Name..."
          />
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { key: 'ALL', label: 'All Devices', count: counts.total },
            { key: 'active', label: 'Active', count: counts.active },
            { key: 'pending', label: 'Pending', count: counts.pending },
            { key: 'revoked', label: 'Revoked', count: counts.revoked },
          ].map((tab) => {
            const isSelected = statusFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusFilter(tab.key as 'ALL' | DeviceStatus)}
                className={`admin-btn ${isSelected ? 'admin-btn-primary' : 'admin-btn-outline'} admin-btn-sm`}
                style={{
                  background: isSelected ? '#2563EB' : 'transparent',
                  borderColor: isSelected ? '#2563EB' : 'var(--adm-border-medium)',
                  color: isSelected ? '#FFFFFF' : 'var(--adm-text-primary)',
                  fontWeight: isSelected ? 700 : 500,
                  gap: '6px',
                }}
              >
                <span>{tab.label}</span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    padding: '1px 6px',
                    borderRadius: '999px',
                    background: isSelected ? 'rgba(255, 255, 255, 0.25)' : 'var(--adm-surface-3)',
                    color: isSelected ? '#FFFFFF' : 'var(--adm-text-secondary)',
                  }}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Devices Data Table */}
      <div className="admin-table-container">
        {filteredDevices.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--adm-text-secondary)' }}>
            <Smartphone size={36} style={{ margin: '0 auto 10px auto', opacity: 0.4 }} />
            <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--adm-text-primary)' }}>
              No PDA devices found
            </div>
            <p style={{ fontSize: '0.84rem', margin: '4px 0 16px 0' }}>
              {devices.length === 0
                ? 'No handheld scanners have been registered yet. Click "Register New PDA" to authorize your first Zebra scanner.'
                : 'No devices match your search or filter criteria.'}
            </p>
            {devices.length === 0 && (
              <button
                type="button"
                onClick={() => onOpenRegisterModal()}
                className="admin-btn admin-btn-primary"
              >
                <Plus size={15} />
                <span>Register First Zebra PDA</span>
              </button>
            )}
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Device ID</th>
                <th>Device Label / Description</th>
                <th>Status</th>
                <th>Last Active / Synced</th>
                <th>Time Since Last Sync</th>
                <th>Battery</th>
                <th>GPS Location</th>
                <th>Enrolled Date</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDevices.map((dev) => {
                const isActive = dev.status === 'active';
                const isPending = dev.status === 'pending';
                const isRevoked = dev.status === 'revoked';

                return (
                  <tr key={dev.deviceId}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Smartphone size={16} color="#64748B" />
                        <span
                          style={{
                            fontWeight: 800,
                            fontFamily: 'monospace',
                            fontSize: '0.94rem',
                            color: 'var(--adm-text-primary)',
                          }}
                        >
                          {dev.deviceId}
                        </span>
                      </div>
                    </td>

                    <td>
                      <span style={{ fontWeight: 500, color: 'var(--adm-text-primary)' }}>
                        {dev.deviceName || '—'}
                      </span>
                    </td>

                    <td>
                      {isActive && (
                        <span
                          className="admin-sync-pill online"
                          style={{ cursor: 'default', background: 'rgba(34, 197, 94, 0.12)', color: '#16A34A', border: '1px solid rgba(34, 197, 94, 0.25)' }}
                        >
                          <span className="pulse-dot green" />
                          <span>Active</span>
                        </span>
                      )}
                      {isPending && (
                        <span
                          className="admin-sync-pill offline"
                          style={{ cursor: 'default', background: 'rgba(234, 179, 8, 0.12)', color: '#D97706', border: '1px solid rgba(234, 179, 8, 0.25)' }}
                        >
                          <span className="pulse-dot amber" />
                          <span>Pending Approval</span>
                        </span>
                      )}
                      {isRevoked && (
                        <span
                          className="admin-sync-pill offline"
                          style={{ cursor: 'default', background: 'rgba(239, 68, 68, 0.12)', color: '#DC2626', border: '1px solid rgba(239, 68, 68, 0.25)' }}
                        >
                          <span className="pulse-dot" style={{ background: '#DC2626' }} />
                          <span>Revoked</span>
                        </span>
                      )}
                    </td>

                    <td style={{ fontSize: '0.82rem', color: 'var(--adm-text-secondary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Clock size={13} style={{ opacity: 0.6 }} />
                        <span>{formatDate(dev.lastSeenAt)}</span>
                      </div>
                    </td>

                    <td
                      style={{
                        fontSize: '0.82rem',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontWeight: 600,
                        color: 'var(--adm-text-primary)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatTimeSinceSync(dev.lastSeenAt)}
                    </td>

                    <td>
                      {renderBattery(dev)}
                    </td>

                    <td>
                      {renderLocation(dev)}
                    </td>

                    <td style={{ fontSize: '0.82rem', color: 'var(--adm-text-secondary)' }}>
                      {formatDate(dev.registeredAt)}
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                        {/* Show QR Code */}
                        <button
                          type="button"
                          onClick={() => onOpenRegisterModal(dev)}
                          className="admin-btn admin-btn-outline admin-btn-sm"
                          title="Show Enrollment QR Code for Zebra scanner pairing"
                          style={{ padding: '5px 8px' }}
                        >
                          <QrCode size={14} />
                          <span style={{ fontSize: '0.76rem' }}>QR</span>
                        </button>

                        {/* Approve Button (if pending) */}
                        {isPending && (
                          <button
                            type="button"
                            onClick={() => handleApprove(dev)}
                            className="admin-btn admin-btn-success admin-btn-sm"
                            title="Approve this device for live fuel tracking"
                            style={{ padding: '5px 8px' }}
                          >
                            <CheckCircle2 size={14} />
                            <span style={{ fontSize: '0.76rem' }}>Approve</span>
                          </button>
                        )}

                        {/* Revoke / Restore Toggle */}
                        {!isPending && (
                          <button
                            type="button"
                            onClick={() => handleToggleRevoke(dev)}
                            className={`admin-btn ${isActive ? 'admin-btn-outline' : 'admin-btn-secondary'} admin-btn-sm`}
                            title={isActive ? 'Revoke scanner access' : 'Re-activate scanner'}
                            style={{
                              padding: '5px 8px',
                              color: isActive ? '#EF4444' : '#16A34A',
                              borderColor: isActive ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)',
                            }}
                          >
                            {isActive ? <ShieldAlert size={14} /> : <ShieldCheck size={14} />}
                            <span style={{ fontSize: '0.76rem' }}>{isActive ? 'Revoke' : 'Activate'}</span>
                          </button>
                        )}

                        {/* Delete Device */}
                        <button
                          type="button"
                          onClick={() => handleDelete(dev)}
                          className="admin-btn admin-btn-outline admin-btn-sm"
                          title="Delete from whitelist"
                          style={{ padding: '5px 8px', color: '#EF4444' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
