/**
 * SecuritySettings — Password change, OAuth connections, active sessions
 */

import { useState, useEffect } from 'react';
import {
  ShieldIcon, KeyIcon, LockIcon, GlobeIcon,
  TrashIcon, CheckIcon, CloseIcon, ClockIcon,
} from '@/components/ui/icons';
import { GitHubIcon, GoogleIcon } from '@/components/ui/icons';
import { useAccountStore } from '@/store/useAccountStore';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';

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
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-display font-bold text-kriptik-white mb-1">Security</h2>
        <p className="text-sm text-kriptik-slate">Manage your password and security settings</p>
      </div>

      {/* Change Password */}
      <div className="p-5 rounded-xl bg-kriptik-charcoal border border-white/5">
        <div className="flex items-center gap-2 mb-4">
          <LockIcon size={16} />
          <h3 className="text-sm font-semibold text-kriptik-silver">Change Password</h3>
        </div>
        <div className="space-y-3 max-w-full sm:max-w-sm">
          <input
            type="password"
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full bg-kriptik-black border border-white/10 rounded-lg px-3 py-2 text-sm text-kriptik-white placeholder:text-kriptik-slate focus:outline-none focus:border-kriptik-lime/50"
          />
          <input
            type="password"
            placeholder="New password (min 8 characters)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full bg-kriptik-black border border-white/10 rounded-lg px-3 py-2 text-sm text-kriptik-white placeholder:text-kriptik-slate focus:outline-none focus:border-kriptik-lime/50"
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleChangePassword()}
            className="w-full bg-kriptik-black border border-white/10 rounded-lg px-3 py-2 text-sm text-kriptik-white placeholder:text-kriptik-slate focus:outline-none focus:border-kriptik-lime/50"
          />
          <button
            onClick={handleChangePassword}
            disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
            className="px-4 py-2 bg-kriptik-lime text-kriptik-black text-sm font-semibold rounded-lg hover:bg-kriptik-lime/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {changingPassword ? 'Changing...' : 'Update Password'}
          </button>
        </div>
      </div>

      {/* Connected Accounts */}
      <div className="p-5 rounded-xl bg-kriptik-charcoal border border-white/5">
        <div className="flex items-center gap-2 mb-4">
          <GlobeIcon size={16} />
          <h3 className="text-sm font-semibold text-kriptik-silver">Connected Accounts</h3>
        </div>
        {connectionsLoading ? (
          <p className="text-sm text-kriptik-slate">Loading...</p>
        ) : connections.length === 0 ? (
          <p className="text-sm text-kriptik-slate">No connected accounts. Connect via login page.</p>
        ) : (
          <div className="space-y-2">
            {connections.map((conn) => (
              <div key={conn.id} className="flex items-center justify-between p-3 rounded-lg bg-kriptik-black/50 border border-white/5">
                <div className="flex items-center gap-3">
                  <span className="text-kriptik-silver">{providerIcons[conn.providerId] || <GlobeIcon size={18} />}</span>
                  <div>
                    <p className="text-sm text-kriptik-white">{providerLabels[conn.providerId] || conn.providerId}</p>
                    <p className="text-xs text-kriptik-slate">Connected {new Date(conn.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
                <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded border border-green-500/20">
                  Connected
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active Sessions */}
      <div className="p-5 rounded-xl bg-kriptik-charcoal border border-white/5">
        <div className="flex items-center gap-2 mb-4">
          <ClockIcon size={16} />
          <h3 className="text-sm font-semibold text-kriptik-silver">Active Sessions</h3>
        </div>
        {sessionsLoading ? (
          <p className="text-sm text-kriptik-slate">Loading...</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-kriptik-slate">No active sessions found</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((sess) => {
              // Parse user agent for a readable device description
              const ua = sess.userAgent || 'Unknown device';
              const shortUa = ua.length > 60 ? ua.slice(0, 60) + '...' : ua;

              return (
                <div key={sess.id} className="flex items-center justify-between p-3 rounded-lg bg-kriptik-black/50 border border-white/5">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-kriptik-white">
                        {sess.isCurrent ? 'Current Session' : 'Session'}
                      </p>
                      {sess.isCurrent && (
                        <span className="text-xs text-kriptik-lime bg-kriptik-lime/10 px-1.5 py-0.5 rounded border border-kriptik-lime/20">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-kriptik-slate mt-0.5 truncate max-w-[200px] sm:max-w-xs" title={ua}>
                      {shortUa}
                    </p>
                    <p className="text-xs text-kriptik-slate">
                      {sess.ipAddress && `IP: ${sess.ipAddress} · `}
                      Created {new Date(sess.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {!sess.isCurrent && (
                    <button
                      onClick={() => handleRevokeSession(sess.id)}
                      className="p-1.5 rounded-md text-kriptik-slate hover:text-red-400 hover:bg-red-500/5 transition-colors"
                      title="Revoke session"
                    >
                      <TrashIcon size={14} />
                    </button>
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
