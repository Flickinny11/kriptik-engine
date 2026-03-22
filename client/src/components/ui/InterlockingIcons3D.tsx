/**
 * InterlockingIcons3D
 *
 * Custom SVG icon set for the Builder.
 * Design system: Black/white with red accents.
 * 3D, interlocking-shape language with layered fills, highlights,
 * and a consistent interlock motif.
 */

import React, { useId } from 'react';
import { motion } from 'framer-motion';

export type InterlockTone = 'crimson' | 'amber' | 'teal' | 'slate' | 'emerald';

export interface InterlockIconProps {
  size?: number;
  className?: string;
  tone?: InterlockTone;
  active?: boolean;
  animate?: boolean;
}

const TONES: Record<InterlockTone, { a0: string; a1: string; a2: string; edge: string }> = {
  crimson: { a0: '#f5f5f5', a1: '#404040', a2: '#1a1a1a', edge: 'rgba(220,38,38,0.45)' },
  amber: { a0: '#fde68a', a1: '#f59e0b', a2: '#b45309', edge: 'rgba(120,53,15,0.55)' },
  teal: { a0: '#99f6e4', a1: '#14b8a6', a2: '#0f766e', edge: 'rgba(15,118,110,0.55)' },
  slate: { a0: '#e2e8f0', a1: '#94a3b8', a2: '#475569', edge: 'rgba(30,41,59,0.55)' },
  emerald: { a0: '#bbf7d0', a1: '#22c55e', a2: '#15803d', edge: 'rgba(20,83,45,0.55)' },
};

