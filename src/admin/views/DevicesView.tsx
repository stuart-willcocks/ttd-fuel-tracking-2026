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
} from 'lucide-react';
import type { AuthorizedDevice, DeviceStatus } from '../../types';

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
                <th>Enrolled Date</th>
                <th>Last Active / Synced</th>
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
                      {formatDate(dev.registeredAt)}
                    </td>

                    <td style={{ fontSize: '0.82rem', color: 'var(--adm-text-secondary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Clock size={13} style={{ opacity: 0.6 }} />
                        <span>{formatDate(dev.lastSeenAt)}</span>
                      </div>
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
