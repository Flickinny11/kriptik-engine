/**
 * DangerZoneSettings — Account deletion, data export
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangleIcon, TrashIcon, DownloadIcon, XIcon } from '@/components/ui/icons';
import { apiClient } from '@/lib/api-client';
import { useUserStore } from '@/store/useUserStore';
import { toast } from 'sonner';

export function DangerZoneSettings() {
  const navigate = useNavigate();
  const { logout } = useUserStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return;
    setDeleting(true);
    try {
      await apiClient.deleteAccount();
      await logout();
      toast.success('Account deleted');
      navigate('/login');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete account');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-display font-bold text-red-400 mb-1">Danger Zone</h2>
        <p className="text-sm text-kriptik-slate">Irreversible actions for your account</p>
      </div>

      {/* Export Data */}
      <div className="p-5 rounded-xl bg-kriptik-charcoal border border-red-500/10">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <DownloadIcon size={16} />
              <h3 className="text-sm font-semibold text-kriptik-silver">Export Data</h3>
            </div>
            <p className="text-xs text-kriptik-slate">Download a copy of your projects and account data</p>
          </div>
          <button
            disabled
            className="px-4 py-2 text-sm text-kriptik-slate bg-kriptik-black border border-white/5 rounded-lg cursor-not-allowed"
          >
            Coming Soon
          </button>
        </div>
      </div>

      {/* Delete Account */}
      <div className="p-5 rounded-xl bg-red-500/5 border border-red-500/20">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangleIcon size={16} className="text-red-400" />
          <h3 className="text-sm font-semibold text-red-400">Delete Account</h3>
        </div>
        <p className="text-xs text-kriptik-slate mb-4">
          Permanently delete your account and all associated data including projects, builds, credentials, and credit history. This action cannot be undone.
        </p>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="px-4 py-2 text-sm font-semibold text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-colors"
        >
          Delete My Account
        </button>
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowDeleteConfirm(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-kriptik-charcoal border border-red-500/20 rounded-xl p-6 w-full max-w-md shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <AlertTriangleIcon size={18} className="text-red-400" />
                  <h3 className="text-lg font-display font-semibold text-red-400">Delete Account</h3>
                </div>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="text-kriptik-silver hover:text-kriptik-white transition-colors"
                >
                  <XIcon size={18} />
                </button>
              </div>

              <p className="text-sm text-kriptik-silver mb-4">
                This will permanently delete your account, all projects, build history, and credit balance. This action is irreversible.
              </p>

              <p className="text-sm text-kriptik-slate mb-2">
                Type <span className="font-mono text-red-400 font-semibold">DELETE</span> to confirm:
              </p>
              <input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleDeleteAccount()}
                placeholder="DELETE"
                autoFocus
                className="w-full bg-kriptik-black border border-red-500/20 rounded-lg px-4 py-3 text-kriptik-white placeholder:text-kriptik-slate focus:outline-none focus:border-red-500/50 font-mono mb-4"
              />

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 text-sm text-kriptik-silver hover:text-kriptik-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmText !== 'DELETE' || deleting}
                  className="px-5 py-2 bg-red-500 text-white text-sm font-semibold rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {deleting ? 'Deleting...' : 'Permanently Delete'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
