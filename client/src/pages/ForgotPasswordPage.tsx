/**
 * ForgotPasswordPage — Request a password reset email
 * Uses Better Auth's built-in forgetPassword endpoint.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { ArrowLeftIcon, KeyIcon, CheckCircleIcon } from '@/components/ui/icons';
import { API_URL, authenticatedFetch } from '@/lib/api-config';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error('Please enter your email address');
      return;
    }

    setLoading(true);
    try {
      // Call Better Auth's request-password-reset endpoint directly
      const res = await authenticatedFetch(`${API_URL}/api/auth/request-password-reset`, {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          redirectTo: `${window.location.origin}/reset-password`,
        }),
      });
      if (!res.ok) {
        // Don't reveal whether the email exists — always show success
      }
      setSent(true);
      toast.success('If an account exists with that email, a reset link has been sent.');
    } catch (err: any) {
      // Don't reveal whether the email exists — always show success
      setSent(true);
      toast.success('If an account exists with that email, a reset link has been sent.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
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
          <h1 className="text-2xl font-bold text-white mb-2">Check Your Email</h1>
          <p className="text-sm text-zinc-400 leading-relaxed">
            We sent a password reset link to<br />
            <span className="text-zinc-300 font-medium">{email}</span>
          </p>
        </div>
        <p className="text-xs text-zinc-500">
          The link expires in 1 hour. Check your spam folder if you don't see it.
        </p>
        <div className="pt-2">
          <Link
            to="/login"
            className="text-sm text-zinc-400 hover:text-white transition-colors inline-flex items-center gap-1.5"
          >
            <ArrowLeftIcon size={14} />
            Back to login
          </Link>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-zinc-800/50 border border-zinc-700/50 flex items-center justify-center mb-4">
          <KeyIcon size={24} className="text-zinc-400" />
        </div>
        <h1 className="text-2xl font-bold text-white">Forgot Password?</h1>
        <p className="text-sm text-zinc-400">
          Enter your email and we'll send you a reset link.
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
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email address"
          autoFocus
          required
          className="w-full h-12 px-4 bg-zinc-900/50 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600/20 transition-colors"
        />

        <button
          type="submit"
          disabled={loading || !email.trim()}
          className="w-full h-12 bg-white hover:bg-zinc-100 text-black font-medium rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Sending...' : 'Send Reset Link'}
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
