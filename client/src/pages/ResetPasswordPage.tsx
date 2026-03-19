/**
 * ResetPasswordPage — Set a new password using the token from the reset email.
 * Uses Better Auth's built-in resetPassword endpoint.
 */

import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { LockIcon, CheckCircleIcon, AlertTriangleIcon, ArrowLeftIcon } from '@/components/ui/icons';
import { API_URL, authenticatedFetch } from '@/lib/api-config';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!token) {
    return (
      <div className="space-y-6 text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <AlertTriangleIcon size={28} className="text-red-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">Invalid Reset Link</h1>
          <p className="text-sm text-zinc-400">
            This password reset link is invalid or has expired.
          </p>
        </div>
        <Link
          to="/forgot-password"
          className="inline-block px-6 py-3 bg-white text-black font-medium rounded-lg hover:bg-zinc-100 transition-colors"
        >
          Request New Link
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6 text-center"
      >
        <div className="w-16 h-16 mx-auto rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
          <CheckCircleIcon size={28} className="text-green-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">Password Reset!</h1>
          <p className="text-sm text-zinc-400">
            Your password has been successfully updated. You can now log in.
          </p>
        </div>
        <button
          onClick={() => navigate('/login')}
          className="inline-block px-6 py-3 bg-white text-black font-medium rounded-lg hover:bg-zinc-100 transition-colors"
        >
          Go to Login
        </button>
      </motion.div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      // Call Better Auth's reset-password endpoint directly
      const res = await authenticatedFetch(`${API_URL}/api/auth/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword, token }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to reset password. The link may have expired.');
      }
      setSuccess(true);
      toast.success('Password reset successfully!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to reset password. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-zinc-800/50 border border-zinc-700/50 flex items-center justify-center mb-4">
          <LockIcon size={24} className="text-zinc-400" />
        </div>
        <h1 className="text-2xl font-bold text-white">Set New Password</h1>
        <p className="text-sm text-zinc-400">
          Choose a strong password for your account.
        </p>
      </div>

      <motion.form
        onSubmit={handleSubmit}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="space-y-4"
      >
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="New password (min 8 characters)"
          autoFocus
          required
          minLength={8}
          className="w-full h-12 px-4 bg-zinc-900/50 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600/20 transition-colors"
        />

        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm new password"
          required
          minLength={8}
          className="w-full h-12 px-4 bg-zinc-900/50 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600/20 transition-colors"
        />

        <button
          type="submit"
          disabled={loading || !newPassword || !confirmPassword}
          className="w-full h-12 bg-white hover:bg-zinc-100 text-black font-medium rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Resetting...' : 'Reset Password'}
        </button>
      </motion.form>

      <div className="text-center">
        <Link
          to="/login"
          className="text-sm text-zinc-500 hover:text-zinc-400 transition-colors inline-flex items-center gap-1.5"
        >
          <ArrowLeftIcon size={14} />
          Back to login
        </Link>
      </div>
    </div>
  );
}
