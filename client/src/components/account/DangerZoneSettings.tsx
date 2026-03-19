/**
 * DangerZoneSettings — Account deletion, data export.
 * Premium warm-glass design with danger-red accents.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangleIcon, TrashIcon, DownloadIcon, XIcon } from '@/components/ui/icons';
import { apiClient } from '@/lib/api-client';
import { useUserStore } from '@/store/useUserStore';
import { toast } from 'sonner';

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
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-display font-bold text-red-600 mb-1">Danger Zone</h2>
        <p className="text-sm text-[#8a7a6b]">Irreversible actions for your account</p>
      </div>

      {/* Export Data */}
      <div
        className="p-4 sm:p-5 rounded-2xl border border-red-200/40"
        style={{
          ...cardStyle,
          background: 'linear-gradient(145deg, rgba(255,252,250,0.85) 0%, rgba(255,248,244,0.75) 100%)',
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-red-50" style={{ boxShadow: '0 1px 3px rgba(220,38,38,0.08)' }}>
                <DownloadIcon size={16} className="text-red-400" />
              </div>
              <h3 className="text-sm font-semibold text-[#4a3f35]">Export Data</h3>
            </div>
            <p className="text-xs text-[#b0a090]">Download a copy of your projects and account data</p>
          </div>
          <button
            disabled
            className="px-4 py-2 text-sm text-[#c0b8ae] rounded-xl border border-[#e8e0d8]/40 cursor-not-allowed w-full sm:w-auto font-medium"
            style={{
              background: 'rgba(255,255,255,0.4)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
            }}
          >
            Coming Soon
          </button>
        </div>
      </div>

      {/* Delete Account */}
      <div
        className="p-5 rounded-2xl border border-red-200/60"
        style={{
          background: 'linear-gradient(145deg, rgba(255,245,245,0.85) 0%, rgba(255,240,240,0.75) 100%)',
          boxShadow: `
            0 4px 16px rgba(220,38,38,0.04),
            0 1px 4px rgba(220,38,38,0.02),
            inset 0 1px 0 rgba(255,255,255,0.7),
            inset 0 -1px 0 rgba(220,38,38,0.02)
          `,
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangleIcon size={16} className="text-red-500" />
          <h3 className="text-sm font-semibold text-red-600">Delete Account</h3>
        </div>
        <p className="text-xs text-[#8a7a6b] mb-4">
          Permanently delete your account and all associated data including projects, builds, credentials, and credit history. This action cannot be undone.
        </p>
        <motion.button
          onClick={() => setShowDeleteConfirm(true)}
          whileHover={{ y: -1, scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className="px-5 py-2.5 text-sm font-semibold text-red-600 rounded-xl border border-red-200 hover:border-red-300 transition-all duration-300 cursor-pointer"
          style={{
            background: 'linear-gradient(145deg, rgba(255,245,245,0.9), rgba(255,235,235,0.7))',
            boxShadow: '0 2px 8px rgba(220,38,38,0.06), inset 0 1px 0 rgba(255,255,255,0.7)',
          }}
        >
          Delete My Account
        </motion.button>
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(245,240,235,0.8)', backdropFilter: 'blur(8px)' }}
            onClick={() => setShowDeleteConfirm(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-md p-6 rounded-2xl border border-red-200/60"
              style={{
                background: 'linear-gradient(145deg, #ffffff, #faf7f4)',
                boxShadow: '0 24px 48px rgba(0,0,0,0.12), 0 8px 16px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <AlertTriangleIcon size={18} className="text-red-500" />
                  <h3 className="text-lg font-display font-semibold text-red-600">Delete Account</h3>
                </div>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="text-[#b0a090] hover:text-[#1a1a1a] transition-colors p-1 rounded-lg hover:bg-[#f0ebe5]"
                >
                  <XIcon size={18} />
                </button>
              </div>

              <p className="text-sm text-[#6b5e50] mb-4">
                This will permanently delete your account, all projects, build history, and credit balance. This action is irreversible.
              </p>

              <p className="text-sm text-[#8a7a6b] mb-2">
                Type <span className="font-mono text-red-600 font-bold">DELETE</span> to confirm:
              </p>
              <input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleDeleteAccount()}
                placeholder="DELETE"
                autoFocus
                className="w-full bg-white border border-red-200/60 rounded-xl px-4 py-3 text-[#1a1a1a] placeholder:text-[#c0b8ae] focus:outline-none focus:border-red-400/50 focus:ring-2 focus:ring-red-100 font-mono mb-4 transition-all duration-300"
                style={{ boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.06)' }}
              />

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2.5 text-sm text-[#8a7a6b] hover:text-[#1a1a1a] font-medium transition-colors rounded-xl hover:bg-[#f0ebe5]"
                >
                  Cancel
                </button>
                <motion.button
                  onClick={handleDeleteAccount}
                  disabled={deleteConfirmText !== 'DELETE' || deleting}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  className="px-5 py-2.5 text-white text-sm font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 cursor-pointer"
                  style={{
                    background: 'linear-gradient(145deg, #ef4444, #dc2626)',
                    boxShadow: '0 4px 12px rgba(220,38,38,0.25), inset 0 1px 0 rgba(255,255,255,0.1)',
                  }}
                >
                  {deleting ? 'Deleting...' : 'Permanently Delete'}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
