/**
 * SecuritySettings — Password change, forgot password, OAuth connections, active sessions.
 * Premium warm-glass design with 3D depth and realistic shadows.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldIcon, KeyIcon, LockIcon, GlobeIcon,
  TrashIcon, CheckIcon, CloseIcon, ClockIcon,
} from '@/components/ui/icons';
import { GitHubIcon, GoogleIcon } from '@/components/ui/icons';
import { useAccountStore } from '@/store/useAccountStore';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

const cardStyle: React.CSSProperties = {
  background: 'linear-gradient(145deg, rgba(255,255,255,0.85) 0%, rgba(250,247,244,0.75) 100%)',
  boxShadow: `
    0 4px 16px rgba(0,0,0,0.06),
    0 1px 4px rgba(0,0,0,0.04),
    inset 0 1px 0 rgba(255,255,255,0.8),
    inset 0 -1px 0 rgba(0,0,0,0.02)
  `,
  backdropFilter: 'blur(12px) saturate(150%)',
};

const inputStyle = "w-full bg-white border border-[#ddd3c8] rounded-xl px-3 py-2.5 text-sm text-[#1a1a1a] placeholder:text-[#c0b8ae] focus:outline-none focus:border-[#c25a00]/50 focus:ring-2 focus:ring-[#c25a00]/10 transition-all duration-300";

export function SecuritySettings() {
  const { sessions, sessionsLoading, connections, connectionsLoading, fetchSessions, fetchConnections, revokeSession } = useAccountStore();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    fetchSessions();
    fetchConnections();
  }, [fetchSessions, fetchConnections]);

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) {
      toast.error('Please fill in both fields');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setChangingPassword(true);
    try {
      await apiClient.changePassword(currentPassword, newPassword);
      toast.success('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      await revokeSession(sessionId);
      toast.success('Session revoked');
    } catch (err: any) {
      toast.error(err.message || 'Failed to revoke session');
    }
  };

  const providerIcons: Record<string, React.ReactNode> = {
    github: <GitHubIcon size={18} />,
    google: <GoogleIcon size={18} />,
  };

  const providerLabels: Record<string, string> = {
    github: 'GitHub',
    google: 'Google',
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-display font-bold text-[#1a1a1a] mb-1">Security</h2>
        <p className="text-sm text-[#8a7a6b]">Manage your password and security settings</p>
      </div>

      {/* Change Password */}
      <div
        className="p-5 rounded-2xl border border-[#e8e0d8]/60 transition-all duration-500"
        style={cardStyle}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#f5f0eb]" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <LockIcon size={16} className="text-[#8a7a6b]" />
          </div>
          <h3 className="text-sm font-semibold text-[#4a3f35]">Change Password</h3>
        </div>
        <div className="space-y-3 max-w-full sm:max-w-sm">
          <input
            type="password"
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={inputStyle}
            style={{ boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.06)' }}
          />
          <input
            type="password"
            placeholder="New password (min 8 characters)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={inputStyle}
            style={{ boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.06)' }}
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleChangePassword()}
            className={inputStyle}
            style={{ boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.06)' }}
          />
          <div className="flex items-center gap-3">
            <motion.button
              onClick={handleChangePassword}
              disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
              whileHover={{ y: -1, scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="px-5 py-2.5 text-sm font-semibold rounded-xl text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 cursor-pointer"
              style={{
                background: 'linear-gradient(145deg, #2a2a2a, #1a1a1a)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.06)',
              }}
            >
              {changingPassword ? 'Changing...' : 'Update Password'}
            </motion.button>
          </div>
          <div className="pt-1">
            <Link
              to="/forgot-password"
              className="text-xs text-[#c25a00] hover:text-[#a04800] font-medium transition-colors duration-300"
            >
              Forgot your password? Reset via email
            </Link>
          </div>
        </div>
      </div>

      {/* Connected Accounts */}
      <div
        className="p-5 rounded-2xl border border-[#e8e0d8]/60 transition-all duration-500"
        style={cardStyle}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#f5f0eb]" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <GlobeIcon size={16} className="text-[#8a7a6b]" />
          </div>
          <h3 className="text-sm font-semibold text-[#4a3f35]">Connected Accounts</h3>
        </div>
        {connectionsLoading ? (
          <p className="text-sm text-[#b0a090]">Loading...</p>
        ) : connections.length === 0 ? (
          <p className="text-sm text-[#b0a090]">No connected accounts. Connect via login page.</p>
        ) : (
          <div className="space-y-2">
            {connections.map((conn) => (
              <div
                key={conn.id}
                className="flex items-center justify-between p-3 rounded-xl border border-[#e8e0d8]/40 transition-all duration-300 hover:-translate-y-px"
                style={{
                  background: 'linear-gradient(145deg, rgba(255,255,255,0.6), rgba(250,247,244,0.4))',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.03), inset 0 1px 0 rgba(255,255,255,0.5)',
                }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-[#4a3f35]">{providerIcons[conn.providerId] || <GlobeIcon size={18} />}</span>
                  <div>
                    <p className="text-sm text-[#1a1a1a] font-medium">{providerLabels[conn.providerId] || conn.providerId}</p>
                    <p className="text-xs text-[#b0a090]">Connected {new Date(conn.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
                <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200 font-medium">
                  Connected
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active Sessions */}
      <div
        className="p-5 rounded-2xl border border-[#e8e0d8]/60 transition-all duration-500"
        style={cardStyle}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#f5f0eb]" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <ClockIcon size={16} className="text-[#8a7a6b]" />
          </div>
          <h3 className="text-sm font-semibold text-[#4a3f35]">Active Sessions</h3>
        </div>
        {sessionsLoading ? (
          <p className="text-sm text-[#b0a090]">Loading...</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-[#b0a090]">No active sessions found</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((sess) => {
              const ua = sess.userAgent || 'Unknown device';
              const shortUa = ua.length > 60 ? ua.slice(0, 60) + '...' : ua;

              return (
                <div
                  key={sess.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-[#e8e0d8]/40 transition-all duration-300 hover:-translate-y-px"
                  style={{
                    background: 'linear-gradient(145deg, rgba(255,255,255,0.6), rgba(250,247,244,0.4))',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.03), inset 0 1px 0 rgba(255,255,255,0.5)',
                  }}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-[#1a1a1a] font-medium">
                        {sess.isCurrent ? 'Current Session' : 'Session'}
                      </p>
                      {sess.isCurrent && (
                        <span
                          className="text-xs text-[#c25a00] px-1.5 py-0.5 rounded-lg font-medium"
                          style={{
                            background: 'linear-gradient(135deg, #fef3e8, #fde6d0)',
                            boxShadow: '0 1px 3px rgba(194,90,0,0.08)',
                          }}
                        >
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#b0a090] mt-0.5 truncate max-w-[200px] sm:max-w-xs" title={ua}>
                      {shortUa}
                    </p>
                    <p className="text-xs text-[#b0a090]">
                      {sess.ipAddress && `IP: ${sess.ipAddress} · `}
                      Created {new Date(sess.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {!sess.isCurrent && (
                    <motion.button
                      onClick={() => handleRevokeSession(sess.id)}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      className="p-2 rounded-xl text-[#b0a090] hover:text-red-500 hover:bg-red-50 transition-all duration-300 cursor-pointer"
                      title="Revoke session"
                    >
                      <TrashIcon size={14} />
                    </motion.button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