function InterlockBase({
  size,
  className,
  tone,
  active,
  children,
}: Required<Pick<InterlockIconProps, 'size' | 'className' | 'tone' | 'active'>> & {
  children?: React.ReactNode;
}) {
  const uid = useId().replace(/:/g, '');
  const colors = TONES[tone];
  const isCrimson = tone === 'crimson';
  const alpha = active ? 1 : 0.85;

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={`il-${uid}-g1`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={colors.a0} stopOpacity={alpha} />
          <stop offset="55%" stopColor={colors.a1} stopOpacity={alpha} />
          <stop offset="100%" stopColor={colors.a2} stopOpacity={alpha} />
        </linearGradient>
        <linearGradient id={`il-${uid}-g2`} x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={isCrimson ? '#e5e5e5' : colors.a0} stopOpacity={alpha * 0.9} />
          <stop offset="45%" stopColor={isCrimson ? '#525252' : colors.a1} stopOpacity={alpha * 0.95} />
          <stop offset="100%" stopColor={colors.a2} stopOpacity={alpha} />
        </linearGradient>
        {/* Red accent gradient for crimson tone */}
        {isCrimson && (
          <linearGradient id={`il-${uid}-red`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#991b1b" stopOpacity="0.95" />
          </linearGradient>
        )}
        <filter id={`il-${uid}-sh`} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="1" stdDeviation="0.7" floodColor="rgba(0,0,0,0.4)" floodOpacity="0.6" />
          <feDropShadow dx="0" dy="3" stdDeviation="1.4" floodColor="rgba(0,0,0,0.25)" floodOpacity="0.45" />
        </filter>
      </defs>

      {/* Back interlock piece */}
      <g filter={`url(#il-${uid}-sh)`} opacity={alpha}>
        <rect
          x="3.5"
          y="8.2"
          width="11.2"
          height="11.2"
          rx="3.4"
          transform="rotate(-14 9.1 13.8)"
          fill={`url(#il-${uid}-g2)`}
          stroke={colors.edge}
          strokeWidth="0.7"
        />
        {/* Specular highlight */}
        <path
          d="M6.2 9.8c2.6-1.7 5.7-2 7.9-0.8"
          stroke={isCrimson ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.55)'}
          strokeWidth="0.9"
          strokeLinecap="round"
          opacity="0.55"
        />
      </g>

      {/* Front interlock piece */}
      <g filter={`url(#il-${uid}-sh)`} opacity={alpha}>
        <rect
          x="9.3"
          y="4.5"
          width="11.2"
          height="11.2"
          rx="3.4"
          transform="rotate(14 14.9 10.1)"
          fill={`url(#il-${uid}-g1)`}
          stroke={colors.edge}
          strokeWidth="0.7"
        />
        {/* Glass rim highlight */}
        <path
          d="M10.6 6.4c2-1.4 4.6-1.8 6.6-1.0"
          stroke={isCrimson ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.65)'}
          strokeWidth="0.9"
          strokeLinecap="round"
          opacity="0.55"
        />
      </g>

      {/* Red accent corner mark for crimson tone */}
      {isCrimson && (
        <circle cx="18.5" cy="5" r="2" fill={`url(#il-${uid}-red)`} opacity={active ? 0.85 : 0.6} />
      )}

      {children}
    </svg>
  );
}

export function DeployInterlockIcon3D({
  size = 18,
  className = '',
  tone = 'crimson',
  active = true,
  animate = false,
}: InterlockIconProps) {
  const Icon = (
    <InterlockBase size={size} className={className} tone={tone} active={active}>
      {/* Uplink arrow - clean geometric */}
      <path
        d="M12 6.6l3.2 3.2h-2.1v5.7h-2.2V9.8H8.8L12 6.6z"
        fill="rgba(0,0,0,0.8)"
        opacity={active ? 0.82 : 0.62}
      />
      {/* Top highlight edge */}
      <path
        d="M12 6.6l3.2 3.2h-2.1v1.1c-1.6 0.1-3 0.1-4.3 0V9.8H8.8L12 6.6z"
        fill="rgba(255,255,255,0.3)"
        opacity={active ? 0.7 : 0.5}
      />
    </InterlockBase>
  );

  if (!animate) return Icon;

  return (
    <motion.div
      style={{ width: size, height: size, display: 'inline-flex' }}
      animate={{ rotate: [0, -3, 0] }}
      transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
    >
      {Icon}
    </motion.div>
  );
}

export function MobileDeployInterlockIcon3D({
  size = 18,
  className = '',
  tone = 'crimson',
  active = true,
  animate = false,
}: InterlockIconProps) {
  const uid = useId().replace(/:/g, '');

  const Icon = (
    <InterlockBase size={size} className={className} tone={tone} active={active}>
      <defs>
        <linearGradient id={`mob-${uid}-screen`} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#dc2626" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#dc2626" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      {/* Phone body - sleek rounded rectangle */}
      <rect
        x="8"
        y="5.5"
        width="8"
        height="12.5"
        rx="2"
        fill="rgba(10,10,10,0.85)"
        opacity={active ? 0.8 : 0.6}
      />
      {/* Screen bezel */}
      <rect
        x="9"
        y="7"
        width="6"
        height="8.5"
        rx="1"
        fill={`url(#mob-${uid}-screen)`}
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="0.4"
      />
      {/* Screen shine line */}
      <line x1="9.5" y1="7.5" x2="14" y2="7.5" stroke="rgba(255,255,255,0.2)" strokeWidth="0.4" />
      {/* Bottom bar (home indicator) */}
      <rect x="10.5" y="16.2" width="3" height="0.6" rx="0.3" fill="rgba(255,255,255,0.3)" />
      {/* Camera notch */}
      <circle cx="12" cy="6.2" r="0.4" fill="rgba(255,255,255,0.2)" />
      {/* Red accent dot - status indicator */}
      <circle cx="13.8" cy="6.2" r="0.35" fill="#ef4444" opacity={active ? 0.9 : 0.5} />
    </InterlockBase>
  );

  if (!animate) return Icon;

  return (
    <motion.div
      style={{ width: size, height: size, display: 'inline-flex' }}
      animate={{ rotate: [0, 4, 0] }}
      transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
    >
      {Icon}
    </motion.div>
  );
}

export function PlanningInterlockIcon3D({
  size = 18,
  className = '',
  tone = 'crimson',
  active = true,
  animate = false,
}: InterlockIconProps) {
  const Icon = (
    <InterlockBase size={size} className={className} tone={tone} active={active}>
      {/* Checklist bars */}
      <rect x="7.2" y="7.0" width="9.6" height="2.0" rx="1" fill="rgba(0,0,0,0.75)" opacity={active ? 0.7 : 0.56} />
      <rect x="7.2" y="10.2" width="7.4" height="2.0" rx="1" fill="rgba(0,0,0,0.75)" opacity={active ? 0.65 : 0.52} />
      {/* Check mark in red */}
      <path
        d="M16.5 10.6l1.2 1.2 2.2-2.5"
        stroke="#dc2626"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={active ? 0.9 : 0.65}
      />
      <path
        d="M16.5 10.6l1.2 1.2 2.2-2.5"
        stroke="rgba(255,255,255,0.2)"
        strokeWidth="0.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={active ? 0.65 : 0.45}
      />
    </InterlockBase>
  );

  if (!animate) return Icon;

  return (
    <motion.div
      style={{ width: size, height: size, display: 'inline-flex' }}
      animate={{ rotateY: [0, 12, 0] }}
      transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
    >
      {Icon}
    </motion.div>
  );
}

export function IterateInterlockIcon3D({
  size = 18,
  className = '',
  tone = 'crimson',
  active = true,
  animate = false,
}: InterlockIconProps) {
  const Icon = (
    <InterlockBase size={size} className={className} tone={tone} active={active}>
      {/* Loop arrows */}
      <path
        d="M8.2 12.6c.8 2.3 3.1 3.9 5.8 3.6 1.2-.1 2.2-.6 3-1.3"
        stroke="rgba(0,0,0,0.75)"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity={active ? 0.82 : 0.64}
      />
      <path
        d="M15.8 8.2c-2.4-1.8-5.8-1.3-7.5 1.1"
        stroke="rgba(0,0,0,0.65)"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity={active ? 0.8 : 0.62}
      />
      {/* Arrow heads with red accent */}
      <path d="M18 13.2l.9 2.1-2.3-.2" fill="#dc2626" opacity={active ? 0.8 : 0.55} />
      <path d="M8.4 8.9L6.3 9.8l.5-2.2" fill="#dc2626" opacity={active ? 0.8 : 0.55} />
      {/* Specular overlay */}
      <path
        d="M8.2 12.6c.8 2.3 3.1 3.9 5.8 3.6 1.2-.1 2.2-.6 3-1.3"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="0.8"
        strokeLinecap="round"
        opacity={active ? 0.6 : 0.45}
      />
    </InterlockBase>
  );

  if (!animate) return Icon;

  return (
    <motion.div
      style={{ width: size, height: size, display: 'inline-flex' }}
      animate={{ rotate: [0, 6, 0] }}
      transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
    >
      {Icon}
    </motion.div>
  );
}

export function CloseInterlockIcon3D({
  size = 16,
  className = '',
  tone = 'crimson',
  active = true,
}: InterlockIconProps) {
  return (
    <InterlockBase size={size} className={className} tone={tone} active={active}>
      <path
        d="M8.4 8.4l7.2 7.2M15.6 8.4l-7.2 7.2"
        stroke="rgba(0,0,0,0.75)"
        strokeWidth="1.9"
        strokeLinecap="round"
        opacity={active ? 0.85 : 0.65}
      />
      <path
        d="M8.4 8.4l7.2 7.2M15.6 8.4l-7.2 7.2"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="0.8"
        strokeLinecap="round"
        opacity={active ? 0.65 : 0.45}
      />
    </InterlockBase>
  );
}
