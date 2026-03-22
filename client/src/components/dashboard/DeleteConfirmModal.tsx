/**
 * DeleteConfirmModal - Photorealistic 3D Glass Delete Confirmation
 *
 * Replaces the native window.confirm() with a Three.js rendered
 * translucent glass panel. Centered on screen, responsive on mobile.
 *
 * Uses ThreeGlassModal for the actual 3D glass rendering.
 */

import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ThreeGlassModal } from '../ui/glass/ThreeGlassModal';

// Custom geometric warning icon — interlocking triangles (no Lucide, no emoji)
function WarningGeometricIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <defs>
        <linearGradient id="warnGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="100%" stopColor="#dc2626" />
        </linearGradient>
        <linearGradient id="warnGrad2" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#fca5a5" />
          <stop offset="100%" stopColor="#ef4444" />
        </linearGradient>
        <filter id="warnGlow">
          <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#ef4444" floodOpacity="0.4" />
        </filter>
      </defs>
      {/* Outer triangle */}
      <path
        d="M24 4L44 40H4L24 4Z"
        fill="url(#warnGrad1)"
        stroke="#dc2626"
        strokeWidth="1"
        filter="url(#warnGlow)"
        opacity="0.85"
      />
      {/* Inner inverted triangle for interlocking effect */}
      <path
        d="M24 36L14 18H34L24 36Z"
        fill="url(#warnGrad2)"
        stroke="#fca5a5"
        strokeWidth="0.5"
        opacity="0.5"
      />
      {/* Exclamation mark */}
      <rect x="22.5" y="16" width="3" height="12" rx="1.5" fill="white" opacity="0.95" />
      <circle cx="24" cy="33" r="2" fill="white" opacity="0.95" />
    </svg>
  );
}

interface DeleteConfirmModalProps {
  isOpen: boolean;
  projectName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmModal({
  isOpen,
  projectName,
  onConfirm,
  onCancel,
}: DeleteConfirmModalProps) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  // Auto-focus cancel button for safety
  useEffect(() => {
    if (isOpen) {
      // Small delay for the modal animation to start
      const t = setTimeout(() => confirmBtnRef.current?.focus(), 200);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  return (
    <ThreeGlassModal isOpen={isOpen} onClose={onCancel} size="sm">
      <div style={{
        textAlign: 'center',
        maxWidth: '100%',
        overflow: 'hidden',
        wordBreak: 'break-word',
      }}>
        {/* Warning icon */}
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 15, stiffness: 200, delay: 0.1 }}
          style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}
        >
          <WarningGeometricIcon size={48} />
        </motion.div>

        {/* Title */}
        <motion.h3
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          style={{
            fontSize: '22px',
            fontWeight: 700,
            color: 'rgba(239, 68, 68, 0.85)',
            margin: '0 0 10px',
            fontFamily: '"Clash Display", "Cabinet Grotesk", system-ui, sans-serif',
            textShadow: '0 1px 6px rgba(239, 68, 68, 0.25)',
          }}
        >
          Delete Project
        </motion.h3>

        {/* Description */}
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          style={{
            fontSize: '15px',
            color: 'rgba(239, 68, 68, 0.7)',
            margin: '0 0 24px',
            lineHeight: 1.6,
            fontFamily: '"Satoshi", system-ui, sans-serif',
            maxWidth: '100%',
            overflowWrap: 'break-word',
          }}
        >
          Are you sure you want to delete{' '}
          <span style={{
            color: 'rgba(252, 165, 165, 0.9)',
            fontWeight: 600,
            wordBreak: 'break-all',
          }}>
            &ldquo;{projectName}&rdquo;
          </span>
          ? This action cannot be undone.
        </motion.p>

        {/* Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          {/* Cancel button */}
          <button
            ref={confirmBtnRef}
            onClick={onCancel}
            style={{
              padding: '10px 24px',
              borderRadius: '12px',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              background: 'rgba(239, 68, 68, 0.08)',
              color: 'rgba(239, 68, 68, 0.7)',
              fontSize: '15px',
              fontWeight: 600,
              fontFamily: '"Cabinet Grotesk", "Satoshi", system-ui, sans-serif',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              backdropFilter: 'blur(8px)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.35)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)';
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.25)';
            }}
          >
            Cancel
          </button>

          {/* Delete button — 3D depth */}
          <button
            onClick={onConfirm}
            style={{
              padding: '10px 24px',
              borderRadius: '12px',
              border: 'none',
              background: 'linear-gradient(180deg, rgba(239, 68, 68, 0.85) 0%, rgba(220, 38, 38, 0.85) 100%)',
              color: 'rgba(255, 255, 255, 0.95)',
              fontSize: '15px',
              fontWeight: 700,
              fontFamily: '"Cabinet Grotesk", "Satoshi", system-ui, sans-serif',
              cursor: 'pointer',
              boxShadow: '0 3px 0 rgba(153, 27, 27, 0.7), 0 6px 16px rgba(239,68,68,0.3), inset 0 1px 0 rgba(255,255,255,0.15)',
              transform: 'translateY(0)',
              transition: 'all 0.15s ease',
              letterSpacing: '0.02em',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(2px)';
              e.currentTarget.style.boxShadow = '0 1px 0 rgba(153, 27, 27, 0.7), 0 3px 8px rgba(239,68,68,0.25), inset 0 1px 0 rgba(255,255,255,0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 3px 0 rgba(153, 27, 27, 0.7), 0 6px 16px rgba(239,68,68,0.3), inset 0 1px 0 rgba(255,255,255,0.15)';
            }}
          >
            Delete
          </button>
        </motion.div>
      </div>
    </ThreeGlassModal>
  );
}

export default DeleteConfirmModal;
