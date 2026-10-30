import React, { useState, useMemo } from 'react';
import {
  Smartphone,
  Trash2,
  CheckCircle2,
  RefreshCw,
  Copy,
  Check,
  Battery,
  BatteryCharging,
  BatteryMedium,
  BatteryWarning,
  ExternalLink,
  Zap,
  X,
} from 'lucide-react';
import type { AuthorizedDevice, DeviceStatus } from '../../types';
import { TELEMETRY_SQL_MIGRATION, checkNativeTelemetryColumns } from '../../services/supabase';

interface DevicesViewProps {
  devices: AuthorizedDevice[];
  onUpdateStatus: (deviceId: string, status: DeviceStatus, assignedDeviceId?: string) => Promise<void>;
  onDeleteDevice: (deviceId: string) => Promise<void>;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const DevicesView: React.FC<DevicesViewProps> = ({
  devices,
  onUpdateStatus,
  onDeleteDevice,
  onRefresh,
  isRefreshing,
}) => {
  const [statusFilter, setStatusFilter] = useState<'ALL' | DeviceStatus>('ALL');
  const [copiedTelemetrySql, setCopiedTelemetrySql] = useState(false);
  const [hasNativeTelemetryColumns, setHasNativeTelemetryColumns] = useState<boolean | null>(null);
  const [showSqlDetails, setShowSqlDetails] = useState(false);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [approvingDevice, setApprovingDevice] = useState<AuthorizedDevice | null>(null);
  const [persistentIdInput, setPersistentIdInput] = useState('');
  const [approveError, setApproveError] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);

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
    };
  }, [devices]);

  // Filtered and sorted devices (ascending by deviceId)
  const filteredDevices = useMemo(() => {
    return devices
      .filter((dev) => {
        if (statusFilter !== 'ALL' && dev.status !== statusFilter) {
          return false;
        }
        return true;
      })
      .sort((a, b) =>
        a.deviceId.localeCompare(b.deviceId, undefined, { numeric: true, sensitivity: 'base' })
      );
  }, [devices, statusFilter]);

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

  const handleOpenApproveModal = (dev: AuthorizedDevice) => {
    setApprovingDevice(dev);
    setPersistentIdInput('');
    setApproveError(null);
  };

  const handleConfirmApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approvingDevice) return;

    const assignedId = persistentIdInput.trim().toUpperCase();
    if (!assignedId) {
      setApproveError('Please enter a persistent Device ID (e.g., TTD-PDA-01).');
      return;
    }

    const collision = devices.find(
      (d) =>
        d.deviceId.toUpperCase() === assignedId &&
        d.deviceId.toUpperCase() !== approvingDevice.deviceId.toUpperCase() &&
        d.status === 'active'
    );
    if (collision) {
      setApproveError(`Device ID "${assignedId}" is already assigned to an authorized device.`);
      return;
    }

    setApproveError(null);
    setIsApproving(true);
    try {
      await onUpdateStatus(approvingDevice.deviceId, 'active', assignedId);
      setApprovingDevice(null);
      setPersistentIdInput('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setApproveError(msg);
    } finally {
      setIsApproving(false);
    }
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
            Authorized devices
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
                Add dedicated columns (<code>app_version</code>, <code>battery_level</code>, <code>is_charging</code>, <code>latitude</code>, <code>longitude</code>, <code>location_accuracy</code>, <code>last_telemetry_at</code>) to <code>public.authorized_devices</code>.
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
                <span>{copiedTelemetrySql ? 'Copied SQL!' : 'Copy Telemetry SQL'}</span>
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

      {/* Controls Bar: Status Filters */}
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
        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { key: 'ALL', label: 'All Devices', count: counts.total },
            { key: 'active', label: 'Authorized', count: counts.active },
            { key: 'pending', label: 'Pending', count: counts.pending },
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
            <p style={{ fontSize: '0.84rem', margin: '4px 0 0 0' }}>
              {devices.length === 0
                ? 'No handheld scanners have requested registration yet. Submit a registration request from a PDA to approve it here.'
                : 'No devices match your filter criteria.'}
            </p>
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Device ID</th>
                <th>APP VERSION</th>
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

                return (
                  <tr key={dev.deviceId}>
                    <td>
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
                    </td>

                    <td>
                      {dev.appVersion ? (
                        <span
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontWeight: 700,
                            fontSize: '0.84rem',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            background: 'var(--adm-surface-2, #F8FAFC)',
                            border: '1px solid var(--adm-border-subtle)',
                            color: 'var(--adm-text-primary)',
                            display: 'inline-block',
                          }}
                        >
                          V{String(dev.appVersion).replace(/^[vV]/, '')}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--adm-text-muted)', fontSize: '0.82rem' }}>—</span>
                      )}
                    </td>

                    <td>
                      {isActive && (
                        <span
                          className="admin-sync-pill online"
                          style={{ cursor: 'default', background: 'rgba(34, 197, 94, 0.12)', color: '#16A34A', border: '1px solid rgba(34, 197, 94, 0.25)' }}
                        >
                          <span className="pulse-dot green" />
                          <span>Authorized</span>
                        </span>
                      )}
                      {isPending && (
                        <button
                          type="button"
                          onClick={() => handleOpenApproveModal(dev)}
                          className="admin-btn admin-btn-success admin-btn-sm"
                          title="Assign persistent Device ID and authorize this device"
                          style={{ padding: '5px 10px' }}
                        >
                          <CheckCircle2 size={14} />
                          <span style={{ fontSize: '0.76rem' }}>Approve</span>
                        </button>
                      )}
                    </td>

                    <td style={{ fontSize: '0.82rem', color: 'var(--adm-text-secondary)' }}>
                      <span>{formatDate(dev.lastSeenAt)}</span>
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

      {/* Authorize Device & Assign Persistent ID Modal */}
      {approvingDevice && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
          onClick={() => {
            if (!isApproving) setApprovingDevice(null);
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '440px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
              border: '1px solid var(--adm-border-subtle)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--adm-border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={18} color="#16A34A" />
                <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--adm-text-primary)' }}>
                  Authorize Device
                </h2>
              </div>
              <button
                type="button"
                disabled={isApproving}
                onClick={() => setApprovingDevice(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--adm-text-muted)',
                  padding: '4px',
                }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmApprove} style={{ padding: '20px' }}>
              <div style={{ marginBottom: '14px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: 'var(--adm-text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    marginBottom: '6px',
                  }}
                >
                  Temporary Request ID
                </label>
                <input
                  type="text"
                  value={approvingDevice.deviceId}
                  readOnly
                  disabled
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    background: 'var(--adm-surface-2, #F8FAFC)',
                    border: '1px solid var(--adm-border-subtle)',
                    borderRadius: '6px',
                    color: 'var(--adm-text-secondary)',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: 'var(--adm-text-primary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    marginBottom: '6px',
                  }}
                >
                  Persistent Device ID *
                </label>
                <input
                  type="text"
                  value={persistentIdInput}
                  onChange={(e) => {
                    setPersistentIdInput(e.target.value.toUpperCase());
                    if (approveError) setApproveError(null);
                  }}
                  placeholder="e.g. TTD-PDA-01"
                  autoFocus
                  required
                  disabled={isApproving}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: '#FFFFFF',
                    border: '1px solid var(--adm-border-medium, #CBD5E1)',
                    borderRadius: '6px',
                    color: 'var(--adm-text-primary)',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
                <p style={{ margin: '6px 0 0 0', fontSize: '0.76rem', color: 'var(--adm-text-secondary)' }}>
                  This persistent ID will be saved in the Admin Console and automatically written back to the PDA.
                </p>
              </div>

              {approveError && (
                <div
                  style={{
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    color: '#DC2626',
                    padding: '9px 12px',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    marginBottom: '16px',
                  }}
                >
                  {approveError}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  disabled={isApproving}
                  onClick={() => setApprovingDevice(null)}
                  className="admin-btn admin-btn-outline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isApproving || !persistentIdInput.trim()}
                  className="admin-btn admin-btn-success"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <CheckCircle2 size={15} />
                  <span>{isApproving ? 'Authorizing...' : 'Assign ID & Authorize'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
