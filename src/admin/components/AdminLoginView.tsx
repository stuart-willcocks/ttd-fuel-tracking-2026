import React, { useState } from 'react';
import { Lock, Mail, Eye, EyeOff, AlertCircle, CheckCircle2, KeyRound, ArrowLeft } from 'lucide-react';
import {
  signInAdminWithPassword,
  sendAdminPasswordResetEmail,
  updateAdminPassword,
} from '../../services/supabase';
import { APP_VERSION, getIsStaging } from '../../version';

interface AdminLoginViewProps {
  isPasswordRecovery?: boolean;
  initialError?: string | null;
  onPasswordRecoveryComplete?: () => void;
}

export const AdminLoginView: React.FC<AdminLoginViewProps> = ({
  isPasswordRecovery = false,
  initialError = null,
  onPasswordRecoveryComplete,
}) => {
  const isStaging = getIsStaging();
  const [mode, setMode] = useState<'login' | 'reset'>(isPasswordRecovery ? 'login' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(initialError);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!email.trim() || !password) {
      setErrorMsg('Please enter both your email address and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      await signInAdminWithPassword(email.trim(), password);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg || 'Invalid email or password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!email.trim()) {
      setErrorMsg('Please enter your admin email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      await sendAdminPasswordResetEmail(email.trim());
      setSuccessMsg('Password reset instructions have been sent to your email.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg || 'Could not send password reset email.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdatePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (newPassword.length < 8) {
      setErrorMsg('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await updateAdminPassword(newPassword);
      setSuccessMsg('Password updated successfully!');
      setTimeout(() => {
        onPasswordRecoveryComplete?.();
      }, 800);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg || 'Failed to update password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        background: '#F1F5F9',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          background: '#FFFFFF',
          borderRadius: '14px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 12px 32px rgba(15, 23, 42, 0.08)',
          overflow: 'hidden',
        }}
      >
        {/* Top Brand Banner */}
        <div
          style={{
            background: '#EC721E',
            padding: '22px 24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            color: '#FFFFFF',
            textAlign: 'center',
          }}
        >
          <img
            src="/logo-01.png"
            alt="The Technical Department Ltd"
            style={{ height: '54px', width: 'auto', objectFit: 'contain' }}
          />
          <div style={{ fontSize: '1.15rem', fontWeight: 800, letterSpacing: '-0.01em' }}>
            TTD Fuel Tracking
          </div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              background: 'rgba(15, 23, 42, 0.22)',
              padding: '3px 10px',
              borderRadius: '999px',
            }}
          >
            <span>ADMIN CONSOLE</span>
            <span>•</span>
            <span>
              V{APP_VERSION}
              {isStaging ? ' (STAGING)' : ''}
            </span>
          </div>
        </div>

        {/* Form Body */}
        <div style={{ padding: '26px 26px 28px 26px' }}>
          {isPasswordRecovery ? (
            <form onSubmit={handleUpdatePasswordSubmit}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '6px',
                  color: '#0F172A',
                  fontWeight: 700,
                  fontSize: '1.05rem',
                }}
              >
                <KeyRound size={18} color="#EC721E" />
                <span>Set Your Admin Password</span>
              </div>
              <p style={{ margin: '0 0 18px 0', fontSize: '0.84rem', color: '#64748B' }}>
                Choose a password for your Admin Console account to complete setup.
              </p>

              {errorMsg && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: '#FEF2F2',
                    border: '1px solid #FECACA',
                    color: '#B91C1C',
                    fontSize: '0.82rem',
                    marginBottom: '16px',
                  }}
                >
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: '#F0FDF4',
                    border: '1px solid #BBF7D0',
                    color: '#15803D',
                    fontSize: '0.82rem',
                    marginBottom: '16px',
                  }}
                >
                  <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span>{successMsg}</span>
                </div>
              )}

              <div style={{ marginBottom: '14px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    color: '#334155',
                    marginBottom: '6px',
                  }}
                >
                  New Password
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  required
                  autoFocus
                  className="admin-input"
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    color: '#334155',
                    marginBottom: '6px',
                  }}
                >
                  Confirm New Password
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  required
                  className="admin-input"
                  style={{ width: '100%' }}
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="admin-btn admin-btn-primary"
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  padding: '10px 16px',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  background: '#EC721E',
                  borderColor: '#EC721E',
                }}
              >
                {isSubmitting ? 'Saving Password...' : 'Save Password & Continue'}
              </button>
            </form>
          ) : mode === 'login' ? (
            <form onSubmit={handleLoginSubmit}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '6px',
                  color: '#0F172A',
                  fontWeight: 700,
                  fontSize: '1.05rem',
                }}
              >
                <Lock size={17} color="#EC721E" />
                <span>Administrator Sign In</span>
              </div>
              <p style={{ margin: '0 0 18px 0', fontSize: '0.84rem', color: '#64748B' }}>
                Sign in with your authorized Supabase administrator credentials.
              </p>

              {errorMsg && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: '#FEF2F2',
                    border: '1px solid #FECACA',
                    color: '#B91C1C',
                    fontSize: '0.82rem',
                    marginBottom: '16px',
                  }}
                >
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div style={{ marginBottom: '14px' }}>
                <label
                  htmlFor="admin-login-email"
                  style={{
                    display: 'block',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    color: '#334155',
                    marginBottom: '6px',
                  }}
                >
                  Email Address
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail
                    size={15}
                    color="#64748B"
                    style={{
                      position: 'absolute',
                      left: '11px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      pointerEvents: 'none',
                    }}
                  />
                  <input
                    id="admin-login-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@thetechnicaldepartment.com"
                    autoComplete="email"
                    required
                    autoFocus
                    className="admin-input"
                    style={{ width: '100%', paddingLeft: '34px' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '18px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '6px',
                  }}
                >
                  <label
                    htmlFor="admin-login-password"
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: '#334155',
                    }}
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMsg(null);
                      setSuccessMsg(null);
                      setMode('reset');
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: '#2563EB',
                      fontSize: '0.76rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Forgot password?
                  </button>
                </div>
                <div style={{ position: 'relative' }}>
                  <Lock
                    size={15}
                    color="#64748B"
                    style={{
                      position: 'absolute',
                      left: '11px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      pointerEvents: 'none',
                    }}
                  />
                  <input
                    id="admin-login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    autoComplete="current-password"
                    required
                    className="admin-input"
                    style={{ width: '100%', paddingLeft: '34px', paddingRight: '36px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    title={showPassword ? 'Hide password' : 'Show password'}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      padding: '4px',
                      color: '#64748B',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="admin-btn admin-btn-primary"
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  padding: '10px 16px',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  background: '#EC721E',
                  borderColor: '#EC721E',
                }}
              >
                {isSubmitting ? 'Signing In...' : 'Sign In to Admin Console'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleResetSubmit}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '6px',
                  color: '#0F172A',
                  fontWeight: 700,
                  fontSize: '1.05rem',
                }}
              >
                <KeyRound size={17} color="#EC721E" />
                <span>Reset Admin Password</span>
              </div>
              <p style={{ margin: '0 0 18px 0', fontSize: '0.84rem', color: '#64748B' }}>
                Enter your administrator email address to receive a password reset link.
              </p>

              {errorMsg && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: '#FEF2F2',
                    border: '1px solid #FECACA',
                    color: '#B91C1C',
                    fontSize: '0.82rem',
                    marginBottom: '16px',
                  }}
                >
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: '#F0FDF4',
                    border: '1px solid #BBF7D0',
                    color: '#15803D',
                    fontSize: '0.82rem',
                    marginBottom: '16px',
                  }}
                >
                  <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span>{successMsg}</span>
                </div>
              )}

              <div style={{ marginBottom: '18px' }}>
                <label
                  htmlFor="admin-reset-email"
                  style={{
                    display: 'block',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    color: '#334155',
                    marginBottom: '6px',
                  }}
                >
                  Email Address
                </label>
                <input
                  id="admin-reset-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@thetechnicaldepartment.com"
                  autoComplete="email"
                  required
                  autoFocus
                  className="admin-input"
                  style={{ width: '100%' }}
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="admin-btn admin-btn-primary"
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  padding: '10px 16px',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  background: '#EC721E',
                  borderColor: '#EC721E',
                  marginBottom: '12px',
                }}
              >
                {isSubmitting ? 'Sending Reset Link...' : 'Send Reset Link'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  setSuccessMsg(null);
                  setMode('login');
                }}
                className="admin-btn admin-btn-outline"
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  gap: '6px',
                  fontSize: '0.84rem',
                }}
              >
                <ArrowLeft size={14} />
                <span>Back to Sign In</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

